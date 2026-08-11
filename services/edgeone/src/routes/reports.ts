import { randomUUID } from 'node:crypto';
import { requireSession, sessionDependenciesFromEnvironment } from '../auth/sessionToken';
import { success } from '../http/envelope';
import type { EdgeOneContext } from '../platform/context';
import { createEdgeOneStores } from '../storage/edgeOneStores';
import { invalidRequest, nonEmptyString, readJsonObject, routeFailure } from './support';

type Stores = ReturnType<typeof createEdgeOneStores>;
type Dependencies = { stores: Stores; now(): Date; reportId(): string };
const REASONS = new Set(['question_error', 'content_safety', 'privacy', 'other']);

export async function createReportsRoute(
  request: Request,
  context: EdgeOneContext,
  injected?: Dependencies,
): Promise<Response> {
  try {
    const identity = await requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env));
    const dependencies = injected ?? defaultDependencies(context);
    if (request.method !== 'POST') throw invalidRequest();
    const body = await readJsonObject(request);
    const reason = nonEmptyString(body.reason, 40);
    if (!REASONS.has(reason)) throw invalidRequest();
    const policyVersion = nonEmptyString(body.policyVersion, 40);
    const currentVersion = context.env.PRIVACY_POLICY_VERSION ?? '2026-08-10';
    if (policyVersion !== currentVersion) throw invalidRequest();
    const assessmentId = body.assessmentId === undefined ? undefined : nonEmptyString(body.assessmentId, 200);
    if ((reason === 'question_error' || reason === 'content_safety') && assessmentId === undefined) throw invalidRequest();
    if (assessmentId !== undefined) {
      const owned = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
      if (owned === null) throw invalidRequest();
    }
    const detail = body.detail === undefined ? undefined : nonEmptyString(body.detail, 2000);
    const timestamp = dependencies.now().toISOString();
    const reportId = dependencies.reportId();
    await dependencies.stores.reports.create({
      id: reportId,
      ownerKey: identity.ownerKey,
      reason,
      policyVersion,
      ...(detail === undefined ? {} : { detail }),
      ...(assessmentId === undefined ? {} : { assessmentId }),
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return success({ type: 'created' as const, reportId }, 201);
  } catch (error) {
    return routeFailure(error);
  }
}

function defaultDependencies(context: EdgeOneContext): Dependencies {
  const now = () => new Date();
  return { stores: createEdgeOneStores(context.blob, { now }), now, reportId: randomUUID };
}
