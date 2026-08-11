import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../http/errors';
import type { BlobPort } from '../storage/ports';
import { deriveOwnerKey } from './ownerKey';

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredSession {
  tokenHash: string;
  tokenProof: string;
  ownerKey: string;
  createdAt: string;
  expiresAt: string;
}

export interface SessionDependencies {
  blob: BlobPort;
  sessionHmacKey: string | undefined;
  ownerHmacKey: string | undefined;
  now?: () => Date;
  randomBytes?: () => Uint8Array;
}

export interface SessionIdentity {
  ownerKey: string;
}

export async function issueSession(
  openId: string,
  dependencies: SessionDependencies,
): Promise<{ token: string; expiresAt: string }> {
  const keys = requireSessionKeys(dependencies);
  if (!openId) throw new ApiError('INVALID_REQUEST', 400);

  const token = Buffer.from((dependencies.randomBytes ?? randomBytes)(32)).toString('base64url');
  const tokenHash = hashToken(token);
  const now = (dependencies.now ?? (() => new Date()))();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  const stored: StoredSession = {
    tokenHash,
    tokenProof: tokenProof(token, keys.sessionHmacKey),
    ownerKey: deriveOwnerKey(openId, keys.ownerHmacKey),
    createdAt: now.toISOString(),
    expiresAt,
  };

  await dependencies.blob.put(sessionBlobKey(tokenHash), stored);
  return { token, expiresAt };
}

export async function requireSession(request: Request, dependencies: SessionDependencies): Promise<SessionIdentity> {
  const keys = requireSessionKeys(dependencies);
  const token = bearerToken(request.headers.get('authorization'));
  const tokenHash = hashToken(token);
  const stored = await dependencies.blob.get<StoredSession>(sessionBlobKey(tokenHash), { consistency: 'strong' });
  if (!stored) throw new ApiError('UNAUTHORIZED', 401);

  if (!constantTimeEqual(stored.tokenHash, tokenHash) || !constantTimeEqual(stored.tokenProof, tokenProof(token, keys.sessionHmacKey))) {
    throw new ApiError('UNAUTHORIZED', 401);
  }
  const now = (dependencies.now ?? (() => new Date()))();
  if (!isValidStoredSession(stored) || new Date(stored.expiresAt).getTime() <= now.getTime()) {
    throw new ApiError('SESSION_EXPIRED', 401);
  }
  return { ownerKey: stored.ownerKey };
}

export function sessionDependenciesFromEnvironment(blob: BlobPort, env: Record<string, string | undefined>): SessionDependencies {
  return {
    blob,
    sessionHmacKey: env.SESSION_HMAC_KEY,
    ownerHmacKey: env.OWNER_HMAC_KEY,
  };
}

function requireSessionKeys(dependencies: SessionDependencies): { sessionHmacKey: string; ownerHmacKey: string } {
  if (!dependencies.sessionHmacKey || !dependencies.ownerHmacKey) {
    throw new ApiError('SERVICE_UNAVAILABLE', 503, true);
  }
  return { sessionHmacKey: dependencies.sessionHmacKey, ownerHmacKey: dependencies.ownerHmacKey };
}

function bearerToken(value: string | null): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value ?? '');
  if (!match?.[1]) throw new ApiError('UNAUTHORIZED', 401);
  return match[1];
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

function tokenProof(token: string, sessionHmacKey: string): string {
  return createHmac('sha256', sessionHmacKey).update(token, 'utf8').digest('hex');
}

function sessionBlobKey(tokenHash: string): string {
  return `sessions/${tokenHash}.json`;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function isValidStoredSession(value: StoredSession): boolean {
  return typeof value.tokenHash === 'string'
    && typeof value.tokenProof === 'string'
    && typeof value.ownerKey === 'string'
    && typeof value.expiresAt === 'string'
    && Number.isFinite(new Date(value.expiresAt).getTime());
}
