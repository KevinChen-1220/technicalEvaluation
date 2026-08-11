import { createBlobPort } from '../src/platform/context';
import { createEdgeOneStores } from '../src/storage/edgeOneStores';
import { createMemoryStores } from '../src/storage/memoryStores';
import type { AssessmentRecord } from '../src/storage/assessmentRepository';

const now = new Date('2026-08-11T00:00:00.000Z');

function record(): AssessmentRecord {
  return {
    id: 'assessment-1', ownerKey: 'owner-a', revision: 1, status: 'draft',
    paper: { id: 'assessment-1', topic: 'TypeScript', questionCount: 50, generatedAt: now.toISOString(), scoring: { maxScore: 50, levels: [{ minPercent: 0, maxPercent: 100, title: 'ok', summary: 'ok' }] }, questions: [] },
    answers: {}, result: null, createdAt: now.toISOString(), updatedAt: now.toISOString(), submittedAt: null,
  };
}

function suites() {
  const memory = createMemoryStores({ now: () => now });
  const data = new Map<string, unknown>();
  const edgeStore = createEdgeOneStores(createBlobPort({
    get: async (key: string) => data.get(key) ?? null,
    setJSON: async (key: string, value: unknown, options?: { onlyIfNew?: boolean }) => {
      if (options?.onlyIfNew && data.has(key)) throw Object.assign(new Error('exists'), { name: 'PreconditionFailed' });
      data.set(key, value);
    },
    delete: async (key: string) => { data.delete(key); },
    list: async ({ prefix }: { prefix?: string } = {}) => ({ blobs: [...data.keys()].filter((key) => key.startsWith(prefix ?? '')).map((key) => ({ key })), directories: [] }),
  }), { now: () => now });
  return [memory, edgeStore];
}

describe.each(suites())('storage contract', (stores) => {
  test('creates idempotently and arbitrates a revision with an immutable only-if-new key', async () => {
    const created = await stores.assessments.createIfAbsent(record());
    await expect(stores.assessments.createIfAbsent(record())).resolves.toEqual(created);
    await expect(stores.assessments.compareAndSwap({ ownerKey: 'owner-a', id: 'assessment-1', expectedRevision: 1, answers: { q1: ['a'] }, updatedAt: '2026-08-11T00:01:00.000Z' }))
      .resolves.toMatchObject({ type: 'updated', record: { revision: 2 } });
    await expect(stores.assessments.compareAndSwap({ ownerKey: 'owner-a', id: 'assessment-1', expectedRevision: 1, answers: {}, updatedAt: '2026-08-11T00:02:00.000Z' }))
      .resolves.toMatchObject({ type: 'conflict', code: 'REVISION_CONFLICT' });
  });
});
