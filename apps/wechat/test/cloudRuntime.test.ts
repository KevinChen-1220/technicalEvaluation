import { createCloudRuntime } from '../src/services/cloudRuntime';

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

  test.each([undefined, '', 'http://api.example.edgeone.run', 'not a url'])(
    'rejects an absent or non-HTTPS API base URL: %p',
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
