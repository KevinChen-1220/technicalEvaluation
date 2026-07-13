import { getAppDatabase, type AppDatabase } from '../../storage/database';
import type {
  AssessmentPaper,
  AssessmentRecordStatus,
  AssessmentResult,
  PersistedAssessmentRecord,
} from './types';

type AssessmentRow = {
  id: string;
  paper_json: string;
  answers_json: string;
  result_json: string | null;
  status: AssessmentRecordStatus;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
};

type RepositoryOptions = {
  database?: AppDatabase;
};

export async function ensureAssessmentSchema(database?: AppDatabase): Promise<void> {
  const db = database ?? (await getAppDatabase());
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY NOT NULL,
      paper_json TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      result_json TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      submitted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS assessments_status_time_idx
      ON assessments(status, submitted_at, updated_at);
  `);
}

export async function createAssessmentDraft({
  database,
  paper,
  createdAt = new Date().toISOString(),
  id = createAssessmentId(paper, createdAt),
}: RepositoryOptions & {
  paper: AssessmentPaper;
  createdAt?: string;
  id?: string;
}): Promise<PersistedAssessmentRecord> {
  const db = database ?? (await getAppDatabase());
  await ensureAssessmentSchema(db);
  await db.runAsync(
    `INSERT INTO assessments (
      id,
      paper_json,
      answers_json,
      result_json,
      status,
      created_at,
      updated_at,
      submitted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    JSON.stringify(paper),
    JSON.stringify({}),
    null,
    'draft',
    createdAt,
    createdAt,
    null,
  );

  const record = await getAssessmentRecord(id, db);
  if (!record) {
    throw new Error('Assessment draft could not be loaded after save.');
  }

  return record;
}

export async function updateAssessmentAnswers({
  database,
  id,
  answers,
  updatedAt = new Date().toISOString(),
}: RepositoryOptions & {
  id: string;
  answers: Record<string, string[]>;
  updatedAt?: string;
}): Promise<PersistedAssessmentRecord | null> {
  const db = database ?? (await getAppDatabase());
  await ensureAssessmentSchema(db);
  await db.runAsync(
    `UPDATE assessments
      SET answers_json = ?,
          updated_at = ?
      WHERE id = ?`,
    JSON.stringify(answers),
    updatedAt,
    id,
  );

  return getAssessmentRecord(id, db);
}

export async function completeAssessment({
  database,
  id,
  answers,
  result,
  submittedAt = new Date().toISOString(),
}: RepositoryOptions & {
  id: string;
  answers: Record<string, string[]>;
  result: AssessmentResult;
  submittedAt?: string;
}): Promise<PersistedAssessmentRecord | null> {
  const db = database ?? (await getAppDatabase());
  await ensureAssessmentSchema(db);
  await db.runAsync(
    `UPDATE assessments
      SET answers_json = ?,
          result_json = ?,
          status = ?,
          updated_at = ?,
          submitted_at = ?
      WHERE id = ?`,
    JSON.stringify(answers),
    JSON.stringify(result),
    'completed',
    submittedAt,
    submittedAt,
    id,
  );

  return getAssessmentRecord(id, db);
}

export async function listAssessmentRecords(database?: AppDatabase): Promise<PersistedAssessmentRecord[]> {
  const db = database ?? (await getAppDatabase());
  await ensureAssessmentSchema(db);
  const rows = await db.getAllAsync<AssessmentRow>(
    `SELECT *
      FROM assessments
      ORDER BY
        CASE status WHEN 'completed' THEN 0 ELSE 1 END ASC,
        COALESCE(submitted_at, updated_at) DESC`,
  );

  return rows.map(rowToRecord).filter((record): record is PersistedAssessmentRecord => record !== null);
}

export async function getAssessmentRecord(
  id: string,
  database?: AppDatabase,
): Promise<PersistedAssessmentRecord | null> {
  const db = database ?? (await getAppDatabase());
  await ensureAssessmentSchema(db);
  const row = await db.getFirstAsync<AssessmentRow>('SELECT * FROM assessments WHERE id = ?', id);
  return row ? rowToRecord(row) : null;
}

function rowToRecord(row: AssessmentRow): PersistedAssessmentRecord | null {
  try {
    return {
      id: row.id,
      paper: JSON.parse(row.paper_json) as AssessmentPaper,
      answers: JSON.parse(row.answers_json) as Record<string, string[]>,
      result: row.result_json ? (JSON.parse(row.result_json) as AssessmentResult) : null,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      submittedAt: row.submitted_at,
    };
  } catch {
    return null;
  }
}

function createAssessmentId(paper: AssessmentPaper, createdAt: string): string {
  return `${paper.id}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;
}
