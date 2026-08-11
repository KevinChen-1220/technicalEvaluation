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

    const ledger = await blob.list('quotas/owner-a/ledger/', { consistency: 'strong', limit: 16 });
    expect(ledger.blobs).toHaveLength(1);
    await expect(blob.get(ledger.blobs[0]!, { consistency: 'strong' })).resolves.toEqual(expect.objectContaining({
      dailyCount: 1, reservationId: 'job-a',
    }));
  });

  test('keeps A-B-A reservations idempotent for the whole UTC day', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);

    await expect(quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true, 'job-a')).resolves.toBe('allowed');
    await expect(quota.reserve('owner-a', new Date('2026-08-11T00:01:00.000Z'), true, 'job-b')).resolves.toBe('allowed');
    await expect(quota.reserve('owner-a', new Date('2026-08-11T00:02:00.000Z'), true, 'job-a')).resolves.toBe('allowed');

    const ledger = await blob.list('quotas/owner-a/ledger/', { consistency: 'strong', limit: 16 });
    const records = await Promise.all(ledger.blobs.map(async (key) => await blob.get<{
      revision: number; dailyCount: number; reservationIds?: string[];
    }>(key, { consistency: 'strong' })));
    const latest = records.filter((record): record is NonNullable<typeof record> => record !== null)
      .sort((left, right) => right.revision - left.revision)[0];
    expect(latest).toEqual(expect.objectContaining({ dailyCount: 2, reservationIds: ['job-a', 'job-b'] }));
  });

  test('keeps a reservation charged to its first UTC date across midnight', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);

    await expect(quota.reserve('owner-a', new Date('2026-08-11T23:58:00.000Z'), true, 'job-a')).resolves.toBe('allowed');
    await expect(quota.reserve('owner-a', new Date('2026-08-11T23:59:00.000Z'), true, 'job-b')).resolves.toBe('allowed');
    await expect(quota.reserve('owner-a', new Date('2026-08-12T00:00:00.000Z'), true, 'job-a')).resolves.toBe('allowed');

    const ledger = await blob.list('quotas/owner-a/ledger/', { consistency: 'strong' });
    const records = (await Promise.all(ledger.blobs.map(async (key) => await blob.get<{
      utcDay: string; dailyCount: number; reservationIds?: string[];
    }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
    expect(records.filter((record) => record.utcDay === '2026-08-11')).toContainEqual(expect.objectContaining({
      dailyCount: 2, reservationIds: ['job-a', 'job-b'],
    }));
    expect(records.filter((record) => record.utcDay === '2026-08-12')).toHaveLength(0);
    const markers = await blob.list('quotas/owner-a/reservations/', { consistency: 'strong' });
    const markerRecords = await Promise.all(markers.blobs.map(async (key) => await blob.get(key, { consistency: 'strong' })));
    expect(markerRecords).toContainEqual(expect.objectContaining({ reservedDate: '2026-08-11' }));
  });

  test('uses an existing marker to repair its original date after a ledger write fails', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    const originalPut = blob.put.bind(blob);
    let failLedger = true;
    jest.spyOn(blob, 'put').mockImplementation(async (key, value, options) => {
      if (failLedger && key.includes('/ledger/')) {
        failLedger = false;
        throw new Error('ledger unavailable');
      }
      await originalPut(key, value, options);
    });

    await expect(quota.reserve(
      'owner-a', new Date('2026-08-11T23:58:00.000Z'), true, 'job-a',
    )).rejects.toThrow('ledger unavailable');
    await expect(quota.reserve(
      'owner-a', new Date('2026-08-12T00:00:00.000Z'), true, 'job-a',
    )).resolves.toBe('allowed');

    const ledger = await blob.list('quotas/owner-a/ledger/', { consistency: 'strong' });
    const records = (await Promise.all(ledger.blobs.map(async (key) => await blob.get<{
      utcDay: string; dailyCount: number; reservationIds?: string[];
    }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
    expect(records).toContainEqual(expect.objectContaining({
      utcDay: '2026-08-11', dailyCount: 1, reservationIds: ['job-a'],
    }));
    expect(records.filter((record) => record.utcDay === '2026-08-12')).toHaveLength(0);
  });
});
