import { createCloudRuntime } from '../src/services/cloudRuntime';
import { createEdgeOneRuntime } from '../src/services/edgeOneRuntime';
import { createSessionClient } from '../src/services/sessionClient';

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: jest.fn(), setStorageSync: jest.fn(), removeStorageSync: jest.fn(),
    login: jest.fn(), request: jest.fn(),
  },
}));

describe('Mini Program EdgeOne runtime', () => {
  test('normalizes the configured HTTPS API base URL and initializes a session once', async () => {
    const ensureSession = jest.fn(async () => 'session-token');
    const request = jest.fn(async () => ({ statusCode: 200, data: { ok: true, data: { id: 'assessment-1' } } }));
    const runtime = createCloudRuntime({
      apiBaseUrl: ' https://api.example.edgeone.run/ ',
      request,
      session: { ensureSession, refreshSession: jest.fn(), clearSession: jest.fn() },
    });

    await runtime.initialize();
    await runtime.request({ path: '/api/assessments/assessment-1', method: 'GET', timeoutMs: 15_000 });

    expect(ensureSession).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.edgeone.run/api/assessments/assessment-1',
      method: 'GET',
      timeout: 15_000,
      header: { Authorization: 'Bearer session-token' },
    }));
  });

  test.each([undefined, '', 'http://api.example.edgeone.run', 'https://api.example.edgeone.run/api', 'https://api.example.edgeone.run/nested', 'not a url'])(
    'rejects an absent, non-HTTPS, or non-origin API base URL: %p',
    (apiBaseUrl) => {
      const runtime = createCloudRuntime({
        apiBaseUrl,
        request: jest.fn(),
        session: { ensureSession: jest.fn(), refreshSession: jest.fn(), clearSession: jest.fn() },
      });
      return expect(runtime.requestPublic({ path: '/api/health', method: 'GET', timeoutMs: 15_000 }))
        .rejects.toThrow(/EdgeOne API base URL/i);
    },
  );

  test('refreshes a session after one 401 and retries the request exactly once', async () => {
    const request = jest.fn()
      .mockResolvedValueOnce({ statusCode: 401, data: { ok: false, error: { code: 'UNAUTHORIZED', retryable: false } } })
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true, data: { type: 'listed' } } });
    const runtime = createCloudRuntime({
      apiBaseUrl: 'https://api.example.edgeone.run', request,
      session: {
        ensureSession: jest.fn(async () => 'old-token'),
        refreshSession: jest.fn(async () => 'new-token'),
        clearSession: jest.fn(),
      },
    });

    await expect(runtime.request({ path: '/api/assessments', method: 'GET', timeoutMs: 15_000 }))
      .resolves.toEqual({ type: 'listed' });
    expect(request).toHaveBeenNthCalledWith(1, expect.objectContaining({ header: { Authorization: 'Bearer old-token' } }));
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({ header: { Authorization: 'Bearer new-token' } }));
  });

  test('does not loop when the retried request is also unauthorized', async () => {
    const request = jest.fn(async () => ({ statusCode: 401, data: { ok: false, error: { code: 'UNAUTHORIZED', retryable: false } } }));
    const runtime = createCloudRuntime({
      apiBaseUrl: 'https://api.example.edgeone.run', request,
      session: {
        ensureSession: jest.fn(async () => 'old-token'),
        refreshSession: jest.fn(async () => 'new-token'),
        clearSession: jest.fn(),
      },
    });

    await expect(runtime.request({ path: '/api/assessments', method: 'GET', timeoutMs: 15_000 }))
      .rejects.toMatchObject({ errorCode: 'UNAUTHORIZED' });
    expect(request).toHaveBeenCalledTimes(2);
  });

  test('coalesces concurrent 401 refreshes into one wx login and session exchange', async () => {
    const values = new Map<string, unknown>([
      ['skill-scope:edgeone-session', { token: 'old-token', expiresAt: '2026-08-20T00:00:00.000Z' }],
    ]);
    let releaseLogin: ((value: { code: string }) => void) | undefined;
    const login = jest.fn(() => new Promise<{ code: string }>((resolve) => { releaseLogin = resolve; }));
    const exchange = jest.fn(async () => ({ token: 'new-token', expiresAt: '2026-08-20T00:00:00.000Z' }));
    const session = createSessionClient({
      storage: {
        get: <T>(key: string) => values.get(key) as T | undefined,
        set: <T>(key: string, value: T) => { values.set(key, value); },
        remove: (key: string) => { values.delete(key); },
      },
      login,
      exchange,
      now: () => new Date('2026-08-11T00:00:00.000Z'),
    });
    const unauthorized: Array<(value: { statusCode: number; data: unknown }) => void> = [];
    const request = jest.fn(async (input: { header?: Record<string, string> }) => {
      if (input.header?.Authorization === 'Bearer old-token') {
        return await new Promise<{ statusCode: number; data: unknown }>((resolve) => unauthorized.push(resolve));
      }
      return { statusCode: 200, data: { ok: true, data: { type: 'listed' } } };
    });
    const runtime = createEdgeOneRuntime({ apiBaseUrl: 'https://api.example.edgeone.run', request, session });

    const both = Promise.all([
      runtime.request({ path: '/api/assessments', method: 'GET', timeoutMs: 15_000 }),
      runtime.request({ path: '/api/assessments', method: 'GET', timeoutMs: 15_000 }),
    ]);
    await waitFor(() => unauthorized.length === 2);
    unauthorized.forEach((resolve) => resolve({
      statusCode: 401, data: { ok: false, error: { code: 'UNAUTHORIZED', retryable: false } },
    }));
    await waitFor(() => login.mock.calls.length === 1);
    expect(login).toHaveBeenCalledTimes(1);
    releaseLogin?.({ code: 'fresh-wechat-code' });

    await expect(both).resolves.toEqual([{ type: 'listed' }, { type: 'listed' }]);
    expect(exchange).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('fresh-wechat-code');
  });

  test('marks startup offline when EdgeOne is unavailable without preventing a later local UI render', async () => {
    const runtime = createCloudRuntime({
      apiBaseUrl: 'https://api.example.edgeone.run',
      request: jest.fn(async () => { throw new Error('offline'); }),
      session: { ensureSession: jest.fn(), refreshSession: jest.fn(), clearSession: jest.fn() },
    });

    await expect(runtime.initialize()).rejects.toMatchObject({ errorCode: 'NETWORK_ERROR' });
    expect(runtime.getStatus()).toBe('offline');
  });

  test('maps network, HTTP and malformed JSON responses to typed public errors', async () => {
    const session = { ensureSession: jest.fn(async () => 'session-token'), refreshSession: jest.fn(), clearSession: jest.fn() };
    const network = createCloudRuntime({ apiBaseUrl: 'https://api.example.edgeone.run', request: jest.fn(async () => { throw new Error('network down'); }), session });
    await expect(network.request({ path: '/api/settings', method: 'GET', timeoutMs: 15_000 }))
      .rejects.toMatchObject({ errorCode: 'NETWORK_ERROR' });

    const malformed = createCloudRuntime({ apiBaseUrl: 'https://api.example.edgeone.run', request: jest.fn(async () => ({ statusCode: 200, data: '<html>' })), session });
    await expect(malformed.request({ path: '/api/settings', method: 'GET', timeoutMs: 15_000 }))
      .rejects.toMatchObject({ errorCode: 'INVALID_RESPONSE' });
  });
});

async function waitFor(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (condition()) return;
    await Promise.resolve();
  }
  throw new Error('Timed out waiting for asynchronous test condition.');
}
