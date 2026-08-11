import { MemoryBlobPort } from '../src/storage/memoryStores';
import { createWeChatTextSecurity } from '../src/moderation/wechatTextSecurity';

describe('WeChat text security', () => {
  test('caches access tokens in Blob using strong reads and moderates bounded chunks', async () => {
    const blob = new MemoryBlobPort();
    const get = jest.spyOn(blob, 'get');
    const calls: string[] = [];
    const fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes('/cgi-bin/token')) return new Response(JSON.stringify({ access_token: 'wx-access-token', expires_in: 7200 }));
      const body = JSON.parse(String(init?.body)) as { content: string };
      expect(Buffer.byteLength(body.content, 'utf8')).toBeLessThanOrEqual(2500);
      return new Response(JSON.stringify({ errcode: 0, result: { suggest: 'pass', label: 100 } }));
    });
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret', fetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });

    await security.checkText('内容'.repeat(2000));
    await security.checkText('second request');

    expect(calls.filter((url) => url.includes('/cgi-bin/token'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/msg_sec_check'))).toHaveLength(6);
    expect(get).toHaveBeenCalledWith('moderation/wechat-access-token.json', { consistency: 'strong' });
  });

  test.each([
    ['blocked content', async () => new Response(JSON.stringify({ errcode: 0, result: { suggest: 'risky', label: 20001 } }))],
    ['API error', async () => new Response(JSON.stringify({ errcode: 40001, errmsg: 'invalid credential' }))],
    ['network failure', async () => { throw new Error('network down'); }],
  ])('fails closed for %s', async (_label, moderationFetch) => {
    const blob = new MemoryBlobPort();
    await blob.put('moderation/wechat-access-token.json', {
      accessToken: 'cached-token', expiresAt: '2026-08-11T09:00:00.000Z',
    });
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret', fetch: moderationFetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    await expect(security.checkText('content')).rejects.toMatchObject({ code: 'CONTENT_BLOCKED' });
  });

  test('applies an abort signal to access-token acquisition', async () => {
    let tokenSignal: AbortSignal | null | undefined;
    const fetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/cgi-bin/token')) {
        tokenSignal = init?.signal;
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }));
      }
      return new Response(JSON.stringify({ errcode: 0, result: { suggest: 'pass', label: 100 } }));
    });
    const security = createWeChatTextSecurity({
      blob: new MemoryBlobPort(), appId: 'wx-runtime-app', appSecret: 'runtime-secret', fetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    await expect(security.checkText('content')).resolves.toBeUndefined();
    expect(tokenSignal).toBeInstanceOf(AbortSignal);
  });
});
