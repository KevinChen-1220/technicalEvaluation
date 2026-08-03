import { createCloudRuntime } from '../src/services/cloudRuntime';

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { cloud: { init: jest.fn(), callFunction: jest.fn() } },
}));

describe('Mini Program Cloud runtime', () => {
  test('initializes the deploy-selected environment before the first function call', async () => {
    const events: string[] = [];
    const sdk = {
      init: jest.fn((options: unknown) => { events.push(`init:${JSON.stringify(options)}`); }),
      callFunction: jest.fn(async () => { events.push('call'); return { result: { ok: true } }; }),
    };
    const runtime = createCloudRuntime(sdk, 'cloudbase-production-1');

    await runtime.callFunction({ name: 'get-assessment', data: { assessmentId: 'assessment-1' } });
    await runtime.callFunction({ name: 'get-generation-job', data: { jobId: 'job-1' } });

    expect(events).toEqual([
      'init:{"env":"cloudbase-production-1","traceUser":true}',
      'call',
      'call',
    ]);
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0]?.[0]).not.toHaveProperty('apiKey');
    expect(sdk.init.mock.calls[0]?.[0]).not.toHaveProperty('secret');
    expect(sdk.init.mock.calls[0]?.[0]).not.toHaveProperty('provider');
  });

  test('app-start initialization is idempotent and supports the bound default environment', () => {
    const sdk = { init: jest.fn(), callFunction: jest.fn() };
    const runtime = createCloudRuntime(sdk, undefined);

    runtime.initialize();
    runtime.initialize();

    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init).toHaveBeenCalledWith({ traceUser: true });
  });
});
