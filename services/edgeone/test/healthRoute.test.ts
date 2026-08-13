import { createHealthRoute } from '../src/routes/health';
import type { EdgeOneContext } from '../src/platform/context';

describe('EdgeOne health route', () => {
  test('reports public service metadata without echoing environment values', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/health'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-appid',
        WECHAT_APP_SECRET: 'must-not-escape-wechat',
        SESSION_HMAC_KEY: 'must-not-escape-session',
        OWNER_HMAC_KEY: 'must-not-escape-owner',
        OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        LLM_BASE_URL: 'https://llm.example.test',
        EDGEONE_DEPLOYMENT_VERSION: 'build-123',
        LLM_API_KEY: 'must-not-escape',
        LLM_MODEL: 'model-that-must-not-escape',
        GENERATION_ENABLED: 'true',
      },
      blob: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
        list: jest.fn(),
      },
    };

    const response = await createHealthRoute(context.request, context);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      data: {
        service: 'skillscope-edgeone',
        version: 'build-123',
        generationEnabled: true,
        configurationReady: true,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/must-not-escape|WECHAT_APP_SECRET|LLM_API_KEY|OPENID_ENCRYPTION_KEY/);
  });

  test('uses safe defaults when optional deployment metadata is unavailable', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/health'),
      env: {},
      blob: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), list: jest.fn() },
    };

    const response = await createHealthRoute(context.request, context);

    expect(await response.json()).toEqual({
      ok: true,
      data: {
        service: 'skillscope-edgeone',
        version: 'unknown',
        generationEnabled: false,
        configurationReady: false,
      },
    });
  });

  test('treats placeholder runtime values as not configuration ready', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/health'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-appid',
        WECHAT_APP_SECRET: 'replace-in-edgeone-console-only',
        SESSION_HMAC_KEY: 'session',
        OWNER_HMAC_KEY: 'owner',
        OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        LLM_BASE_URL: 'https://llm.example.test',
        LLM_API_KEY: 'llm-secret',
        LLM_MODEL: 'model',
        GENERATION_ENABLED: 'true',
        EDGEONE_DEPLOYMENT_VERSION: 'build-123',
      },
      blob: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), list: jest.fn() },
    };

    const response = await createHealthRoute(context.request, context);

    expect(await response.json()).toMatchObject({
      ok: true,
      data: {
        configurationReady: false,
        generationEnabled: true,
      },
    });
  });

  test('returns the standard error envelope for unsupported methods', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/health', { method: 'POST' }),
      env: {},
      blob: { get: jest.fn(), put: jest.fn(), delete: jest.fn(), list: jest.fn() },
    };

    const response = await createHealthRoute(context.request, context);

    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: expect.any(String), retryable: false },
    });
  });
});
