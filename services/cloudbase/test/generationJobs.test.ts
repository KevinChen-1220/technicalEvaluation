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

  async countCreatedByOwner(ownerOpenId: string, from: string, to: string): Promise<number> {
    return this.jobs.filter((job) => (
      job._openid === ownerOpenId && job.createdAt >= from && job.createdAt < to
    )).length;
  }

  async createJob(job: GenerationJob): Promise<GenerationJob> {
    const existing = this.jobs.find((candidate) => candidate._id === job._id);
    if (existing) return existing;
    this.jobs.push(job);
    return job;
  }

  async findOwnedJob(jobId: string, ownerOpenId: string): Promise<GenerationJob | null> {
    return this.jobs.find((job) => job._id === jobId && job._openid === ownerOpenId) ?? null;
  }
}

function trustedContext(openId: string): unknown {
  wxServerSdk.getWXContext.mockReturnValue({ OPENID: openId });
  return getTrustedWeChatContext();
}

type TestDependencies = Omit<GenerationJobServiceDependencies, 'repository'> & {
  repository: ObservableJobRepository;
};

function createDependencies(repository = new ObservableJobRepository()): TestDependencies {
  return {
    repository,
    clock: { now: () => now },
    ids: {
      jobId: (ownerOpenId, clientRequestId) => clientRequestId
        ? `stable-${ownerOpenId}-${clientRequestId}`
        : 'random-job-id',
    },
    quota: { allows: async (_ownerOpenId, createdToday) => createdToday < 2 },
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
    dependencies.repository.jobs.push(
      makeJob('existing-1', 'owner-1', '2026-08-03T01:00:00.000Z'),
      makeJob('existing-2', 'owner-1', '2026-08-03T02:00:00.000Z'),
      makeJob('other-owner', 'owner-2', '2026-08-03T03:00:00.000Z'),
    );

    await expect(createGenerationJob(
      { topic: 'TypeScript', questionCount: 50 },
      trustedContext('owner-1'),
      dependencies,
    )).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED', retryable: false });
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
