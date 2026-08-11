import { createBlobPort } from '../src/platform/context';

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

    await expect(blob.get<{ enabled: boolean }>('settings/user.json', { consistency: 'strong' }))
      .resolves.toEqual({ enabled: true });
    await blob.put('settings/user.json', { enabled: true }, { onlyIfNew: true });
    await blob.delete('settings/user.json');
    await expect(blob.list('settings/')).resolves.toEqual({
      blobs: ['settings/user.json', 'reports/r1.json'],
      directories: ['settings/'],
    });

    expect(store.get).toHaveBeenCalledWith('settings/user.json', {
      type: 'json',
      consistency: 'strong',
    });
    expect(store.setJSON).toHaveBeenCalledWith('settings/user.json', { enabled: true }, { onlyIfNew: true });
    expect(store.delete).toHaveBeenCalledWith('settings/user.json');
    expect(store.list).toHaveBeenCalledWith({ prefix: 'settings/', directories: true });
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
});
