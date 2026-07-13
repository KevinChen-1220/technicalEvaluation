import type { AppDatabase } from '../../storage/database';
import { importCompletedAssessmentRecord } from './assessmentRepository';
import type { AssessmentPaper, AssessmentResult } from './types';

const historyKey = 'skill_scope_assessment_history';
const migrationKey = 'skill_scope_history_migrated_to_sqlite';

export type HistoryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type LegacyHistoryRecord = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult;
  submittedAt: string;
};

export async function migrateLegacyAssessmentHistory({
  database,
  storage = defaultHistoryStorage,
}: {
  database?: AppDatabase;
  storage?: HistoryStorage;
} = {}): Promise<number> {
  if ((await storage.getItem(migrationKey)) === 'true') {
    return 0;
  }

  const records = await loadLegacyHistory(storage);
  let imported = 0;
  for (const record of records) {
    await importCompletedAssessmentRecord({
      ...(database ? { database } : {}),
      ...record,
    });
    imported += 1;
  }

  await storage.setItem(migrationKey, 'true');
  return imported;
}

async function loadLegacyHistory(storage: HistoryStorage): Promise<LegacyHistoryRecord[]> {
  try {
    const raw = await storage.getItem(historyKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLegacyHistoryRecord) : [];
  } catch {
    return [];
  }
}

function isLegacyHistoryRecord(value: unknown): value is LegacyHistoryRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<LegacyHistoryRecord>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.submittedAt === 'string' &&
    !!candidate.paper &&
    typeof candidate.paper === 'object' &&
    typeof candidate.paper.id === 'string' &&
    Array.isArray(candidate.paper.questions) &&
    !!candidate.result &&
    typeof candidate.result === 'object' &&
    typeof candidate.result.score === 'number' &&
    typeof candidate.result.accuracy === 'number' &&
    Array.isArray(candidate.result.questionResults) &&
    Array.isArray(candidate.result.knowledgePointResults) &&
    Array.isArray(candidate.result.wrongQuestionIds) &&
    !!candidate.answers &&
    typeof candidate.answers === 'object' &&
    !Array.isArray(candidate.answers)
  );
}

const defaultHistoryStorage: HistoryStorage = {
  async getItem(key) {
    if (typeof globalThis.localStorage === 'undefined') {
      return null;
    }

    return globalThis.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(key, value);
    }
  },
};
