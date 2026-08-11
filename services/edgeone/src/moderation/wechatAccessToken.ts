import { ApiError } from '../http/errors';
import { createHash, randomUUID } from 'node:crypto';
import type { Deadline } from '../http/deadline';
import { createDeadline, remainingMilliseconds, withinDeadline } from '../http/deadline';
import { BlobPreconditionFailedError, type BlobPort } from '../storage/ports';
import type { FetchPort } from '../generation/openAIClient';

const TOKEN_EXPIRY_MARGIN_MS = 5 * 60 * 1000;
const TOKEN_REQUEST_TIMEOUT_MS = 8_000;
const TOKEN_REFRESH_BUDGET_MS = 10_000;
const REFRESH_LOCK_LEASE_MS = 12_000;
const REFRESH_POLL_MS = 50;
const MAX_LOCK_REVISION = 999_999_999_999;

type StoredAccessToken = { revision: number; accessToken: string; issuedAt: string; expiresAt: string };
type LegacyAccessToken = { accessToken: string; expiresAt: string };
type StoredRefreshLock = { revision: number; ownerToken: string; leaseUntil: string; updatedAt: string };
type RefreshLockState = { key: string; lock: StoredRefreshLock };
const refreshFlightsByScope = new WeakMap<object, Map<string, Promise<string>>>();

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
  let cached: StoredAccessToken | LegacyAccessToken | null;
  try {
    cached = await readLatestAccessToken(dependencies.blob, appId, dependencies.now(), deadline);
  } catch {
    throw backendUnavailable();
  }
  if (isUsable(cached, dependencies.now())) return cached.accessToken;

  const flightKey = appId;
  const refreshFlights = flightsFor(dependencies.blob);
  const existingFlight = refreshFlights.get(flightKey);
  if (existingFlight !== undefined) return await awaitInfrastructure(existingFlight, deadline);
  const internalDeadline = createDeadline(TOKEN_REFRESH_BUDGET_MS);
  const refresh = refreshAcrossInstances(dependencies, appId, appSecret, internalDeadline);
  let flight: Promise<string>;
  flight = refresh.then(
    (value) => {
      if (refreshFlights.get(flightKey) === flight) refreshFlights.delete(flightKey);
      return value;
    },
    (error: unknown) => {
      if (refreshFlights.get(flightKey) === flight) refreshFlights.delete(flightKey);
      throw error;
    },
  );
  refreshFlights.set(flightKey, flight);
  return await awaitInfrastructure(flight, deadline);
}

function flightsFor(blob: BlobPort): Map<string, Promise<string>> {
  const scope = blob.coordinationKey ?? blob;
  const existing = refreshFlightsByScope.get(scope);
  if (existing !== undefined) return existing;
  const created = new Map<string, Promise<string>>();
  refreshFlightsByScope.set(scope, created);
  return created;
}

async function refreshAcrossInstances(
  dependencies: WeChatAccessTokenDependencies,
  appId: string,
  appSecret: string,
  deadline: Deadline,
): Promise<string> {
  while (remainingMilliseconds(deadline) > 0) {
    const cached = await readLatestAccessToken(dependencies.blob, appId, dependencies.now(), deadline);
    if (isUsable(cached, dependencies.now())) return cached.accessToken;

    const currentLock = await readLatestRefreshLock(dependencies.blob, appId, dependencies.now(), deadline);
    if (currentLock !== null && isActiveLock(currentLock.lock, dependencies.now())) {
      await waitForRefresh(deadline);
      continue;
    }

    const now = dependencies.now();
    const revision = (currentLock?.lock.revision ?? 0) + 1;
    if (revision > MAX_LOCK_REVISION) throw backendUnavailable();
    const lockKey = refreshLockKey(appId, revision, now);
    const ownerToken = randomUUID();
    const claimedLock: StoredRefreshLock = {
      revision,
      ownerToken,
      leaseUntil: new Date(now.getTime() + REFRESH_LOCK_LEASE_MS).toISOString(),
      updatedAt: now.toISOString(),
    };
    try {
      await awaitInfrastructure(dependencies.blob.put(lockKey, claimedLock, { onlyIfNew: true }), deadline);
    } catch (error) {
      if (isPreconditionFailure(error)) {
        await waitForRefresh(deadline);
        continue;
      }
      throw error;
    }
    if (currentLock !== null) void dependencies.blob.delete(currentLock.key).catch(() => undefined);

    const afterClaim = await readLatestAccessToken(dependencies.blob, appId, dependencies.now(), deadline);
    if (isUsable(afterClaim, dependencies.now())) return afterClaim.accessToken;
    return await refreshAccessToken(dependencies, appId, appSecret, claimedLock, deadline);
  }
  throw backendUnavailable();
}

async function refreshAccessToken(
  dependencies: WeChatAccessTokenDependencies,
  appId: string,
  appSecret: string,
  lock: StoredRefreshLock,
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
    cancelUnreadBody(response);
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
      dependencies.blob.put(tokenCacheKey(appId, lock.revision, lock.updatedAt), {
        revision: lock.revision,
        accessToken: payload.access_token,
        issuedAt: lock.updatedAt,
        expiresAt: expiresAt.toISOString(),
      }, { onlyIfNew: true }),
      deadline,
    );
    void pruneOlderTokens(dependencies.blob, appId, lock.revision, lock.updatedAt).catch(() => undefined);
  } catch {
    throw backendUnavailable();
  }
  return payload.access_token;
}

function isUsable(value: StoredAccessToken | LegacyAccessToken | null, now: Date): value is StoredAccessToken | LegacyAccessToken {
  return value !== null
    && typeof value.accessToken === 'string'
    && Number.isFinite(new Date(value.expiresAt).getTime())
    && new Date(value.expiresAt).getTime() - now.getTime() > TOKEN_EXPIRY_MARGIN_MS;
}

function legacyTokenCacheKey(appId: string): string {
  const digest = createHash('sha256').update(appId, 'utf8').digest('hex').slice(0, 24);
  return `moderation/wechat-access-token/${digest}.json`;
}

function tokenCachePrefix(appId: string, utcDay: string): string {
  const digest = createHash('sha256').update(appId, 'utf8').digest('hex').slice(0, 24);
  return `moderation/wechat-access-token/${digest}.tokens/${utcDay}/`;
}

function tokenCacheKey(appId: string, revision: number, issuedAt: string): string {
  const inverse = MAX_LOCK_REVISION - revision;
  return `${tokenCachePrefix(appId, issuedAt.slice(0, 10))}${String(inverse).padStart(12, '0')}.json`;
}

async function readLatestAccessToken(
  blob: BlobPort,
  appId: string,
  now: Date,
  deadline?: Deadline,
): Promise<StoredAccessToken | LegacyAccessToken | null> {
  const listings = await awaitInfrastructure(Promise.all(currentAndPreviousUtcDays(now).map(async (utcDay) => (
    await blob.list(tokenCachePrefix(appId, utcDay), { consistency: 'strong' })
  ))), deadline);
  const keys = listings.flatMap((listing) => listing.blobs);
  const candidates = await awaitInfrastructure(Promise.all(keys.map(async (key) => (
    await blob.get<StoredAccessToken>(key, { consistency: 'strong' })
  ))), deadline);
  const valid = candidates.filter((value): value is StoredAccessToken => isStoredAccessToken(value));
  valid.sort((left, right) => new Date(right.issuedAt).getTime() - new Date(left.issuedAt).getTime()
    || right.revision - left.revision);
  if (valid[0] !== undefined) return valid[0];
  return await awaitInfrastructure(
    blob.get<LegacyAccessToken>(legacyTokenCacheKey(appId), { consistency: 'strong' }), deadline,
  );
}

function isStoredAccessToken(value: StoredAccessToken | null): value is StoredAccessToken {
  return value !== null
    && Number.isInteger(value.revision)
    && value.revision > 0
    && typeof value.accessToken === 'string'
    && value.accessToken.length > 0
    && Number.isFinite(new Date(value.issuedAt).getTime())
    && Number.isFinite(new Date(value.expiresAt).getTime());
}

async function pruneOlderTokens(blob: BlobPort, appId: string, keepRevision: number, issuedAt: string): Promise<void> {
  const listing = await blob.list(tokenCachePrefix(appId, issuedAt.slice(0, 10)), { consistency: 'strong' });
  await Promise.all(listing.blobs.map(async (key) => {
    const inverse = Number(/\/(\d{12})\.json$/.exec(key)?.[1]);
    const revision = MAX_LOCK_REVISION - inverse;
    if (Number.isInteger(revision) && revision < keepRevision) await blob.delete(key);
  }));
}

function refreshLockPrefix(appId: string, utcDay: string): string {
  const digest = createHash('sha256').update(appId, 'utf8').digest('hex').slice(0, 24);
  return `moderation/wechat-access-token/${digest}.refresh-locks/${utcDay}/`;
}

function refreshLockKey(appId: string, revision: number, now: Date): string {
  const inverse = MAX_LOCK_REVISION - revision;
  return `${refreshLockPrefix(appId, now.toISOString().slice(0, 10))}${String(inverse).padStart(12, '0')}.json`;
}

async function readLatestRefreshLock(
  blob: BlobPort,
  appId: string,
  now: Date,
  deadline: Deadline,
): Promise<RefreshLockState | null> {
  const listings = await awaitInfrastructure(Promise.all(currentAndPreviousUtcDays(now).map(async (utcDay) => (
    await blob.list(refreshLockPrefix(appId, utcDay), { consistency: 'strong' })
  ))), deadline);
  const keys = listings.flatMap((listing) => listing.blobs);
  const states = await awaitInfrastructure(Promise.all(keys.map(async (key) => ({
    key,
    lock: await blob.get<StoredRefreshLock>(key, { consistency: 'strong' }),
  }))), deadline);
  const valid = states.filter((state): state is RefreshLockState => state.lock !== null
    && Number.isInteger(state.lock.revision)
    && state.lock.revision > 0);
  valid.sort((left, right) => new Date(right.lock.updatedAt).getTime() - new Date(left.lock.updatedAt).getTime()
    || right.lock.revision - left.lock.revision);
  return valid[0] ?? null;
}

function currentAndPreviousUtcDays(now: Date): string[] {
  return [
    now.toISOString().slice(0, 10),
    new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10),
  ];
}

function isActiveLock(value: StoredRefreshLock | null, now: Date): value is StoredRefreshLock {
  return value !== null
    && typeof value.ownerToken === 'string'
    && typeof value.leaseUntil === 'string'
    && Number.isFinite(new Date(value.leaseUntil).getTime())
    && new Date(value.leaseUntil).getTime() > now.getTime();
}

async function waitForRefresh(deadline: Deadline): Promise<void> {
  const delay = Math.min(REFRESH_POLL_MS, remainingMilliseconds(deadline));
  if (delay <= 0) throw backendUnavailable();
  await awaitInfrastructure(new Promise<void>((resolve) => setTimeout(resolve, delay)), deadline);
}

function operationTimeout(deadline: Deadline | undefined, maximum: number): number {
  return deadline === undefined ? maximum : Math.min(maximum, remainingMilliseconds(deadline));
}

async function awaitInfrastructure<T>(operation: Promise<T>, deadline?: Deadline): Promise<T> {
  try {
    return deadline === undefined ? await operation : await withinDeadline(operation, deadline);
  } catch (error) {
    if (isPreconditionFailure(error)) throw error;
    throw backendUnavailable();
  }
}

function cancelUnreadBody(response: Response): void {
  if (response.body !== null && !response.body.locked) void response.body.cancel().catch(() => undefined);
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
    void reader.cancel().catch(() => undefined);
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

function isPreconditionFailure(error: unknown): boolean {
  return error instanceof BlobPreconditionFailedError
    || (isRecord(error) && error.code === 'BLOB_PRECONDITION_FAILED');
}
