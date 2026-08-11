import { ApiError } from '../http/errors';
import type { FetchPort } from '../generation/openAIClient';
import { getWeChatAccessToken, type WeChatAccessTokenDependencies } from './wechatAccessToken';

const MAX_CHUNK_BYTES = 2500;
const MODERATION_TIMEOUT_MS = 10_000;

export type WeChatTextSecurityDependencies = WeChatAccessTokenDependencies;

export function createWeChatTextSecurity(dependencies: WeChatTextSecurityDependencies) {
  return {
    async checkText(content: string): Promise<void> {
      if (typeof content !== 'string' || content.trim().length === 0) throw blocked();
      const token = await getWeChatAccessToken(dependencies);
      for (const chunk of splitUtf8(content, MAX_CHUNK_BYTES)) {
        await moderateChunk(chunk, token, dependencies.fetch);
      }
    },
  };
}

async function moderateChunk(content: string, token: string, fetchPort: FetchPort): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODERATION_TIMEOUT_MS);
  try {
    const url = new URL('https://api.weixin.qq.com/wxa/msg_sec_check');
    url.searchParams.set('access_token', token);
    const response = await fetchPort(url.toString(), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, version: 2, scene: 2 }),
      signal: controller.signal,
    });
    if (!response.ok) throw blocked();
    const payload: unknown = await response.json();
    if (!isRecord(payload) || payload.errcode !== 0 || !isRecord(payload.result) || payload.result.suggest !== 'pass') {
      throw blocked();
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw blocked();
  } finally {
    clearTimeout(timeout);
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
