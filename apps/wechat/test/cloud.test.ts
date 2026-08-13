import { createCloudClient } from '../src/services/cloud';

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: {
    getStorageSync: jest.fn(), setStorageSync: jest.fn(), removeStorageSync: jest.fn(),
    login: jest.fn(), request: jest.fn(),
  },
}));

describe('Mini Program EdgeOne API adapter', () => {
  test('maps each public client method onto a scoped REST request with correct timeouts', async () => {
    const calls: Array<{ path: string; method: string; body?: Record<string, unknown>; timeoutMs: number }> = [];
    const client = createCloudClient(async (input) => {
      calls.push(input);
      if (input.path === '/api/generation') return completedJob();
      if (input.path === '/api/assessments/assessment-1' && input.method === 'GET') return { type: 'found', assessment: publicAssessment() };
      if (input.path.startsWith('/api/assessments?') && input.method === 'GET') return { type: 'listed', summaries: [], assessments: [], nextCursor: null };
      if (input.path.endsWith('/complete')) return { type: 'completed', assessment: completedAssessment() };
      if (input.path === '/api/assessments/assessment-1') return { type: 'updated', revision: 2 };
      if (input.path === '/api/settings' && input.method === 'GET') return { type: 'not_found', errorCode: 'INVALID_REQUEST' };
      if (input.path === '/api/settings') return { type: 'accepted', settings: settings() };
      return { type: 'created', reportId: 'report-1' };
    });

    await client.createGenerationJob({ topic: 'TypeScript', notes: 'types', clientRequestId: 'request-1' });
    await client.getGenerationJob({ jobId: 'job-1' });
    await client.getAssessment({ assessmentId: 'assessment-1' });
    await client.updateAssessment({ assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 1 });
    await client.listAssessments({ cursor: 'cursor 1', pageSize: 20 });
    await client.completeAssessment({ assessmentId: 'assessment-1', answers: fullAnswers(), expectedRevision: 1 });
    await client.getUserSettings({});
    await client.acceptPrivacyPolicy({ privacyPolicyVersion: '2026-08-10' });
    await client.createReport({ assessmentId: 'assessment-1', reason: 'question_error', detail: 'broken', policyVersion: '2026-08-10' });

    expect(calls).toEqual([
      { path: '/api/generation', method: 'POST', body: { topic: 'TypeScript', notes: 'types', clientRequestId: 'request-1' }, timeoutMs: 120_000 },
      { path: '/api/assessments/assessment-1', method: 'GET', timeoutMs: 15_000 },
      { path: '/api/assessments/assessment-1', method: 'PUT', body: { assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 1 }, timeoutMs: 15_000 },
      { path: '/api/assessments?cursor=cursor+1&pageSize=20', method: 'GET', timeoutMs: 15_000 },
      { path: '/api/assessments/assessment-1/complete', method: 'POST', body: { assessmentId: 'assessment-1', answers: fullAnswers(), expectedRevision: 1 }, timeoutMs: 15_000 },
      { path: '/api/settings', method: 'GET', timeoutMs: 15_000 },
      { path: '/api/settings', method: 'PUT', body: { privacyPolicyVersion: '2026-08-10' }, timeoutMs: 15_000 },
      { path: '/api/reports', method: 'POST', body: { assessmentId: 'assessment-1', reason: 'question_error', detail: 'broken', policyVersion: '2026-08-10' }, timeoutMs: 15_000 },
    ]);
  });

  test('keeps the completed generation envelope available to the controller polling contract', async () => {
    const client = createCloudClient(async () => completedJob());
    await client.createGenerationJob({ topic: 'TypeScript' });
    await expect(client.getGenerationJob({ jobId: 'job-1' })).resolves.toEqual(completedJob());
  });

  test('sends explicit retries and does not depend on an in-memory job map after restart', async () => {
    const calls: Array<{ path: string; method: string; body?: Record<string, unknown> }> = [];
    const firstClient = createCloudClient(async (input) => {
      calls.push(input);
      return { jobId: 'job-1', status: 'failed', progress: 0, retryable: true, errorCode: 'PROVIDER_ERROR' };
    });
    await firstClient.createGenerationJob({ topic: 'TypeScript', clientRequestId: 'request-1', retry: true });

    const restartedClient = createCloudClient(async (input) => {
      calls.push(input);
      return completedJob();
    });
    await expect(restartedClient.getGenerationJob({ jobId: 'job-1' })).rejects.toMatchObject({ errorCode: 'INCOMPLETE_JOB' });
    await restartedClient.createGenerationJob({ topic: 'TypeScript', clientRequestId: 'request-1' });

    expect(calls).toEqual([
      { path: '/api/generation', method: 'POST', body: { topic: 'TypeScript', clientRequestId: 'request-1', retry: true }, timeoutMs: 120_000 },
      { path: '/api/generation', method: 'POST', body: { topic: 'TypeScript', clientRequestId: 'request-1' }, timeoutMs: 120_000 },
    ]);
  });

  test('rejects malformed server DTOs and preserves typed service errors', async () => {
    const malformed = createCloudClient(async () => ({ jobId: '', status: 'completed', progress: 100, retryable: false, assessmentId: 'assessment-1' }));
    await expect(malformed.createGenerationJob({ topic: 'TypeScript' })).rejects.toMatchObject({ errorCode: 'INTERNAL_ERROR' });

    const failure = Object.assign(new Error('offline'), { errorCode: 'NETWORK_ERROR' });
    const offline = createCloudClient(async () => { throw failure; });
    await expect(offline.listAssessments()).rejects.toBe(failure);
  });

  test('does not introduce provider, owner, or model configuration fields in any REST payload', async () => {
    const calls: Array<{ body?: Record<string, unknown> }> = [];
    const client = createCloudClient(async (input) => {
      calls.push(input);
      return completedJob();
    });
    await client.createGenerationJob({ topic: 'TypeScript', notes: 'safe', clientRequestId: 'request-1' });
    expect(JSON.stringify(calls)).not.toMatch(/apiKey|provider|owner|OPENID|model|endpoint/i);
  });
});

function completedJob() {
  return { jobId: 'job-1', status: 'completed' as const, progress: 100, retryable: false, assessmentId: 'assessment-1' };
}

function settings() {
  return { privacyPolicyVersion: '2026-08-10', privacyConsentAt: '2026-08-10T00:00:00.000Z', hasCurrentPrivacyConsent: true };
}

function publicAssessment() {
  return {
    id: 'assessment-1', revision: 1, status: 'draft' as const, answers: {},
    createdAt: '2026-08-03T10:00:00.000Z', updatedAt: '2026-08-03T10:00:00.000Z', completedAt: null, result: null,
    paper: {
      id: 'paper-1', topic: 'TypeScript', questionCount: 50 as const, generatedAt: '2026-08-03T10:00:00.000Z',
      scoring: { maxScore: 100, levels: [{ minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' }] },
      questions: Array.from({ length: 50 }, (_, index) => ({
        id: `q${index + 1}`, type: 'single_choice' as const, difficulty: 'easy' as const, knowledgePoint: 'types', prompt: `Question ${index + 1}`,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      })),
    },
  };
}

function completedAssessment() {
  const assessment = publicAssessment();
  const questions = assessment.paper.questions.map((question) => ({ ...question, correctOptionIds: ['a'], explanation: `${question.prompt} explanation` }));
  return {
    ...assessment, status: 'completed' as const, completedAt: '2026-08-03T11:00:00.000Z', answers: fullAnswers(), paper: { ...assessment.paper, questions },
    result: {
      totalQuestions: 50, correctCount: 50, score: 50, accuracy: 100, level: { minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' },
      questionResults: questions.map((question) => ({ questionId: question.id, isCorrect: true, userOptionIds: ['a'], correctOptionIds: ['a'] })),
      knowledgePointResults: [{ knowledgePoint: 'types', total: 50, correct: 50, accuracy: 100 }], wrongQuestionIds: [],
    },
  };
}

function fullAnswers(): Record<string, string[]> {
  return Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']]));
}
