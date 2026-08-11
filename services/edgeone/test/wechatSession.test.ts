import { exchangeWeChatCode } from '../src/auth/wechatSession';

const env = {
  WECHAT_APP_ID: 'wx-test-app',
  WECHAT_APP_SECRET: 'secret-that-must-not-escape',
  SESSION_HMAC_KEY: 'session-hmac-key',
  OWNER_HMAC_KEY: 'owner-hmac-key',
};

describe('WeChat code exchange', () => {
  test('rejects an empty code before making a request', async () => {
    const fetch = jest.fn();

    await expect(exchangeWeChatCode('', env, fetch)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });

    expect(fetch).not.toHaveBeenCalled();
  });

  test('uses only the official HTTPS endpoint and returns the OpenID privately', async () => {
    const fetch = jest.fn(async (url: string) => {
      expect(url).toMatch(/^https:\/\/api\.weixin\.qq\.com\/sns\/jscode2session\?/);
      expect(url).toContain('appid=wx-test-app');
      expect(url).toContain('secret=secret-that-must-not-escape');
      return new Response(JSON.stringify({ openid: 'openid-for-owner-key' }), { status: 200 });
    });

    await expect(exchangeWeChatCode('one-time-code', env, fetch)).resolves.toEqual({ openId: 'openid-for-owner-key' });
  });

  test('converts upstream failures to safe errors without leaking credentials', async () => {
    const fetch = jest.fn(async () => new Response(JSON.stringify({ errcode: 40029, errmsg: 'invalid code' }), { status: 200 }));

    await expect(exchangeWeChatCode('bad-code', env, fetch)).rejects.toMatchObject({ code: 'WECHAT_SESSION_EXCHANGE_FAILED' });
    await expect(exchangeWeChatCode('bad-code', env, fetch)).rejects.not.toThrow(env.WECHAT_APP_SECRET);
  });
});
