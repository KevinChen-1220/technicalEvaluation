import { createMemoryStores } from '../src/storage/memoryStores';
import { BlobAssessmentRepository, type AssessmentRecord } from '../src/storage/assessmentRepository';
import { MemoryBlobPort } from '../src/storage/memoryStores';
import type { BlobPort } from '../src/storage/ports';

const stamp = '2026-08-11T00:00:00.000Z';
function draft(id: string, ownerKey = 'owner-a', updatedAt = stamp): AssessmentRecord {
  return { id, ownerKey, revision: 1, status: 'draft', paper: { id, topic: id, questionCount: 50, generatedAt: stamp, scoring: { maxScore: 50, levels: [{ minPercent: 0, maxPercent: 100, title: 'ok', summary: 'ok' }] }, questions: [] }, answers: {}, result: null, createdAt: stamp, updatedAt, submittedAt: null };
}

describe('assessment repository', () => {
  test('keeps records owner namespaced and caps list indexes at 200 summaries', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z') });
    await stores.assessments.createIfAbsent(draft('a', 'owner-a'));
    await stores.assessments.createIfAbsent(draft('b', 'owner-b'));
    await expect(stores.assessments.get('owner-b', 'a')).resolves.toBeNull();
    for (let i = 0; i < 205; i += 1) await stores.assessments.createIfAbsent(draft(`id-${i}`, 'owner-c', `2026-08-11T00:${String(i % 60).padStart(2, '0')}:00.000Z`));
    await expect(stores.assessments.list('owner-c')).resolves.toHaveLength(200);
  });

  test('completes through the same revision contract and returns the written object', async () => {
    const stores = createMemoryStores({ now: () => new Date(stamp) });
    await stores.assessments.createIfAbsent(draft('a'));
    await expect(stores.assessments.complete({ ownerKey: 'owner-a', id: 'a', expectedRevision: 1, answers: { q: ['a'] }, result: { score: 100 }, submittedAt: stamp, updatedAt: stamp }))
      .resolves.toMatchObject({ type: 'updated', record: { status: 'completed', revision: 2, submittedAt: stamp } });
  });

  test('omits expired drafts and only carries summaries in the owner index', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z'), draftRetentionDays: 1, cleanupLimit: 1 });
    await stores.assessments.createIfAbsent(draft('expired', 'owner-a', '2026-08-09T00:00:00.000Z'));
    await stores.assessments.createIfAbsent(draft('current', 'owner-a', stamp));
    await expect(stores.assessments.list('owner-a')).resolves.toEqual([expect.objectContaining({ id: 'current' })]);
  });

  test('does not return expired drafts after the bounded cleanup budget is exhausted', async () => {
    const stores = createMemoryStores({ now: () => new Date('2026-08-11T00:00:00.000Z'), draftRetentionDays: 1, cleanupLimit: 1 });
    await stores.assessments.createIfAbsent(draft('expired-a', 'owner-a', '2026-08-08T00:00:00.000Z'));
    await stores.assessments.createIfAbsent(draft('expired-b', 'owner-a', '2026-08-09T00:00:00.000Z'));
    await stores.assessments.createIfAbsent(draft('current', 'owner-a', stamp));
    await expect(stores.assessments.list('owner-a')).resolves.toEqual([expect.objectContaining({ id: 'current' })]);
  });

  test('retries immutable owner-index revisions so concurrent assessments are both listed', async () => {
    const stores = createMemoryStores({ now: () => new Date(stamp) });
    await Promise.all([stores.assessments.createIfAbsent(draft('first')), stores.assessments.createIfAbsent(draft('second'))]);
    await expect(stores.assessments.list('owner-a')).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'first' }), expect.objectContaining({ id: 'second' }),
    ]));
  });

  test('uses strong revision discovery when eventual list visibility lags', async () => {
    const backing = new MemoryBlobPort();
    const blob: BlobPort = {
      get: backing.get.bind(backing), put: backing.put.bind(backing), delete: backing.delete.bind(backing),
      list: async (prefix, options) => options?.consistency === 'strong'
        ? await backing.list(prefix, options)
        : { blobs: [], directories: [] },
    };
    const repository = new BlobAssessmentRepository(blob, { now: () => new Date(stamp) });
    await repository.createIfAbsent(draft('visible'));
    await expect(repository.get('owner-a', 'visible')).resolves.toMatchObject({ id: 'visible' });
  });
});
