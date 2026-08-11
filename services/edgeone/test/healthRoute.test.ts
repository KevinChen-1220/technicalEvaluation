import { createHealthRoute } from '../src/routes/health';
import type { EdgeOneContext } from '../src/platform/context';

describe('EdgeOne health route', () => {
  test('reports public service metadata without echoing environment values', async () => {
    const context: EdgeOneContext = {
      request: new Request('https://example.test/api/health'),
      env: {
        EDGEONE_DEPLOYMENT_VERSION: 'build-123',
        LLM_API_KEY: 'must-not-escape',
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
    expect(await response.json()).toEqual({
      ok: true,
      data: {
        service: 'skillscope-edgeone',
        version: 'build-123',
        generationEnabled: true,
      },
    });
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
      },
    });
  });
});
