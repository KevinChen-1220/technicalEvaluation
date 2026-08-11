import type { AssessmentPaper } from '@dynamic-assessment/assessment-core';
import { issueSession } from '../src/auth/sessionToken';
import type { EdgeOneContext } from '../src/platform/context';
import { createAssessmentsRoute } from '../src/routes/assessments';
import { createGenerationRoute } from '../src/routes/generation';
import { createReportsRoute } from '../src/routes/reports';
import { createSettingsRoute } from '../src/routes/settings';
import { createMemoryStores, MemoryBlobPort } from '../src/storage/memoryStores';

const now = () => new Date('2026-08-11T08:00:00.000Z');

describe('EdgeOne REST contracts', () => {
  test('generation requires current privacy consent, maps free-tier limits, and ignores a forged owner', async () => {
    const fixture = await routeFixture();
    const generated = jest.fn();
    const noConsent = await createGenerationRoute(fixture.request('/api/generation', 'POST', {
      topic: 'TypeScript', ownerKey: 'forged-owner', clientRequestId: 'request-1',
    }), fixture.context, { stores: fixture.stores, generate: generated, now });
    expect(noConsent.status).toBe(403);
    expect(await noConsent.json()).toEqual({ ok: false, error: { code: 'PRIVACY_CONSENT_REQUIRED', retryable: false } });
    expect(generated).not.toHaveBeenCalled();

    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    jest.spyOn(fixture.stores.quota, 'reserve').mockResolvedValue('quota_exceeded');
    const limited = await createGenerationRoute(fixture.request('/api/generation', 'POST', {
      topic: 'TypeScript', ownerKey: 'forged-owner', clientRequestId: 'request-2',
    }), fixture.context, { stores: fixture.stores, generate: generated, now });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ ok: false, error: { code: 'FREE_TIER_LIMIT', retryable: true } });
  });

  test('generation is idempotent by owner and clientRequestId and returns a completed job envelope', async () => {
    const fixture = await routeFixture();
    await fixture.stores.settings.set(fixture.ownerKey, {
      privacyPolicyVersion: '2026-08-10', privacyConsentAt: now().toISOString(),
    });
    const generate = jest.fn(async (input: { ownerKey: string; assessmentId: string; topic: string }) => {
      expect(input.ownerKey).toBe(fixture.ownerKey);
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
      assessmentId: expect.any(String),
    } });
    expect(await second.json()).toEqual({ ok: true, data: expect.objectContaining({
      status: 'completed', assessmentId: firstBody.data.assessmentId,
    }) });
    expect(generate).toHaveBeenCalledTimes(1);
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

    const completed = await createAssessmentsRoute(fixture.request('/api/assessments/assessment-a/complete', 'POST', {
      answers: { q1: ['a'] }, expectedRevision: 2,
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
    expect(await response.json()).toEqual({ ok: false, error: { code: 'INVALID_REQUEST', retryable: false } });
    expect(await fixture.stores.reports.list(fixture.ownerKey)).toEqual([]);
  });
});

async function routeFixture() {
  const blob = new MemoryBlobPort();
  const sessionDependencies = {
    blob, sessionHmacKey: 'session-runtime-key', ownerHmacKey: 'owner-runtime-key', now,
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
      PRIVACY_POLICY_VERSION: '2026-08-10', GENERATION_ENABLED: 'true',
    },
    blob,
  };
  return {
    context,
    ownerKey: identity.ownerKey,
    stores: {
      assessments: new (await import('../src/storage/assessmentRepository')).BlobAssessmentRepository(blob, { now }),
      settings: new (await import('../src/storage/settingsRepository')).BlobSettingsRepository<Record<string, unknown>>(blob),
      quota: new (await import('../src/storage/quotaRepository')).BlobQuotaRepository(blob),
      reports: new (await import('../src/storage/reportRepository')).BlobReportRepository(blob, { now }),
    },
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
