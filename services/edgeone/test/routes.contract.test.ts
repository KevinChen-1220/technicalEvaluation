import type { AssessmentPaper } from '@dynamic-assessment/assessment-core';
import { issueSession } from '../src/auth/sessionToken';
import type { EdgeOneContext } from '../src/platform/context';
import { createAssessmentsRoute } from '../src/routes/assessments';
import { createGenerationRoute } from '../src/routes/generation';
import { createReportsRoute } from '../src/routes/reports';
import { createSettingsRoute } from '../src/routes/settings';
import { MemoryBlobPort } from '../src/storage/memoryStores';
import { createEdgeOneStores } from '../src/storage/edgeOneStores';
import { ApiError } from '../src/http/errors';
import { createHash } from 'node:crypto';

const now = () => new Date('2026-08-11T08:00:00.000Z');

describe('EdgeOne REST contracts', () => {
  test('generation requires current privacy consent, maps free-tier limits, and ignores a forged owner', async () => {
    const fixture = await routeFixture();
    const generated = jest.fn();
    const noConsent = await createGenerationRoute(fixture.request('/api/generation', 'POST', {
      topic: 'TypeScript', ownerKey: 'forged-owner', clientRequestId: 'request-1',
    }), fixture.context, { stores: fixture.stores, generate: generated, now });
    expect(noConsent.status).toBe(403);
    expect(await noConsent.json()).toEqual({ ok: false, error: {
      code: 'PRIVACY_CONSENT_REQUIRED', message: expect.any(String), retryable: false,
    } });
    expect(generated).not.toHaveBeenCalled();

    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    jest.spyOn(fixture.stores.quota, 'reserve').mockResolvedValue('quota_exceeded');
    const limited = await createGenerationRoute(fixture.request('/api/generation', 'POST', {
      topic: 'TypeScript', ownerKey: 'forged-owner', clientRequestId: 'request-2',
    }), fixture.context, { stores: fixture.stores, generate: generated, now });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: {
      code: 'FREE_TIER_LIMIT', message: expect.any(String), retryable: true,
    } });
  });

  test('generation is idempotent by owner and clientRequestId and returns a completed job envelope', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    const generate = jest.fn(async (input: { ownerKey: string; openId: string; assessmentId: string; topic: string }) => {
      expect(input.ownerKey).toBe(fixture.ownerKey);
      expect(input.openId).toBe('private-open-id');
      const record = assessmentRecord(input.ownerKey, input.assessmentId, input.topic);
      await fixture.stores.assessments.createIfAbsent(record);
      return record;
    });
    const body = { topic: 'TypeScript', ownerKey: 'forged-owner', clientRequestId: 'stable-request' };
    const first = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    const second = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    const firstBody = await first.json() as { data: { assessmentId: string } };
    expect(first.status).toBe(201);
    expect(firstBody).toEqual({ ok: true, data: {
      jobId: expect.any(String), status: 'completed', progress: 100, retryable: false,
      assessmentId: expect.any(String), attempt: 1,
    } });
    expect(await second.json()).toEqual({ ok: true, data: expect.objectContaining({
      status: 'completed', assessmentId: firstBody.data.assessmentId,
    }) });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('persists an in-flight job so concurrent duplicate requests invoke the LLM once', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const didStart = new Promise<void>((resolve) => { started = resolve; });
    const generate = jest.fn(async (input: { ownerKey: string; assessmentId: string; topic: string }) => {
      started();
      await barrier;
      const record = assessmentRecord(input.ownerKey, input.assessmentId, input.topic);
      await fixture.stores.assessments.createIfAbsent(record);
      return record;
    });
    const body = { topic: 'TypeScript', clientRequestId: 'concurrent-request' };
    const first = createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    await didStart;
    const duplicate = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    expect(await duplicate.json()).toEqual({ ok: true, data: expect.objectContaining({ status: 'running', attempt: 1 }) });
    expect(generate).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  test('recovers a persisted assessment immediately after taking over a stale running job', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    const clientRequestId = 'stale-persisted-assessment';
    const digest = createHash('sha256')
      .update(`${fixture.ownerKey}\0${clientRequestId}`, 'utf8').digest('hex').slice(0, 32);
    const assessmentId = `assessment-${digest}`;
    const jobId = `job-${digest}`;
    await fixture.stores.jobs.begin({
      ownerKey: fixture.ownerKey,
      jobId,
      clientRequestIdHash: createHash('sha256').update(clientRequestId, 'utf8').digest('hex'),
      assessmentId,
      leaseToken: 'abandoned-lease',
      now: '2026-08-11T08:00:00.000Z',
      retry: false,
    });
    await fixture.stores.assessments.createIfAbsent(assessmentRecord(fixture.ownerKey, assessmentId, 'TypeScript'));
    const reserve = jest.spyOn(fixture.stores.quota, 'reserve');
    const generate = jest.fn(async () => { throw new Error('LLM must not run'); });

    const response = await createGenerationRoute(fixture.request('/api/generation', 'POST', {
      topic: 'TypeScript', clientRequestId, retry: true,
    }), fixture.context, {
      stores: fixture.stores,
      generate,
      now: () => new Date('2026-08-11T08:03:00.000Z'),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: expect.objectContaining({
      status: 'completed', assessmentId, attempt: 2,
    }) });
    expect(reserve).not.toHaveBeenCalled();
    expect(generate).not.toHaveBeenCalled();
  });

  test('creates a 115-second deadline at route entry and passes it into generation', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    jest.spyOn(fixture.stores.quota, 'reserve').mockResolvedValue('allowed');
    const startedAt = Date.now();
    const generate = jest.fn(async (input: { ownerKey: string; assessmentId: string; topic: string }, deadline?: { expiresAt: number }) => {
      expect(deadline).toBeDefined();
      expect(deadline!.expiresAt - startedAt).toBeLessThanOrEqual(115_000);
      expect(deadline!.expiresAt - startedAt).toBeGreaterThan(110_000);
      const record = assessmentRecord(input.ownerKey, input.assessmentId, input.topic);
      await fixture.stores.assessments.createIfAbsent(record);
      return record;
    });
    await createGenerationRoute(fixture.request('/api/generation', 'POST', {
      topic: 'TypeScript', clientRequestId: 'deadline-request',
    }), fixture.context, { stores: fixture.stores, generate, now });
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test('keeps failed status stable until an explicit retry opens the next attempt', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    jest.spyOn(fixture.stores.quota, 'reserve').mockResolvedValue('allowed');
    const generate = jest.fn()
      .mockRejectedValueOnce(new ApiError('PROVIDER_ERROR', 502, true))
      .mockImplementationOnce(async (input: { ownerKey: string; assessmentId: string; topic: string }) => {
        const record = assessmentRecord(input.ownerKey, input.assessmentId, input.topic);
        await fixture.stores.assessments.createIfAbsent(record);
        return record;
      });
    const body = { topic: 'TypeScript', clientRequestId: 'retry-request' };
    const failed = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    expect(failed.status).toBe(502);

    const stable = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    expect(await stable.json()).toEqual({ ok: true, data: expect.objectContaining({
      status: 'failed', attempt: 1, errorCode: 'PROVIDER_ERROR', retryable: true,
    }) });

    const retried = await createGenerationRoute(fixture.request('/api/generation', 'POST', { ...body, retry: true }), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    expect(await retried.json()).toEqual({ ok: true, data: expect.objectContaining({ status: 'completed', attempt: 2 }) });
    expect(generate).toHaveBeenCalledTimes(2);
  });

  test('reuses one real quota reservation when a failed generation is retried immediately', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    const generate = jest.fn()
      .mockRejectedValueOnce(new ApiError('PROVIDER_ERROR', 502, true))
      .mockImplementationOnce(async (input: { ownerKey: string; assessmentId: string; topic: string }) => {
        const record = assessmentRecord(input.ownerKey, input.assessmentId, input.topic);
        await fixture.stores.assessments.createIfAbsent(record);
        return record;
      });
    const body = { topic: 'TypeScript', clientRequestId: 'real-quota-retry' };

    const failed = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    const retried = await createGenerationRoute(fixture.request('/api/generation', 'POST', { ...body, retry: true }), fixture.context, {
      stores: fixture.stores, generate, now,
    });

    expect(failed.status).toBe(502);
    expect(retried.status).toBe(201);
    expect(generate).toHaveBeenCalledTimes(2);
    const quotaRecords = [...fixture.blob.records.entries()]
      .filter(([key]) => key.startsWith(`quotas/${encodeURIComponent(fixture.ownerKey)}/ledger/`));
    expect(quotaRecords).toHaveLength(1);
    expect(quotaRecords[0]?.[1]).toEqual(expect.objectContaining({ dailyCount: 1 }));
  });

  test('recovers quota idempotency when the job marker write fails before an A-B-A retry', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    const originalPut = fixture.blob.put.bind(fixture.blob);
    let failMarker = true;
    jest.spyOn(fixture.blob, 'put').mockImplementation(async (key, value, options) => {
      if (failMarker && key.endsWith('/quota-reserved.json')) {
        failMarker = false;
        throw new Error('marker unavailable');
      }
      await originalPut(key, value, options);
    });
    const generate = jest.fn(async (input: { ownerKey: string; assessmentId: string; topic: string }) => {
      const record = assessmentRecord(input.ownerKey, input.assessmentId, input.topic);
      await fixture.stores.assessments.createIfAbsent(record);
      return record;
    });
    const body = { topic: 'TypeScript', clientRequestId: 'marker-failure-job-a' };

    const failed = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate, now,
    });
    expect(failed.status).toBe(500);
    await expect(fixture.stores.quota.reserve(
      fixture.ownerKey, new Date('2026-08-11T08:01:00.000Z'), true, 'job-b',
    )).resolves.toBe('allowed');

    const retried = await createGenerationRoute(
      fixture.request('/api/generation', 'POST', { ...body, retry: true }), fixture.context,
      { stores: fixture.stores, generate, now },
    );
    expect(retried.status).toBe(201);
    expect(generate).toHaveBeenCalledTimes(1);

    const quotaRecords = [...fixture.blob.records.entries()]
      .filter(([key]) => key.startsWith(`quotas/${encodeURIComponent(fixture.ownerKey)}/ledger/`))
      .map(([, value]) => value as { revision: number; dailyCount: number; reservationIds: string[] })
      .sort((left, right) => right.revision - left.revision);
    expect(quotaRecords[0]).toEqual(expect.objectContaining({
      dailyCount: 2,
      reservationIds: expect.arrayContaining(['job-b', expect.stringMatching(/^job-/)]),
    }));
  });

  test('durably fails a claimed job when quota reservation throws', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    jest.spyOn(fixture.stores.quota, 'reserve').mockRejectedValue(new Error('Blob unavailable'));
    const body = { topic: 'TypeScript', clientRequestId: 'quota-error' };

    const failed = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate: jest.fn(), now,
    });
    const replay = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
      stores: fixture.stores, generate: jest.fn(), now,
    });

    expect(failed.status).toBe(500);
    expect(await replay.json()).toEqual({ ok: true, data: expect.objectContaining({
      status: 'failed', attempt: 1, errorCode: 'INTERNAL_ERROR', retryable: true,
    }) });
  });

  test('uses a fresh short budget to persist failure after the global deadline expires', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    let generationStarted!: () => void;
    const didStart = new Promise<void>((resolve) => { generationStarted = resolve; });
    const originalFail = fixture.stores.jobs.fail.bind(fixture.stores.jobs);
    jest.spyOn(fixture.stores.jobs, 'fail').mockImplementation(async (...args) => {
      await new Promise((resolve) => setTimeout(resolve, 100));
      return await originalFail(...args);
    });
    jest.useFakeTimers();
    try {
      let settled = false;
      const body = { topic: 'TypeScript', clientRequestId: 'deadline-durable-failure' };
      const operation = createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
        stores: fixture.stores,
        generate: async () => {
          generationStarted();
          return await new Promise(() => undefined);
        },
        now,
      }).finally(() => { settled = true; });
      await didStart;
      await jest.advanceTimersByTimeAsync(115_000);
      await Promise.resolve();
      expect(settled).toBe(false);
      await jest.advanceTimersByTimeAsync(100);
      expect((await operation).status).toBe(504);

      const replay = await createGenerationRoute(fixture.request('/api/generation', 'POST', body), fixture.context, {
        stores: fixture.stores, generate: jest.fn(), now,
      });
      expect(await replay.json()).toEqual({ ok: true, data: expect.objectContaining({
        status: 'failed', errorCode: 'REQUEST_TIMEOUT', attempt: 1,
      }) });
    } finally {
      jest.useRealTimers();
    }
  });

  test('lists, gets, updates, and completes only the authenticated owner assessment', async () => {
    const fixture = await routeFixture();
    await fixture.stores.assessments.createIfAbsent(assessmentRecord(fixture.ownerKey, 'assessment-a', 'TypeScript'));
    await fixture.stores.assessments.createIfAbsent(assessmentRecord('other-owner', 'assessment-b', 'Rust'));

    const listed = await createAssessmentsRoute(fixture.request('/api/assessments?ownerKey=forged-owner'), fixture.context, { stores: fixture.stores, now });
    const listedBody = await listed.json() as { data: { assessments: Array<{ id: string }> } };
    expect(listedBody.data.assessments.map((item) => item.id)).toEqual(['assessment-a']);

    const found = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-a'), fixture.context, { stores: fixture.stores, now });
    expect(await found.json()).toEqual({ ok: true, data: expect.objectContaining({ type: 'found' }) });

    const updated = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-a', 'PATCH', {
      ownerKey: 'forged-owner', answers: { q1: ['a'] }, expectedRevision: 1,
    }), fixture.context, { stores: fixture.stores, now });
    expect(await updated.json()).toEqual({ ok: true, data: { type: 'updated', revision: 2 } });

    const conflict = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-a', 'PATCH', {
      answers: {}, expectedRevision: 1,
    }), fixture.context, { stores: fixture.stores, now });
    expect(await conflict.json()).toEqual({ ok: true, data: expect.objectContaining({ type: 'conflict' }) });

    const incomplete = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-a/complete', 'POST', {
      answers: { q1: ['a'] }, expectedRevision: 2,
    }), fixture.context, { stores: fixture.stores, now });
    expect(incomplete.status).toBe(400);
    expect(await incomplete.json()).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'INVALID_REQUEST', retryable: false }),
    });

    const answers = Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']]));
    const completed = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-a/complete', 'POST', {
      answers, expectedRevision: 2,
    }), fixture.context, { stores: fixture.stores, now });
    expect(await completed.json()).toEqual({ ok: true, data: expect.objectContaining({
      type: 'completed', assessment: expect.objectContaining({ status: 'completed', completedAt: now().toISOString() }),
    }) });

    const foreign = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-b'), fixture.context, { stores: fixture.stores, now });
    expect(await foreign.json()).toEqual({ ok: true, data: { type: 'not_found', errorCode: 'INVALID_REQUEST' } });
  });

  test('settings derive owner and expose only the public privacy DTO', async () => {
    const fixture = await routeFixture();
    const accepted = await createSettingsRoute(fixture.request('/api/settings', 'PUT', {
      ownerKey: 'forged-owner', privacyPolicyVersion: '2026-08-10', modelApiKey: 'must-not-persist',
    }), fixture.context, { stores: fixture.stores, now });
    expect(await accepted.json()).toEqual({ ok: true, data: {
      type: 'accepted', settings: {
        privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(), hasCurrentPrivacyConsent: true,
      },
    } });
    expect(await fixture.stores.settings.get(fixture.ownerKey)).not.toHaveProperty('modelApiKey');
    expect(await fixture.stores.settings.get('forged-owner')).toBeNull();
  });

  test.each(['privacy', 'other'] as const)('allows %s reports without an assessment id', async (reason) => {
    const fixture = await routeFixture();
    const response = await createReportsRoute(fixture.request('/api/reports', 'POST', {
      reason, detail: 'feedback', policyVersion: '2026-08-10', ownerKey: 'forged-owner',
    }), fixture.context, { stores: fixture.stores, now, reportId: () => 'report-a' });
    expect(await response.json()).toEqual({ ok: true, data: { type: 'created', reportId: 'report-a' } });
    expect(await fixture.stores.reports.list(fixture.ownerKey)).toEqual([
      expect.objectContaining({ id: 'report-a', ownerKey: fixture.ownerKey, policyVersion: '2026-08-10' }),
    ]);
  });

  test('requires an owned assessment for question and safety reports', async () => {
    const fixture = await routeFixture();
    const response = await createReportsRoute(fixture.request('/api/reports', 'POST', {
      reason: 'question_error', assessmentId: 'foreign-assessment', policyVersion: '2026-08-10',
    }), fixture.context, { stores: fixture.stores, now, reportId: () => 'report-a' });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: {
      code: 'INVALID_REQUEST', message: expect.any(String), retryable: false,
    } });
    expect(await fixture.stores.reports.list(fixture.ownerKey)).toEqual([]);
  });

  test('never leaks unknown answer aliases from a draft response', async () => {
    const fixture = await routeFixture();
    const record = assessmentRecord(fixture.ownerKey, 'assessment-leak', 'TypeScript');
    Object.assign(record.paper.questions[0]!, {
      answer: ['b'], correctAnswer: 'b', rationale: 'hidden answer alias',
    });
    Object.assign(record.paper.questions[0]!.options[0]!, { isCorrect: true });
    record.paper.questions[0]!.materials = [Object.assign(
      { type: 'text' as const, text: 'Reference material' },
      { answer: 'material-secret', explanation: 'material-rationale' },
    )];
    await fixture.stores.assessments.createIfAbsent(record);
    const response = await createAssessmentsRoute(
      fixture.request('/api/assessments/assessment-leak'), fixture.context, { stores: fixture.stores, now },
    );
    const serialized = JSON.stringify(await response.json());
    expect(serialized).not.toContain('correctOptionIds');
    expect(serialized).not.toContain('explanation');
    expect(serialized).not.toContain('correctAnswer');
    expect(serialized).not.toContain('isCorrect');
    expect(serialized).not.toContain('hidden answer alias');
    expect(serialized).not.toContain('material-secret');
    expect(serialized).not.toContain('material-rationale');
  });

  test.each([
    ['generation', '/api/generation', 'GET'],
    ['assessments', '/api/assessments', 'POST'],
    ['settings', '/api/settings', 'POST'],
    ['reports', '/api/reports', 'GET'],
  ])('returns a stable 405 envelope for unsupported %s methods', async (route, path, method) => {
    const fixture = await routeFixture();
    const handlers = {
      generation: () => createGenerationRoute(fixture.request(path, method), fixture.context, { stores: fixture.stores, generate: jest.fn(), now }),
      assessments: () => createAssessmentsRoute(fixture.request(path, method), fixture.context, { stores: fixture.stores, now }),
      settings: () => createSettingsRoute(fixture.request(path, method), fixture.context, { stores: fixture.stores, now }),
      reports: () => createReportsRoute(fixture.request(path, method), fixture.context, { stores: fixture.stores, now, reportId: () => 'report-a' }),
    };
    const response = await handlers[route as keyof typeof handlers]();
    expect(response.status).toBe(405);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: expect.any(String), retryable: false },
    });
  });

  test.each([
    ['generation', '/api/generation', 'POST', { topic: 'TypeScript', clientRequestId: 'unauthorized' }],
    ['assessments', '/api/assessments', 'GET', undefined],
    ['settings', '/api/settings', 'GET', undefined],
    ['reports', '/api/reports', 'POST', { reason: 'other', detail: 'feedback' }],
  ])('requires a session for the %s business route', async (route, path, method, body) => {
    const fixture = await routeFixture();
    const request = new Request(`https://example.test${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    });
    const handlers = {
      generation: () => createGenerationRoute(request, fixture.context, { stores: fixture.stores, generate: jest.fn(), now }),
      assessments: () => createAssessmentsRoute(request, fixture.context, { stores: fixture.stores, now }),
      settings: () => createSettingsRoute(request, fixture.context, { stores: fixture.stores, now }),
      reports: () => createReportsRoute(request, fixture.context, { stores: fixture.stores, now, reportId: () => 'report-a' }),
    };

    const response = await handlers[route as keyof typeof handlers]();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'UNAUTHORIZED', message: expect.any(String), retryable: false },
    });
  });
});

async function routeFixture() {
  const blob = new MemoryBlobPort();
  const sessionDependencies = {
    blob, sessionHmacKey: 'session-runtime-key', ownerHmacKey: 'owner-runtime-key',
    openIdEncryptionKey: Buffer.alloc(32, 9).toString('base64'), now,
    randomBytes: () => new Uint8Array(32).fill(7),
  };
  const session = await issueSession('private-open-id', sessionDependencies);
  const ownerKey = (await import('../src/auth/sessionToken')).requireSession;
  const identity = await ownerKey(new Request('https://example.test', {
    headers: { authorization: `Bearer ${session.token}` },
  }), sessionDependencies);
  const context: EdgeOneContext = {
    request: new Request('https://example.test'),
    env: {
      SESSION_HMAC_KEY: 'session-runtime-key', OWNER_HMAC_KEY: 'owner-runtime-key',
      OPENID_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      PRIVACY_POLICY_VERSION: '2026-08-10', GENERATION_ENABLED: 'true',
    },
    blob,
  };
  return {
    context,
    blob,
    ownerKey: identity.ownerKey,
    stores: createEdgeOneStores(blob, { now }),
    request(path: string, method = 'GET', body?: unknown) {
      return new Request(`https://example.test${path}`, {
        method,
        headers: {
          authorization: `Bearer ${session.token}`,
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    },
  };
}

function assessmentRecord(ownerKey: string, id: string, topic: string) {
  const paper: AssessmentPaper = {
    id, topic, questionCount: 50, generatedAt: now().toISOString(),
    scoring: { maxScore: 50, levels: [{ minPercent: 0, maxPercent: 100, title: 'Result', summary: 'Summary' }] },
    questions: Array.from({ length: 50 }, (_, index) => ({
      id: `q${index + 1}`, type: 'single_choice', difficulty: 'easy', knowledgePoint: 'Core', prompt: `Q${index + 1}`,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionIds: ['a'], explanation: 'A',
    })),
  };
  return {
    id, ownerKey, revision: 1, status: 'draft' as const, paper, answers: {}, result: null,
    createdAt: now().toISOString(), updatedAt: now().toISOString(), submittedAt: null,
  };
}
