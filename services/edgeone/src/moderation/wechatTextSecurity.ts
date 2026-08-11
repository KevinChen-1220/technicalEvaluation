import { ApiError } from '../http/errors';
import type { FetchPort } from '../generation/openAIClient';
import { getWeChatAccessToken, readJsonResponse, type WeChatAccessTokenDependencies } from './wechatAccessToken';
import type { Deadline } from '../http/deadline';
import { remainingMilliseconds } from '../http/deadline';

const MAX_CHUNK_BYTES = 2500;
const MODERATION_TIMEOUT_MS = 10_000;

export type WeChatTextSecurityDependencies = WeChatAccessTokenDependencies;

export function createWeChatTextSecurity(dependencies: WeChatTextSecurityDependencies) {
  return {
    async checkText(content: string, openId: string, deadline?: Deadline): Promise<void> {
      if (typeof content !== 'string' || content.trim().length === 0) throw blocked();
      if (typeof openId !== 'string' || openId.length === 0) throw backendUnavailable();
      const token = await getWeChatAccessToken(dependencies, deadline);
      const chunks = splitUtf8(content, MAX_CHUNK_BYTES);
      let cursor = 0;
      const results = await Promise.allSettled(Array.from({ length: Math.min(3, chunks.length) }, async () => {
        while (cursor < chunks.length) {
          const chunk = chunks[cursor++];
          if (chunk !== undefined) await moderateChunk(chunk, openId, token, dependencies.fetch, deadline);
        }
      }));
      const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
      if (rejected !== undefined) throw rejected.reason;
    },
  };
}

async function moderateChunk(content: string, openId: string, token: string, fetchPort: FetchPort, deadline?: Deadline): Promise<void> {
  const controller = new AbortController();
  const timeoutMs = deadline === undefined ? MODERATION_TIMEOUT_MS : Math.min(MODERATION_TIMEOUT_MS, remainingMilliseconds(deadline));
  if (timeoutMs <= 0) throw backendUnavailable();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(backendUnavailable());
    }, timeoutMs);
  });
  try {
    const url = new URL('https://api.weixin.qq.com/wxa/msg_sec_check');
    url.searchParams.set('access_token', token);
    const response = await Promise.race([
      fetchPort(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ content, version: 2, scene: 2, openid: openId }),
        signal: controller.signal,
      }),
      expiry,
    ]);
    if (!response.ok) {
      await cancelUnreadBody(response);
      throw backendUnavailable();
    }
    let payload: unknown;
    try { payload = await readJsonResponse(response, deadline, MODERATION_TIMEOUT_MS); } catch { throw backendUnavailable(); }
    if (!isRecord(payload) || payload.errcode !== 0 || !isRecord(payload.result) || typeof payload.result.suggest !== 'string') {
      throw backendUnavailable();
    }
    if (payload.result.suggest !== 'pass') throw blocked();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw backendUnavailable();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function cancelUnreadBody(response: Response): Promise<void> {
  if (response.body !== null && !response.body.locked) await response.body.cancel().catch(() => undefined);
}

function splitUtf8(value: string, maxBytes: number): string[] {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (bytes + characterBytes > maxBytes && current.length > 0) {
      chunks.push(current);
      current = '';
      bytes = 0;
    }
    current += character;
    bytes += characterBytes;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

function blocked(): ApiError {
  return new ApiError('CONTENT_BLOCKED', 422, false);
}

function backendUnavailable(): ApiError {
  return new ApiError('BACKEND_UNAVAILABLE', 503, true);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
