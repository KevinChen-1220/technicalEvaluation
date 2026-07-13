import { scoreAssessment } from './scoring';
import { samplePaper } from './samplePaper';
import {
  completeAssessment,
  createAssessmentDraft,
  importCompletedAssessmentRecord,
  listAssessmentRecords,
  updateAssessmentAnswers,
} from './assessmentRepository';
import type { AppDatabase } from '../../storage/database';

type Row = {
  id: string;
  paper_json: string;
  answers_json: string;
  result_json: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

function createMemoryDatabase(): AppDatabase {
  const assessmentRows = new Map<string, Row>();

  return {
    async execAsync() {},
    async runAsync(sql, ...params) {
      if (sql.includes('INSERT INTO assessments')) {
        const [id, paperJson, answersJson, resultJson, status, createdAt, updatedAt, submittedAt] = params as [
          string,
          string,
          string,
          string | null,
          string,
          string,
          string,
          string | null,
        ];
        assessmentRows.set(id, {
          id,
          paper_json: paperJson,
          answers_json: answersJson,
          result_json: resultJson ?? null,
          status,
          created_at: createdAt,
          updated_at: updatedAt,
          submitted_at: submittedAt ?? null,
        });
        return;
      }

      if (sql.includes('UPDATE assessments') && sql.includes('answers_json') && !sql.includes('result_json')) {
        const [answersJson, updatedAt, id] = params as [string, string, string];
        const row = assessmentRows.get(id);
        if (row) {
          row.answers_json = answersJson;
          row.updated_at = updatedAt;
        }
        return;
      }

      if (sql.includes('UPDATE assessments') && sql.includes('result_json')) {
        const [answersJson, resultJson, status, updatedAt, submittedAt, id] = params as [string, string, string, string, string, string];
        const row = assessmentRows.get(id);
        if (row) {
          row.answers_json = answersJson;
          row.result_json = resultJson;
          row.status = status;
          row.updated_at = updatedAt;
          row.submitted_at = submittedAt;
        }
      }
    },
    async getAllAsync() {
      return Array.from(assessmentRows.values()).sort((left, right) => {
        const statusOrder = (left.status === 'completed' ? 0 : 1) - (right.status === 'completed' ? 0 : 1);
        if (statusOrder !== 0) {
          return statusOrder;
        }

        return (right.submitted_at ?? right.updated_at).localeCompare(left.submitted_at ?? left.updated_at);
      }) as never[];
    },
    async getFirstAsync(sql, ...params) {
      if (sql.includes('FROM assessments WHERE id = ?')) {
        return (assessmentRows.get(params[0] as string) ?? null) as never;
      }

      return null;
    },
  };
}

describe('assessment repository', () => {
  it('creates a draft record as soon as a paper exists', async () => {
    const database = createMemoryDatabase();

    const record = await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T08:00:00.000Z',
      id: 'draft-1',
    });

    expect(record).toMatchObject({
      id: 'draft-1',
      paper: samplePaper,
      answers: {},
      result: null,
      status: 'draft',
      createdAt: '2026-07-13T08:00:00.000Z',
      updatedAt: '2026-07-13T08:00:00.000Z',
      submittedAt: null,
    });
  });

  it('updates answers on the existing draft record', async () => {
    const database = createMemoryDatabase();
    await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T08:00:00.000Z',
      id: 'draft-1',
    });

    const updated = await updateAssessmentAnswers({
      database,
      id: 'draft-1',
      answers: { q1: ['B'] },
      updatedAt: '2026-07-13T08:05:00.000Z',
    });

    expect(updated?.answers).toEqual({ q1: ['B'] });
    expect(updated?.updatedAt).toBe('2026-07-13T08:05:00.000Z');
    expect(updated?.status).toBe('draft');
  });

  it('completes the same record instead of creating a duplicate', async () => {
    const database = createMemoryDatabase();
    const answers = { q1: ['B'], q2: ['A'], q3: ['A'], q4: ['A', 'B', 'C'] };
    const result = scoreAssessment(samplePaper, {
      paperId: samplePaper.id,
      answers,
      submittedAt: '2026-07-13T08:10:00.000Z',
    });
    await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T08:00:00.000Z',
      id: 'draft-1',
    });

    const completed = await completeAssessment({
      database,
      id: 'draft-1',
      answers,
      result,
      submittedAt: '2026-07-13T08:10:00.000Z',
    });
    const records = await listAssessmentRecords(database);

    expect(completed?.status).toBe('completed');
    expect(completed?.result).toEqual(result);
    expect(completed?.submittedAt).toBe('2026-07-13T08:10:00.000Z');
    expect(records).toHaveLength(1);
  });

  it('lists records newest first by submitted or updated time', async () => {
    const database = createMemoryDatabase();
    await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T08:00:00.000Z',
      id: 'older',
    });
    await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T09:00:00.000Z',
      id: 'newer',
    });

    expect((await listAssessmentRecords(database)).map((record) => record.id)).toEqual(['newer', 'older']);
  });

  it('lists completed records before newer drafts', async () => {
    const database = createMemoryDatabase();
    const result = scoreAssessment(samplePaper, {
      paperId: samplePaper.id,
      answers: {},
      submittedAt: '2026-07-13T08:05:00.000Z',
    });
    await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T08:00:00.000Z',
      id: 'completed',
    });
    await completeAssessment({
      database,
      id: 'completed',
      answers: {},
      result,
      submittedAt: '2026-07-13T08:05:00.000Z',
    });
    await createAssessmentDraft({
      database,
      paper: samplePaper,
      createdAt: '2026-07-13T09:00:00.000Z',
      id: 'draft',
    });

    expect((await listAssessmentRecords(database)).map((record) => record.id)).toEqual(['completed', 'draft']);
  });

  it('imports a legacy completed history record into sqlite', async () => {
    const database = createMemoryDatabase();
    const result = scoreAssessment(samplePaper, {
      paperId: samplePaper.id,
      answers: { q1: ['B'] },
      submittedAt: '2026-07-13T08:10:00.000Z',
    });

    const imported = await importCompletedAssessmentRecord({
      database,
      id: 'legacy-1',
      paper: samplePaper,
      answers: { q1: ['B'] },
      result,
      submittedAt: '2026-07-13T08:10:00.000Z',
    });

    expect(imported).toMatchObject({
      id: 'legacy-1',
      status: 'completed',
      result,
      submittedAt: '2026-07-13T08:10:00.000Z',
    });
    expect(await listAssessmentRecords(database)).toHaveLength(1);
  });
});
