import { createHash, randomUUID } from 'node:crypto';
import { requireSession, sessionDependenciesFromEnvironment } from '../auth/sessionToken';
import { generateFiftyQuestionAssessment, type GenerateAssessmentInput } from '../generation/generateAssessment';
import { requestOpenAICompletion } from '../generation/openAIClient';
import { success } from '../http/envelope';
import { ApiError } from '../http/errors';
import type { EdgeOneContext } from '../platform/context';
import { createEdgeOneStores } from '../storage/edgeOneStores';
import { quotaErrorCode } from '../storage/quotaRepository';
import { createWeChatTextSecurity } from '../moderation/wechatTextSecurity';
import { invalidRequest, nonEmptyString, readJsonObject, routeFailure } from './support';

type Stores = ReturnType<typeof createEdgeOneStores>;

export interface GenerationRouteDependencies {
  stores: Stores;
  generate(input: GenerateAssessmentInput): Promise<{ id: string }>;
  now(): Date;
}

export async function createGenerationRoute(
  request: Request,
  context: EdgeOneContext,
  injected?: GenerationRouteDependencies,
): Promise<Response> {
  try {
    if (request.method !== 'POST') throw invalidRequest();
    const identity = await requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env));
    const dependencies = injected ?? defaultDependencies(context);
    const body = await readJsonObject(request);
    const topic = nonEmptyString(body.topic, 500);
    const notes = body.notes === undefined ? undefined : nonEmptyString(body.notes, 4000);
    const clientRequestId = body.clientRequestId === undefined ? undefined : nonEmptyString(body.clientRequestId, 128);
    const policyVersion = context.env.PRIVACY_POLICY_VERSION ?? '2026-08-10';
    const settings = await dependencies.stores.settings.get(identity.ownerKey);
    if (settings?.privacyPolicyVersion !== policyVersion || typeof settings.privacyConsentAt !== 'string') {
      return routeFailure(new ApiError('PRIVACY_CONSENT_REQUIRED', 403, false));
    }

    const identityKey = clientRequestId ?? randomUUID();
    const digest = createHash('sha256').update(`${identity.ownerKey}\0${identityKey}`, 'utf8').digest('hex').slice(0, 32);
    const assessmentId = `assessment-${digest}`;
    const jobId = `job-${digest}`;
    if (clientRequestId !== undefined) {
      const existing = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
      if (existing !== null) return success(completedJob(jobId, assessmentId));
    }

    const quota = await dependencies.stores.quota.reserve(
      identity.ownerKey,
      dependencies.now(),
      context.env.GENERATION_ENABLED === 'true',
    );
    const quotaCode = quotaErrorCode(quota);
    if (quotaCode !== null) {
      const status = quotaCode === 'FREE_TIER_LIMIT' ? 429 : 503;
      return routeFailure(new ApiError(quotaCode, status, quotaCode === 'FREE_TIER_LIMIT'));
    }

    await dependencies.generate({
      ownerKey: identity.ownerKey,
      assessmentId,
      topic,
      ...(notes === undefined ? {} : { notes }),
    });
    return success(completedJob(jobId, assessmentId), 201);
  } catch (error) {
    return routeFailure(error);
  }
}

function defaultDependencies(context: EdgeOneContext): GenerationRouteDependencies {
  const now = () => new Date();
  const stores = createEdgeOneStores(context.blob, { now });
  const security = createWeChatTextSecurity({
    blob: context.blob,
    appId: context.env.WECHAT_APP_ID,
    appSecret: context.env.WECHAT_APP_SECRET,
    fetch: async (url, init) => await fetch(url, init),
    now,
  });
  return {
    stores,
    now,
    generate: async (input) => await generateFiftyQuestionAssessment(input, {
      complete: async (completionInput) => await requestOpenAICompletion(completionInput, {
        baseUrl: context.env.LLM_BASE_URL,
        apiKey: context.env.LLM_API_KEY,
        model: context.env.LLM_MODEL,
      }),
      checkText: security.checkText,
      createIfAbsent: async (record) => await stores.assessments.createIfAbsent(record),
      now,
    }),
  };
}

function completedJob(jobId: string, assessmentId: string) {
  return { jobId, status: 'completed' as const, progress: 100, retryable: false, assessmentId };
}
