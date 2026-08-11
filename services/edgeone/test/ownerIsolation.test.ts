import { issueSession, requireSession } from '../src/auth/sessionToken';
import type { BlobPort } from '../src/storage/ports';

function createBlob(): BlobPort {
  const records = new Map<string, unknown>();
  const get = jest.fn(async (key: string) => records.get(key) ?? null);
  const put = jest.fn(async (key: string, value: unknown) => { records.set(key, value); });
  return {
    get: get as BlobPort['get'],
    put: put as BlobPort['put'],
    delete: jest.fn(),
    list: jest.fn(async () => ({ blobs: [], directories: [] })),
  };
}

describe('owner isolation', () => {
  test('uses the bearer session owner instead of a forged client owner', async () => {
    const blob = createBlob();
    let seed = 10;
    const dependencies = {
      blob,
      now: () => new Date('2026-08-11T00:00:00.000Z'),
      sessionHmacKey: 'session-hmac-key',
      ownerHmacKey: 'owner-hmac-key',
      openIdEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
      randomBytes: () => new Uint8Array(32).fill(seed++),
    };
    const alice = await issueSession('alice-openid', dependencies);
    const bob = await issueSession('bob-openid', dependencies);

    const identity = await requireSession(new Request('https://example.test/api/assessment?owner=forged-owner', {
      method: 'POST',
      headers: { authorization: `Bearer ${alice.token}` },
      body: JSON.stringify({ ownerKey: 'forged-owner' }),
    }), dependencies);
    const bobIdentity = await requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${bob.token}` },
    }), dependencies);

    expect(identity.ownerKey).not.toBe('forged-owner');
    expect(identity.ownerKey).not.toBe(bobIdentity.ownerKey);
  });

  test('rejects missing and tampered bearer tokens', async () => {
    const blob = createBlob();
    const dependencies = {
      blob,
      now: () => new Date('2026-08-11T00:00:00.000Z'),
      sessionHmacKey: 'session-hmac-key',
      ownerHmacKey: 'owner-hmac-key',
      openIdEncryptionKey: Buffer.alloc(32, 9).toString('base64'),
      randomBytes: () => new Uint8Array(32).fill(13),
    };
    const issued = await issueSession('alice-openid', dependencies);

    await expect(requireSession(new Request('https://example.test/api/assessment'), dependencies)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(requireSession(new Request('https://example.test/api/assessment', {
      headers: { authorization: `Bearer ${issued.token.slice(0, -1)}A` },
    }), dependencies)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
