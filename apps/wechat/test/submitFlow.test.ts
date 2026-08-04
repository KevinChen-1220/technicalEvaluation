import {
  completeAssessmentSubmission,
  validateAssessmentCompletion,
} from '../src/services/submit-assessment';
import {
  createAssessmentCache,
  type CachedAssessment,
  type CachedCompletedAssessment,
  type StoragePort,
} from '../src/storage/assessmentCache';

describe('assessment submit flow', () => {
  test('blocks final submit when any question is unanswered and reports the remaining count in Chinese', () => {
    const assessment = record({ answers: { q1: ['a'] } });

    expect(validateAssessmentCompletion(assessment)).toEqual({
      complete: false,
      remainingCount: 49,
      message: '还有 49 题未作答',
    });
  });

  test('flushes pending answers before server completion and saves the authoritative completed DTO', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(record({
      revision: 4,
      answers: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']])),
    }));
    cache.savePendingUpdates([{
      id: 'assessment:assessment-1',
      version: 1,
      assessmentId: 'assessment-1',
      expectedRevision: 3,
      answers: { q1: ['a'] },
      changedQuestionIds: ['q1'],
    }]);
    const events: string[] = [];
    const completed = completedRecord({ revision: 5 });

    const result = await completeAssessmentSubmission({
      assessmentId: 'assessment-1',
      cache,
      flushPending: async () => {
        events.push('flush');
        cache.savePendingUpdates([]);
      },
      completeAssessment: async (input) => {
        events.push(`complete:${input.expectedRevision}`);
        expect(input).toEqual({
          assessmentId: 'assessment-1',
          expectedRevision: 4,
          answers: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']])),
        });
        return { type: 'completed', assessment: completed };
      },
    });

    expect(result).toEqual({ type: 'completed', assessment: completed });
    expect(events).toEqual(['flush', 'complete:4']);
    expect(cache.getPendingUpdates()).toEqual([]);
    expect(cache.getAssessment('assessment-1')).toEqual(completed);
  });

  test('does not call complete when pending answers could not be flushed', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(record({
      answers: Object.fromEntries(Array.from({ length: 50 }, (_, index) => [`q${index + 1}`, ['a']])),
    }));
    cache.savePendingUpdates([{
      id: 'assessment:assessment-1',
      version: 1,
      assessmentId: 'assessment-1',
      expectedRevision: 1,
      answers: { q1: ['a'] },
      changedQuestionIds: ['q1'],
    }]);
    const completeAssessment = jest.fn();

    const result = await completeAssessmentSubmission({
      assessmentId: 'assessment-1',
      cache,
      flushPending: async () => undefined,
      completeAssessment,
    });

    expect(result).toEqual({ type: 'pending_not_flushed', message: '答案仍在同步中，请稍后再提交' });
    expect(completeAssessment).not.toHaveBeenCalled();
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

function record(overrides: Partial<CachedAssessment> = {}): CachedAssessment {
  return {
    id: 'assessment-1',
    revision: 1,
    status: 'draft',
    answers: {},
    createdAt: '2026-08-03T08:00:00.000Z',
    updatedAt: '2026-08-03T08:00:00.000Z',
    completedAt: null,
    result: null,
    paper: {
      id: 'paper-1',
      topic: 'TypeScript',
      questionCount: 50,
      generatedAt: '2026-08-03T08:00:00.000Z',
      scoring: { maxScore: 100, levels: [{ minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' }] },
      questions: Array.from({ length: 50 }, (_, index) => ({
        id: `q${index + 1}`,
        type: 'single_choice' as const,
        difficulty: 'easy' as const,
        knowledgePoint: index < 25 ? 'types' : 'runtime',
        prompt: `Question ${index + 1}`,
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      })),
    },
    ...overrides,
  } as CachedAssessment;
}

function completedRecord(overrides: Partial<CachedAssessment> = {}): CachedCompletedAssessment {
  const draft = record(overrides);
  return {
    ...draft,
    status: 'completed',
    completedAt: '2026-08-03T11:00:00.000Z',
    result: {
      totalQuestions: 50,
      correctCount: 50,
      score: 50,
      accuracy: 100,
      level: { minPercent: 80, maxPercent: 100, title: '优秀', summary: '掌握扎实' },
      questionResults: draft.paper.questions.map((question) => ({
        questionId: question.id,
        isCorrect: true,
        userOptionIds: ['a'],
        correctOptionIds: ['a'],
      })),
      knowledgePointResults: [],
      wrongQuestionIds: [],
    },
    paper: {
      ...draft.paper,
      questions: draft.paper.questions.map((question) => ({
        ...question,
        correctOptionIds: ['a'],
        explanation: `${question.prompt} explanation`,
      })),
    },
  } as CachedCompletedAssessment;
}
