import { createMemoryStores, MemoryBlobPort } from '../src/storage/memoryStores';
import { BlobQuotaRepository } from '../src/storage/quotaRepository';

describe('free tier quota', () => {
  test('enforces the generation circuit breaker, 60-second window, and daily five limit', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z') });
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), false)).resolves.toBe('generation_disabled');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true)).resolves.toBe('allowed');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:59.000Z'), true)).resolves.toBe('rate_limited');
    for (let minute = 1; minute < 5; minute += 1) await expect(stores.quota.reserve('owner-a', new Date(`2026-08-11T00:0${minute}:00.000Z`), true)).resolves.toBe('allowed');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:05:00.000Z'), true)).resolves.toBe('quota_exceeded');
  });

  test('uses a rolling 60-second ledger across a minute boundary', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z') });
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:59.000Z'), true)).resolves.toBe('allowed');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:01:00.000Z'), true)).resolves.toBe('rate_limited');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:01:59.000Z'), true)).resolves.toBe('allowed');
  });

  test('records one quota reservation for repeated attempts of the same job', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    const now = new Date('2026-08-11T00:00:00.000Z');

    await expect(quota.reserve('owner-a', now, true, 'job-a')).resolves.toBe('allowed');
    await expect(quota.reserve('owner-a', now, true, 'job-a')).resolves.toBe('allowed');
    await expect(quota.reserve('owner-a', now, true, 'job-b')).resolves.toBe('rate_limited');

    const ledger = await blob.list('quotas/', { consistency: 'strong', limit: 16 });
    expect(ledger.blobs).toHaveLength(1);
    await expect(blob.get(ledger.blobs[0]!, { consistency: 'strong' })).resolves.toEqual(expect.objectContaining({
      dailyCount: 1, reservationId: 'job-a',
    }));
  });
});
