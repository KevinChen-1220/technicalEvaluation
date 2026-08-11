import { MemoryBlobPort } from '../src/storage/memoryStores';
import { createWeChatTextSecurity } from '../src/moderation/wechatTextSecurity';
import { getWeChatAccessToken } from '../src/moderation/wechatAccessToken';
import { createDeadline } from '../src/http/deadline';
import { createHash } from 'node:crypto';

describe('WeChat text security', () => {
  test('caches access tokens in Blob using strong reads and moderates bounded chunks', async () => {
    const blob = new MemoryBlobPort();
    const get = jest.spyOn(blob, 'get');
    const calls: string[] = [];
    const fetch = jest.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.includes('/cgi-bin/token')) return new Response(JSON.stringify({ access_token: 'wx-access-token', expires_in: 7200 }));
      const body = JSON.parse(String(init?.body)) as { content: string; openid?: string; version?: number; scene?: number };
      expect(Buffer.byteLength(body.content, 'utf8')).toBeLessThanOrEqual(2500);
      expect(body).toEqual(expect.objectContaining({ openid: 'private-open-id', version: 2, scene: 2 }));
      return new Response(JSON.stringify({ errcode: 0, result: { suggest: 'pass', label: 100 } }));
    });
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret', fetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });

    await security.checkText('内容'.repeat(2000), 'private-open-id');
    await security.checkText('second request', 'private-open-id');

    expect(calls.filter((url) => url.includes('/cgi-bin/token'))).toHaveLength(1);
    expect(calls.filter((url) => url.includes('/msg_sec_check'))).toHaveLength(6);
    expect(get).toHaveBeenCalledWith(expect.stringMatching(/^moderation\/wechat-access-token\/[a-f0-9]+\.json$/), { consistency: 'strong' });
  });

  test('maps only an explicit risky suggestion to CONTENT_BLOCKED', async () => {
    const blob = new MemoryBlobPort();
    const tokenKey = await seedToken(blob);
    expect(tokenKey).toMatch(/^moderation\/wechat-access-token\//);
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret',
      fetch: async () => new Response(JSON.stringify({ errcode: 0, result: { suggest: 'risky', label: 20001 } })),
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    await expect(security.checkText('content', 'private-open-id')).rejects.toMatchObject({
      code: 'CONTENT_BLOCKED', status: 422, retryable: false,
    });
  });

  test.each([
    ['API error', async () => new Response(JSON.stringify({ errcode: 40001, errmsg: 'invalid credential' }))],
    ['HTTP error', async () => new Response('upstream', { status: 503 })],
    ['invalid JSON', async () => new Response('<html>bad gateway</html>')],
    ['network failure', async () => { throw new Error('network down'); }],
  ])('fails closed with retryable backend error for %s', async (_label, moderationFetch) => {
    const blob = new MemoryBlobPort();
    await seedToken(blob);
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret', fetch: moderationFetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    await expect(security.checkText('content', 'private-open-id')).rejects.toMatchObject({
      code: 'BACKEND_UNAVAILABLE', status: 503, retryable: true,
    });
  });

  test('isolates token cache keys by AppID and refreshes expired tokens', async () => {
    const blob = new MemoryBlobPort();
    let tokenSequence = 0;
    const fetch = jest.fn(async () => new Response(JSON.stringify({ access_token: `token-${++tokenSequence}`, expires_in: 7200 })));
    const base = { blob, appSecret: 'runtime-secret', fetch, now: () => new Date('2026-08-11T08:00:00.000Z') };
    await getWeChatAccessToken({ ...base, appId: 'wx-app-a' });
    await getWeChatAccessToken({ ...base, appId: 'wx-app-b' });
    const keys = [...blob.records.keys()].filter((key) => (
      key.startsWith('moderation/wechat-access-token/') && !key.includes('.refresh-locks/')
    ));
    expect(keys).toHaveLength(2);
    await blob.put(keys[0]!, {
      accessToken: 'cached-token', expiresAt: '2026-08-11T09:00:00.000Z',
    });
    await getWeChatAccessToken({ ...base, appId: 'wx-app-a', now: () => new Date('2026-08-11T10:00:00.000Z') });
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  test('coalesces concurrent token refreshes and rejects non-positive expires_in', async () => {
    const blob = new MemoryBlobPort();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const fetch = jest.fn(async () => {
      await barrier;
      return new Response(JSON.stringify({ access_token: 'shared-token', expires_in: 7200 }));
    });
    const dependencies = {
      blob, appId: 'wx-single-flight', appSecret: 'runtime-secret', fetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    };
    const left = getWeChatAccessToken(dependencies);
    const right = getWeChatAccessToken(dependencies);
    await Promise.resolve();
    release();
    await expect(Promise.all([left, right])).resolves.toEqual(['shared-token', 'shared-token']);
    expect(fetch).toHaveBeenCalledTimes(1);

    await expect(getWeChatAccessToken({
      ...dependencies,
      appId: 'wx-invalid-expiry',
      fetch: async () => new Response(JSON.stringify({ access_token: 'bad-token', expires_in: 0 })),
    })).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
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
    await expect(security.checkText('content', 'private-open-id')).resolves.toBeUndefined();
    expect(tokenSignal).toBeInstanceOf(AbortSignal);
  });

  test('bounds output moderation concurrency to three requests', async () => {
    const blob = new MemoryBlobPort();
    await seedToken(blob);
    let active = 0;
    let maximumActive = 0;
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret',
      fetch: async () => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return new Response(JSON.stringify({ errcode: 0, result: { suggest: 'pass', label: 100 } }));
      },
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    await security.checkText('x'.repeat(2500 * 8), 'private-open-id', createDeadline(1_000));
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(3);
  });

  test('cancels a stalled moderation response body at the global deadline', async () => {
    let cancelled = false;
    const blob = new MemoryBlobPort();
    await seedToken(blob);
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret',
      fetch: async () => new Response(new ReadableStream<Uint8Array>({
        cancel() {
          cancelled = true;
          return new Promise<void>(() => undefined);
        },
      })),
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    const outcome = await settlesWithin(
      security.checkText('content', 'private-open-id', createDeadline(10)),
      100,
    );
    expect(outcome).toEqual({ type: 'rejected', error: expect.objectContaining({
      code: 'BACKEND_UNAVAILABLE', retryable: true,
    }) });
    expect(cancelled).toBe(true);
  });

  test('stops waiting for Blob token reads and writes at the global deadline', async () => {
    jest.useFakeTimers();
    try {
      const stalledReadBlob = new MemoryBlobPort();
      jest.spyOn(stalledReadBlob, 'get').mockImplementation(() => new Promise(() => undefined));
      const readOperation = getWeChatAccessToken({
        blob: stalledReadBlob, appId: 'wx-stalled-read', appSecret: 'runtime-secret',
        fetch: jest.fn(), now: () => new Date(),
      }, createDeadline(50));
      const readRejection = expect(readOperation).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
      await jest.advanceTimersByTimeAsync(50);
      await readRejection;

      const stalledWriteBlob = new MemoryBlobPort();
      jest.spyOn(stalledWriteBlob, 'put').mockImplementation(() => new Promise(() => undefined));
      const writeOperation = getWeChatAccessToken({
        blob: stalledWriteBlob, appId: 'wx-stalled-write', appSecret: 'runtime-secret',
        fetch: async () => new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 })),
        now: () => new Date(),
      }, createDeadline(50));
      const writeRejection = expect(writeOperation).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
      await jest.advanceTimersByTimeAsync(50);
      await writeRejection;
    } finally {
      jest.useRealTimers();
    }
  });

  test('lets a single-flight waiter honor its own earlier deadline', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    try {
      const dependencies = {
        blob: new MemoryBlobPort(), appId: 'wx-waiter-deadline', appSecret: 'runtime-secret',
        fetch: async () => {
          await barrier;
          return new Response(JSON.stringify({ access_token: 'token', expires_in: 7200 }));
        },
        now: () => new Date(),
      };
      const owner = getWeChatAccessToken(dependencies, createDeadline(1_000));
      await Promise.resolve();
      const waiter = getWeChatAccessToken(dependencies, createDeadline(50));
      const waiterRejection = expect(waiter).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
      await jest.advanceTimersByTimeAsync(50);
      await waiterRejection;
      release();
      await owner;
    } finally {
      release?.();
      jest.useRealTimers();
    }
  });

  test('does not let the first short waiter cancel a longer single-flight waiter', async () => {
    jest.useFakeTimers();
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    try {
      const dependencies = {
        blob: new MemoryBlobPort(), appId: 'wx-short-owner', appSecret: 'runtime-secret',
        fetch: async () => {
          started();
          await barrier;
          return new Response(JSON.stringify({ access_token: 'shared-token', expires_in: 7200 }));
        },
        now: () => new Date(Date.now()),
      };
      const shortWaiter = getWeChatAccessToken(dependencies, createDeadline(50));
      const shortRejection = expect(shortWaiter).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
      await didStart;
      const longWaiter = getWeChatAccessToken(dependencies, createDeadline(1_000));
      await jest.advanceTimersByTimeAsync(50);
      await shortRejection;
      release();
      await expect(longWaiter).resolves.toBe('shared-token');
    } finally {
      release?.();
      jest.useRealTimers();
    }
  });

  test('coordinates token refresh across isolated instances through a Blob lease', async () => {
    let getFromInstanceA!: typeof getWeChatAccessToken;
    let getFromInstanceB!: typeof getWeChatAccessToken;
    await jest.isolateModulesAsync(async () => {
      getFromInstanceA = (await import('../src/moderation/wechatAccessToken')).getWeChatAccessToken;
    });
    await jest.isolateModulesAsync(async () => {
      getFromInstanceB = (await import('../src/moderation/wechatAccessToken')).getWeChatAccessToken;
    });
    const blob = new MemoryBlobPort();
    let release!: () => void;
    let started!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const fetch = jest.fn(async () => {
      started();
      await barrier;
      return new Response(JSON.stringify({ access_token: 'cross-instance-token', expires_in: 7200 }));
    });
    const dependencies = {
      blob, appId: 'wx-cross-instance', appSecret: 'runtime-secret', fetch,
      now: () => new Date(Date.now()),
    };

    const left = getFromInstanceA(dependencies, createDeadline(2_000));
    const right = getFromInstanceB(dependencies, createDeadline(2_000));
    await didStart;
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(fetch).toHaveBeenCalledTimes(1);
    release();

    await expect(Promise.all([left, right])).resolves.toEqual(['cross-instance-token', 'cross-instance-token']);
  });

  test('allows only one isolated instance to take over an expired refresh lock', async () => {
    let getFromInstanceA!: typeof getWeChatAccessToken;
    let getFromInstanceB!: typeof getWeChatAccessToken;
    await jest.isolateModulesAsync(async () => {
      getFromInstanceA = (await import('../src/moderation/wechatAccessToken')).getWeChatAccessToken;
    });
    await jest.isolateModulesAsync(async () => {
      getFromInstanceB = (await import('../src/moderation/wechatAccessToken')).getWeChatAccessToken;
    });
    const blob = new MemoryBlobPort();
    const appId = 'wx-racing-takeover';
    await blob.put(refreshLockKeyForTest(appId, 1), {
      revision: 1,
      ownerToken: 'abandoned-owner',
      leaseUntil: '2026-08-11T07:59:00.000Z',
      updatedAt: '2026-08-11T07:58:00.000Z',
    }, { onlyIfNew: true });
    const fetch = jest.fn(async () => new Response(JSON.stringify({ access_token: 'takeover-token', expires_in: 7200 })));
    const dependencies = {
      blob, appId, appSecret: 'runtime-secret', fetch,
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    };

    await expect(Promise.all([
      getFromInstanceA(dependencies, createDeadline(2_000)),
      getFromInstanceB(dependencies, createDeadline(2_000)),
    ])).resolves.toEqual(['takeover-token', 'takeover-token']);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('waits for an active refresh lock and takes over after its lease expires', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-11T08:00:00.000Z'));
    try {
      const blob = new MemoryBlobPort();
      const appId = 'wx-expired-lock';
      await blob.put(refreshLockKeyForTest(appId, 1), {
        revision: 1,
        ownerToken: 'abandoned-owner',
        leaseUntil: '2026-08-11T08:00:01.000Z',
        updatedAt: '2026-08-11T08:00:00.000Z',
      }, { onlyIfNew: true });
      const fetch = jest.fn(async () => new Response(JSON.stringify({ access_token: 'recovered-token', expires_in: 7200 })));

      const operation = getWeChatAccessToken({
        blob, appId, appSecret: 'runtime-secret', fetch, now: () => new Date(Date.now()),
      }, createDeadline(5_000));
      await jest.advanceTimersByTimeAsync(0);
      expect(fetch).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1_000);

      await expect(operation).resolves.toBe('recovered-token');
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  test.each(['token', 'moderation'] as const)('enforces the global deadline when the %s fetch ignores abort', async (stage) => {
    jest.useFakeTimers();
    try {
      const blob = new MemoryBlobPort();
      if (stage === 'moderation') await seedToken(blob);
      const dependencies = {
        blob, appId: stage === 'token' ? 'wx-token-stall' : 'wx-runtime-app', appSecret: 'runtime-secret',
        fetch: async () => await new Promise<Response>(() => undefined), now: () => new Date(),
      };
      const operation = stage === 'token'
        ? getWeChatAccessToken(dependencies, createDeadline(50))
        : createWeChatTextSecurity(dependencies).checkText('content', 'private-open-id', createDeadline(50));
      const rejection = expect(operation).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
      await jest.advanceTimersByTimeAsync(50);
      await rejection;
    } finally {
      jest.useRealTimers();
    }
  });

  test.each(['token', 'moderation'] as const)('cancels an unread %s error response body', async (stage) => {
    let cancelled = false;
    const errorResponse = () => new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    }), { status: 503 });
    const blob = new MemoryBlobPort();
    if (stage === 'moderation') await seedToken(blob);
    const dependencies = {
      blob, appId: stage === 'token' ? 'wx-token-cancel' : 'wx-runtime-app', appSecret: 'runtime-secret',
      fetch: async () => errorResponse(), now: () => new Date('2026-08-11T08:00:00.000Z'),
    };

    const operation = stage === 'token'
      ? getWeChatAccessToken(dependencies)
      : createWeChatTextSecurity(dependencies).checkText('content', 'private-open-id');

    const outcome = await settlesWithin(operation, 100);
    expect(outcome).toEqual({ type: 'rejected', error: expect.objectContaining({
      code: 'BACKEND_UNAVAILABLE', retryable: true,
    }) });
    expect(cancelled).toBe(true);
  });

  test('waits for started moderation workers to settle before returning a failure', async () => {
    const blob = new MemoryBlobPort();
    await seedToken(blob);
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    let markAllStarted!: () => void;
    const allStarted = new Promise<void>((resolve) => { markAllStarted = resolve; });
    let settled = false;
    const security = createWeChatTextSecurity({
      blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret',
      fetch: async () => {
        calls += 1;
        if (calls === 3) markAllStarted();
        if (calls === 1) return new Response('upstream', { status: 503 });
        await barrier;
        return new Response(JSON.stringify({ errcode: 0, result: { suggest: 'pass', label: 100 } }));
      },
      now: () => new Date('2026-08-11T08:00:00.000Z'),
    });
    const observed = security.checkText('x'.repeat(2500 * 3), 'private-open-id')
      .catch((error: unknown) => error)
      .finally(() => { settled = true; });

    try {
      await allStarted;
      await Promise.resolve();
      expect(settled).toBe(false);
    } finally {
      release();
    }
    await expect(observed).resolves.toMatchObject({ code: 'BACKEND_UNAVAILABLE', retryable: true });
  });
});

async function seedToken(blob: MemoryBlobPort): Promise<string> {
  await getWeChatAccessToken({
    blob, appId: 'wx-runtime-app', appSecret: 'runtime-secret',
    fetch: async () => new Response(JSON.stringify({ access_token: 'cached-token', expires_in: 7200 })),
    now: () => new Date('2026-08-11T08:00:00.000Z'),
  });
  return [...blob.records.keys()].find((key) => (
    key.startsWith('moderation/wechat-access-token/') && !key.includes('.refresh-locks/')
  ))!;
}

function refreshLockKeyForTest(appId: string, revision: number): string {
  const digest = createHash('sha256').update(appId, 'utf8').digest('hex').slice(0, 24);
  const inverse = 999_999_999_999 - revision;
  return `moderation/wechat-access-token/${digest}.refresh-locks/${String(inverse).padStart(12, '0')}.json`;
}

async function settlesWithin(operation: Promise<unknown>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(
        (value) => ({ type: 'resolved' as const, value }),
        (error: unknown) => ({ type: 'rejected' as const, error }),
      ),
      new Promise<{ type: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ type: 'timeout' }), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
