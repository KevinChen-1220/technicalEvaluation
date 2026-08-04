import { getTrustedWeChatContext } from '../server/trustedContext';
import {
  completeAssessment,
  getAssessment,
  listAssessments,
  updateAssessmentAnswers,
  type AssessmentRepository,
} from '../server/assessment/service';
import type { Assessment, AssessmentCompareAndSwapQuery } from '../shared/contracts';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

describe('assessment service', () => {
  test('returns an owned assessment without owner or server-only fields', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    const result = await getAssessment(
      { assessmentId: 'assessment-1', OPENID: 'spoofed' },
      trustedContext('owner-1'),
      { repository },
    );

    expect(result).toMatchObject({
      type: 'found', assessment: { id: 'assessment-1', answers: { q1: ['a'] }, status: 'draft', revision: 1 },
    });
    expect(result.type === 'found' ? result.assessment.paper.questions[0] : null).toEqual({
      id: 'q1', type: 'single_choice', difficulty: 'easy', knowledgePoint: 'types', prompt: 'Pick one',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
    });
  });

  test('exposes answers and explanations only for completed result DTOs', async () => {
    const repository = new InMemoryAssessmentRepository([{
      ...record(),
      status: 'completed',
      answers: { q1: ['a'], q2: ['x'] },
      result: scoreFor(2),
      completedAt: '2026-08-03T10:00:00.000Z',
    }]);

    const result = await getAssessment(
      { assessmentId: 'assessment-1' }, trustedContext('owner-1'), { repository },
    );

    expect(result.type).toBe('found');
    const question = result.type === 'found' ? result.assessment.paper.questions[0] : undefined;
    expect(question).toHaveProperty('correctOptionIds', ['a']);
    expect(question).toHaveProperty('explanation', 'A');
    expect(result.type === 'found' ? result.assessment.result : null).toMatchObject({ score: 2 });
  });

  test('makes a foreign assessment indistinguishable from a missing assessment', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    const foreign = await getAssessment({ assessmentId: 'assessment-1' }, trustedContext('owner-2'), { repository });
    const missing = await getAssessment({ assessmentId: 'missing' }, trustedContext('owner-2'), { repository });

    expect(foreign).toEqual({ type: 'not_found', errorCode: 'INVALID_REQUEST' });
    expect(missing).toEqual(foreign);
  });

  test('updates draft answers through the existing owner-and-revision CAS contract', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    await expect(updateAssessmentAnswers({
      assessmentId: 'assessment-1', answers: { q1: ['b'], q2: ['x', 'y'] }, expectedRevision: 1,
      owner: 'spoofed', provider: 'spoofed',
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } })).resolves.toEqual({
      type: 'updated', revision: 2,
    });

    expect(repository.records[0]).toMatchObject({
      _openid: 'owner-1', status: 'draft', revision: 2,
      answers: { q1: ['b'], q2: ['x', 'y'] }, result: null, completedAt: null,
    });
  });

  test.each([
    [{ unknown: ['a'] }, 'unknown question'],
    [{ q1: ['missing-option'] }, 'unknown option'],
    [{ q1: ['a', 'b'] }, 'too many single-choice options'],
  ])('rejects %s against the persisted paper', async (answers, _description) => {
    const repository = new InMemoryAssessmentRepository([record()]);

    await expect(updateAssessmentAnswers({
      assessmentId: 'assessment-1', answers, expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } })).resolves.toEqual({
      type: 'invalid', errorCode: 'INVALID_REQUEST',
    });
    expect(repository.compareAndSwapCalls).toBe(0);
  });

  test('does not update a completed assessment', async () => {
    const repository = new InMemoryAssessmentRepository([{ ...record(), status: 'completed' }]);

    await expect(updateAssessmentAnswers({
      assessmentId: 'assessment-1', answers: { q1: ['b'] }, expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } })).resolves.toEqual({
      type: 'invalid', errorCode: 'INVALID_REQUEST',
    });
    expect(repository.compareAndSwapCalls).toBe(0);
  });

  test('returns the current sanitized server record on a revision conflict', async () => {
    const current = { ...record(), revision: 4, answers: { q1: ['a'], q2: ['server'] } };
    const repository = new InMemoryAssessmentRepository([current]);

    await expect(updateAssessmentAnswers({
      assessmentId: 'assessment-1', answers: { q1: ['b'] }, expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } })).resolves.toMatchObject({
      type: 'conflict',
      current: {
        id: 'assessment-1', paper: expect.any(Object), answers: current.answers, status: 'draft', revision: 4,
      },
    });
    const result = await updateAssessmentAnswers({
      assessmentId: 'assessment-1', answers: { q1: ['b'] }, expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } });
    expect(result.type === 'conflict' ? result.current.paper.questions[0] : null)
      .not.toHaveProperty('correctOptionIds');
  });

  test('lists owned assessments with cursor pagination and safe completed result records', async () => {
    const repository = new InMemoryAssessmentRepository([
      { ...record(), _id: 'older', updatedAt: '2026-08-03T09:00:00.000Z' },
      { ...record(), _id: 'newer', updatedAt: '2026-08-03T10:00:00.000Z', status: 'completed', result: scoreFor(1), completedAt: '2026-08-03T10:00:00.000Z' },
      { ...record(), _id: 'foreign', _openid: 'owner-2', updatedAt: '2026-08-03T11:00:00.000Z' },
    ]);

    const first = await listAssessments({ pageSize: 1 }, trustedContext('owner-1'), { repository });

    expect(repository.listQueries[0]).toEqual({ ownerOpenId: 'owner-1', limit: 1, cursor: null });
    expect(first.type).toBe('listed');
    expect(first.type === 'listed' ? first.summaries : []).toEqual([expect.objectContaining({
      id: 'newer',
      status: 'completed',
      score: 1,
      accuracy: 50,
      updatedAt: '2026-08-03T10:00:00.000Z',
    })]);
    expect(first.type === 'listed' ? first.assessments[0]!.paper.questions[0] : null)
      .toHaveProperty('correctOptionIds', ['a']);
    expect(first.type === 'listed' ? first.nextCursor : null).toEqual(expect.any(String));

    const second = await listAssessments({ pageSize: 1, cursor: first.type === 'listed' ? first.nextCursor : null }, trustedContext('owner-1'), { repository });
    expect(second.type === 'listed' ? second.summaries.map((summary) => summary.id) : []).toEqual(['older']);
  });

  test('completes by recalculating score server-side and ignoring tampered client result fields', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    const result = await completeAssessment({
      assessmentId: 'assessment-1',
      answers: { q1: ['a'], q2: ['y'] },
      expectedRevision: 1,
      result: scoreFor(999),
      score: 999,
      owner: 'spoofed',
      completedAt: 'spoofed',
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } });

    expect(result.type).toBe('completed');
    expect(result.type === 'completed' ? result.assessment.result : null).toMatchObject({
      totalQuestions: 2,
      correctCount: 1,
      score: 1,
      accuracy: 50,
      wrongQuestionIds: ['q2'],
    });
    expect(repository.records[0]).toMatchObject({
      _openid: 'owner-1',
      status: 'completed',
      revision: 2,
      completedAt: '2026-08-03T10:30:00.000Z',
      result: { score: 1, correctCount: 1 },
    });
  });

  test('rejects incomplete completion without changing the record', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    await expect(completeAssessment({
      assessmentId: 'assessment-1',
      answers: { q1: ['a'] },
      expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } })).resolves.toEqual({
      type: 'invalid', errorCode: 'INVALID_REQUEST',
    });
    expect(repository.compareAndSwapCalls).toBe(0);
    expect(repository.records[0]).toMatchObject({ status: 'draft', revision: 1, result: null });
  });

  test('returns the same persisted result for repeated completion without changing revision', async () => {
    const completed = {
      ...record(),
      status: 'completed' as const,
      revision: 8,
      answers: { q1: ['a'], q2: ['x'] },
      result: scoreFor(2),
      completedAt: '2026-08-03T10:00:00.000Z',
    };
    const repository = new InMemoryAssessmentRepository([completed]);

    const first = await completeAssessment({
      assessmentId: 'assessment-1',
      answers: { q1: ['b'], q2: ['y'] },
      expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } });
    const second = await completeAssessment({
      assessmentId: 'assessment-1',
      answers: { q1: ['b'], q2: ['y'] },
      expectedRevision: 1,
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } });

    expect(first).toEqual(second);
    expect(repository.compareAndSwapCalls).toBe(0);
    expect(repository.records[0]).toMatchObject({ revision: 8, completedAt: '2026-08-03T10:00:00.000Z' });
  });

  test('makes foreign and missing completion requests indistinguishable', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    const foreign = await completeAssessment({
      assessmentId: 'assessment-1',
      answers: { q1: ['a'], q2: ['x'] },
      expectedRevision: 1,
    }, trustedContext('owner-2'), { repository, clock: { now: () => now } });
    const missing = await completeAssessment({
      assessmentId: 'missing',
      answers: { q1: ['a'], q2: ['x'] },
      expectedRevision: 1,
    }, trustedContext('owner-2'), { repository, clock: { now: () => now } });

    expect(foreign).toEqual({ type: 'not_found', errorCode: 'INVALID_REQUEST' });
    expect(missing).toEqual(foreign);
  });
});

const now = new Date('2026-08-03T10:30:00.000Z');

class InMemoryAssessmentRepository implements AssessmentRepository {
  compareAndSwapCalls = 0;
  listQueries: Array<{ ownerOpenId: string; limit: number; cursor: string | null }> = [];

  constructor(readonly records: Assessment[]) {}

  async findOwnedAssessment(id: string, ownerOpenId: string): Promise<Assessment | null> {
    return this.records.find((candidate) => candidate._id === id && candidate._openid === ownerOpenId) ?? null;
  }

  async listOwnedAssessments(input: { ownerOpenId: string; limit: number; cursor: string | null }): Promise<{
    records: Assessment[];
    nextCursor: string | null;
  }> {
    this.listQueries.push(input);
    const sorted = this.records
      .filter((candidate) => candidate._openid === input.ownerOpenId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right._id.localeCompare(left._id));
    const cursor = input.cursor === null ? null : JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8')) as { updatedAt: string; id: string };
    const page = sorted
      .filter((candidate) => cursor === null || candidate.updatedAt < cursor.updatedAt || (candidate.updatedAt === cursor.updatedAt && candidate._id < cursor.id))
      .slice(0, input.limit);
    const last = page[page.length - 1];
    return {
      records: page,
      nextCursor: page.length === input.limit && last !== undefined
        ? Buffer.from(JSON.stringify({ updatedAt: last.updatedAt, id: last._id })).toString('base64url')
        : null,
    };
  }

  async compareAndSwap(query: AssessmentCompareAndSwapQuery): Promise<Assessment | null> {
    this.compareAndSwapCalls += 1;
    const index = this.records.findIndex((candidate) => (
      candidate._id === query.filter._id
      && candidate._openid === query.filter._openid
      && candidate.revision === query.filter.revision
    ));
    if (index < 0) return null;
    const current = this.records[index]!;
    const updated = {
      ...current,
      ...query.update.$set,
      revision: current.revision + query.update.$inc.revision,
    };
    this.records[index] = updated;
    return updated;
  }

  async getRevision(input: { id: string; openId: string }): Promise<number | null> {
    return (await this.findOwnedAssessment(input.id, input.openId))?.revision ?? null;
  }
}

function scoreFor(correctCount: number) {
  return {
    totalQuestions: 2,
    correctCount,
    score: correctCount,
    accuracy: correctCount === 1 ? 50 : correctCount === 2 ? 100 : 0,
    level: { minPercent: 0, maxPercent: 100, title: '完成', summary: '完成测评' },
    questionResults: [],
    knowledgePointResults: [],
    wrongQuestionIds: [],
  };
}

function trustedContext(openId: string): unknown {
  wxServerSdk.getWXContext.mockReturnValue({ OPENID: openId });
  return getTrustedWeChatContext();
}

function record(): Assessment {
  return {
    _id: 'assessment-1', _openid: 'owner-1', schemaVersion: 1, status: 'draft', revision: 1,
    answers: { q1: ['a'] }, result: null, createdAt: '2026-08-03T10:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z', completedAt: null,
    paper: {
      id: 'paper-1', topic: 'TypeScript', questionCount: 50,
      generatedAt: '2026-08-03T10:00:00.000Z', scoring: { maxScore: 100, levels: [] },
      questions: [
        {
          id: 'q1', type: 'single_choice', difficulty: 'easy', knowledgePoint: 'types', prompt: 'Pick one',
          options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], correctOptionIds: ['a'], explanation: 'A',
        },
        {
          id: 'q2', type: 'multiple_choice', difficulty: 'medium', knowledgePoint: 'types', prompt: 'Pick many',
          options: [{ id: 'x', text: 'X' }, { id: 'y', text: 'Y' }], correctOptionIds: ['x'], explanation: 'X',
        },
      ],
    },
  };
}
