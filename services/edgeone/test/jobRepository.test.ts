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
    expect(left.job).toEqual(expect.objectContaining({ status: 'running', attempt: 1, assessmentId: 'assessment-a' }));
    expect(right.job).toEqual(expect.objectContaining({ status: 'running', attempt: 1, assessmentId: 'assessment-a' }));
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
});
