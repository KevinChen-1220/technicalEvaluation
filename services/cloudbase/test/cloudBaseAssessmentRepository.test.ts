import { CloudBaseAssessmentRepository } from '../server/adapters/cloudBaseAssessmentRepository';
import type { AssessmentCompareAndSwapQuery } from '../shared/contracts';

describe('CloudBase assessment repository', () => {
  test('performs one owner-and-revision conditional update and returns the updated record', async () => {
    const harness = databaseHarness();
    const repository = new CloudBaseAssessmentRepository(harness.database);
    const query: AssessmentCompareAndSwapQuery = {
      collection: 'assessments',
      filter: { _id: 'assessment-1', _openid: 'owner-1', revision: 3 },
      update: {
        $set: {
          answers: { q1: ['b'] }, result: null, status: 'draft', completedAt: null,
          updatedAt: '2026-08-03T10:30:00.000Z',
        },
        $inc: { revision: 1 },
      },
    };

    await expect(repository.compareAndSwap(query)).resolves.toMatchObject({
      _id: 'assessment-1', _openid: 'owner-1', revision: 4,
    });

    expect(harness.where).toHaveBeenNthCalledWith(1, query.filter);
    expect(harness.update).toHaveBeenCalledWith({ data: {
      ...query.update.$set,
      revision: { $inc: 1 },
    } });
    expect(harness.where).toHaveBeenNthCalledWith(2, { _id: 'assessment-1', _openid: 'owner-1' });
  });

  test('returns null when the conditional update loses the CAS race', async () => {
    const harness = databaseHarness(0);
    const repository = new CloudBaseAssessmentRepository(harness.database);

    await expect(repository.compareAndSwap({
      collection: 'assessments',
      filter: { _id: 'assessment-1', _openid: 'owner-1', revision: 3 },
      update: {
        $set: { answers: {}, result: null, status: 'draft', completedAt: null, updatedAt: 'now' },
        $inc: { revision: 1 },
      },
    })).resolves.toBeNull();
    expect(harness.get).not.toHaveBeenCalled();
  });
});

function databaseHarness(updated = 1): {
  database: ConstructorParameters<typeof CloudBaseAssessmentRepository>[0];
  where: jest.Mock;
  update: jest.Mock;
  get: jest.Mock;
} {
  const where = jest.fn();
  const update = jest.fn(async () => ({ stats: { updated } }));
  const get = jest.fn(async () => ({ data: [{
    _id: 'assessment-1', _openid: 'owner-1', schemaVersion: 1, status: 'draft', revision: 4,
    paper: {}, answers: { q1: ['b'] }, result: null, createdAt: 'before', updatedAt: 'now', completedAt: null,
  }] }));
  const query = { where, limit: jest.fn(), update, get };
  query.where.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  const database = {
    command: { inc: jest.fn((value: number) => ({ $inc: value })) },
    collection: jest.fn(() => query),
  } as unknown as ConstructorParameters<typeof CloudBaseAssessmentRepository>[0];
  return { database, where, update, get };
}
