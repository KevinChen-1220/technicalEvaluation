import { createHttpsContentSafetyModeration, type ContentSafetyFetchTransport } from '../server/adapters/httpsContentSafety';
import { createWeChatMsgSecCheckModeration } from '../server/adapters/weChatMsgSecCheck';

describe('content safety adapters', () => {
  test('calls WeChat msgSecCheck with trusted OpenID, scene 2, and version 2', async () => {
    const msgSecCheck = jest.fn(async () => ({ errcode: 0, result: { suggest: 'pass' } }));
    const moderation = createWeChatMsgSecCheckModeration({
      openapi: { security: { msgSecCheck } },
      environment: { SKILLSCOPE_ENV: 'production' },
    });

    await expect(moderation.checkText({
      ownerOpenId: 'owner-1',
      content: '测评主题',
      scene: 'generation_input',
      title: 'SkillScope generation input',
    })).resolves.toEqual({ allowed: true });
    expect(msgSecCheck).toHaveBeenCalledWith({
      openid: 'owner-1',
      scene: 2,
      version: 2,
      content: '测评主题',
      title: 'SkillScope generation input',
    });
  });

  test('fails closed for risky or unavailable WeChat moderation', async () => {
    const risky = createWeChatMsgSecCheckModeration({
      openapi: { security: { msgSecCheck: jest.fn(async () => ({ errcode: 0, result: { suggest: 'risky' } })) } },
      environment: { SKILLSCOPE_ENV: 'production' },
    });
    await expect(risky.checkText({
      ownerOpenId: 'owner-1', content: 'x', scene: 'generation_input', title: 'x',
    })).resolves.toEqual({ allowed: false });

    expect(() => createWeChatMsgSecCheckModeration({
      openapi: {},
      environment: { SKILLSCOPE_ENV: 'production' },
    })).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', retryable: false }));
  });

  test('uses server-only HTTPS output moderation and blocks on service failure', async () => {
    const fetch = jest.fn(async () => ({ ok: true, json: async () => ({ allowed: true }) })) as unknown as ContentSafetyFetchTransport;
    const moderation = createHttpsContentSafetyModeration({
      environment: {
        SKILLSCOPE_ENV: 'production',
        CONTENT_SAFETY_URL: 'https://safety.example/check',
        CONTENT_SAFETY_API_KEY: 'server-secret',
        CONTENT_SAFETY_PROVIDER: 'provider-a',
      },
      fetch,
    });

    await expect(moderation.checkText({
      ownerOpenId: 'owner-1',
      content: 'Question 1',
      scene: 'generation_output',
      title: 'SkillScope generated assessment',
    })).resolves.toEqual({ allowed: true });
    expect(fetch).toHaveBeenCalledWith('https://safety.example/check', expect.objectContaining({
      method: 'POST',
      headers: {
        Authorization: 'Bearer server-secret',
        'Content-Type': 'application/json',
      },
    }));

    const failing = createHttpsContentSafetyModeration({
      environment: {
        SKILLSCOPE_ENV: 'production',
        CONTENT_SAFETY_URL: 'https://safety.example/check',
        CONTENT_SAFETY_API_KEY: 'server-secret',
      },
      fetch: jest.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as ContentSafetyFetchTransport,
    });
    await expect(failing.checkText({
      ownerOpenId: 'owner-1', content: 'x', scene: 'generation_output', title: 'x',
    })).resolves.toEqual({ allowed: false });
  });

  test('requires HTTPS output moderation configuration in formal production', () => {
    expect(() => createHttpsContentSafetyModeration({
      environment: { SKILLSCOPE_ENV: 'production' },
      fetch: jest.fn() as unknown as ContentSafetyFetchTransport,
    })).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', retryable: false }));
    expect(createHttpsContentSafetyModeration({
      environment: { SKILLSCOPE_ENV: 'development' },
      fetch: jest.fn() as unknown as ContentSafetyFetchTransport,
    })).toBeDefined();
  });
});
