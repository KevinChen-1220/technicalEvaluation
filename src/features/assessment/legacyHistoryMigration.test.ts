import type { AppDatabase, DatabaseValue } from '../../storage/database';
import { scoreAssessment } from './scoring';
import { samplePaper } from './samplePaper';
import { listAssessmentRecords } from './assessmentRepository';
import { migrateLegacyAssessmentHistory, type HistoryStorage } from './legacyHistoryMigration';

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
  const rows = new Map<string, Row>();

  return {
    async execAsync() {},
    async runAsync(sql: string, ...params: DatabaseValue[]) {
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
        rows.set(id, {
          id,
          paper_json: paperJson,
          answers_json: answersJson,
          result_json: resultJson,
          status,
          created_at: createdAt,
          updated_at: updatedAt,
          submitted_at: submittedAt,
        });
      }
    },
    async getAllAsync<T>() {
      return Array.from(rows.values()) as T[];
    },
    async getFirstAsync<T>(sql: string, ...params: DatabaseValue[]) {
      if (sql.includes('FROM assessments WHERE id = ?')) {
        return (rows.get(params[0] as string) ?? null) as T | null;
      }

      return null;
    },
  };
}

function createMemoryStorage(initial: Record<string, string>): HistoryStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));

  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
}

describe('legacy history migration', () => {
  it('imports old local history records into sqlite once', async () => {
    const database = createMemoryDatabase();
    const result = scoreAssessment(samplePaper, {
      paperId: samplePaper.id,
      answers: { q1: ['B'] },
      submittedAt: '2026-07-13T08:10:00.000Z',
    });
    const storage = createMemoryStorage({
      skill_scope_assessment_history: JSON.stringify([
        {
          id: 'legacy-1',
          paper: samplePaper,
          answers: { q1: ['B'] },
          result,
          submittedAt: '2026-07-13T08:10:00.000Z',
        },
      ]),
    });

    await expect(migrateLegacyAssessmentHistory({ database, storage })).resolves.toBe(1);
    await expect(migrateLegacyAssessmentHistory({ database, storage })).resolves.toBe(0);

    const records = await listAssessmentRecords(database);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      id: 'legacy-1',
      status: 'completed',
      result,
    });
    expect(storage.values.get('skill_scope_history_migrated_to_sqlite')).toBe('true');
  });
});
