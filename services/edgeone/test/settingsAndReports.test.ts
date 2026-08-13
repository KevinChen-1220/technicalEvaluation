import { createMemoryStores, MemoryBlobPort } from '../src/storage/memoryStores';
import { BlobSettingsRepository } from '../src/storage/settingsRepository';
import { BlobReportRepository } from '../src/storage/reportRepository';

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

  test('omits every expired report even when only one delete is permitted', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z'), reportRetentionDays: 1, cleanupLimit: 1 });
    await stores.reports.create({ id: 'old-a', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-08T00:00:00.000Z', updatedAt: '2026-08-08T00:00:00.000Z' });
    await stores.reports.create({ id: 'old-b', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-09T00:00:00.000Z', updatedAt: '2026-08-09T00:00:00.000Z' });
    await stores.reports.create({ id: 'new', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' });
    await expect(stores.reports.list('owner-a')).resolves.toEqual([expect.objectContaining({ id: 'new' })]);
  });

  test('cleans expired reports during new report creation when no list route is exposed', async () => {
    const blob = new MemoryBlobPort();
    const beforeExpiry = new BlobReportRepository(blob, {
      now: () => new Date('2026-08-11T00:00:00.000Z'), retentionDays: 365, cleanupLimit: 20,
    });
    await beforeExpiry.create({ id: 'old', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' });
    const reports = new BlobReportRepository(blob, {
      now: () => new Date('2027-08-12T00:00:00.000Z'), retentionDays: 365, cleanupLimit: 20,
    });
    await reports.create({ id: 'new', ownerKey: 'owner-a', reason: 'other', createdAt: '2027-08-12T00:00:00.000Z', updatedAt: '2027-08-12T00:00:00.000Z' });

    expect([...blob.records.keys()]).toEqual(['reports/owner-a/new.json']);
  });

  test('uses strong and bounded report discovery', async () => {
    const blob = new MemoryBlobPort();
    const list = jest.spyOn(blob, 'list');
    const reports = new BlobReportRepository(blob, { now: () => new Date('2026-08-11T00:00:00.000Z') });
    await reports.create({ id: 'r1', ownerKey: 'owner-a', reason: 'other', createdAt: '2026-08-11T00:00:00.000Z', updatedAt: '2026-08-11T00:00:00.000Z' });
    await expect(reports.list('owner-a')).resolves.toHaveLength(1);
    expect(list).toHaveBeenCalledWith('reports/owner-a/', { consistency: 'strong', limit: 200 });
  });
});
