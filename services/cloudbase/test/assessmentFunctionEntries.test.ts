import { getTrustedWeChatContext } from '../server/trustedContext';
import type { AssessmentRepository } from '../server/assessment/service';
import type { Assessment, AssessmentCompareAndSwapQuery } from '../shared/contracts';
import { createMain as createGetMain } from '../functions/get-assessment';
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
  async compareAndSwap(_query: AssessmentCompareAndSwapQuery): Promise<Assessment | null> { return null; }
  async getRevision(): Promise<number | null> { return null; }
}

function record(): Assessment {
  return {
    _id: 'assessment-1', _openid: 'owner-1', schemaVersion: 1, status: 'draft', revision: 1,
    answers: {}, result: null, createdAt: 'now', updatedAt: 'now', completedAt: null,
    paper: {
      id: 'paper-1', topic: 'TS', questionCount: 50, generatedAt: 'now',
      scoring: { maxScore: 100, levels: [] }, questions: [],
    },
  };
}
