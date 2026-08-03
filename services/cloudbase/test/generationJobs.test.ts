import { getTrustedWeChatContext } from '../server/trustedContext';
import {
  createGenerationJob,
  getGenerationJob,
  type GenerationJobServiceDependencies,
} from '../server/generation/jobService';
import type { GenerationJob } from '../shared/contracts';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };
const now = new Date('2026-08-03T10:30:00.000Z');

class ObservableJobRepository {
  readonly jobs: GenerationJob[] = [];

  async findIdempotent(ownerOpenId: string, clientRequestId: string): Promise<GenerationJob | null> {
    return this.jobs.find((job) => (
      job._openid === ownerOpenId && job.clientRequestId === clientRequestId
    )) ?? null;
  }

  async findOwnedJob(jobId: string, ownerOpenId: string): Promise<GenerationJob | null> {
    return this.jobs.find((job) => job._id === jobId && job._openid === ownerOpenId) ?? null;
  }
}

class ObservableAtomicDailyQuota {
  readonly counts = new Map<string, number>();
  failNextJobWrite = false;

  constructor(
    private readonly repository: ObservableJobRepository,
    private readonly limit: number,
  ) {}

  async reserveJob(input: {
    job: GenerationJob;
    counterId: string;
    ownerOpenId: string;
    utcDay: string;
    now: string;
  }): Promise<
    | { type: 'created' | 'existing'; job: GenerationJob }
    | { type: 'quota_exceeded' }
  > {
    const existing = this.repository.jobs.find((job) => job._id === input.job._id);
    if (existing) return { type: 'existing', job: existing };

    const count = this.counts.get(input.counterId) ?? 0;
    if (count >= this.limit) return { type: 'quota_exceeded' };
    this.counts.set(input.counterId, count + 1);
    try {
      if (this.failNextJobWrite) {
        this.failNextJobWrite = false;
        throw new Error('simulated transactional job write failure');
      }
      this.repository.jobs.push(input.job);
      return { type: 'created', job: input.job };
    } catch (error) {
      this.counts.set(input.counterId, count);
      throw error;
    }
  }
}

function trustedContext(openId: string): unknown {
  wxServerSdk.getWXContext.mockReturnValue({ OPENID: openId });
  return getTrustedWeChatContext();
}

type TestDependencies = Omit<GenerationJobServiceDependencies, 'repository' | 'quota'> & {
  repository: ObservableJobRepository;
  quota: ObservableAtomicDailyQuota;
};

function createDependencies(repository = new ObservableJobRepository()): TestDependencies {
  let sequence = 0;
  return {
    repository,
    clock: { now: () => now },
    ids: {
      jobId: (ownerOpenId, clientRequestId) => clientRequestId
        ? `stable-${ownerOpenId}-${clientRequestId}`
        : `random-job-${sequence += 1}`,
      quotaCounterId: (ownerOpenId, utcDay) => `quota-${ownerOpenId}-${utcDay}`,
    },
    quota: new ObservableAtomicDailyQuota(repository, 2),
  };
}

describe('generation job API', () => {
  test('uses the trusted owner, trims input, and creates a 24-hour queued job', async () => {
    const dependencies = createDependencies();

    await expect(createGenerationJob({
      topic: '  TypeScript generics  ',
      notes: '  focus on inference  ',
      questionCount: 50,
      clientRequestId: '  request-1  ',
      OPENID: 'spoofed-event-openid',
    } as Parameters<typeof createGenerationJob>[0] & { OPENID: string }, trustedContext('owner-1'), dependencies)).resolves.toEqual({
      jobId: 'stable-owner-1-request-1',
      status: 'queued',
    });

    expect(dependencies.repository.jobs).toEqual([
      expect.objectContaining({
        _id: 'stable-owner-1-request-1',
        _openid: 'owner-1',
        status: 'queued',
        progress: 0,
        attempt: 1,
        retryable: false,
        clientRequestId: 'request-1',
        request: {
          topic: 'TypeScript generics',
          notes: 'focus on inference',
          questionCount: 50,
        },
        createdAt: '2026-08-03T10:30:00.000Z',
        expiresAt: '2026-08-04T10:30:00.000Z',
      }),
    ]);
  });

  test.each([
    [{ topic: '', questionCount: 50 }, 'INVALID_REQUEST'],
    [{ topic: 'x'.repeat(201), questionCount: 50 }, 'INVALID_REQUEST'],
    [{ topic: 'valid', notes: 'x'.repeat(2001), questionCount: 50 }, 'INVALID_REQUEST'],
    [{ topic: 'valid', questionCount: 20 }, 'INVALID_REQUEST'],
    [{ topic: 'valid', questionCount: 50, clientRequestId: 'x'.repeat(101) }, 'INVALID_REQUEST'],
  ])('rejects invalid create input %#', async (input, errorCode) => {
    await expect(createGenerationJob(
      input,
      trustedContext('owner-1'),
      createDependencies(),
    )).rejects.toMatchObject({ code: errorCode, retryable: false });
  });

  test('enforces the injected daily quota', async () => {
    const dependencies = createDependencies();
    const context = trustedContext('owner-1');
    await createGenerationJob({ topic: 'One', questionCount: 50 }, context, dependencies);
    await createGenerationJob({ topic: 'Two', questionCount: 50 }, context, dependencies);

    await expect(createGenerationJob(
      { topic: 'Three', questionCount: 50 },
      context,
      dependencies,
    )).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', retryable: false });
  });

  test('atomically caps concurrent creates without exceeding the daily limit', async () => {
    const dependencies = createDependencies();
    const context = trustedContext('owner-1');

    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => (
      createGenerationJob({ topic: `Concurrent ${index}`, questionCount: 50 }, context, dependencies)
    )));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(2);
    expect(results.filter((result) => (
      result.status === 'rejected' && result.reason?.code === 'QUOTA_EXCEEDED'
    ))).toHaveLength(6);
    expect(dependencies.repository.jobs).toHaveLength(2);
    expect(dependencies.quota.counts.get('quota-owner-1-2026-08-03')).toBe(2);
  });

  test('rolls back the quota reservation when transactional job creation fails', async () => {
    const dependencies = createDependencies();
    dependencies.quota.failNextJobWrite = true;
    const context = trustedContext('owner-1');

    await expect(createGenerationJob(
      { topic: 'Failed write', questionCount: 50 }, context, dependencies,
    )).rejects.toThrow('simulated transactional job write failure');
    expect(dependencies.repository.jobs).toHaveLength(0);
    expect(dependencies.quota.counts.get('quota-owner-1-2026-08-03')).toBe(0);

    await expect(createGenerationJob(
      { topic: 'Retry after rollback', questionCount: 50 }, context, dependencies,
    )).resolves.toMatchObject({ status: 'queued' });
    expect(dependencies.repository.jobs).toHaveLength(1);
    expect(dependencies.quota.counts.get('quota-owner-1-2026-08-03')).toBe(1);
  });

  test('returns the same job for a repeated owner/clientRequestId without consuming quota', async () => {
    const dependencies = createDependencies();
    const context = trustedContext('owner-1');

    const first = await createGenerationJob({
      topic: 'TypeScript', questionCount: 50, clientRequestId: 'request-1',
    }, context, dependencies);
    const second = await createGenerationJob({
      topic: 'Changed input is ignored for the same request key',
      questionCount: 100,
      clientRequestId: 'request-1',
    }, context, dependencies);

    expect(second).toEqual(first);
    expect(dependencies.repository.jobs).toHaveLength(1);
  });

  test.each([
    ['completed', { assessmentId: 'assessment-1', progress: 100 }],
    ['failed', { errorCode: 'INVALID_MODEL_RESPONSE', progress: 40 }],
  ] as const)('returns the actual %s status for a stable idempotency key', async (status, fields) => {
    const dependencies = createDependencies();
    dependencies.repository.jobs.push({
      ...makeJob('stable-owner-1-request-1', 'owner-1', now.toISOString()),
      clientRequestId: 'request-1',
      status,
      ...fields,
    });

    await expect(createGenerationJob({
      topic: 'TypeScript', questionCount: 50, clientRequestId: 'request-1',
    }, trustedContext('owner-1'), dependencies)).resolves.toEqual({
      jobId: 'stable-owner-1-request-1',
      status,
    });
    expect(dependencies.repository.jobs).toHaveLength(1);
    expect(dependencies.quota.counts.size).toBe(0);
  });

  test('makes foreign polling indistinguishable from a missing job', async () => {
    const dependencies = createDependencies();
    dependencies.repository.jobs.push(makeJob('job-1', 'owner-1', now.toISOString()));

    const foreign = await getGenerationJob(
      { jobId: 'job-1' }, trustedContext('owner-2'), dependencies,
    );
    const missing = await getGenerationJob(
      { jobId: 'missing' }, trustedContext('owner-2'), dependencies,
    );

    expect(foreign).toEqual({ type: 'not_found', errorCode: 'INVALID_REQUEST' });
    expect(missing).toEqual(foreign);
  });

  test('returns only public status fields for an owned job', async () => {
    const dependencies = createDependencies();
    dependencies.repository.jobs.push({
      ...makeJob('job-1', 'owner-1', now.toISOString()),
      status: 'failed',
      progress: 40,
      retryable: false,
      errorCode: 'INVALID_MODEL_RESPONSE',
      leaseOwner: 'private-worker-id',
    });

    await expect(getGenerationJob(
      { jobId: 'job-1' }, trustedContext('owner-1'), dependencies,
    )).resolves.toEqual({
      jobId: 'job-1',
      status: 'failed',
      progress: 40,
      retryable: false,
      errorCode: 'INVALID_MODEL_RESPONSE',
    });
  });
});

function makeJob(id: string, ownerOpenId: string, createdAt: string): GenerationJob {
  return {
    _id: id,
    _openid: ownerOpenId,
    schemaVersion: 1,
    status: 'queued',
    progress: 0,
    request: { topic: 'Topic', questionCount: 50 },
    retryable: false,
    attempt: 1,
    createdAt,
    updatedAt: createdAt,
    expiresAt: '2026-08-04T10:30:00.000Z',
  };
}
