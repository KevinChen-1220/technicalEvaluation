import { ApiError } from '../http/errors';
import type { BlobPort } from '../storage/ports';
import type { FetchPort } from '../generation/openAIClient';

const TOKEN_KEY = 'moderation/wechat-access-token.json';
const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

type StoredAccessToken = { accessToken: string; expiresAt: string };

export interface WeChatAccessTokenDependencies {
  blob: BlobPort;
  appId: string | undefined;
  appSecret: string | undefined;
  fetch: FetchPort;
  now(): Date;
}

export async function getWeChatAccessToken(dependencies: WeChatAccessTokenDependencies): Promise<string> {
  if (!dependencies.appId || !dependencies.appSecret) throw new ApiError('CONFIGURATION_ERROR', 503, false);
  let cached: StoredAccessToken | null;
  try {
    cached = await dependencies.blob.get<StoredAccessToken>(TOKEN_KEY, { consistency: 'strong' });
  } catch {
    throw new ApiError('CONTENT_BLOCKED', 503, false);
  }
  if (isUsable(cached, dependencies.now())) return cached.accessToken;

  let response: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TOKEN_REQUEST_TIMEOUT_MS);
  try {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', dependencies.appId);
    url.searchParams.set('secret', dependencies.appSecret);
    response = await dependencies.fetch(url.toString(), { signal: controller.signal });
  } catch {
    throw new ApiError('CONTENT_BLOCKED', 503, false);
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new ApiError('CONTENT_BLOCKED', 503, false);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError('CONTENT_BLOCKED', 503, false);
  }
  if (!isRecord(payload) || typeof payload.access_token !== 'string' || typeof payload.expires_in !== 'number') {
    throw new ApiError('CONTENT_BLOCKED', 503, false);
  }
  const expiresAt = new Date(dependencies.now().getTime() + Math.max(0, payload.expires_in * 1000 - TOKEN_EXPIRY_MARGIN_MS));
  try {
    await dependencies.blob.put(TOKEN_KEY, { accessToken: payload.access_token, expiresAt: expiresAt.toISOString() });
  } catch {
    throw new ApiError('CONTENT_BLOCKED', 503, false);
  }
  return payload.access_token;
}

function isUsable(value: StoredAccessToken | null, now: Date): value is StoredAccessToken {
  return value !== null
    && typeof value.accessToken === 'string'
    && Number.isFinite(new Date(value.expiresAt).getTime())
    && new Date(value.expiresAt).getTime() > now.getTime();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
