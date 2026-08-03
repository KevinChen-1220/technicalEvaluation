import { getTrustedWeChatContext } from '../server/trustedContext';
import {
  getAssessment,
  updateAssessmentAnswers,
  type AssessmentRepository,
} from '../server/assessment/service';
import type { Assessment, AssessmentCompareAndSwapQuery } from '../shared/contracts';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

describe('assessment service', () => {
  test('returns an owned assessment without owner or server-only fields', async () => {
    const repository = new InMemoryAssessmentRepository([record()]);

    await expect(getAssessment(
      { assessmentId: 'assessment-1', OPENID: 'spoofed' },
      trustedContext('owner-1'),
      { repository },
    )).resolves.toEqual({
      type: 'found',
      assessment: {
        id: 'assessment-1', paper: record().paper, answers: { q1: ['a'] }, status: 'draft', revision: 1,
      },
    });
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
    }, trustedContext('owner-1'), { repository, clock: { now: () => now } })).resolves.toEqual({
      type: 'conflict',
      current: {
        id: 'assessment-1', paper: current.paper, answers: current.answers, status: 'draft', revision: 4,
      },
    });
  });
});

const now = new Date('2026-08-03T10:30:00.000Z');

class InMemoryAssessmentRepository implements AssessmentRepository {
  compareAndSwapCalls = 0;

  constructor(readonly records: Assessment[]) {}

  async findOwnedAssessment(id: string, ownerOpenId: string): Promise<Assessment | null> {
    return this.records.find((candidate) => candidate._id === id && candidate._openid === ownerOpenId) ?? null;
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
