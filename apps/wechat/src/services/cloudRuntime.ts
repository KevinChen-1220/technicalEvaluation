import Taro from '@tarojs/taro';
import { createEdgeOneRuntime, type EdgeOneRuntime, type SessionPort, type TaroRequestPort } from './edgeOneRuntime';
import { createSessionClient } from './sessionClient';

export type CloudRuntime = EdgeOneRuntime & {
  initialize(): Promise<void>;
  getStatus(): 'starting' | 'online' | 'offline';
};

export function createCloudRuntime(input: {
  apiBaseUrl: string | undefined;
  request: TaroRequestPort;
  session: SessionPort;
}): CloudRuntime {
  const runtime = createEdgeOneRuntime(input);
  let status: 'starting' | 'online' | 'offline' = 'starting';
  let initialization: Promise<void> | undefined;

  return {
    ...runtime,
    async initialize(): Promise<void> {
      if (initialization === undefined) {
        initialization = runtime.requestPublic<{ token: string }>({
          path: '/api/health', method: 'GET', timeoutMs: 15_000,
        }).then(async () => {
          await input.session.ensureSession();
          status = 'online';
        }).catch((error) => {
          status = 'offline';
          throw error;
        });
      }
      return await initialization;
    },
    getStatus: () => status,
  };
}

const apiBaseUrl = process.env.TARO_APP_EDGEONE_API_BASE_URL;

const session = createSessionClient({
  storage: {
    get<T>(key: string): T | undefined {
      const value = Taro.getStorageSync<T | ''>(key);
      return value === '' ? undefined : value;
    },
    set<T>(key: string, value: T): void { Taro.setStorageSync(key, value); },
    remove(key: string): void { Taro.removeStorageSync(key); },
  },
  login: async () => await Taro.login() as { code?: string },
  exchange: async (code) => await publicRuntime.requestPublic<{ token: string; expiresAt: string }>({
    path: '/api/session', method: 'POST', body: { code }, timeoutMs: 15_000,
  }),
});

const publicRuntime = createEdgeOneRuntime({
  apiBaseUrl,
  request: async (input) => await Taro.request(input),
  session: {
    ensureSession: async () => '', refreshSession: async () => '', clearSession: () => undefined,
  },
});

export const cloudRuntime = createCloudRuntime({
  apiBaseUrl,
  request: async (input) => await Taro.request(input),
  session,
});
