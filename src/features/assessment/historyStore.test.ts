import { scoreAssessment } from './scoring';
import { samplePaper } from './samplePaper';
import {
  createHistoryRecord,
  loadAssessmentHistory,
  saveAssessmentHistoryRecord,
  type HistoryStorage,
} from './historyStore';

function createMemoryStorage(initial?: Record<string, string>): HistoryStorage {
  const values = new Map(Object.entries(initial ?? {}));

  return {
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('assessment history store', () => {
  it('creates a complete replayable history record', () => {
    const firstQuestion = samplePaper.questions[0];
    expect(firstQuestion).toBeDefined();

    const answers = { [firstQuestion!.id]: ['hook'] };
    const result = scoreAssessment(samplePaper, {
      paperId: samplePaper.id,
      answers,
      submittedAt: '2026-07-13T08:00:00.000Z',
    });

    const record = createHistoryRecord(samplePaper, answers, result, '2026-07-13T08:00:00.000Z');

    expect(record.id).toContain(samplePaper.id);
    expect(record.paper).toBe(samplePaper);
    expect(record.answers).toEqual(answers);
    expect(record.result).toBe(result);
    expect(record.submittedAt).toBe('2026-07-13T08:00:00.000Z');
  });

  it('saves records newest first and loads them back', async () => {
    const storage = createMemoryStorage();
    const first = createHistoryRecord(
      samplePaper,
      {},
      scoreAssessment(samplePaper, { paperId: samplePaper.id, answers: {}, submittedAt: '2026-07-13T08:00:00.000Z' }),
      '2026-07-13T08:00:00.000Z',
    );
    const second = createHistoryRecord(
      samplePaper,
      {},
      scoreAssessment(samplePaper, { paperId: samplePaper.id, answers: {}, submittedAt: '2026-07-13T09:00:00.000Z' }),
      '2026-07-13T09:00:00.000Z',
    );

    await saveAssessmentHistoryRecord(first, storage);
    await saveAssessmentHistoryRecord(second, storage);

    const records = await loadAssessmentHistory(storage);

    expect(records.map((record) => record.id)).toEqual([second.id, first.id]);
  });

  it('returns an empty list when persisted history is invalid', async () => {
    const storage = createMemoryStorage({
      skill_scope_assessment_history: '<html>not json</html>',
    });

    await expect(loadAssessmentHistory(storage)).resolves.toEqual([]);
  });

  it('filters malformed records from parseable persisted history', async () => {
    const valid = createHistoryRecord(
      samplePaper,
      {},
      scoreAssessment(samplePaper, { paperId: samplePaper.id, answers: {}, submittedAt: '2026-07-13T09:00:00.000Z' }),
      '2026-07-13T09:00:00.000Z',
    );
    const storage = createMemoryStorage({
      skill_scope_assessment_history: JSON.stringify([null, {}, valid]),
    });

    await expect(loadAssessmentHistory(storage)).resolves.toEqual([valid]);
  });

  it('uses an in-memory fallback when localStorage is unavailable', async () => {
    const previousLocalStorage = globalThis.localStorage;

    try {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: undefined,
      });
      jest.resetModules();
      const fallbackStore = await import('./historyStore');
      const record = fallbackStore.createHistoryRecord(
        samplePaper,
        {},
        scoreAssessment(samplePaper, { paperId: samplePaper.id, answers: {}, submittedAt: '2026-07-13T10:00:00.000Z' }),
        '2026-07-13T10:00:00.000Z',
      );

      await fallbackStore.saveAssessmentHistoryRecord(record);

      await expect(fallbackStore.loadAssessmentHistory()).resolves.toEqual([record]);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: previousLocalStorage,
      });
      jest.resetModules();
    }
  });
});
