describe('WeChat CloudBase build configuration', () => {
  test('injects the deploy-selected public environment id', () => {
    const previous = process.env.TARO_APP_CLOUDBASE_ENV_ID;
    process.env.TARO_APP_CLOUDBASE_ENV_ID = 'cloudbase-production-1';
    jest.resetModules();

    const config = require('../config').default as { env?: Record<string, string> };

    expect(config.env).toEqual({
      TARO_APP_CLOUDBASE_ENV_ID: '"cloudbase-production-1"',
    });
    if (previous === undefined) delete process.env.TARO_APP_CLOUDBASE_ENV_ID;
    else process.env.TARO_APP_CLOUDBASE_ENV_ID = previous;
  });
});
