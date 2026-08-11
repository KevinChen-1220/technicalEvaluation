import { createHash } from 'node:crypto';
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

  test('allows only one of two concurrent reservations inside the rolling window', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    const now = new Date('2026-08-11T00:00:00.000Z');

    const decisions = await Promise.all([
      quota.reserve('owner-a', now, true, 'job-a'),
      quota.reserve('owner-a', now, true, 'job-b'),
    ]);

    expect([...decisions].sort()).toEqual(['allowed', 'rate_limited']);
    const ledger = await blob.list('quotas/owner-a/ledger/', { consistency: 'strong' });
    const records = (await Promise.all(ledger.blobs.map(async (key) => await blob.get<{
      revision: number; dailyCount: number; reservationIds?: string[];
    }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
    expect(records.sort((left, right) => right.revision - left.revision)[0]).toEqual(expect.objectContaining({
      dailyCount: 1,
      reservationIds: [decisions[0] === 'allowed' ? 'job-a' : 'job-b'],
    }));
  });

  test('repairs an uncounted marker after 60 seconds exactly once under concurrent retries', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    const initialDecisions = await Promise.all([
      quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true, 'job-a'),
      quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true, 'job-b'),
    ]);
    const uncountedReservationId = initialDecisions[0] === 'rate_limited' ? 'job-a' : 'job-b';

    await expect(Promise.all([
      quota.reserve('owner-a', new Date('2026-08-11T00:01:00.000Z'), true, uncountedReservationId),
      quota.reserve('owner-a', new Date('2026-08-11T00:01:00.000Z'), true, uncountedReservationId),
    ])).resolves.toEqual(['allowed', 'allowed']);

    const ledger = await blob.list('quotas/owner-a/ledger/', { consistency: 'strong' });
    const records = (await Promise.all(ledger.blobs.map(async (key) => await blob.get<{
      revision: number; dailyCount: number; reservationIds?: string[];
    }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
    expect(records.sort((left, right) => right.revision - left.revision)[0]).toEqual(expect.objectContaining({
      dailyCount: 2,
      reservationIds: expect.arrayContaining(['job-a', 'job-b']),
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

  test('serializes historical markers from different UTC dates through one owner rate ledger', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    await seedQuotaMarker(blob, 'owner-a', 'job-a', '2026-06-01', '2026-06-01T00:00:00.000Z');
    await seedQuotaMarker(blob, 'owner-a', 'job-b', '2026-07-01', '2026-07-01T00:00:00.000Z');

    const decisions = await Promise.all([
      quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true, 'job-a'),
      quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true, 'job-b'),
    ]);
    const allowedId = decisions[0] === 'allowed' ? 'job-a' : 'job-b';
    const blockedId = allowedId === 'job-a' ? 'job-b' : 'job-a';

    expect([...decisions].sort()).toEqual(['allowed', 'rate_limited']);
    await expect(quota.reserve(
      'owner-a', new Date('2026-08-11T00:00:01.000Z'), true, 'job-c',
    )).resolves.toBe('rate_limited');
    await expect(quota.reserve(
      'owner-a', new Date('2026-08-11T00:01:00.000Z'), true, blockedId,
    )).resolves.toBe('allowed');
    await expect(quota.reserve(
      'owner-a', new Date('2026-08-11T00:01:01.000Z'), true, allowedId,
    )).resolves.toBe('allowed');

    const dailyRecords = (await Promise.all((await blob.list(
      'quotas/owner-a/ledger/', { consistency: 'strong' },
    )).blobs.map(async (key) => await blob.get<{
      revision: number; utcDay: string; dailyCount: number; reservationIds?: string[];
    }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
    const latestByDay = new Map<string, typeof dailyRecords[number]>();
    for (const record of dailyRecords) {
      const current = latestByDay.get(record.utcDay);
      if (current === undefined || current.revision < record.revision) latestByDay.set(record.utcDay, record);
    }
    expect(latestByDay.get('2026-06-01')).toEqual(expect.objectContaining({
      dailyCount: 1, reservationIds: ['job-a'],
    }));
    expect(latestByDay.get('2026-07-01')).toEqual(expect.objectContaining({
      dailyCount: 1, reservationIds: ['job-b'],
    }));
    expect(latestByDay.has('2026-08-11')).toBe(false);
  });

  test('keeps only the last 30 days of reservation ids in the global rate ledger', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);

    await expect(quota.reserve(
      'owner-a', new Date('2026-07-11T23:58:59.000Z'), true, 'job-expired',
    )).resolves.toBe('allowed');
    await expect(quota.reserve(
      'owner-a', new Date('2026-07-12T00:00:00.000Z'), true, 'job-boundary',
    )).resolves.toBe('allowed');
    await expect(quota.reserve(
      'owner-a', new Date('2026-08-11T00:00:00.000Z'), true, 'job-current',
    )).resolves.toBe('allowed');

    const rateRecords = (await Promise.all((await blob.list(
      'quotas/owner-a/rate-ledger/', { consistency: 'strong' },
    )).blobs.map(async (key) => await blob.get<{
      revision: number; lastRequestAt: string;
      reservations: Array<{ reservationId: string; acceptedAt: string }>;
    }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
    const latest = rateRecords.sort((left, right) => right.revision - left.revision)[0];
    expect(latest).toEqual(expect.objectContaining({
      lastRequestAt: '2026-08-11T00:00:00.000Z',
      reservations: [
        { reservationId: 'job-boundary', acceptedAt: '2026-07-12T00:00:00.000Z' },
        { reservationId: 'job-current', acceptedAt: '2026-08-11T00:00:00.000Z' },
      ],
    }));
  });

  test('does not append rate revisions for reservations rejected by the first-date daily quota', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    const decisions: string[] = [];

    for (let minute = 0; minute < 10; minute += 1) {
      decisions.push(await quota.reserve(
        'owner-a', new Date(Date.UTC(2026, 7, 11, 0, minute)), true, `job-${minute + 1}`,
      ));
    }

    expect(decisions).toEqual([
      'allowed', 'allowed', 'allowed', 'allowed', 'allowed',
      'quota_exceeded', 'quota_exceeded', 'quota_exceeded', 'quota_exceeded', 'quota_exceeded',
    ]);
    const rateRecords = await readRateRecords(blob, 'owner-a');
    expect(rateRecords).toHaveLength(5);
    expect(rateRecords.sort((left, right) => right.revision - left.revision)[0]?.reservations).toEqual([
      { reservationId: 'job-1', acceptedAt: '2026-08-11T00:00:00.000Z' },
      { reservationId: 'job-2', acceptedAt: '2026-08-11T00:01:00.000Z' },
      { reservationId: 'job-3', acceptedAt: '2026-08-11T00:02:00.000Z' },
      { reservationId: 'job-4', acceptedAt: '2026-08-11T00:03:00.000Z' },
      { reservationId: 'job-5', acceptedAt: '2026-08-11T00:04:00.000Z' },
    ]);
  });

  test('catches up bounded rate revision cleanup after delete failures recover', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);
    const originalDelete = blob.delete.bind(blob);
    let cleanupUnavailable = true;
    jest.spyOn(blob, 'delete').mockImplementation(async (key) => {
      if (cleanupUnavailable && key.includes('/rate-ledger/')) throw new Error('cleanup unavailable');
      await originalDelete(key);
    });

    for (let day = 0; day < 40; day += 1) {
      await expect(quota.reserve(
        'owner-a', utcDayOffset('2026-06-01T00:00:00.000Z', day), true, `job-${day + 1}`,
      )).resolves.toBe('allowed');
    }
    expect((await blob.list('quotas/owner-a/rate-ledger/', { consistency: 'strong' })).blobs).toHaveLength(40);

    cleanupUnavailable = false;
    await expect(quota.reserve(
      'owner-a', utcDayOffset('2026-06-01T00:00:00.000Z', 40), true, 'job-41',
    )).resolves.toBe('allowed');
    expect((await blob.list('quotas/owner-a/rate-ledger/', { consistency: 'strong' })).blobs).toHaveLength(9);
    await expect(quota.reserve(
      'owner-a', utcDayOffset('2026-06-01T00:00:00.000Z', 41), true, 'job-42',
    )).resolves.toBe('allowed');
    expect((await blob.list('quotas/owner-a/rate-ledger/', { consistency: 'strong' })).blobs).toHaveLength(8);
  });

  test('physically deletes a rate revision older than 30 days while preserving the latest snapshot', async () => {
    const blob = new MemoryBlobPort();
    const quota = new BlobQuotaRepository(blob);

    await expect(quota.reserve(
      'owner-a', new Date('2026-06-01T00:00:00.000Z'), true, 'job-old',
    )).resolves.toBe('allowed');
    await expect(quota.reserve(
      'owner-a', new Date('2026-07-02T00:00:00.000Z'), true, 'job-current',
    )).resolves.toBe('allowed');

    const rateRecords = await readRateRecords(blob, 'owner-a');
    expect(rateRecords).toEqual([expect.objectContaining({
      revision: 2,
      reservations: [{ reservationId: 'job-current', acceptedAt: '2026-07-02T00:00:00.000Z' }],
    })]);
  });
});

async function seedQuotaMarker(
  blob: MemoryBlobPort,
  ownerKey: string,
  reservationId: string,
  reservedDate: string,
  reservedAt: string,
): Promise<void> {
  const reservationIdHash = createHash('sha256').update(reservationId, 'utf8').digest('hex');
  await blob.put(
    `quotas/${encodeURIComponent(ownerKey)}/reservations/${reservationIdHash}.json`,
    { reservationIdHash, reservedDate, reservedAt },
    { onlyIfNew: true },
  );
}

async function readRateRecords(blob: MemoryBlobPort, ownerKey: string): Promise<Array<{
  revision: number;
  lastRequestAt: string;
  reservations: Array<{ reservationId: string; acceptedAt: string }>;
}>> {
  const keys = (await blob.list(
    `quotas/${encodeURIComponent(ownerKey)}/rate-ledger/`, { consistency: 'strong' },
  )).blobs;
  return (await Promise.all(keys.map(async (key) => await blob.get<{
    revision: number;
    lastRequestAt: string;
    reservations: Array<{ reservationId: string; acceptedAt: string }>;
  }>(key, { consistency: 'strong' })))).filter((record): record is NonNullable<typeof record> => record !== null);
}

function utcDayOffset(start: string, days: number): Date {
  return new Date(new Date(start).getTime() + days * 86_400_000);
}
