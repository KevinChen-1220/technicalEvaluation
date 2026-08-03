import type { AssessmentQuestion, ScoringLevel } from '@dynamic-assessment/assessment-core';
import type { Assessment, GenerationJob } from '../shared/contracts';
import {
  generationWorkerBudget,
  parseGeneratedBatch,
  runGenerationWorker,
  type CompletionBatchRequest,
  type CompletionCallOptions,
  type GenerationWorkerDependencies,
  type WorkerClaimInput,
  type WorkerFailureInput,
  type WorkerLeaseInput,
  type WorkerProgressInput,
} from '../server/generation/worker';
import { GenerationServiceError } from '../server/generation/errors';

const initialTime = new Date('2026-08-03T10:30:00.000Z');
const scoringLevels: ScoringLevel[] = [
  { minPercent: 0, maxPercent: 59, title: '继续练习', summary: '巩固基础知识。' },
  { minPercent: 60, maxPercent: 100, title: '掌握良好', summary: '继续保持。' },
];

class ObservableWorkerRepository {
  readonly jobs: GenerationJob[] = [];
  readonly assessments: Assessment[] = [];
  readonly events: string[] = [];

  async claimNext(input: WorkerClaimInput): Promise<GenerationJob | null> {
    const job = this.jobs.find((candidate) => (
      candidate.status === 'queued'
      || (candidate.status === 'running' && candidate.leaseExpiresAt !== undefined
        && candidate.leaseExpiresAt <= input.now)
    ));
    if (!job) return null;

    Object.assign(job, {
      status: 'running',
      leaseOwner: input.leaseOwner,
      leaseExpiresAt: input.leaseExpiresAt,
      updatedAt: input.now,
    });
    this.events.push(`claim:${job._id}`);
    return { ...job };
  }

  async findAssessment(assessmentId: string): Promise<Assessment | null> {
    return this.assessments.find((assessment) => assessment._id === assessmentId) ?? null;
  }

  async updateProgress(input: WorkerProgressInput): Promise<boolean> {
    const job = this.jobs.find((candidate) => (
      candidate._id === input.jobId
      && candidate.status === 'running'
      && candidate.leaseOwner === input.leaseOwner
    ));
    if (!job) return false;
    Object.assign(job, {
      progress: input.progress,
      leaseExpiresAt: input.leaseExpiresAt,
      updatedAt: input.now,
    });
    this.events.push(`progress:${input.progress}`);
    return true;
  }

  async renewLease(input: WorkerLeaseInput): Promise<boolean> {
    const job = this.jobs.find((candidate) => (
      candidate._id === input.jobId
      && candidate.status === 'running'
      && candidate.leaseOwner === input.leaseOwner
    ));
    if (!job) return false;
    Object.assign(job, { leaseExpiresAt: input.leaseExpiresAt, updatedAt: input.now });
    this.events.push(`renew:${input.leaseExpiresAt}`);
    return true;
  }

  async createAssessmentIfAbsent(assessment: Assessment): Promise<Assessment> {
    const existing = await this.findAssessment(assessment._id);
    if (existing) return existing;
    this.assessments.push(assessment);
    this.events.push(`assessment:${assessment._id}`);
    return assessment;
  }

  async completeJob(input: {
    jobId: string;
    leaseOwner: string;
    assessmentId: string;
    now: string;
  }): Promise<boolean> {
    const job = this.jobs.find((candidate) => candidate._id === input.jobId);
    if (!job) return false;
    if (job.status === 'completed' && job.assessmentId === input.assessmentId) return true;
    if (job.status !== 'running' || job.leaseOwner !== input.leaseOwner) return false;
    Object.assign(job, {
      status: 'completed',
      assessmentId: input.assessmentId,
      progress: 100,
      retryable: false,
      updatedAt: input.now,
    });
    delete job.errorCode;
    delete job.leaseOwner;
    delete job.leaseExpiresAt;
    this.events.push(`complete:${job._id}`);
    return true;
  }

  async recordFailure(input: WorkerFailureInput): Promise<void> {
    const job = this.jobs.find((candidate) => (
      candidate._id === input.jobId && candidate.leaseOwner === input.leaseOwner
    ));
    if (!job) return;
    Object.assign(job, {
      status: input.requeue ? 'queued' : 'failed',
      attempt: input.requeue ? 2 : job.attempt,
      retryable: input.requeue,
      errorCode: input.errorCode,
      updatedAt: input.now,
    });
    delete job.leaseOwner;
    delete job.leaseExpiresAt;
    this.events.push(`${input.requeue ? 'requeue' : 'fail'}:${input.errorCode}`);
  }
}

class ObservableCompletionClient {
  readonly requests: CompletionBatchRequest[] = [];
  readonly signals: AbortSignal[] = [];

  constructor(
    private readonly responder: (
      request: CompletionBatchRequest,
      index: number,
    ) => string | Promise<string>,
  ) {}

  async complete(request: CompletionBatchRequest, options: CompletionCallOptions): Promise<string> {
    this.requests.push(request);
    this.signals.push(options.signal);
    return this.responder(request, this.requests.length - 1);
  }
}

function dependencies(
  repository: ObservableWorkerRepository,
  completionClient: ObservableCompletionClient,
): GenerationWorkerDependencies & { logger: { events: unknown[] } } {
  const logger = { events: [] as unknown[], log(event: unknown) { this.events.push(event); } };
  return {
    repository,
    completionClient,
    clock: { now: () => initialTime },
    ids: {
      leaseOwner: () => 'worker-1',
      assessmentId: (jobId) => `assessment-${jobId}`,
    },
    logger,
  };
}

describe('generation worker', () => {
  test.each([[50, 5], [100, 10]] as const)(
    'generates %i questions in %i exact batches and normalizes IDs',
    async (questionCount, expectedBatches) => {
      const repository = new ObservableWorkerRepository();
      repository.jobs.push(makeJob(questionCount));
      const client = new ObservableCompletionClient((request) => batchResponse(request.batchNumber));

      await expect(runGenerationWorker(dependencies(repository, client))).resolves.toEqual({
        claimed: true,
        jobId: 'job-1',
        status: 'completed',
        assessmentId: 'assessment-job-1',
      });

      expect(client.requests).toHaveLength(expectedBatches);
      expect(client.requests.every((request) => request.questionCount === 10)).toBe(true);
      expect(client.requests.map((request) => request.includeScoring)).toEqual([
        true,
        ...Array.from({ length: expectedBatches - 1 }, () => false),
      ]);
      expect(repository.assessments[0]?.paper.questions.map((question) => question.id)).toEqual(
        Array.from({ length: questionCount }, (_, index) => `q${index + 1}`),
      );
      expect(repository.jobs[0]).toMatchObject({
        status: 'completed', progress: 100, assessmentId: 'assessment-job-1',
      });
    },
  );

  test('repairs fenced, prose-wrapped, commonly malformed JSON', () => {
    const questions = makeQuestions(1);
    const malformed = `Model output follows:\n\`\`\`json\n{questions:${JSON.stringify(questions)},scoring:{maxScore:100,levels:${JSON.stringify(scoringLevels)}},}\n\`\`\``;

    expect(parseGeneratedBatch(malformed, true)).toEqual({
      questions,
      scoring: { maxScore: 100, levels: scoringLevels },
    });
  });

  test('rejects HTML and XML before JSON repair', () => {
    expect(() => parseGeneratedBatch('<html><body>upstream error</body></html>', false))
      .toThrow(expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }));
    expect(() => parseGeneratedBatch('<?xml version="1.0"?><response />', false))
      .toThrow(expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }));
  });

  test('rejects markup outside an otherwise valid JSON object', () => {
    const valid = batchResponse(1);

    expect(() => parseGeneratedBatch(`Model note <div>unsafe</div> ${valid}`, false))
      .toThrow(expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }));
    expect(() => parseGeneratedBatch(`${valid} <metadata />`, false))
      .toThrow(expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }));
  });

  test('requeues one retryable batch failure as attempt 2, then can complete', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push(makeJob(50));
    const client = new ObservableCompletionClient((request, index) => (
      index === 0 ? 'not json' : batchResponse(request.batchNumber)
    ));
    const workerDependencies = dependencies(repository, client);

    await expect(runGenerationWorker(workerDependencies)).resolves.toMatchObject({
      status: 'queued', errorCode: 'INVALID_MODEL_RESPONSE',
    });
    expect(repository.jobs[0]).toMatchObject({ status: 'queued', attempt: 2, retryable: true });

    await expect(runGenerationWorker(workerDependencies)).resolves.toMatchObject({ status: 'completed' });
    expect(repository.assessments).toHaveLength(1);
  });

  test('marks the second retryable failure as final failed', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push({ ...makeJob(50), attempt: 2 });
    const client = new ObservableCompletionClient(() => 'not json');

    await expect(runGenerationWorker(dependencies(repository, client))).resolves.toEqual({
      claimed: true,
      jobId: 'job-1',
      status: 'failed',
      errorCode: 'INVALID_MODEL_RESPONSE',
    });
    expect(repository.jobs[0]).toMatchObject({ status: 'failed', attempt: 2, retryable: false });
  });

  test('recovers a running job after its lease expires', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push({
      ...makeJob(50),
      status: 'running',
      leaseOwner: 'stale-worker',
      leaseExpiresAt: '2026-08-03T10:29:59.000Z',
    });
    const client = new ObservableCompletionClient((request) => batchResponse(request.batchNumber));

    await runGenerationWorker(dependencies(repository, client));

    expect(repository.events[0]).toBe('claim:job-1');
    expect(repository.jobs[0]).toMatchObject({ status: 'completed', assessmentId: 'assessment-job-1' });
  });

  test('renews the lease before every external provider call', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push(makeJob(50));
    const timeline: string[] = [];
    const client = {
      complete: async (request: CompletionBatchRequest, options: CompletionCallOptions) => {
        expect(options.signal.aborted).toBe(false);
        timeline.push(`provider:${request.batchNumber + 1}`);
        return batchResponse(request.batchNumber);
      },
    };
    const workerDependencies = dependencies(
      repository,
      client as ObservableCompletionClient,
    );
    const originalRenewLease = repository.renewLease.bind(repository);
    repository.renewLease = async (input) => {
      timeline.push(`renew:${timeline.filter((entry) => entry.startsWith('renew:')).length + 1}`);
      return originalRenewLease(input);
    };

    await runGenerationWorker(workerDependencies);

    expect(timeline).toEqual([
      'renew:1', 'provider:1',
      'renew:2', 'provider:2',
      'renew:3', 'provider:3',
      'renew:4', 'provider:4',
      'renew:5', 'provider:5',
    ]);
  });

  test('aborts a provider call before the renewed lease can expire', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(initialTime);
    const repository = new ObservableWorkerRepository();
    repository.jobs.push(makeJob(50));
    let observedSignal: AbortSignal | undefined;
    const client = {
      complete: async (_request: CompletionBatchRequest, options: CompletionCallOptions): Promise<string> => {
        observedSignal = options.signal;
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        });
      },
    };
    const workerDependencies = dependencies(repository, client as ObservableCompletionClient);
    workerDependencies.clock = { now: () => new Date(Date.now()) };

    const resultPromise = runGenerationWorker(workerDependencies);
    await jest.advanceTimersByTimeAsync(generationWorkerBudget.providerCallTimeoutMs);
    const result = await resultPromise;

    expect(observedSignal?.aborted).toBe(true);
    expect(result).toMatchObject({ status: 'queued', errorCode: 'PROVIDER_ERROR' });
    const renewedLease = repository.events.find((event) => event.startsWith('renew:'))?.slice(6);
    expect(renewedLease).toBe('2026-08-03T10:32:00.000Z');
    expect(new Date(renewedLease!).getTime() - Date.now()).toBe(80_000);
    jest.useRealTimers();
  });

  test('rejects duplicate option IDs and invalid correct answers in a batch', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push(makeJob(50));
    const invalidQuestions = makeQuestions(1);
    invalidQuestions[0] = {
      ...invalidQuestions[0]!,
      options: [{ id: 'A', text: 'One' }, { id: 'A', text: 'Duplicate' }],
      correctOptionIds: ['B'],
    };
    const client = new ObservableCompletionClient(() => JSON.stringify({
      questions: invalidQuestions,
      scoring: { maxScore: 100, levels: scoringLevels },
    }));

    await expect(runGenerationWorker(dependencies(repository, client))).resolves.toMatchObject({
      status: 'queued', errorCode: 'INVALID_MODEL_RESPONSE',
    });
    expect(repository.assessments).toHaveLength(0);
  });

  test('persists the assessment before marking the job completed', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push(makeJob(50));
    const client = new ObservableCompletionClient((request) => batchResponse(request.batchNumber));

    await runGenerationWorker(dependencies(repository, client));

    expect(repository.events.indexOf('assessment:assessment-job-1')).toBeGreaterThan(-1);
    expect(repository.events.indexOf('assessment:assessment-job-1'))
      .toBeLessThan(repository.events.indexOf('complete:job-1'));
  });

  test('does not call the provider or duplicate storage after completion', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push(makeJob(50));
    const client = new ObservableCompletionClient((request) => batchResponse(request.batchNumber));
    const workerDependencies = dependencies(repository, client);

    await runGenerationWorker(workerDependencies);
    await expect(runGenerationWorker(workerDependencies)).resolves.toEqual({ claimed: false });

    expect(client.requests).toHaveLength(5);
    expect(repository.assessments).toHaveLength(1);
  });

  test('resumes completion without provider access when an assessment was already persisted', async () => {
    const repository = new ObservableWorkerRepository();
    const job = {
      ...makeJob(50),
      status: 'running' as const,
      leaseOwner: 'stale-worker',
      leaseExpiresAt: '2026-08-03T10:29:59.000Z',
    };
    repository.jobs.push(job);
    repository.assessments.push(makeAssessment('assessment-job-1', job));
    const client = new ObservableCompletionClient(() => {
      throw new Error('provider must not be called');
    });

    await expect(runGenerationWorker(dependencies(repository, client))).resolves.toMatchObject({
      status: 'completed', assessmentId: 'assessment-job-1',
    });
    expect(client.requests).toHaveLength(0);
    expect(repository.assessments).toHaveLength(1);
  });

  test('stores and logs only safe codes and structured metadata on provider failure', async () => {
    const repository = new ObservableWorkerRepository();
    repository.jobs.push({
      ...makeJob(50),
      request: { topic: 'private topic', notes: 'private notes', questionCount: 50 },
    });
    const client = new ObservableCompletionClient(() => {
      throw new GenerationServiceError('PROVIDER_ERROR', true);
    });
    const workerDependencies = dependencies(repository, client);

    const result = await runGenerationWorker(workerDependencies);
    const serialized = JSON.stringify({ result, logs: workerDependencies.logger.events });

    expect(result).toEqual({
      claimed: true, jobId: 'job-1', status: 'queued', errorCode: 'PROVIDER_ERROR',
    });
    expect(workerDependencies.logger.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        eventName: 'generation_batch_failed',
        jobId: 'job-1',
        batchNumber: 1,
        safeCode: 'PROVIDER_ERROR',
        durationMs: 0,
      }),
    ]));
    expect(serialized).not.toContain('private topic');
    expect(serialized).not.toContain('private notes');
    expect(serialized).not.toContain('Authorization');
    expect(serialized).not.toContain('LLM_');
    expect(serialized).not.toContain('http');
  });
});

function batchResponse(batchNumber: number): string {
  const body: Record<string, unknown> = { questions: makeQuestions(batchNumber * 10 + 1) };
  if (batchNumber === 0) {
    body.scoring = { maxScore: 100, levels: scoringLevels };
  }
  return JSON.stringify(body);
}

function makeQuestions(start: number): AssessmentQuestion[] {
  return Array.from({ length: 10 }, (_, index) => ({
    id: `model-${start + index}`,
    type: 'single_choice',
    difficulty: 'easy',
    knowledgePoint: 'TypeScript',
    prompt: `Question ${start + index}`,
    options: [{ id: 'A', text: 'Correct' }, { id: 'B', text: 'Incorrect' }],
    correctOptionIds: ['A'],
    explanation: 'A is correct.',
  }));
}

function makeJob(questionCount: 50 | 100): GenerationJob {
  return {
    _id: 'job-1',
    _openid: 'owner-1',
    schemaVersion: 1,
    status: 'queued',
    progress: 0,
    request: { topic: 'TypeScript', questionCount },
    retryable: false,
    attempt: 1,
    createdAt: initialTime.toISOString(),
    updatedAt: initialTime.toISOString(),
    expiresAt: '2026-08-04T10:30:00.000Z',
  };
}

function makeAssessment(id: string, job: GenerationJob): Assessment {
  return {
    _id: id,
    _openid: job._openid,
    schemaVersion: 1,
    status: 'draft',
    paper: {
      id,
      topic: job.request.topic,
      questionCount: job.request.questionCount,
      generatedAt: initialTime.toISOString(),
      scoring: { maxScore: 100, levels: scoringLevels },
      questions: Array.from({ length: job.request.questionCount }, (_, index) => ({
        ...makeQuestions(1)[0]!, id: `q${index + 1}`,
      })),
    },
    answers: {},
    result: null,
    revision: 1,
    createdAt: initialTime.toISOString(),
    updatedAt: initialTime.toISOString(),
    completedAt: null,
  };
}
