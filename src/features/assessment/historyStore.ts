import type { AssessmentHistoryRecord, AssessmentPaper, AssessmentResult } from './types';

const historyKey = 'skill_scope_assessment_history';

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
    return Array.isArray(parsed) ? parsed : [];
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
