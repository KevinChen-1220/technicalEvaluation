import { createCloudClient } from '../src/services/cloud';

jest.mock('@tarojs/taro', () => ({
  __esModule: true,
  default: { cloud: { callFunction: jest.fn() } },
}));

describe('Mini Program cloud adapter', () => {
  test('rebuilds safe public payloads without owner or provider fields', async () => {
    const calls: Array<{ name: string; data: unknown }> = [];
    const client = createCloudClient(async (input) => {
      calls.push(input);
      if (input.name === 'create-generation-job') return { result: { jobId: 'job-1', status: 'queued' } };
      if (input.name === 'get-generation-job') return { result: { jobId: 'job-1', status: 'queued', progress: 0, retryable: false } };
      if (input.name === 'get-assessment') return { result: { type: 'not_found', errorCode: 'INVALID_REQUEST' } };
      if (input.name === 'list-assessments') return { result: { type: 'listed', summaries: [], assessments: [], nextCursor: null } };
      if (input.name === 'complete-assessment') return { result: { type: 'completed', assessment: completedAssessment() } };
      return { result: { type: 'updated', revision: 2 } };
    });
    const unsafe = { OPENID: 'spoofed', owner: 'spoofed', provider: 'x', model: 'x', endpoint: 'http://x', apiKey: 'secret' };

    await client.createGenerationJob({ topic: 'TS', notes: 'types', questionCount: 50, ...unsafe });
    await client.getGenerationJob({ jobId: 'job-1', ...unsafe });
    await client.getAssessment({ assessmentId: 'assessment-1', ...unsafe });
    await client.updateAssessment({ assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 1, ...unsafe });
    await client.listAssessments({ cursor: 'cursor-1', pageSize: 20, ...unsafe });
    await client.completeAssessment({
      assessmentId: 'assessment-1',
      answers: { q1: ['a'] },
      expectedRevision: 2,
      result: { score: 999 },
      score: 999,
      completedAt: 'spoofed',
      owner: 'spoofed',
    } as Parameters<typeof client.completeAssessment>[0] & {
      result: unknown;
      score: number;
      completedAt: string;
      owner: string;
    });

    expect(calls).toEqual([
      { name: 'create-generation-job', data: { topic: 'TS', notes: 'types', questionCount: 50 } },
      { name: 'get-generation-job', data: { jobId: 'job-1' } },
      { name: 'get-assessment', data: { assessmentId: 'assessment-1' } },
      { name: 'update-assessment', data: { assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 1 } },
      { name: 'list-assessments', data: { cursor: 'cursor-1', pageSize: 20 } },
      { name: 'complete-assessment', data: { assessmentId: 'assessment-1', answers: { q1: ['a'] }, expectedRevision: 2 } },
    ]);
  });

  test('turns a safe cloud error response into a typed rejection', async () => {
    const client = createCloudClient(async () => ({ result: { errorCode: 'QUOTA_EXCEEDED' } }));

    await expect(client.createGenerationJob({ topic: 'TS', questionCount: 50 }))
      .rejects.toMatchObject({ errorCode: 'QUOTA_EXCEEDED' });
  });

  test.each([
    ['create-generation-job', { jobId: '', status: 'queued' }, 'INTERNAL_ERROR', (client: ReturnType<typeof createCloudClient>) => (
      client.createGenerationJob({ topic: 'TS', questionCount: 50 })
    )],
    ['get-generation-job', { jobId: 'job-1', status: 'running', progress: 'half', retryable: false }, 'INTERNAL_ERROR', (client: ReturnType<typeof createCloudClient>) => (
      client.getGenerationJob({ jobId: 'job-1' })
    )],
    ['get-generation-job', { jobId: 'job-1', status: 'completed', progress: 100, retryable: false }, 'INCOMPLETE_JOB', (client: ReturnType<typeof createCloudClient>) => (
      client.getGenerationJob({ jobId: 'job-1' })
    )],
    ['get-assessment', { type: 'found', assessment: { ...publicAssessment(), revision: 0 } }, 'INTERNAL_ERROR', (client: ReturnType<typeof createCloudClient>) => (
      client.getAssessment({ assessmentId: 'assessment-1' })
    )],
    ['update-assessment', { type: 'updated', revision: 'next' }, 'INTERNAL_ERROR', (client: ReturnType<typeof createCloudClient>) => (
      client.updateAssessment({ assessmentId: 'assessment-1', answers: {}, expectedRevision: 1 })
    )],
    ['list-assessments', { assessments: [publicAssessment()], nextCursor: 7 }, 'INTERNAL_ERROR', (client: ReturnType<typeof createCloudClient>) => (
      client.listAssessments({})
    )],
    ['complete-assessment', { type: 'completed', assessment: { ...completedAssessment(), result: null } }, 'INTERNAL_ERROR', (client: ReturnType<typeof createCloudClient>) => (
      client.completeAssessment({ assessmentId: 'assessment-1', answers: fullAnswers(), expectedRevision: 1 })
    )],
  ] as const)('rejects a malformed %s response', async (_name, result, errorCode, invoke) => {
    const client = createCloudClient(async () => ({ result }));

    await expect(invoke(client)).rejects.toMatchObject({ errorCode });
  });

  test('rejects answer keys in a supposedly answerable assessment response', async () => {
    const assessment = publicAssessment();
    const leaked = {
      ...assessment,
      paper: {
        ...assessment.paper,
        questions: assessment.paper.questions.map((question, index) => (
          index === 0 ? { ...question, correctOptionIds: ['a'], explanation: 'leaked' } : question
        )),
      },
    };
    const client = createCloudClient(async () => ({ result: { type: 'found', assessment: leaked } }));

    await expect(client.getAssessment({ assessmentId: 'assessment-1' }))
      .rejects.toMatchObject({ errorCode: 'INTERNAL_ERROR' });
  });

  test('accepts completed assessment DTOs with answer keys only when a persisted result is present', async () => {
    const completed = completedAssessment();
    const client = createCloudClient(async (input) => (
      input.name === 'get-assessment'
        ? { result: { type: 'found', assessment: completed } }
        : { result: { type: 'completed', assessment: completed } }
    ));

    await expect(client.getAssessment({ assessmentId: 'assessment-1' }))
      .resolves.toEqual({ type: 'found', assessment: completed });
    await expect(client.completeAssessment({ assessmentId: 'assessment-1', answers: fullAnswers(), expectedRevision: 1 }))
      .resolves.toEqual({ type: 'completed', assessment: completed });
  });

  test('times out a cloud call that never settles', async () => {
    jest.useFakeTimers();
    const client = createCloudClient(
      () => new Promise(() => undefined),
      { callTimeoutMs: 50 },
    );

    const operation = client.getGenerationJob({ jobId: 'job-1' });
    jest.advanceTimersByTime(50);

    await expect(operation).rejects.toMatchObject({ errorCode: 'REQUEST_TIMEOUT' });
    jest.useRealTimers();
  });

  test('maps a malformed callFunction envelope to a typed internal error', async () => {
    const client = createCloudClient(async () => null as unknown as { result?: unknown });

    await expect(client.createGenerationJob({ topic: 'TS', questionCount: 50 }))
      .rejects.toMatchObject({ errorCode: 'INTERNAL_ERROR' });
  });
});

function publicAssessment() {
  return {
    id: 'assessment-1', revision: 1, status: 'draft' as const, answers: {},
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    completedAt: null,
    result: null,
    paper: {
      id: 'paper-1', topic: 'TypeScript', questionCount: 50 as const,
      generatedAt: '2026-08-03T10:00:00.000Z',
      scoring: {
        maxScore: 100,
        levels: [{ minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' }],
      },
      questions: Array.from({ length: 50 }, (_, index) => ({
        id: `q${index + 1}`,
        type: 'single_choice' as const,
        difficulty: 'easy' as const,
        knowledgePoint: 'types',
        prompt: `Question ${index + 1}`,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      })),
    },
  };
}

function completedAssessment() {
  const assessment = publicAssessment();
  const questions = assessment.paper.questions.map((question) => ({
    ...question,
    correctOptionIds: ['a'],
    explanation: `${question.prompt} explanation`,
  }));
  return {
    ...assessment,
    status: 'completed' as const,
    completedAt: '2026-08-03T11:00:00.000Z',
    answers: fullAnswers(),
    paper: { ...assessment.paper, questions },
    result: {
      totalQuestions: 50,
      correctCount: 50,
      score: 50,
      accuracy: 100,
      level: { minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' },
      questionResults: questions.map((question) => ({
        questionId: question.id,
        isCorrect: true,
        userOptionIds: ['a'],
        correctOptionIds: ['a'],
      })),
      knowledgePointResults: [{ knowledgePoint: 'types', total: 50, correct: 50, accuracy: 100 }],
      wrongQuestionIds: [],
    },
  };
}

function fullAnswers(): Record<string, string[]> {
  return Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']]));
}
