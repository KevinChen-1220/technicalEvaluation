import { createMemoryStores } from '../src/storage/memoryStores';

describe('free tier quota', () => {
  test('enforces the generation circuit breaker, 60-second window, and daily five limit', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z') });
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), false)).resolves.toBe('generation_disabled');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:00.000Z'), true)).resolves.toBe('allowed');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:00:59.000Z'), true)).resolves.toBe('rate_limited');
    for (let minute = 1; minute < 5; minute += 1) await expect(stores.quota.reserve('owner-a', new Date(`2026-08-11T00:0${minute}:00.000Z`), true)).resolves.toBe('allowed');
    await expect(stores.quota.reserve('owner-a', new Date('2026-08-11T00:05:00.000Z'), true)).resolves.toBe('quota_exceeded');
  });
});
