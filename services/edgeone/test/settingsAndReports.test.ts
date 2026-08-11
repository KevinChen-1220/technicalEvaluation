import { createMemoryStores, MemoryBlobPort } from '../src/storage/memoryStores';
import { BlobSettingsRepository } from '../src/storage/settingsRepository';

describe('settings and reports', () => {
  test('reads owner settings strongly and returns the object just written', async () => {
    const blob = new MemoryBlobPort();
    const get = jest.spyOn(blob, 'get');
    const repository = new BlobSettingsRepository<{ model: string }>(blob);
    await expect(repository.set('owner-a', { model: 'provider/model' })).resolves.toEqual({ model: 'provider/model' });
    await expect(repository.get('owner-a')).resolves.toEqual({ model: 'provider/model' });
    expect(get).toHaveBeenCalledWith('settings/owner-a.json', { consistency: 'strong' });
  });

  test('returns only retained owner reports and deletes expired reports in a bounded batch', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z'), reportRetentionDays: 1, cleanupLimit: 1 });
    await stores.reports.create({ id: 'old', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z' });
    await stores.reports.create({ id: 'new', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' });
    await stores.reports.create({ id: 'other', ownerKey: 'owner-b', reason: 'other', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' });
    await expect(stores.reports.list('owner-a')).resolves.toEqual([expect.objectContaining({ id: 'new' })]);
  });
});
