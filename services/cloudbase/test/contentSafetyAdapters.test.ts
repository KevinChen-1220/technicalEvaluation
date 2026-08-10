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
    const fetch = jest.fn(async () => ({
      ok: true,
      body: readableBody([new TextEncoder().encode('{"allowed":true}')]),
    })) as unknown as ContentSafetyFetchTransport;
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
      fetch: jest.fn(async () => ({
        ok: false,
        body: null,
      })) as unknown as ContentSafetyFetchTransport,
    });
    await expect(failing.checkText({
      ownerOpenId: 'owner-1', content: 'x', scene: 'generation_output', title: 'x',
    })).resolves.toEqual({ allowed: false });
  });

  test('fails closed without moderation capabilities unless unsafe bypass is explicit and non-production', async () => {
    expect(() => createHttpsContentSafetyModeration({
      environment: { SKILLSCOPE_ENV: 'production' },
      fetch: jest.fn() as unknown as ContentSafetyFetchTransport,
    })).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', retryable: false }));

    const defaultOutput = createHttpsContentSafetyModeration({
      environment: { SKILLSCOPE_ENV: 'development' },
      fetch: jest.fn() as unknown as ContentSafetyFetchTransport,
    });
    const defaultInput = createWeChatMsgSecCheckModeration({
      openapi: {},
      environment: { SKILLSCOPE_ENV: 'development' },
    });
    const request = { ownerOpenId: 'owner-1', content: 'x', scene: 'generation_output' as const, title: 'x' };
    await expect(defaultOutput.checkText(request)).resolves.toEqual({ allowed: false });
    await expect(defaultInput.checkText({ ...request, scene: 'generation_input' })).resolves.toEqual({ allowed: false });

    const unsafeOutput = createHttpsContentSafetyModeration({
      environment: { SKILLSCOPE_ENV: 'development', SKILLSCOPE_ALLOW_UNSAFE_MODERATION: 'true' },
      fetch: jest.fn() as unknown as ContentSafetyFetchTransport,
    });
    await expect(unsafeOutput.checkText(request)).resolves.toEqual({ allowed: true });
    expect(() => createHttpsContentSafetyModeration({
      environment: { SKILLSCOPE_ENV: 'production', SKILLSCOPE_ALLOW_UNSAFE_MODERATION: 'true' },
      fetch: jest.fn() as unknown as ContentSafetyFetchTransport,
    })).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  test('aborts a hung output moderation request on its own timeout and fails closed', async () => {
    jest.useFakeTimers();
    try {
      const fetchMock = jest.fn((_url: string, init: Parameters<ContentSafetyFetchTransport>[1]) => new Promise<never>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }));
      const moderation = createHttpsContentSafetyModeration({
        environment: {
          SKILLSCOPE_ENV: 'production',
          CONTENT_SAFETY_URL: 'https://safety.example/check',
          CONTENT_SAFETY_API_KEY: 'server-secret',
        },
        fetch: fetchMock as ContentSafetyFetchTransport,
        timeoutMs: 25,
      });

      const result = moderation.checkText({
        ownerOpenId: 'owner-1', content: 'x', scene: 'generation_output', title: 'x',
      });
      await jest.advanceTimersByTimeAsync(25);

      await expect(result).resolves.toEqual({ allowed: false });
      expect(fetchMock.mock.calls[0]?.[1].signal?.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('cancels an oversized multi-chunk response without reading later chunks', async () => {
    const read = jest.fn()
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(10) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(7) })
      .mockResolvedValueOnce({ done: false, value: new Uint8Array(100) });
    const cancel = jest.fn(async () => undefined);
    const releaseLock = jest.fn();
    const moderation = createHttpsContentSafetyModeration({
      environment: {
        SKILLSCOPE_ENV: 'production',
        CONTENT_SAFETY_URL: 'https://safety.example/check',
        CONTENT_SAFETY_API_KEY: 'server-secret',
      },
      fetch: jest.fn(async () => ({
        ok: true,
        body: { getReader: () => ({ read, cancel, releaseLock }) },
      })) as unknown as ContentSafetyFetchTransport,
      maxResponseBytes: 16,
    });

    await expect(moderation.checkText({
      ownerOpenId: 'owner-1', content: 'x', scene: 'generation_output', title: 'x',
    })).resolves.toEqual({ allowed: false });
    expect(read).toHaveBeenCalledTimes(2);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(releaseLock).toHaveBeenCalledTimes(1);
  });

  test('accepts a valid response exactly at the 16 KiB byte limit', async () => {
    const prefix = '{"allowed":true,"padding":"';
    const suffix = '"}';
    const responseText = `${prefix}${'x'.repeat(16 * 1024 - prefix.length - suffix.length)}${suffix}`;
    const encoded = new TextEncoder().encode(responseText);
    const moderation = createHttpsContentSafetyModeration({
      environment: {
        SKILLSCOPE_ENV: 'production',
        CONTENT_SAFETY_URL: 'https://safety.example/check',
        CONTENT_SAFETY_API_KEY: 'server-secret',
      },
      fetch: jest.fn(async () => ({
        ok: true,
        body: readableBody([encoded.slice(0, 10_000), encoded.slice(10_000)]),
      })) as unknown as ContentSafetyFetchTransport,
    });

    expect(encoded.byteLength).toBe(16 * 1024);
    await expect(moderation.checkText({
      ownerOpenId: 'owner-1', content: 'x', scene: 'generation_output', title: 'x',
    })).resolves.toEqual({ allowed: true });
  });
});

function readableBody(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
}
