import type { AnswerableAssessmentQuestion } from '@dynamic-assessment/assessment-core';
import { selectOption } from '../src/answer/selection';
import { AssessmentSyncQueue } from '../src/answer/syncQueue';
import { createAssessmentCache, type CachedAssessment, type StoragePort } from '../src/storage/assessmentCache';

describe('answer selection', () => {
  test('single choice and true/false replace the selected option', () => {
    expect(selectOption(question('single_choice'), ['a'], 'b')).toEqual(['b']);
    expect(selectOption(question('true_false'), ['true'], 'false')).toEqual(['false']);
  });

  test('multiple choice toggles one option without disturbing the others', () => {
    expect(selectOption(question('multiple_choice'), ['a'], 'b')).toEqual(['a', 'b']);
    expect(selectOption(question('multiple_choice'), ['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('AssessmentSyncQueue', () => {
  test('writes assessment and pending queue before making the network call', async () => {
    const events: string[] = [];
    const storage = new MemoryStorage(events);
    const cache = createAssessmentCache(storage);
    cache.saveAssessment(assessment());
    events.length = 0;
    const queue = new AssessmentSyncQueue({
      cache,
      updateAssessment: async () => { events.push('network'); return { type: 'updated', revision: 2 }; },
    });

    const operation = queue.recordSelection('assessment-1', 'q1', 'b');

    expect(operation.assessment.answers.q1).toEqual(['b']);
    expect(cache.getAssessment('assessment-1')?.answers.q1).toEqual(['b']);
    expect(events).toEqual(['storage:assessment', 'storage:pending']);
    await operation.sync;
    expect(events).toContain('network');
  });

  test('keeps a pending update cached after a network failure', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(assessment());
    const queue = new AssessmentSyncQueue({
      cache,
      updateAssessment: async () => { throw new Error('offline'); },
    });

    const operation = queue.recordSelection('assessment-1', 'q1', 'b');
    await operation.sync;

    expect(cache.getPendingUpdates()).toHaveLength(1);
    expect(queue.getStatus('assessment-1')).toBe('offline');
    expect(cache.getAssessment('assessment-1')?.answers.q1).toEqual(['b']);
  });

  test('merges a conflict by preserving locally changed questions and retries once', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(assessment());
    const updateAssessment = jest.fn()
      .mockResolvedValueOnce({
        type: 'conflict',
        current: { ...assessment(), revision: 4, answers: { q1: ['a'], q2: ['server'] } },
      })
      .mockResolvedValueOnce({ type: 'updated', revision: 5 });
    const queue = new AssessmentSyncQueue({ cache, updateAssessment });

    await queue.recordSelection('assessment-1', 'q1', 'b').sync;

    expect(updateAssessment).toHaveBeenNthCalledWith(2, {
      assessmentId: 'assessment-1',
      answers: { q1: ['b'], q2: ['server'] },
      expectedRevision: 4,
    });
    expect(cache.getAssessment('assessment-1')).toMatchObject({
      revision: 5,
      answers: { q1: ['b'], q2: ['server'] },
    });
    expect(cache.getPendingUpdates()).toEqual([]);
  });

  test('serializes network updates for the same assessment', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(assessment());
    let concurrent = 0;
    let maxConcurrent = 0;
    const releases: Array<() => void> = [];
    const queue = new AssessmentSyncQueue({
      cache,
      updateAssessment: async ({ expectedRevision }) => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        await new Promise<void>((resolve) => releases.push(resolve));
        concurrent -= 1;
        return { type: 'updated', revision: expectedRevision + 1 };
      },
    });

    const first = queue.recordSelection('assessment-1', 'q1', 'b').sync;
    await Promise.resolve();
    expect(releases).toHaveLength(1);
    const second = queue.recordSelection('assessment-1', 'q1', 'a').sync;
    releases.shift()!();
    await Promise.resolve();
    await Promise.resolve();
    expect(releases).toHaveLength(1);
    releases.shift()!();
    await Promise.all([first, second]);

    expect(maxConcurrent).toBe(1);
  });

  test('preserves every locally pending question when the first update conflicts', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment(assessment());
    let releaseConflict!: () => void;
    let serverAnswers: Record<string, string[]> = { q1: ['a'], q3: ['server-only'] };
    let revision = 4;
    const updateAssessment = jest.fn()
      .mockImplementationOnce(async () => {
        await new Promise<void>((resolve) => { releaseConflict = resolve; });
        return {
          type: 'conflict',
          current: { ...assessment(), revision, answers: serverAnswers },
        };
      })
      .mockImplementation(async ({ answers }) => {
        serverAnswers = answers;
        revision += 1;
        return { type: 'updated', revision };
      });
    const queue = new AssessmentSyncQueue({ cache, updateAssessment });

    const first = queue.recordSelection('assessment-1', 'q1', 'b').sync;
    await Promise.resolve();
    const second = queue.recordSelection('assessment-1', 'q2', 'y').sync;
    releaseConflict();
    await Promise.all([first, second]);

    expect(updateAssessment).toHaveBeenNthCalledWith(2, {
      assessmentId: 'assessment-1',
      answers: { q1: ['b'], q2: ['y'], q3: ['server-only'] },
      expectedRevision: 4,
    });
    expect(serverAnswers).toEqual({ q1: ['b'], q2: ['y'], q3: ['server-only'] });
    expect(cache.getAssessment('assessment-1')?.answers).toEqual(serverAnswers);
  });

  test('coalesces a restarted process selection with persisted pending work', async () => {
    const cache = createAssessmentCache(new MemoryStorage());
    cache.saveAssessment({ ...assessment(), answers: { q1: ['b'] } });
    cache.savePendingUpdates([{
      id: 'pending-1', assessmentId: 'assessment-1', answers: { q1: ['b'] },
      expectedRevision: 1, changedQuestionIds: ['q1'],
    }]);
    const updateAssessment = jest.fn(async ({ expectedRevision }) => ({
      type: 'updated' as const, revision: expectedRevision + 1,
    }));
    const restartedQueue = new AssessmentSyncQueue({ cache, updateAssessment });

    const operation = restartedQueue.recordSelection('assessment-1', 'q2', 'y');

    expect(cache.getPendingUpdates()).toEqual([expect.objectContaining({
      assessmentId: 'assessment-1',
      answers: { q1: ['b'], q2: ['y'] },
      changedQuestionIds: ['q1', 'q2'],
    })]);
    await operation.sync;
    expect(cache.getPendingUpdates()).toEqual([]);
  });
});

class MemoryStorage implements StoragePort {
  private readonly values = new Map<string, unknown>();

  constructor(private readonly events: string[] = []) {}

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  set<T>(key: string, value: T): void {
    this.events.push(key.includes('pending') ? 'storage:pending' : 'storage:assessment');
    this.values.set(key, value);
  }
}

function question(type: AnswerableAssessmentQuestion['type']): AnswerableAssessmentQuestion {
  return {
    id: 'q1', type, difficulty: 'easy', knowledgePoint: 'types', prompt: 'Pick',
    options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
  };
}

function assessment(): CachedAssessment {
  return {
    id: 'assessment-1', revision: 1, status: 'draft', answers: { q1: ['a'] },
    createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    completedAt: null,
    result: null,
    paper: {
      id: 'paper-1', topic: 'TypeScript', questionCount: 50,
      generatedAt: '2026-08-03T10:00:00.000Z', scoring: { maxScore: 100, levels: [] },
      questions: [
        question('single_choice'),
        { ...question('multiple_choice'), id: 'q2', options: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }] },
        { ...question('single_choice'), id: 'q3', options: [{ id: 'server-only', text: 'Server' }, { id: 'other', text: 'Other' }] },
      ],
    },
  };
}
