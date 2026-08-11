import { createBlobPort } from '../src/platform/context';
import { BlobGenerationJobRepository } from '../src/storage/jobRepository';

describe('EdgeOne Blob adapter', () => {
  test('forwards CRUD and strong consistency reads through the platform store', async () => {
    const store = {
      get: jest.fn(async () => ({ enabled: true })),
      setJSON: jest.fn(async () => undefined),
      delete: jest.fn(async () => undefined),
      list: jest.fn(async () => ({
        blobs: [{ key: 'settings/user.json' }, 'reports/r1.json'],
        directories: ['settings/'],
      })),
    };
    const blob = createBlobPort(store);
    expect(createBlobPort(store).coordinationKey).toBe(blob.coordinationKey);

    await expect(blob.get<{ enabled: boolean }>('settings/user.json', { consistency: 'strong' }))
      .resolves.toEqual({ enabled: true });
    await blob.put('settings/user.json', { enabled: true }, { onlyIfNew: true });
    await blob.delete('settings/user.json');
    await expect(blob.list('settings/', { consistency: 'strong', limit: 10 })).resolves.toEqual({
      blobs: ['settings/user.json', 'reports/r1.json'],
      directories: ['settings/'],
    });

    expect(store.get).toHaveBeenCalledWith('settings/user.json', {
      type: 'json',
      consistency: 'strong',
    });
    expect(store.setJSON).toHaveBeenCalledWith('settings/user.json', { enabled: true }, { onlyIfNew: true });
    expect(store.delete).toHaveBeenCalledWith('settings/user.json');
    expect(store.list).toHaveBeenCalledWith({ prefix: 'settings/', directories: false, consistency: 'strong', limit: 10 });
  });

  test('maps platform precondition failures to the portable conflict error', async () => {
    const store = {
      get: jest.fn(),
      setJSON: jest.fn(async () => { throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' }); }),
      delete: jest.fn(),
      list: jest.fn(),
    };
    const blob = createBlobPort(store);

    await expect(blob.put('assessments/owner/id/revisions/2.json', {}, { onlyIfNew: true }))
      .rejects.toMatchObject({ code: 'BLOB_PRECONDITION_FAILED' });
  });

  test('uses recursive flat listing so nested job claims remain discoverable', async () => {
    const records = new Map<string, unknown>();
    const list = jest.fn(async ({ prefix = '', directories = false }: { prefix?: string; directories?: boolean } = {}) => {
      const matches = [...records.keys()].filter((key) => key.startsWith(prefix));
      if (!directories) return { blobs: matches.map((key) => ({ key })), directories: [] };
      const blobs: Array<{ key: string }> = [];
      const grouped = new Set<string>();
      for (const key of matches) {
        const suffix = key.slice(prefix.length);
        const separator = suffix.indexOf('/');
        if (separator < 0) blobs.push({ key });
        else grouped.add(`${prefix}${suffix.slice(0, separator + 1)}`);
      }
      return { blobs, directories: [...grouped] };
    });
    const blob = createBlobPort({
      get: async (key: string) => records.get(key) ?? null,
      setJSON: async (key: string, value: unknown, options?: { onlyIfNew?: boolean }) => {
        if (options?.onlyIfNew && records.has(key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
        records.set(key, value);
      },
      delete: async (key: string) => { records.delete(key); },
      list,
    });
    const jobs = new BlobGenerationJobRepository(blob);
    const begun = await jobs.begin({
      ownerKey: 'owner-a', jobId: 'job-a', clientRequestIdHash: 'request-a', assessmentId: 'assessment-a',
      leaseToken: 'lease-a', now: '2026-08-11T08:00:00.000Z', retry: false,
    });

    expect(begun.type).toBe('claimed');
    await expect(jobs.markQuotaReserved(
      'owner-a', 'job-a', 1, 'lease-a', '2026-08-11T08:00:01.000Z',
    )).resolves.toEqual(expect.objectContaining({ status: 'running', quotaReserved: true }));
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ directories: false }));
  });
});
