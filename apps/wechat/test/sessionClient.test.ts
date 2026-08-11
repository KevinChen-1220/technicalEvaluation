import { createSessionClient } from '../src/services/sessionClient';

function createStorage(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get: <T>(key: string): T | undefined => values.get(key) as T | undefined,
    set: <T>(key: string, value: T): void => { values.set(key, value); },
    remove: (key: string): void => { values.delete(key); },
  };
}

describe('EdgeOne session client', () => {
  test('reuses a valid persisted opaque session without logging in', async () => {
    const storage = createStorage({ 'skill-scope:edgeone-session': { token: 'saved-token', expiresAt: '2026-08-20T00:00:00.000Z' } });
    const login = jest.fn();
    const client = createSessionClient({
      storage, login,
      exchange: jest.fn(),
      now: () => new Date('2026-08-11T00:00:00.000Z'),
    });

    await expect(client.ensureSession()).resolves.toBe('saved-token');
    expect(login).not.toHaveBeenCalled();
  });

  test('uses one concurrent wx login and persists the returned token plus expiry', async () => {
    const storage = createStorage();
    const login = jest.fn(async () => ({ code: 'wechat-code' }));
    const exchange = jest.fn(async () => ({ token: 'session-token', expiresAt: '2026-08-20T00:00:00.000Z' }));
    const client = createSessionClient({ storage, login, exchange, now: () => new Date('2026-08-11T00:00:00.000Z') });

    await expect(Promise.all([client.ensureSession(), client.ensureSession()]))
      .resolves.toEqual(['session-token', 'session-token']);
    expect(login).toHaveBeenCalledTimes(1);
    expect(exchange).toHaveBeenCalledWith('wechat-code');
    expect(storage.get('skill-scope:edgeone-session')).toEqual({ token: 'session-token', expiresAt: '2026-08-20T00:00:00.000Z' });
  });

  test('clears invalid local state and returns a typed error when wx login cannot yield a code', async () => {
    const storage = createStorage({ 'skill-scope:edgeone-session': { token: 'expired', expiresAt: '2026-08-01T00:00:00.000Z' } });
    const client = createSessionClient({
      storage, login: jest.fn(async () => ({})), exchange: jest.fn(), now: () => new Date('2026-08-11T00:00:00.000Z'),
    });

    await expect(client.ensureSession()).rejects.toMatchObject({ errorCode: 'LOGIN_FAILED' });
    expect(storage.get('skill-scope:edgeone-session')).toBeUndefined();
  });

  test('refresh forces a fresh exchange and offline exchange failures remain typed', async () => {
    const storage = createStorage({ 'skill-scope:edgeone-session': { token: 'old-token', expiresAt: '2026-08-20T00:00:00.000Z' } });
    const client = createSessionClient({
      storage,
      login: jest.fn(async () => ({ code: 'new-code' })),
      exchange: jest.fn(async () => { throw Object.assign(new Error('offline'), { errorCode: 'NETWORK_ERROR' }); }),
      now: () => new Date('2026-08-11T00:00:00.000Z'),
    });

    await expect(client.refreshSession()).rejects.toMatchObject({ errorCode: 'NETWORK_ERROR' });
    expect(storage.get('skill-scope:edgeone-session')).toBeUndefined();
  });
});
