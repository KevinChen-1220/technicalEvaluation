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
        EDGEONE_DEPLOYMENT_VERSION: 'runtime-build',
        GENERATION_ENABLED: 'true',
        LLM_API_KEY: 'must-not-escape',
      },
    });

    const body = await response.json();

    expect(body).toEqual({
      ok: true,
      data: {
        service: 'skillscope-edgeone',
        version: 'runtime-build',
        generationEnabled: true,
      },
    });
    expect(JSON.stringify(body)).not.toContain('must-not-escape');
  });
});
