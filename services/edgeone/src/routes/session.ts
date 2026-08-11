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
    const payload = await request.json() as { code?: unknown };
    if (typeof payload.code !== 'string') throw new ApiError('INVALID_REQUEST', 400);
    const { openId } = await exchangeWeChatCode(payload.code, context.env, fetch);
    const session = await issueSession(openId, sessionDependenciesFromEnvironment(context.blob, context.env));
    return success(session, 201);
  } catch (error) {
    if (error instanceof ApiError) return failure(error.code, error.retryable, error.status);
    return failure('INVALID_REQUEST', false, 400);
  }
}
