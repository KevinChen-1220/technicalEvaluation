import type {
  AssessmentPaper,
  AssessmentResult,
} from '../../../packages/assessment-core/src';
import {
  COLLECTION_SCHEMA_VERSION,
  MissingTrustedOpenIdError,
  canAccessOwnRecord,
  createAssessment,
  createGenerationJob,
  createUserSettings,
  updateAssessment,
} from '../shared/contracts';

const paper = {
  id: 'paper-1',
  topic: 'TypeScript',
  questionCount: 50,
  generatedAt: '2026-08-03T00:00:00.000Z',
  scoring: { maxScore: 100, levels: [] },
  questions: [],
} satisfies AssessmentPaper;

const now = '2026-08-03T00:00:00.000Z';
const context = { OPENID: 'trusted-openid' };

describe('CloudBase persistence contracts', () => {
  test('rejects records without a trusted OPENID', () => {
    expect(() => createAssessment({
      id: 'assessment-1',
      paper,
      answers: {},
      result: null,
      status: 'draft',
      completedAt: null,
    }, {}, now)).toThrow(MissingTrustedOpenIdError);
  });

  test('uses trusted OPENID instead of spoofed client ownership values', () => {
    expect(createGenerationJob({
      id: 'job-1',
      request: { topic: '  TypeScript  ', notes: '  generics  ', questionCount: 50 },
      expiresAt: '2026-08-04T00:00:00.000Z',
      clientOpenId: 'spoofed-openid',
      clientOwner: 'spoofed-owner',
    } as Parameters<typeof createGenerationJob>[0] & {
      clientOpenId: string;
      clientOwner: string;
    }, context, now)).toMatchObject({
      _openid: 'trusted-openid',
      request: { topic: 'TypeScript', notes: 'generics', questionCount: 50 },
    });
  });

  test('permits record access only for the exact trusted _openid', () => {
    expect(canAccessOwnRecord({ _openid: 'trusted-openid' }, 'trusted-openid')).toBe(true);
    expect(canAccessOwnRecord({ _openid: 'trusted-openid' }, 'similar-openid')).toBe(false);
  });

  test('accepts one revision update then reports a stale revision conflict without mutation', () => {
    const record = createAssessment({
      id: 'assessment-1',
      paper,
      answers: {},
      result: null,
      status: 'draft',
      completedAt: null,
      clientRevision: 999,
    } as Parameters<typeof createAssessment>[0] & { clientRevision: number }, context, now);

    const updated = updateAssessment(record, {
      expectedRevision: 1,
      answers: { 'question-1': ['option-a'] },
      result: null,
      status: 'draft',
      completedAt: null,
      clientOpenId: 'spoofed-openid',
      clientOwner: 'spoofed-owner',
      clientRevision: 999,
    } as Parameters<typeof updateAssessment>[1] & {
      clientOpenId: string;
      clientOwner: string;
      clientRevision: number;
    }, context, '2026-08-03T01:00:00.000Z');

    expect(updated).toMatchObject({
      type: 'updated',
      record: {
        _openid: 'trusted-openid',
        revision: 2,
        answers: { 'question-1': ['option-a'] },
      },
    });
    expect(record).toMatchObject({ revision: 1, answers: {} });
    if (updated.type !== 'updated') {
      throw new Error('Expected the matching revision to update the assessment.');
    }

    const stale = updateAssessment(
      updated.record,
      {
        expectedRevision: 1,
        answers: { 'question-1': ['option-b'] },
        result: null,
        status: 'draft',
        completedAt: null,
      },
      context,
      '2026-08-03T02:00:00.000Z',
    );

    expect(stale).toEqual({ type: 'conflict', currentRevision: 2 });
    expect(updated.record).toMatchObject({
      revision: 2,
      answers: { 'question-1': ['option-a'] },
    });
  });

  test('persists schema version one on every collection record', () => {
    expect(COLLECTION_SCHEMA_VERSION).toBe(1);
    expect(createAssessment({
      id: 'assessment-1', paper, answers: {}, result: null, status: 'draft', completedAt: null,
    }, context, now)).toMatchObject({ schemaVersion: 1 });
    expect(createGenerationJob({
      id: 'job-1', request: { topic: 'TypeScript', questionCount: 100 }, expiresAt: '2026-08-04T00:00:00.000Z',
    }, context, now)).toMatchObject({ schemaVersion: 1 });
    expect(createUserSettings({
      id: 'settings-1', locale: 'zh-CN', privacyConsentVersion: '2026-08', privacyConsentAt: null,
    }, context, now)).toMatchObject({ schemaVersion: 1 });
  });
});
