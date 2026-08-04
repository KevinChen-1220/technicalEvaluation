import type {
  AnswerableAssessmentPaper,
  AssessmentPaper,
  AssessmentResult,
} from '@dynamic-assessment/assessment-core';

const ASSESSMENT_KEY_PREFIX = 'assessment:v1:';
const ASSESSMENT_INDEX_KEY = 'assessment-index:v1';
const PENDING_KEY = 'assessment-pending:v1';

type CachedAssessmentBase = {
  id: string;
  answers: Record<string, string[]>;
  revision: number;
  createdAt: string;
  updatedAt: string;
};

export type CachedDraftAssessment = CachedAssessmentBase & {
  paper: AnswerableAssessmentPaper;
  status: 'draft';
  completedAt: null;
  result: null;
};

export type CachedCompletedAssessment = CachedAssessmentBase & {
  paper: AssessmentPaper;
  status: 'completed';
  completedAt: string;
  result: AssessmentResult;
};

export type CachedAssessment = CachedDraftAssessment | CachedCompletedAssessment;

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
      const index = storage.get<string[]>(ASSESSMENT_INDEX_KEY) ?? [];
      if (!index.includes(assessment.id)) {
        storage.set(ASSESSMENT_INDEX_KEY, [assessment.id, ...index]);
      }
    },
    listAssessments(): CachedAssessment[] {
      const index = storage.get<string[]>(ASSESSMENT_INDEX_KEY) ?? [];
      return index
        .map((id) => storage.get<CachedAssessment>(`${ASSESSMENT_KEY_PREFIX}${id}`))
        .filter((assessment): assessment is CachedAssessment => assessment !== undefined);
    },
    saveAssessments(assessments: CachedAssessment[]): void {
      for (const assessment of assessments) {
        storage.set(`${ASSESSMENT_KEY_PREFIX}${assessment.id}`, assessment);
      }
      const existing = storage.get<string[]>(ASSESSMENT_INDEX_KEY) ?? [];
      const incoming = assessments.map((assessment) => assessment.id);
      storage.set(ASSESSMENT_INDEX_KEY, [...incoming, ...existing.filter((id) => !incoming.includes(id))]);
    },
    getPendingUpdates(): PendingAssessmentUpdate[] {
      return storage.get<PendingAssessmentUpdate[]>(PENDING_KEY) ?? [];
    },
    savePendingUpdates(updates: PendingAssessmentUpdate[]): void {
      storage.set(PENDING_KEY, updates);
    },
    removePendingForAssessment(assessmentId: string): void {
      storage.set(
        PENDING_KEY,
        (storage.get<PendingAssessmentUpdate[]>(PENDING_KEY) ?? [])
          .filter((update) => update.assessmentId !== assessmentId),
      );
    },
  };
}
