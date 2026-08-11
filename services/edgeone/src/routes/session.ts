import { ApiError } from '../http/errors';
import { failure, success } from '../http/envelope';
import { exchangeWeChatCode, type WeChatFetch } from '../auth/wechatSession';
import { issueSession, sessionDependenciesFromEnvironment } from '../auth/sessionToken';
import type { EdgeOneContext } from '../platform/context';

export async function createSessionRoute(
  request: Request,
  context: EdgeOneContext,
  fetch: WeChatFetch,
): Promise<Response> {
  try {
    if (request.method !== 'POST') throw new ApiError('METHOD_NOT_ALLOWED', 405);
    assertSessionEnvironment(context.env);
    const payload = await requestPayload(request);
    if (typeof payload.code !== 'string') throw new ApiError('INVALID_REQUEST', 400);
    const { openId } = await exchangeWeChatCode(payload.code, context.env, fetch);
    const session = await issueSession(openId, sessionDependenciesFromEnvironment(context.blob, context.env));
    return success(session, 201);
  } catch (error) {
    if (error instanceof ApiError) return failure(error.code, error.retryable, error.status);
    return failure('BACKEND_UNAVAILABLE', true, 503);
  }
}

function assertSessionEnvironment(env: EdgeOneContext['env']): void {
  if (!env.WECHAT_APP_ID || !env.WECHAT_APP_SECRET || !env.SESSION_HMAC_KEY || !env.OWNER_HMAC_KEY) {
    throw new ApiError('BACKEND_UNAVAILABLE', 503, true);
  }
}

async function requestPayload(request: Request): Promise<{ code?: unknown }> {
  try {
    return await request.json() as { code?: unknown };
  } catch {
    throw new ApiError('INVALID_REQUEST', 400);
  }
}
