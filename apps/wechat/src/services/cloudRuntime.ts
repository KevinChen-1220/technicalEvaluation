import Taro from '@tarojs/taro';

type CloudRuntimeSdk = {
  init(options: { env?: string; traceUser: boolean }): void;
  callFunction(input: { name: string; data: Record<string, unknown> }): Promise<{ result?: unknown }>;
};

export function createCloudRuntime(sdk: CloudRuntimeSdk, environmentId: string | undefined) {
  let initialized = false;

  function initialize(): void {
    if (initialized) return;
    const env = environmentId?.trim();
    sdk.init(env ? { env, traceUser: true } : { traceUser: true });
    initialized = true;
  }

  return {
    initialize,
    callFunction(input: { name: string; data: Record<string, unknown> }): Promise<{ result?: unknown }> {
      initialize();
      return sdk.callFunction(input);
    },
  };
}

const configuredEnvironmentId = process.env.TARO_APP_CLOUDBASE_ENV_ID;

export const cloudRuntime = createCloudRuntime({
  init(options) {
    Taro.cloud.init(options);
  },
  callFunction(input) {
    return Taro.cloud.callFunction(input) as Promise<{ result?: unknown }>;
  },
}, configuredEnvironmentId);
