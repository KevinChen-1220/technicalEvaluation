import { onRequest } from '../node-functions/api/health';

jest.mock('@edgeone/pages-blob', () => ({
  getStore: jest.fn(() => ({
    get: jest.fn(),
    setJSON: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
  })),
}));

describe('EdgeOne health Cloud Function entry', () => {
  test('uses runtime environment passed by the platform without exposing secrets', async () => {
    const response = await onRequest({
      request: new Request('https://example.test/api/health'),
      env: {
        WECHAT_APP_ID: 'wx-runtime-appid',
        WECHAT_APP_SECRET: 'must-not-escape-wechat',
        SESSION_HMAC_KEY: 'must-not-escape-session',
        OWNER_HMAC_KEY: 'must-not-escape-owner',
        OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
        LLM_BASE_URL: 'https://llm.example.test',
        EDGEONE_DEPLOYMENT_VERSION: 'runtime-build',
        GENERATION_ENABLED: 'true',
        LLM_API_KEY: 'must-not-escape',
        LLM_MODEL: 'model-that-must-not-escape',
      },
    });

    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      data: {
        service: 'skillscope-edgeone',
        version: 'runtime-build',
        configurationReady: true,
        generationEnabled: true,
      },
    });
    expect(JSON.stringify(body)).not.toMatch(/must-not-escape|WECHAT_APP_SECRET|LLM_API_KEY|OPENID_ENCRYPTION_KEY/);
  });
});
