import { requireSession, sessionDependenciesFromEnvironment } from '../auth/sessionToken';
import { success } from '../http/envelope';
import type { EdgeOneContext } from '../platform/context';
import { createEdgeOneStores } from '../storage/edgeOneStores';
import { invalidRequest, methodNotAllowed, nonEmptyString, readJsonObject, routeFailure } from './support';

type Stores = ReturnType<typeof createEdgeOneStores>;
type Dependencies = { stores: Stores; now(): Date };
type StoredSettings = { privacyPolicyVersion?: unknown; privacyConsentAt?: unknown };

export async function createSettingsRoute(
  request: Request,
  context: EdgeOneContext,
  injected?: Dependencies,
): Promise<Response> {
  try {
    const identity = await requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env));
    const dependencies = injected ?? defaultDependencies(context);
    const currentVersion = context.env.PRIVACY_POLICY_VERSION ?? '2026-08-10';
    if (request.method === 'GET') {
      const stored = await dependencies.stores.settings.get(identity.ownerKey) as StoredSettings | null;
      return stored === null
        ? success({ type: 'not_found' as const, errorCode: 'INVALID_REQUEST' as const })
        : success({ type: 'found' as const, settings: publicSettings(stored, currentVersion) });
    }
    if (request.method === 'PUT') {
      const body = await readJsonObject(request);
      const policyVersion = nonEmptyString(body.privacyPolicyVersion, 40);
      if (policyVersion !== currentVersion) throw invalidRequest();
      const stored = {
        privacyPolicyVersion: currentVersion,
        privacyConsentAt: dependencies.now().toISOString(),
      };
      await dependencies.stores.settings.set(identity.ownerKey, stored);
      return success({ type: 'accepted' as const, settings: publicSettings(stored, currentVersion) });
    }
    throw methodNotAllowed();
  } catch (error) {
    return routeFailure(error);
  }
}

function publicSettings(stored: StoredSettings, currentVersion: string) {
  const privacyPolicyVersion = typeof stored.privacyPolicyVersion === 'string' ? stored.privacyPolicyVersion : currentVersion;
  const privacyConsentAt = typeof stored.privacyConsentAt === 'string' ? stored.privacyConsentAt : null;
  return {
    privacyPolicyVersion,
    privacyConsentAt,
    hasCurrentPrivacyConsent: privacyPolicyVersion === currentVersion && privacyConsentAt !== null,
  };
}

function defaultDependencies(context: EdgeOneContext): Dependencies {
  const now = () => new Date();
  return { stores: createEdgeOneStores(context.blob, { now }), now };
}
