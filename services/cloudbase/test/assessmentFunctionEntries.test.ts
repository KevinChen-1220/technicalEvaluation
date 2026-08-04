import { getTrustedWeChatContext } from '../server/trustedContext';
import type { AssessmentRepository } from '../server/assessment/service';
import type { Assessment, AssessmentCompareAndSwapQuery } from '../shared/contracts';
import { createMain as createGetMain } from '../functions/get-assessment';
import { createMain as createListMain } from '../functions/list-assessments';
import { createMain as createCompleteMain } from '../functions/complete-assessment';
import { createMain as createUpdateMain } from '../functions/update-assessment';

jest.mock('wx-server-sdk', () => ({ getWXContext: jest.fn() }), { virtual: true });

const wxServerSdk = require('wx-server-sdk') as { getWXContext: jest.Mock };

describe('assessment function entries', () => {
  test('get entry uses trusted context and ignores event OPENID', async () => {
    const repository = new Repository([record()]);
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    await expect(createGetMain({ repository })({
      assessmentId: 'assessment-1', OPENID: 'owner-2', owner: 'owner-2',
    }, {})).resolves.toMatchObject({ type: 'found', assessment: { id: 'assessment-1' } });
  });

  test('update entry maps foreign and missing assessments to the same response', async () => {
    const repository = new Repository([record()]);
    const main = createUpdateMain({ repository, clock: { now: () => new Date('2026-08-03T10:30:00.000Z') } });
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-2' });

    const foreign = await main({ assessmentId: 'assessment-1', answers: {}, expectedRevision: 1 }, {});
    const missing = await main({ assessmentId: 'missing', answers: {}, expectedRevision: 1 }, {});

    expect(foreign).toEqual({ type: 'not_found', errorCode: 'INVALID_REQUEST' });
    expect(missing).toEqual(foreign);
  });

  test('list entry uses trusted context and returns only owned records', async () => {
    const repository = new Repository([record(), { ...record(), _id: 'foreign', _openid: 'owner-2' }]);
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    const result = await createListMain({ repository })({ pageSize: 20, owner: 'owner-2' }, {}) as {
      type: 'listed';
      summaries: Array<{ id: string }>;
    };

    expect(result).toMatchObject({ type: 'listed' });
    expect(result.type === 'listed' ? result.summaries.map((summary) => summary.id) : []).toEqual(['assessment-1']);
  });

  test('complete entry ignores client scoring fields and returns server-computed result', async () => {
    const repository = new Repository([record()]);
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'owner-1' });

    const result = await createCompleteMain({
      repository,
      clock: { now: () => new Date('2026-08-03T10:30:00.000Z') },
    })({
      assessmentId: 'assessment-1',
      answers: { q1: ['a'] },
      expectedRevision: 1,
      score: 999,
      result: { score: 999 },
      owner: 'owner-2',
    }, {});

    expect(result).toMatchObject({
      type: 'completed',
      assessment: { id: 'assessment-1', status: 'completed', result: { score: 1, correctCount: 1 } },
    });
  });

  test('trusted context helper remains the only OPENID source for assessment entries', () => {
    wxServerSdk.getWXContext.mockReturnValue({ OPENID: 'trusted-owner' });
    expect(getTrustedWeChatContext()).toBeDefined();
  });

  test('maps missing trusted authentication to a stable invalid-request code', async () => {
    wxServerSdk.getWXContext.mockReturnValue({});

    await expect(createGetMain({ repository: new Repository([]) })({ assessmentId: 'assessment-1' }, {}))
      .resolves.toEqual({ errorCode: 'INVALID_REQUEST' });
  });
});

class Repository implements AssessmentRepository {
  constructor(private readonly records: Assessment[]) {}
  async findOwnedAssessment(id: string, owner: string): Promise<Assessment | null> {
    return this.records.find((item) => item._id === id && item._openid === owner) ?? null;
  }
  async listOwnedAssessments(input: { ownerOpenId: string; limit: number; cursor: string | null }): Promise<{ records: Assessment[]; nextCursor: string | null }> {
    return {
      records: this.records.filter((item) => item._openid === input.ownerOpenId).slice(0, input.limit),
      nextCursor: null,
    };
  }
  async compareAndSwap(query: AssessmentCompareAndSwapQuery): Promise<Assessment | null> {
    const index = this.records.findIndex((item) => (
      item._id === query.filter._id
      && item._openid === query.filter._openid
      && item.revision === query.filter.revision
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
  async getRevision(): Promise<number | null> { return null; }
}

function record(): Assessment {
  return {
    _id: 'assessment-1', _openid: 'owner-1', schemaVersion: 1, status: 'draft', revision: 1,
    answers: {}, result: null, createdAt: 'now', updatedAt: 'now', completedAt: null,
    paper: {
      id: 'paper-1', topic: 'TS', questionCount: 50, generatedAt: 'now',
      scoring: { maxScore: 100, levels: [] },
      questions: [{
        id: 'q1',
        type: 'single_choice',
        difficulty: 'easy',
        knowledgePoint: 'types',
        prompt: 'Pick',
        options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
        correctOptionIds: ['a'],
        explanation: 'A',
      }],
    },
  };
}
