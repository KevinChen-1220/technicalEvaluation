import { issueSession, requireSession } from '../src/auth/sessionToken';
import type { BlobPort } from '../src/storage/ports';

function createBlob(): BlobPort & { records: Map<string, unknown> } {
  const records = new Map<string, unknown>();
  const get = jest.fn(async (key: string) => records.get(key) ?? null);
  const put = jest.fn(async (key: string, value: unknown) => { records.set(key, value); });
  return {
    records,
    get: get as BlobPort['get'],
    put: put as BlobPort['put'],
    delete: jest.fn(async (key: string) => { records.delete(key); }),
    list: jest.fn(async () => ({ blobs: [], directories: [] })),
  };
}

function deps(blob = createBlob(), now = new Date('2026-08-11T00:00:00.000Z')) {
  return {
    blob,
    now: () => now,
    sessionHmacKey: 'session-hmac-key',
    ownerHmacKey: 'owner-hmac-key',
    openIdEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
    randomBytes: () => new Uint8Array(32).fill(7),
  };
}

describe('opaque sessions', () => {
  test('stores only hashed token and derived owner key with a seven-day expiration', async () => {
    const blob = createBlob();
    const result = await issueSession('openid-must-never-be-persisted', deps(blob));
    const stored = [...blob.records.values()][0];

    expect(result.token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(result.expiresAt).toBe('2026-08-18T00:00:00.000Z');
    expect(JSON.stringify(stored)).not.toContain('openid-must-never-be-persisted');
    expect(stored).toEqual(expect.objectContaining({
      tokenHash: expect.any(String),
      ownerKey: expect.any(String),
      encryptedOpenId: {
        iv: expect.any(String),
        tag: expect.any(String),
        ciphertext: expect.any(String),
      },
    }));
    expect(blob.get).not.toHaveBeenCalled();
  });

  test('uses strong consistency and rejects an expired session', async () => {
    const blob = createBlob();
    const issued = await issueSession('open-id', deps(blob));
    const expiredDeps = deps(blob, new Date('2026-08-18T00:00:00.001Z'));

    await expect(requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${issued.token}` },
    }), expiredDeps)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(blob.get).toHaveBeenCalledWith(expect.stringMatching(/^sessions\/[a-f0-9]{64}\.json$/), { consistency: 'strong' });
  });

  test('decrypts OpenID only for authenticated server-side consumers', async () => {
    const blob = createBlob();
    const issued = await issueSession('private-open-id', deps(blob));
    const identity = await requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${issued.token}` },
    }), deps(blob));

    expect(identity).toEqual({ ownerKey: expect.any(String), openId: 'private-open-id' });
    expect(JSON.stringify([...blob.records.entries()])).not.toContain('private-open-id');
  });

  test('rejects tampered encrypted OpenID without exposing it', async () => {
    const blob = createBlob();
    const issued = await issueSession('private-open-id', deps(blob));
    const [key, value] = [...blob.records.entries()][0] as [string, Record<string, unknown>];
    const encrypted = value.encryptedOpenId as { ciphertext: string };
    const first = encrypted.ciphertext.startsWith('A') ? 'B' : 'A';
    blob.records.set(key, {
      ...value,
      encryptedOpenId: { ...encrypted, ciphertext: `${first}${encrypted.ciphertext.slice(1)}` },
    });

    await expect(requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${issued.token}` },
    }), deps(blob))).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
  });

  test('maps Blob read failures to a retryable backend error', async () => {
    const blob = createBlob();
    const issued = await issueSession('open-id', deps(blob));
    (blob.get as unknown as jest.Mock).mockRejectedValueOnce(new Error('Blob unavailable'));

    await expect(requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${issued.token}` },
    }), deps(blob))).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', status: 503, retryable: true });
  });

  test('maps corrupted session records to a retryable backend error', async () => {
    const blob = createBlob();
    const issued = await issueSession('open-id', deps(blob));
    const [key] = [...blob.records.keys()];
    blob.records.set(key!, { tokenHash: null });

    await expect(requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${issued.token}` },
    }), deps(blob))).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', status: 503, retryable: true });
  });
});
