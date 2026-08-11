import type { EdgeOneEnvironment } from '../platform/context';
import { ApiError } from '../http/errors';

export type WeChatFetch = (url: string) => Promise<Response>;

const WECHAT_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';

export async function exchangeWeChatCode(
  code: string,
  env: EdgeOneEnvironment,
  fetch: WeChatFetch,
): Promise<{ openId: string }> {
  const appId = env.WECHAT_APP_ID;
  const appSecret = env.WECHAT_APP_SECRET;
  if (!code.trim()) throw new ApiError('INVALID_REQUEST', 400);
  if (!appId || !appSecret) throw new ApiError('SERVICE_UNAVAILABLE', 503, true);

  const endpoint = new URL(WECHAT_SESSION_URL);
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'api.weixin.qq.com') {
    throw new ApiError('SERVICE_UNAVAILABLE', 503, true);
  }
  endpoint.search = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code.trim(),
    grant_type: 'authorization_code',
  }).toString();

  let response: Response;
  try {
    response = await fetch(endpoint.toString());
  } catch {
    throw new ApiError('WECHAT_SESSION_EXCHANGE_FAILED', 502, true);
  }

  if (!response.ok) throw new ApiError('WECHAT_SESSION_EXCHANGE_FAILED', 502, true);

  let payload: { openid?: unknown; errcode?: unknown };
  try {
    payload = await response.json() as { openid?: unknown; errcode?: unknown };
  } catch {
    throw new ApiError('WECHAT_SESSION_EXCHANGE_FAILED', 502, true);
  }
  if (typeof payload.openid !== 'string' || !payload.openid) {
    throw new ApiError('WECHAT_SESSION_EXCHANGE_FAILED', 502, true);
  }
  return { openId: payload.openid };
}
