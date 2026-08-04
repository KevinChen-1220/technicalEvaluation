import {
  createHistoryController,
  getAssessmentOpenTarget,
  reconcileAssessmentRecords,
} from '../src/services/assessment-sync';
import {
  createAssessmentCache,
  type CachedAssessment,
  type PendingAssessmentUpdate,
  type StoragePort,
} from '../src/storage/assessmentCache';

describe('assessment history and reconciliation', () => {
  test('renders cached history immediately in updated order before cloud refresh', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(record({ id: 'older', topic: 'Old', updatedAt: '2026-08-03T09:00:00.000Z' }));
    cache.saveAssessment(record({ id: 'newer', topic: 'New', updatedAt: '2026-08-03T10:00:00.000Z' }));
    const observedBeforeCloud: string[][] = [];
    const controller = createHistoryController({
      cache,
      listAssessments: async () => {
        observedBeforeCloud.push(controller.getState().rows.map((row) => row.id));
        return {
          assessments: [
            record({ id: 'cloud', topic: 'Cloud', updatedAt: '2026-08-03T11:00:00.000Z', revision: 2 }),
          ],
          nextCursor: null,
        };
      },
    });

    expect(controller.loadCached().rows.map((row) => row.id)).toEqual(['newer', 'older']);
    await controller.refreshFromCloud();

    expect(observedBeforeCloud).toEqual([['newer', 'older']]);
    expect(controller.getState().rows.map((row) => row.id)).toEqual(['cloud', 'newer', 'older']);
  });

  test('starts one sync pass when cloud refresh preserves pending local answers', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    const local = record({ revision: 3, answers: { q1: ['b'] } });
    cache.saveAssessment(local);
    cache.savePendingUpdates([{
      id: 'assessment:assessment-1',
      version: 1,
      assessmentId: 'assessment-1',
      expectedRevision: 3,
      answers: local.answers,
      changedQuestionIds: ['q1'],
    }]);
    const syncPendingUpdate = jest.fn(async () => undefined);
    const controller = createHistoryController({
      cache,
      syncPendingUpdate,
      listAssessments: async () => ({
        assessments: [record({ revision: 4, answers: { q1: ['server'], q2: ['x'] } })],
        nextCursor: null,
      }),
    });

    controller.loadCached();
    await controller.refreshFromCloud();

    expect(syncPendingUpdate).toHaveBeenCalledWith(expect.objectContaining({
      assessmentId: 'assessment-1',
      expectedRevision: 4,
      answers: { q1: ['b'], q2: ['x'] },
    }));
  });

  test('keeps pending local answers over a higher-revision cloud draft and queues one CAS update', () => {
    const local = record({
      id: 'assessment-1',
      revision: 3,
      answers: { q1: ['b'], q2: ['local'] },
      updatedAt: '2026-08-03T10:00:00.000Z',
    });
    const cloud = record({
      id: 'assessment-1',
      revision: 4,
      answers: { q1: ['server'], q2: ['server'], q3: ['server-only'] },
      updatedAt: '2026-08-03T10:05:00.000Z',
    });
    const pending: PendingAssessmentUpdate[] = [{
      id: 'assessment:assessment-1',
      version: 7,
      assessmentId: 'assessment-1',
      expectedRevision: 3,
      answers: local.answers,
      changedQuestionIds: ['q1', 'q2'],
    }];

    const reconciled = reconcileAssessmentRecords({
      localRecords: [local],
      cloudRecords: [cloud],
      pendingUpdates: pending,
    });

    expect(reconciled.records[0]).toMatchObject({
      id: 'assessment-1',
      revision: 4,
      answers: { q1: ['b'], q2: ['local'], q3: ['server-only'] },
    });
    expect(reconciled.pendingUpdates).toEqual([expect.objectContaining({
      assessmentId: 'assessment-1',
      expectedRevision: 4,
      answers: { q1: ['b'], q2: ['local'], q3: ['server-only'] },
      changedQuestionIds: ['q1', 'q2'],
    })]);
    expect(reconciled.syncRequests).toHaveLength(1);
  });

  test('treats a completed cloud record as authoritative and clears stale local draft pending work', () => {
    const local = record({
      id: 'assessment-1',
      status: 'draft',
      revision: 4,
      answers: { q1: ['b'] },
    });
    const cloud = completedRecord({
      id: 'assessment-1',
      revision: 5,
      answers: { q1: ['a'], q2: ['x'], q3: ['true'] },
      updatedAt: '2026-08-03T10:10:00.000Z',
      completedAt: '2026-08-03T10:10:00.000Z',
    });
    const pending: PendingAssessmentUpdate[] = [{
      id: 'assessment:assessment-1',
      version: 2,
      assessmentId: 'assessment-1',
      expectedRevision: 4,
      answers: local.answers,
      changedQuestionIds: ['q1'],
    }];

    const reconciled = reconcileAssessmentRecords({
      localRecords: [local],
      cloudRecords: [cloud],
      pendingUpdates: pending,
    });

    expect(reconciled.records).toEqual([cloud]);
    expect(reconciled.pendingUpdates).toEqual([]);
    expect(reconciled.syncRequests).toEqual([]);
  });

  test('opens drafts at the first unanswered question and falls back to question one when fully answered', () => {
    expect(getAssessmentOpenTarget(record({ answers: { q1: ['a'] } }))).toEqual({
      route: 'answer',
      assessmentId: 'assessment-1',
      startIndex: 1,
    });
    expect(getAssessmentOpenTarget(record({
      answers: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']])),
    }))).toEqual({
      route: 'answer',
      assessmentId: 'assessment-1',
      startIndex: 0,
    });
  });

  test('opens completed records on the result route without asking the client to rescore', () => {
    expect(getAssessmentOpenTarget(completedRecord({ id: 'completed-1' }))).toEqual({
      route: 'result',
      assessmentId: 'completed-1',
    });
  });
});

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, unknown>();
  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }
  set<T>(key: string, value: T): void {
    this.values.set(key, value);
  }
}

type TestAssessmentOverrides = Partial<CachedAssessment> & { topic?: string };

function record(overrides: TestAssessmentOverrides = {}): CachedAssessment {
  const base = {
    id: 'assessment-1',
    revision: 1,
    status: 'draft' as const,
    answers: {},
    createdAt: '2026-08-03T08:00:00.000Z',
    updatedAt: '2026-08-03T08:00:00.000Z',
    completedAt: null,
    result: null,
    paper: {
      id: 'paper-1',
      topic: overrides.topic ?? 'TypeScript',
      questionCount: 50 as const,
      generatedAt: '2026-08-03T08:00:00.000Z',
      scoring: { maxScore: 100, levels: [{ minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' }] },
      questions: [
        question('q1', 'single_choice', 'Pick one', ['a', 'b']),
        question('q2', 'multiple_choice', 'Pick many', ['x', 'y']),
        question('q3', 'true_false', 'True?', ['true', 'false']),
        ...Array.from({ length: 47 }, (_, index) => question(`q${index + 4}`, 'single_choice', `Extra ${index + 4}`, ['a', 'b'])),
      ],
    },
  } satisfies CachedAssessment;
  const { topic: _topic, ...assessmentOverrides } = overrides;
  return { ...base, ...assessmentOverrides } as CachedAssessment;
}

function completedRecord(overrides: TestAssessmentOverrides = {}): CachedAssessment {
  const draft = record(overrides);
  return {
    ...draft,
    status: 'completed',
    completedAt: overrides.completedAt ?? '2026-08-03T11:00:00.000Z',
    result: {
      totalQuestions: 50,
      correctCount: 3,
      score: 3,
      accuracy: 6,
      level: { minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' },
      questionResults: [],
      knowledgePointResults: [],
      wrongQuestionIds: [],
    },
    paper: {
      ...draft.paper,
      questions: draft.paper.questions.map((item) => ({
        ...item,
        correctOptionIds: [item.options[0]!.id],
        explanation: `${item.prompt} explanation`,
      })),
    },
  } as CachedAssessment;
}

function question(
  id: string,
  type: 'single_choice' | 'multiple_choice' | 'true_false',
  prompt: string,
  optionIds: string[],
) {
  return {
    id,
    type,
    difficulty: 'easy' as const,
    knowledgePoint: 'types',
    prompt,
    options: optionIds.map((optionId) => ({ id: optionId, text: optionId.toUpperCase() })),
  };
}
