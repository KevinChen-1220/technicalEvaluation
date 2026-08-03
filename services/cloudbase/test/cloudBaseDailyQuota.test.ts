import { CloudBaseDailyQuota } from '../server/adapters/cloudBaseDailyQuota';
import type { GenerationJob } from '../shared/contracts';

describe('CloudBase atomic daily quota', () => {
  test('creates a first job when wx-server-sdk 4.0.2 throws its exact missing-document error', async () => {
    const database = new InMemoryTransactionalDatabase();
    database.missingDocumentBehavior = 'sdk-error';
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);

    await expect(quota.reserveJob({
      job: makeJob('job-1'),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    })).resolves.toMatchObject({ type: 'created' });
    expect(database.document('daily_generation_quotas', 'quota-owner-1-2026-08-03'))
      .toMatchObject({ count: 1 });
  });

  test('treats data null as absent and rolls back a failed first job write', async () => {
    const database = new InMemoryTransactionalDatabase();
    database.missingDocumentBehavior = 'null';
    database.failJobWriteId = 'job-1';
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);
    const input = {
      job: makeJob('job-1'),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    };

    await expect(quota.reserveJob(input)).rejects.toThrow('simulated job write failure');
    expect(database.document('daily_generation_quotas', input.counterId)).toBeUndefined();
    expect(database.document('generation_jobs', 'job-1')).toBeUndefined();
  });

  test('does not exceed the limit under concurrent reservations', async () => {
    const database = new InMemoryTransactionalDatabase();
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);

    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => quota.reserveJob({
      job: makeJob(`job-${index + 1}`),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    })));

    expect(results.filter((result) => result.type === 'created')).toHaveLength(2);
    expect(results.filter((result) => result.type === 'quota_exceeded')).toHaveLength(6);
    expect(database.documents('generation_jobs')).toHaveLength(2);
    expect(database.document('daily_generation_quotas', 'quota-owner-1-2026-08-03'))
      .toMatchObject({ _openid: 'owner-1', utcDay: '2026-08-03', count: 2 });
  });

  test('rolls back the counter when job creation fails inside the transaction', async () => {
    const database = new InMemoryTransactionalDatabase();
    database.failJobWriteId = 'job-1';
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);
    const input = {
      job: makeJob('job-1'),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    };

    await expect(quota.reserveJob(input)).rejects.toThrow('simulated job write failure');
    expect(database.document('daily_generation_quotas', input.counterId)).toBeUndefined();
    expect(database.document('generation_jobs', 'job-1')).toBeUndefined();

    database.failJobWriteId = undefined;
    await expect(quota.reserveJob(input)).resolves.toMatchObject({ type: 'created' });
    expect(database.document('daily_generation_quotas', input.counterId)).toMatchObject({ count: 1 });
    expect(database.document('generation_jobs', 'job-1')).toBeDefined();
  });

  test('returns an existing terminal job without incrementing the counter', async () => {
    const database = new InMemoryTransactionalDatabase();
    database.seed('generation_jobs', {
      ...makeJob('job-1'), status: 'completed', progress: 100, assessmentId: 'assessment-1',
    });
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);

    await expect(quota.reserveJob({
      job: makeJob('job-1'),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    })).resolves.toMatchObject({ type: 'existing', job: { status: 'completed' } });
    expect(database.document('daily_generation_quotas', 'quota-owner-1-2026-08-03')).toBeUndefined();
  });

  test('does not overwrite a malformed existing job or consume quota', async () => {
    const database = new InMemoryTransactionalDatabase();
    database.seed('generation_jobs', {
      _id: 'job-1',
      _openid: 'owner-1',
      status: 'corrupt',
    });
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);

    await expect(quota.reserveJob({
      job: makeJob('job-1'),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    })).rejects.toThrow('Invalid generation job state.');
    expect(database.document('generation_jobs', 'job-1')).toMatchObject({ status: 'corrupt' });
    expect(database.document('daily_generation_quotas', 'quota-owner-1-2026-08-03')).toBeUndefined();
  });

  test('writes the quota reservation before the job within one transaction', async () => {
    const database = new InMemoryTransactionalDatabase();
    const quota = new CloudBaseDailyQuota(database.asCloudDatabase(), 2);

    await quota.reserveJob({
      job: makeJob('job-1'),
      counterId: 'quota-owner-1-2026-08-03',
      ownerOpenId: 'owner-1',
      utcDay: '2026-08-03',
      now: '2026-08-03T10:30:00.000Z',
    });

    expect(database.committedWrites).toEqual([
      'daily_generation_quotas:quota-owner-1-2026-08-03',
      'generation_jobs:job-1',
    ]);
    expect(database.transactionCount).toBe(1);
  });
});

class InMemoryTransactionalDatabase {
  readonly committedWrites: string[] = [];
  transactionCount = 0;
  failJobWriteId: string | undefined;
  missingDocumentBehavior: 'undefined' | 'null' | 'sdk-error' = 'undefined';
  private state = new Map<string, Map<string, Record<string, unknown>>>();
  private transactionQueue: Promise<void> = Promise.resolve();

  asCloudDatabase(): ConstructorParameters<typeof CloudBaseDailyQuota>[0] {
    return { runTransaction: this.runTransaction } as unknown as ConstructorParameters<typeof CloudBaseDailyQuota>[0];
  }

  seed(collection: string, document: Record<string, unknown>): void {
    this.collectionState(this.state, collection).set(document._id as string, structuredClone(document));
  }

  documents(collection: string): Record<string, unknown>[] {
    return [...this.collectionState(this.state, collection).values()];
  }

  document(collection: string, id: string): Record<string, unknown> | undefined {
    return this.collectionState(this.state, collection).get(id);
  }

  private readonly runTransaction = <T>(callback: (transaction: unknown) => Promise<T>): Promise<T> => {
    const execute = async (): Promise<T> => {
      this.transactionCount += 1;
      const draft = cloneState(this.state);
      const pendingWrites: string[] = [];
      const transaction = {
        collection: (collectionName: string) => ({
          doc: (id: string) => ({
            get: async () => {
              const document = this.collectionState(draft, collectionName).get(id);
              if (document !== undefined) return { data: document };
              if (this.missingDocumentBehavior === 'sdk-error') throw sdkMissingDocumentError(id);
              return { data: this.missingDocumentBehavior === 'null' ? null : undefined };
            },
            set: async ({ data }: { data: Record<string, unknown> }) => {
              if (collectionName === 'generation_jobs' && id === this.failJobWriteId) {
                throw new Error('simulated job write failure');
              }
              this.collectionState(draft, collectionName).set(id, structuredClone(data));
              pendingWrites.push(`${collectionName}:${id}`);
            },
          }),
        }),
      };

      const result = await callback(transaction);
      this.state = draft;
      this.committedWrites.push(...pendingWrites);
      return result;
    };
    const result = this.transactionQueue.then(execute, execute);
    this.transactionQueue = result.then(() => undefined, () => undefined);
    return result;
  };

  private collectionState(
    state: Map<string, Map<string, Record<string, unknown>>>,
    collection: string,
  ): Map<string, Record<string, unknown>> {
    let documents = state.get(collection);
    if (documents === undefined) {
      documents = new Map();
      state.set(collection, documents);
    }
    return documents;
  }
}

function sdkMissingDocumentError(id: string): Error {
  const message = `document.get:fail document with _id ${id} does not exist`;
  const error = new Error(message) as Error & { errCode: number; errMsg: string };
  error.errCode = -1;
  error.errMsg = message;
  return error;
}

function cloneState(
  state: Map<string, Map<string, Record<string, unknown>>>,
): Map<string, Map<string, Record<string, unknown>>> {
  return new Map([...state].map(([collection, documents]) => [
    collection,
    new Map([...documents].map(([id, document]) => [id, structuredClone(document)])),
  ]));
}

function makeJob(id: string): GenerationJob {
  return {
    _id: id,
    _openid: 'owner-1',
    schemaVersion: 1,
    status: 'queued',
    progress: 0,
    request: { topic: 'TypeScript', questionCount: 50 },
    retryable: false,
    attempt: 1,
    createdAt: '2026-08-03T10:30:00.000Z',
    updatedAt: '2026-08-03T10:30:00.000Z',
    expiresAt: '2026-08-04T10:30:00.000Z',
  };
}
