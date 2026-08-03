import { CloudBaseGenerationRepository } from '../server/adapters/cloudBaseGenerationRepository';
import type { GenerationJob } from '../shared/contracts';

describe('CloudBase generation repository', () => {
  test('claims a queued candidate with one conditional update', async () => {
    const candidate = makeJob();
    const harness = createDatabaseHarness(candidate);
    const repository = new CloudBaseGenerationRepository(harness.database);

    await expect(repository.claimNext({
      leaseOwner: 'worker-1',
      now: '2026-08-03T10:30:00.000Z',
      leaseExpiresAt: '2026-08-03T10:32:00.000Z',
    })).resolves.toMatchObject({
      _id: 'job-1', status: 'running', leaseOwner: 'worker-1',
    });

    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.where).toHaveBeenCalledWith({ _id: 'job-1', status: 'queued' });
    expect(harness.update).toHaveBeenCalledWith({ data: {
      status: 'running',
      leaseOwner: 'worker-1',
      leaseExpiresAt: '2026-08-03T10:32:00.000Z',
      updatedAt: '2026-08-03T10:30:00.000Z',
    } });
  });

  test('claims an expired running candidate only when the observed lease still matches', async () => {
    const candidate = {
      ...makeJob(),
      status: 'running' as const,
      leaseOwner: 'stale-worker',
      leaseExpiresAt: '2026-08-03T10:29:00.000Z',
    };
    const harness = createDatabaseHarness(candidate);
    const repository = new CloudBaseGenerationRepository(harness.database);

    await repository.claimNext({
      leaseOwner: 'worker-2',
      now: '2026-08-03T10:30:00.000Z',
      leaseExpiresAt: '2026-08-03T10:32:00.000Z',
    });

    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.where).toHaveBeenCalledWith({
      _id: 'job-1',
      status: 'running',
      leaseExpiresAt: '2026-08-03T10:29:00.000Z',
    });
  });

  test('returns no claim and performs no update when no candidate exists', async () => {
    const harness = createDatabaseHarness(null);
    const repository = new CloudBaseGenerationRepository(harness.database);

    await expect(repository.claimNext({
      leaseOwner: 'worker-1',
      now: '2026-08-03T10:30:00.000Z',
      leaseExpiresAt: '2026-08-03T10:32:00.000Z',
    })).resolves.toBeNull();
    expect(harness.update).not.toHaveBeenCalled();
  });

  test('renews a lease with one owner-checked conditional update', async () => {
    const harness = createDatabaseHarness(makeJob());
    const repository = new CloudBaseGenerationRepository(harness.database);

    await expect(repository.renewLease({
      jobId: 'job-1',
      leaseOwner: 'worker-1',
      now: '2026-08-03T10:30:00.000Z',
      leaseExpiresAt: '2026-08-03T10:32:00.000Z',
    })).resolves.toBe(true);

    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.where).toHaveBeenCalledWith({
      _id: 'job-1', status: 'running', leaseOwner: 'worker-1',
    });
    expect(harness.update).toHaveBeenCalledWith({ data: {
      leaseExpiresAt: '2026-08-03T10:32:00.000Z',
      updatedAt: '2026-08-03T10:30:00.000Z',
    } });
  });
});

function createDatabaseHarness(candidate: GenerationJob | null): {
  database: ConstructorParameters<typeof CloudBaseGenerationRepository>[0];
  where: jest.Mock;
  update: jest.Mock;
} {
  const where = jest.fn();
  const update = jest.fn(async () => ({ stats: { updated: 1 } }));
  const get = jest.fn()
    .mockResolvedValueOnce({ data: candidate === null ? [] : [candidate] })
    .mockImplementation(async () => ({
      data: candidate === null ? [] : [{
        ...candidate,
        status: 'running',
        leaseOwner: 'worker-1',
        leaseExpiresAt: '2026-08-03T10:32:00.000Z',
      }],
    }));
  const query = {
    where,
    orderBy: jest.fn(),
    limit: jest.fn(),
    get,
    update,
  };
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  const command = {
    lte: jest.fn((value: unknown) => ({ $lte: value })),
    or: jest.fn((...value: unknown[]) => ({ $or: value })),
  };
  const database = {
    command,
    collection: jest.fn(() => query),
  } as unknown as ConstructorParameters<typeof CloudBaseGenerationRepository>[0];

  return { database, where, update };
}

function makeJob(): GenerationJob {
  return {
    _id: 'job-1',
    _openid: 'owner-1',
    schemaVersion: 1,
    status: 'queued',
    progress: 0,
    request: { topic: 'TypeScript', questionCount: 50 },
    retryable: false,
    attempt: 1,
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    expiresAt: '2026-08-04T10:00:00.000Z',
  };
}
