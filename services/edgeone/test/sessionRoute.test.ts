import { createSessionRoute } from '../src/routes/session';
import type { EdgeOneContext } from '../src/platform/context';

describe('session route', () => {
  test('creates an opaque session from the runtime environment and ignores client owner fields', async () => {
    const records = new Map<string, unknown>();
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/session'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-app',
        WECHAT_APP_SECRET: 'runtime-app-secret',
        SESSION_HMAC_KEY: 'runtime-session-key',
        OWNER_HMAC_KEY: 'runtime-owner-key',
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
  });
});
