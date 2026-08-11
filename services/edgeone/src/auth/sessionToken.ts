import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError } from '../http/errors';
import type { BlobPort } from '../storage/ports';
import { deriveOwnerKey } from './ownerKey';

const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredSession {
  tokenHash: string;
  tokenProof: string;
  ownerKey: string;
  encryptedOpenId: EncryptedOpenId;
  createdAt: string;
  expiresAt: string;
}

type EncryptedOpenId = { iv: string; tag: string; ciphertext: string };

export interface SessionDependencies {
  blob: BlobPort;
  sessionHmacKey: string | undefined;
  ownerHmacKey: string | undefined;
  openIdEncryptionKey: string | undefined;
  now?: () => Date;
  randomBytes?: () => Uint8Array;
}

export interface SessionIdentity { ownerKey: string; openId: string }

export async function issueSession(
  openId: string,
  dependencies: SessionDependencies,
): Promise<{ token: string; expiresAt: string }> {
  const keys = requireSessionKeys(dependencies);
  if (!openId) throw new ApiError('INVALID_REQUEST', 400);

  const token = Buffer.from((dependencies.randomBytes ?? randomBytes)(32)).toString('base64url');
  const tokenHash = hashToken(token);
  const ownerKey = deriveOwnerKey(openId, keys.ownerHmacKey);
  const now = (dependencies.now ?? (() => new Date()))();
  const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString();
  const stored: StoredSession = {
    tokenHash,
    tokenProof: tokenProof(token, keys.sessionHmacKey),
    ownerKey,
    encryptedOpenId: encryptOpenId(openId, tokenHash, ownerKey, keys.openIdEncryptionKey, dependencies.randomBytes),
    createdAt: now.toISOString(),
    expiresAt,
  };

  try {
    await dependencies.blob.put(sessionBlobKey(tokenHash), stored);
  } catch {
    throw backendUnavailable();
  }
  return { token, expiresAt };
}

export async function requireSession(request: Request, dependencies: SessionDependencies): Promise<SessionIdentity> {
  const keys = requireSessionKeys(dependencies);
  const token = bearerToken(request.headers.get('authorization'));
  const tokenHash = hashToken(token);
  let stored: StoredSession | null;
  try {
    stored = await dependencies.blob.get<StoredSession>(sessionBlobKey(tokenHash), { consistency: 'strong' });
  } catch {
    throw backendUnavailable();
  }
  if (!stored) throw new ApiError('UNAUTHORIZED', 401);

  if (!isValidStoredSession(stored)) throw backendUnavailable();

  if (!constantTimeEqual(stored.tokenHash, tokenHash) || !constantTimeEqual(stored.tokenProof, tokenProof(token, keys.sessionHmacKey))) {
    throw new ApiError('UNAUTHORIZED', 401);
  }
  const now = (dependencies.now ?? (() => new Date()))();
  if (!isValidStoredSession(stored) || new Date(stored.expiresAt).getTime() <= now.getTime()) {
    throw new ApiError('SESSION_EXPIRED', 401);
  }
  let openId: string;
  try {
    openId = decryptOpenId(stored.encryptedOpenId, tokenHash, stored.ownerKey, keys.openIdEncryptionKey);
  } catch {
    throw backendUnavailable();
  }
  return { ownerKey: stored.ownerKey, openId };
}

export function sessionDependenciesFromEnvironment(blob: BlobPort, env: Record<string, string | undefined>): SessionDependencies {
  return {
    blob,
    sessionHmacKey: env.SESSION_HMAC_KEY,
    ownerHmacKey: env.OWNER_HMAC_KEY,
    openIdEncryptionKey: env.OPENID_ENCRYPTION_KEY,
  };
}

export function isValidOpenIdEncryptionKey(value: string | undefined): boolean {
  return value !== undefined && decodeEncryptionKey(value) !== null;
}

function requireSessionKeys(dependencies: SessionDependencies): { sessionHmacKey: string; ownerHmacKey: string; openIdEncryptionKey: Buffer } {
  if (!dependencies.sessionHmacKey || !dependencies.ownerHmacKey || !dependencies.openIdEncryptionKey) {
    throw backendUnavailable();
  }
  const openIdEncryptionKey = decodeEncryptionKey(dependencies.openIdEncryptionKey);
  if (openIdEncryptionKey === null) throw backendUnavailable();
  return { sessionHmacKey: dependencies.sessionHmacKey, ownerHmacKey: dependencies.ownerHmacKey, openIdEncryptionKey };
}

function encryptOpenId(
  openId: string,
  tokenHash: string,
  ownerKey: string,
  key: Buffer,
  random?: () => Uint8Array,
): EncryptedOpenId {
  const iv = Buffer.from((random ?? (() => randomBytes(12)))()).subarray(0, 12);
  if (iv.length !== 12) throw backendUnavailable();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad(tokenHash, ownerKey));
  const ciphertext = Buffer.concat([cipher.update(openId, 'utf8'), cipher.final()]);
  return {
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  };
}

function decryptOpenId(encrypted: EncryptedOpenId, tokenHash: string, ownerKey: string, key: Buffer): string {
  const iv = Buffer.from(encrypted.iv, 'base64url');
  const tag = Buffer.from(encrypted.tag, 'base64url');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) throw backendUnavailable();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad(tokenHash, ownerKey));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function aad(tokenHash: string, ownerKey: string): Buffer {
  return Buffer.from(`skillscope-session-v1\0${tokenHash}\0${ownerKey}`, 'utf8');
}

function decodeEncryptionKey(value: string): Buffer | null {
  if (!/^[A-Za-z0-9+/_-]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, value.includes('-') || value.includes('_') ? 'base64url' : 'base64');
  return key.length === 32 ? key : null;
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

function isValidStoredSession(value: unknown): value is StoredSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<StoredSession>;
  return typeof session.tokenHash === 'string'
    && typeof session.tokenProof === 'string'
    && typeof session.ownerKey === 'string'
    && isEncryptedOpenId(session.encryptedOpenId)
    && typeof session.createdAt === 'string'
    && typeof session.expiresAt === 'string'
    && Number.isFinite(new Date(session.createdAt).getTime())
    && Number.isFinite(new Date(session.expiresAt).getTime());
}

function isEncryptedOpenId(value: unknown): value is EncryptedOpenId {
  if (!value || typeof value !== 'object') return false;
  const encrypted = value as Partial<EncryptedOpenId>;
  return typeof encrypted.iv === 'string' && typeof encrypted.tag === 'string' && typeof encrypted.ciphertext === 'string';
}

function backendUnavailable(): ApiError {
  return new ApiError('BACKEND_UNAVAILABLE', 503, true);
}
