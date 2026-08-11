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
import { methodNotAllowed } from './support';
import { createDeadline, withinDeadline, type Deadline } from '../http/deadline';

type Stores = ReturnType<typeof createEdgeOneStores>;

export interface GenerationRouteDependencies {
  stores: Stores;
  generate(input: GenerateAssessmentInput, deadline?: Deadline): Promise<{ id: string }>;
  now(): Date;
}

export async function createGenerationRoute(
  request: Request,
  context: EdgeOneContext,
  injected?: GenerationRouteDependencies,
): Promise<Response> {
  const deadline = createDeadline(115_000);
  try {
    const identity = await withinDeadline(
      requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env)), deadline,
    );
    if (request.method !== 'POST') throw methodNotAllowed();
    const dependencies = injected ?? defaultDependencies(context);
    const body = await readJsonObject(request, deadline);
    const topic = nonEmptyString(body.topic, 500);
    const notes = body.notes === undefined ? undefined : nonEmptyString(body.notes, 4000);
    const clientRequestId = body.clientRequestId === undefined ? undefined : nonEmptyString(body.clientRequestId, 128);
    if (body.retry !== undefined && typeof body.retry !== 'boolean') throw invalidRequest();
    const retry = body.retry === true;
    const policyVersion = context.env.PRIVACY_POLICY_VERSION ?? '2026-08-10';
    const settings = await withinDeadline(dependencies.stores.settings.get(identity.ownerKey), deadline);
    if (settings?.privacyPolicyVersion !== policyVersion || typeof settings.privacyConsentAt !== 'string') {
      return routeFailure(new ApiError('PRIVACY_CONSENT_REQUIRED', 403, false));
    }

    const identityKey = clientRequestId ?? randomUUID();
    const digest = createHash('sha256').update(`${identity.ownerKey}\0${identityKey}`, 'utf8').digest('hex').slice(0, 32);
    const assessmentId = `assessment-${digest}`;
    const jobId = `job-${digest}`;
    const leaseToken = randomUUID();
    const begun = await withinDeadline(dependencies.stores.jobs.begin({
      ownerKey: identity.ownerKey,
      jobId,
      clientRequestIdHash: createHash('sha256').update(identityKey, 'utf8').digest('hex'),
      assessmentId,
      leaseToken,
      now: dependencies.now().toISOString(),
      retry,
    }), deadline);
    if (begun.type === 'existing') {
      if (begun.job.status === 'running') {
        const assessment = await withinDeadline(dependencies.stores.assessments.get(identity.ownerKey, assessmentId), deadline);
        if (assessment !== null) {
          const recovered = await withinDeadline(dependencies.stores.jobs.recoverCompleted(
            identity.ownerKey, jobId, begun.job.attempt, dependencies.now().toISOString(),
          ), deadline);
          return success(jobEnvelope(recovered));
        }
      }
      return success(jobEnvelope(begun.job), begun.job.status === 'running' ? 202 : 200);
    }

    const quota = await withinDeadline(dependencies.stores.quota.reserve(
      identity.ownerKey,
      dependencies.now(),
      context.env.GENERATION_ENABLED === 'true',
    ), deadline);
    const quotaCode = quotaErrorCode(quota);
    if (quotaCode !== null) {
      const status = quotaCode === 'FREE_TIER_LIMIT' ? 429 : 503;
      const error = new ApiError(quotaCode, status, quotaCode === 'FREE_TIER_LIMIT');
      await withinDeadline(dependencies.stores.jobs.fail(
        identity.ownerKey, jobId, begun.job.attempt, leaseToken,
        error.code, error.retryable, dependencies.now().toISOString(),
      ), deadline);
      return routeFailure(error);
    }

    try {
      await withinDeadline(dependencies.generate({
        ownerKey: identity.ownerKey,
        openId: identity.openId,
        assessmentId,
        topic,
        ...(notes === undefined ? {} : { notes }),
      }, deadline), deadline);
      const completed = await withinDeadline(dependencies.stores.jobs.complete(
        identity.ownerKey, jobId, begun.job.attempt, leaseToken, dependencies.now().toISOString(),
      ), deadline);
      return success(jobEnvelope(completed), 201);
    } catch (error) {
      const apiError = error instanceof ApiError ? error : new ApiError('INTERNAL_ERROR', 500, true);
      try {
        await withinDeadline(dependencies.stores.jobs.fail(
          identity.ownerKey, jobId, begun.job.attempt, leaseToken,
          apiError.code, apiError.retryable, dependencies.now().toISOString(),
        ), deadline);
      } catch {
        // The public response must preserve the original safe failure even if the deadline prevents status persistence.
      }
      throw apiError;
    }
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
    generate: async (input, deadline) => await generateFiftyQuestionAssessment(input, {
      complete: async (completionInput, operationDeadline) => await requestOpenAICompletion(completionInput, {
        baseUrl: context.env.LLM_BASE_URL,
        apiKey: context.env.LLM_API_KEY,
        model: context.env.LLM_MODEL,
        ...(operationDeadline === undefined ? {} : { deadline: operationDeadline }),
      }),
      checkText: security.checkText,
      createIfAbsent: async (record) => await stores.assessments.createIfAbsent(record),
      now,
    }, deadline),
  };
}

function jobEnvelope(job: { jobId: string; status: 'running' | 'completed' | 'failed'; assessmentId: string; attempt: number; retryable: boolean; errorCode: string | null }) {
  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.status === 'completed' ? 100 : job.status === 'running' ? 10 : 0,
    retryable: job.retryable,
    assessmentId: job.assessmentId,
    attempt: job.attempt,
    ...(job.errorCode === null ? {} : { errorCode: job.errorCode }),
  };
}
