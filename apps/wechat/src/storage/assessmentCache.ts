import type { AnswerableAssessmentPaper } from '@dynamic-assessment/assessment-core';

const ASSESSMENT_KEY_PREFIX = 'assessment:v1:';
const PENDING_KEY = 'assessment-pending:v1';

export type CachedAssessment = {
  id: string;
  paper: AnswerableAssessmentPaper;
  answers: Record<string, string[]>;
  status: 'draft' | 'completed';
  revision: number;
};

export type PendingAssessmentUpdate = {
  id: string;
  version?: number;
  assessmentId: string;
  answers: Record<string, string[]>;
  expectedRevision: number;
  changedQuestionIds: string[];
};

export type StoragePort = {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
};

export type AssessmentCache = ReturnType<typeof createAssessmentCache>;

export function createAssessmentCache(storage: StoragePort) {
  return {
    getAssessment(assessmentId: string): CachedAssessment | undefined {
      return storage.get<CachedAssessment>(`${ASSESSMENT_KEY_PREFIX}${assessmentId}`);
    },
    saveAssessment(assessment: CachedAssessment): void {
      storage.set(`${ASSESSMENT_KEY_PREFIX}${assessment.id}`, assessment);
    },
    getPendingUpdates(): PendingAssessmentUpdate[] {
      return storage.get<PendingAssessmentUpdate[]>(PENDING_KEY) ?? [];
    },
    savePendingUpdates(updates: PendingAssessmentUpdate[]): void {
      storage.set(PENDING_KEY, updates);
    },
  };
}
