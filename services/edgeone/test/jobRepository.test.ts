import { BlobGenerationJobRepository } from '../src/storage/jobRepository';
import { MemoryBlobPort } from '../src/storage/memoryStores';

describe('generation job persistence', () => {
  test('allows only one concurrent claimant for the same client request', async () => {
    const repository = new BlobGenerationJobRepository(new MemoryBlobPort());
    const input = {
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
      now: '2026-08-11T08:00:00.000Z', retry: false,
    };
    const [left, right] = await Promise.all([
      repository.begin({ ...input, leaseToken: 'lease-a' }),
      repository.begin({ ...input, leaseToken: 'lease-b' }),
    ]);

    expect([left.type, right.type].sort()).toEqual(['claimed', 'existing']);
    expect(left.job).toEqual(expect.objectContaining({
      status: 'running', attempt: 1, assessmentId: 'assessment-a',
      updatedAt: '2026-08-11T08:00:00.000Z', leaseUntil: '2026-08-11T08:02:00.000Z',
    }));
    expect(right.job).toEqual(expect.objectContaining({
      status: 'running', attempt: 1, assessmentId: 'assessment-a',
      updatedAt: '2026-08-11T08:00:00.000Z', leaseUntil: '2026-08-11T08:02:00.000Z',
    }));
  });

  test('returns a completed job after a lost response without creating a new attempt', async () => {
    const repository = new BlobGenerationJobRepository(new MemoryBlobPort());
    const claimed = await repository.begin({
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
      leaseToken: 'lease-a', now: '2026-08-11T08:00:00.000Z', retry: false,
    });
    expect(claimed.type).toBe('claimed');
    await repository.complete('owner-a', 'job-a', 1, 'lease-a', '2026-08-11T08:00:05.000Z');

    const replay = await repository.begin({
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
      leaseToken: 'lease-b', now: '2026-08-11T08:01:00.000Z', retry: true,
    });
    expect(replay).toEqual({ type: 'existing', job: expect.objectContaining({
      status: 'completed', attempt: 1, assessmentId: 'assessment-a', errorCode: null,
    }) });
  });

  test('requires explicit retry to open a new attempt after failure', async () => {
    const repository = new BlobGenerationJobRepository(new MemoryBlobPort());
    await repository.begin({
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
      leaseToken: 'lease-a', now: '2026-08-11T08:00:00.000Z', retry: false,
    });
    await repository.fail('owner-a', 'job-a', 1, 'lease-a', 'PROVIDER_ERROR', true, '2026-08-11T08:00:05.000Z');

    const stableFailure = await repository.begin({
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
      leaseToken: 'lease-b', now: '2026-08-11T08:01:00.000Z', retry: false,
    });
    const retried = await repository.begin({
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
      leaseToken: 'lease-c', now: '2026-08-11T08:01:01.000Z', retry: true,
    });

    expect(stableFailure).toEqual({ type: 'existing', job: expect.objectContaining({ status: 'failed', attempt: 1, errorCode: 'PROVIDER_ERROR' }) });
    expect(retried).toEqual({ type: 'claimed', job: expect.objectContaining({ status: 'running', attempt: 2, errorCode: null }) });
  });

  test('allows only one claimant to take over an expired running lease', async () => {
    const repository = new BlobGenerationJobRepository(new MemoryBlobPort());
    const base = {
      ownerKey: 'owner-a', jobId: 'job-stale', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
    };
    await repository.begin({
      ...base, leaseToken: 'lease-a', now: '2026-08-11T08:00:00.000Z', retry: false,
    });

    const [left, right] = await Promise.all([
      repository.begin({ ...base, leaseToken: 'lease-b', now: '2026-08-12T08:00:00.000Z', retry: true }),
      repository.begin({ ...base, leaseToken: 'lease-c', now: '2026-08-12T08:00:00.000Z', retry: true }),
    ]);

    expect([left.type, right.type].sort()).toEqual(['claimed', 'existing']);
    expect(left.job).toEqual(expect.objectContaining({ attempt: 2, status: 'running' }));
    expect(right.job).toEqual(expect.objectContaining({ attempt: 2, status: 'running' }));
  });

  test('caps retries at three attempts and returns a stable terminal failure', async () => {
    const repository = new BlobGenerationJobRepository(new MemoryBlobPort());
    const base = {
      ownerKey: 'owner-a', jobId: 'job-limit', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const begun = await repository.begin({
        ...base, leaseToken: `lease-${attempt}`, now: `2026-08-11T08:0${attempt}:00.000Z`, retry: attempt > 1,
      });
      expect(begun).toEqual({ type: 'claimed', job: expect.objectContaining({ attempt }) });
      await repository.fail(
        base.ownerKey, base.jobId, attempt, `lease-${attempt}`, 'PROVIDER_ERROR', true,
        `2026-08-11T08:0${attempt}:05.000Z`,
      );
    }

    const firstReplay = await repository.begin({
      ...base, leaseToken: 'lease-4', now: '2026-08-11T09:00:00.000Z', retry: true,
    });
    const secondReplay = await repository.begin({
      ...base, leaseToken: 'lease-5', now: '2026-08-12T09:00:00.000Z', retry: true,
    });

    expect(firstReplay).toEqual({ type: 'existing', job: expect.objectContaining({
      attempt: 3, status: 'failed', errorCode: 'PROVIDER_ERROR', retryable: false,
    }) });
    expect(secondReplay).toEqual(firstReplay);
  });

  test('turns a third abandoned lease into a stable terminal failure', async () => {
    const repository = new BlobGenerationJobRepository(new MemoryBlobPort());
    const base = {
      ownerKey: 'owner-a', jobId: 'job-abandoned', clientRequestIdHash: 'request-hash', assessmentId: 'assessment-a',
    };
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const begun = await repository.begin({
        ...base,
        leaseToken: `lease-${attempt}`,
        now: `2026-08-${10 + attempt}T08:00:00.000Z`,
        retry: attempt > 1,
      });
      expect(begun).toEqual({ type: 'claimed', job: expect.objectContaining({ attempt, status: 'running' }) });
    }

    const exhausted = await repository.begin({
      ...base, leaseToken: 'lease-4', now: '2026-08-14T08:00:00.000Z', retry: true,
    });
    const replay = await repository.begin({
      ...base, leaseToken: 'lease-5', now: '2026-08-15T08:00:00.000Z', retry: true,
    });

    expect(exhausted).toEqual({ type: 'existing', job: expect.objectContaining({
      attempt: 3, status: 'failed', errorCode: 'JOB_ATTEMPT_LIMIT', retryable: false, leaseUntil: null,
    }) });
    expect(replay).toEqual(exhausted);
  });
});
