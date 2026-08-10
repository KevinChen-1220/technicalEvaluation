import { CloudBaseRetentionRepository } from '../server/adapters/cloudBaseRetentionRepository';

describe('CloudBase retention repository', () => {
  test('deletes a bounded batch of stale drafts by updatedAt', async () => {
    const where = jest.fn();
    const limit = jest.fn();
    const remove = jest.fn(async () => ({ stats: { removed: 3 } }));
    const query = { where, limit, remove };
    where.mockReturnValue(query);
    limit.mockReturnValue(query);
    const lte = jest.fn((value: string) => ({ $lte: value }));
    const collection = jest.fn(() => query);
    const repository = new CloudBaseRetentionRepository({
      command: { lte },
      collection,
    } as unknown as ConstructorParameters<typeof CloudBaseRetentionRepository>[0]);

    await expect(repository.deleteExpiredDraftAssessments({
      before: '2026-07-11T08:00:00.000Z',
      limit: 50,
    })).resolves.toBe(3);

    expect(collection).toHaveBeenCalledWith('assessments');
    expect(where).toHaveBeenCalledWith({
      status: 'draft',
      updatedAt: { $lte: '2026-07-11T08:00:00.000Z' },
    });
    expect(limit).toHaveBeenCalledWith(50);
  });
});
