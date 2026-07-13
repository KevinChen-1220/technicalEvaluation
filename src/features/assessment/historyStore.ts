import type { AssessmentHistoryRecord, AssessmentPaper, AssessmentResult } from './types';

const historyKey = 'skill_scope_assessment_history';
const memoryHistoryStorage = new Map<string, string>();

export type HistoryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function createHistoryRecord(
  paper: AssessmentPaper,
  answers: Record<string, string[]>,
  result: AssessmentResult,
  submittedAt = new Date().toISOString(),
): AssessmentHistoryRecord {
  return {
    id: `${paper.id}-${submittedAt}-${Math.random().toString(36).slice(2, 8)}`,
    paper,
    answers,
    result,
    submittedAt,
  };
}

export async function loadAssessmentHistory(
  storage: HistoryStorage = defaultHistoryStorage,
): Promise<AssessmentHistoryRecord[]> {
  try {
    const raw = await storage.getItem(historyKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isAssessmentHistoryRecord) : [];
  } catch {
    return [];
  }
}

export async function saveAssessmentHistoryRecord(
  record: AssessmentHistoryRecord,
  storage: HistoryStorage = defaultHistoryStorage,
): Promise<AssessmentHistoryRecord[]> {
  const current = await loadAssessmentHistory(storage);
  const next = [record, ...current].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));

  await storage.setItem(historyKey, JSON.stringify(next));

  return next;
}

const defaultHistoryStorage: HistoryStorage = {
  async getItem(key) {
    if (typeof globalThis.localStorage === 'undefined') {
      return memoryHistoryStorage.get(key) ?? null;
    }

    return globalThis.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(key, value);
      return;
    }

    memoryHistoryStorage.set(key, value);
  },
};

function isAssessmentHistoryRecord(value: unknown): value is AssessmentHistoryRecord {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AssessmentHistoryRecord>;

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
