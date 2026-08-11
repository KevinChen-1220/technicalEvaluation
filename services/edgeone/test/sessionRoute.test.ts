import { createSessionRoute } from '../src/routes/session';
import type { EdgeOneContext } from '../src/platform/context';

describe('session route', () => {
  test('preflights every required credential before calling WeChat', async () => {
    const fetch = jest.fn(async () => new Response(JSON.stringify({ openid: 'never-used' })));
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/session'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-app',
        WECHAT_APP_SECRET: 'runtime-app-secret',
        SESSION_HMAC_KEY: 'runtime-session-key',
      },
      blob: {
        get: jest.fn(), put: jest.fn(), delete: jest.fn(), list: jest.fn(async () => ({ blobs: [], directories: [] })),
      },
    };

    const response = await createSessionRoute(new Request('https://example.test/api/session', {
      method: 'POST', body: JSON.stringify({ code: 'wx-code' }),
    }), context, fetch);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: {
      code: 'BACKEND_UNAVAILABLE', message: expect.any(String), retryable: true,
    } });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('maps Blob persistence failures to a retryable backend response', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/session'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-app', WECHAT_APP_SECRET: 'runtime-app-secret',
        SESSION_HMAC_KEY: 'runtime-session-key', OWNER_HMAC_KEY: 'runtime-owner-key',
        OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      },
      blob: {
        get: jest.fn(),
        put: jest.fn(async () => { throw new Error('Blob service unavailable'); }) as EdgeOneContext['blob']['put'],
        delete: jest.fn(), list: jest.fn(async () => ({ blobs: [], directories: [] })),
      },
    };

    const response = await createSessionRoute(new Request('https://example.test/api/session', {
      method: 'POST', body: JSON.stringify({ code: 'wx-code' }),
    }), context, async () => new Response(JSON.stringify({ openid: 'private-openid' })));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: {
      code: 'BACKEND_UNAVAILABLE', message: expect.any(String), retryable: true,
    } });
  });

  test('creates an opaque session from the runtime environment and ignores client owner fields', async () => {
    const records = new Map<string, unknown>();
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/session'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-app',
        WECHAT_APP_SECRET: 'runtime-app-secret',
        SESSION_HMAC_KEY: 'runtime-session-key',
        OWNER_HMAC_KEY: 'runtime-owner-key',
        OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      },
      blob: {
        get: jest.fn(async (key: string) => records.get(key) ?? null) as EdgeOneContext['blob']['get'],
        put: jest.fn(async (key: string, value: unknown) => { records.set(key, value); }) as EdgeOneContext['blob']['put'],
        delete: jest.fn(),
        list: jest.fn(async () => ({ blobs: [], directories: [] })),
      },
    };
    const request = new Request('https://example.test/api/session', {
      method: 'POST',
      body: JSON.stringify({ code: 'wx-code', ownerKey: 'forged-owner' }),
    });

    const response = await createSessionRoute(request, context, async () => new Response(JSON.stringify({ openid: 'private-openid' })));
    const body = await response.json() as { ok: boolean; data: { token: string; expiresAt: string } };

    expect(response.status).toBe(201);
    expect(body.ok).toBe(true);
    expect(body.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(body)).not.toContain('forged-owner');
    expect(JSON.stringify([...records.values()])).not.toContain('private-openid');
    expect([...records.values()][0]).toEqual(expect.objectContaining({ encryptedOpenId: expect.any(Object) }));
  });

  test.each([undefined, 'not-a-32-byte-key'])(
    'rejects a missing or invalid OpenID encryption key before exchanging the WeChat code: %s',
    async (openIdEncryptionKey) => {
    const fetch = jest.fn(async () => new Response(JSON.stringify({ openid: 'never-used' })));
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/session'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-app', WECHAT_APP_SECRET: 'runtime-app-secret',
        SESSION_HMAC_KEY: 'runtime-session-key', OWNER_HMAC_KEY: 'runtime-owner-key',
        ...(openIdEncryptionKey === undefined ? {} : { OPENID_ENCRYPTION_KEY: openIdEncryptionKey }),
      },
      blob: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), list: jest.fn(async () => ({ blobs: [], directories: [] })) },
    };
    const response = await createSessionRoute(new Request('https://example.test/api/session', {
      method: 'POST', body: JSON.stringify({ code: 'wx-code' }),
    }), context, fetch);

    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    },
  );

  test('returns the standard error envelope for unsupported methods', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/session'),
      env: {},
      blob: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), list: jest.fn() },
    };

    const response = await createSessionRoute(context.request, context, jest.fn());

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: expect.any(String), retryable: false },
    });
  });
});
