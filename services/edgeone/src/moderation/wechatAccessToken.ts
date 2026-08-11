import { ApiError } from '../http/errors';
import { createHash } from 'node:crypto';
import type { Deadline } from '../http/deadline';
import { remainingMilliseconds, withinDeadline } from '../http/deadline';
import type { BlobPort } from '../storage/ports';
import type { FetchPort } from '../generation/openAIClient';

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 10_000;

type StoredAccessToken = { accessToken: string; expiresAt: string };
const refreshFlights = new Map<string, Promise<string>>();

export interface WeChatAccessTokenDependencies {
  blob: BlobPort;
  appId: string | undefined;
  appSecret: string | undefined;
  fetch: FetchPort;
  now(): Date;
}

export async function getWeChatAccessToken(dependencies: WeChatAccessTokenDependencies, deadline?: Deadline): Promise<string> {
  if (!dependencies.appId || !dependencies.appSecret) throw new ApiError('CONFIGURATION_ERROR', 503, false);
  const appId = dependencies.appId;
  const appSecret = dependencies.appSecret;
  const cacheKey = tokenCacheKey(appId);
  let cached: StoredAccessToken | null;
  try {
    cached = await awaitInfrastructure(
      dependencies.blob.get<StoredAccessToken>(cacheKey, { consistency: 'strong' }),
      deadline,
    );
  } catch {
    throw backendUnavailable();
  }
  if (isUsable(cached, dependencies.now())) return cached.accessToken;

  const flightKey = appId;
  const existingFlight = refreshFlights.get(flightKey);
  if (existingFlight !== undefined) return await awaitInfrastructure(existingFlight, deadline);
  const flight = refreshAccessToken(dependencies, cacheKey, appId, appSecret, deadline);
  refreshFlights.set(flightKey, flight);
  try {
    return await awaitInfrastructure(flight, deadline);
  } finally {
    if (refreshFlights.get(flightKey) === flight) refreshFlights.delete(flightKey);
  }
}

async function refreshAccessToken(
  dependencies: WeChatAccessTokenDependencies,
  cacheKey: string,
  appId: string,
  appSecret: string,
  deadline?: Deadline,
): Promise<string> {
  let response: Response;
  const controller = new AbortController();
  const timeoutMs = operationTimeout(deadline, TOKEN_REQUEST_TIMEOUT_MS);
  if (timeoutMs <= 0) throw backendUnavailable();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(backendUnavailable());
    }, timeoutMs);
  });
  try {
    const url = new URL('https://api.weixin.qq.com/cgi-bin/token');
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', appId);
    url.searchParams.set('secret', appSecret);
    response = await Promise.race([
      dependencies.fetch(url.toString(), { signal: controller.signal }),
      expiry,
    ]);
  } catch {
    throw backendUnavailable();
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
  if (!response.ok) {
    await cancelUnreadBody(response);
    throw backendUnavailable();
  }
  let payload: unknown;
  try {
    payload = await readJsonResponse(response, deadline, TOKEN_REQUEST_TIMEOUT_MS);
  } catch {
    throw backendUnavailable();
  }
  if (!isRecord(payload)
    || typeof payload.access_token !== 'string'
    || payload.access_token.length === 0
    || typeof payload.expires_in !== 'number'
    || !Number.isFinite(payload.expires_in)
    || payload.expires_in <= 0) {
    throw backendUnavailable();
  }
  const expiresAt = new Date(dependencies.now().getTime() + payload.expires_in * 1000);
  try {
    await awaitInfrastructure(
      dependencies.blob.put(cacheKey, { accessToken: payload.access_token, expiresAt: expiresAt.toISOString() }),
      deadline,
    );
  } catch {
    throw backendUnavailable();
  }
  return payload.access_token;
}

function isUsable(value: StoredAccessToken | null, now: Date): value is StoredAccessToken {
  return value !== null
    && typeof value.accessToken === 'string'
    && Number.isFinite(new Date(value.expiresAt).getTime())
    && new Date(value.expiresAt).getTime() - now.getTime() > TOKEN_EXPIRY_MARGIN_MS;
}

function tokenCacheKey(appId: string): string {
  const digest = createHash('sha256').update(appId, 'utf8').digest('hex').slice(0, 24);
  return `moderation/wechat-access-token/${digest}.json`;
}

function operationTimeout(deadline: Deadline | undefined, maximum: number): number {
  return deadline === undefined ? maximum : Math.min(maximum, remainingMilliseconds(deadline));
}

async function awaitInfrastructure<T>(operation: Promise<T>, deadline?: Deadline): Promise<T> {
  try {
    return deadline === undefined ? await operation : await withinDeadline(operation, deadline);
  } catch {
    throw backendUnavailable();
  }
}

async function cancelUnreadBody(response: Response): Promise<void> {
  if (response.body !== null && !response.body.locked) await response.body.cancel().catch(() => undefined);
}

export async function readJsonResponse(response: Response, deadline: Deadline | undefined, maximumMs: number): Promise<unknown> {
  if (response.body === null) throw backendUnavailable();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const timeoutMs = operationTimeout(deadline, maximumMs);
      if (timeoutMs <= 0) throw backendUnavailable();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const expiry = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(backendUnavailable()), timeoutMs);
      });
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        result = await Promise.race([reader.read(), expiry]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
      if (result.done) break;
      if (result.value === undefined) continue;
      total += result.value.byteLength;
      if (total > 64 * 1024) throw backendUnavailable();
      chunks.push(result.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

function backendUnavailable(): ApiError {
  return new ApiError('BACKEND_UNAVAILABLE', 503, true);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
