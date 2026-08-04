import type {
  AssessmentCache,
  CachedAssessment,
  CachedCompletedAssessment,
} from '../storage/assessmentCache';

export type CompleteAssessmentInput = {
  assessmentId: string;
  answers: Record<string, string[]>;
  expectedRevision: number;
};

export type CompleteAssessmentResponse =
  | { type: 'completed'; assessment: CachedCompletedAssessment }
  | { type: 'conflict'; current: CachedAssessment }
  | { type: 'not_found'; errorCode: 'INVALID_REQUEST' }
  | { type: 'invalid'; errorCode: 'INVALID_REQUEST' };

export type CompletionValidation =
  | { complete: true; remainingCount: 0; message: null }
  | { complete: false; remainingCount: number; message: string };

export function validateAssessmentCompletion(assessment: CachedAssessment): CompletionValidation {
  const remainingCount = assessment.paper.questions
    .filter((question) => (assessment.answers[question.id]?.length ?? 0) === 0)
    .length;
  if (remainingCount === 0) {
    return { complete: true, remainingCount: 0, message: null };
  }
  return {
    complete: false,
    remainingCount,
    message: `还有 ${remainingCount} 题未作答`,
  };
}

export async function completeAssessmentSubmission(dependencies: {
  assessmentId: string;
  cache: AssessmentCache;
  flushPending(): Promise<void>;
  completeAssessment(input: CompleteAssessmentInput): Promise<CompleteAssessmentResponse>;
}): Promise<
  | CompleteAssessmentResponse
  | { type: 'missing_cache'; message: string }
  | { type: 'incomplete'; remainingCount: number; message: string }
  | { type: 'pending_not_flushed'; message: string }
> {
  const initial = dependencies.cache.getAssessment(dependencies.assessmentId);
  if (initial === undefined) return { type: 'missing_cache', message: '试卷暂时无法打开' };

  const initialValidation = validateAssessmentCompletion(initial);
  if (!initialValidation.complete) {
    return { type: 'incomplete', remainingCount: initialValidation.remainingCount, message: initialValidation.message };
  }

  await dependencies.flushPending();
  if (dependencies.cache.getPendingUpdates().some((pending) => pending.assessmentId === dependencies.assessmentId)) {
    return { type: 'pending_not_flushed', message: '答案仍在同步中，请稍后再提交' };
  }

  const latest = dependencies.cache.getAssessment(dependencies.assessmentId) ?? initial;
  const latestValidation = validateAssessmentCompletion(latest);
  if (!latestValidation.complete) {
    return { type: 'incomplete', remainingCount: latestValidation.remainingCount, message: latestValidation.message };
  }

  const result = await dependencies.completeAssessment({
    assessmentId: latest.id,
    answers: latest.answers,
    expectedRevision: latest.revision,
  });
  if (result.type === 'completed') {
    dependencies.cache.saveAssessment(result.assessment);
    dependencies.cache.removePendingForAssessment(latest.id);
  } else if (result.type === 'conflict') {
    dependencies.cache.saveAssessment(result.current);
  }
  return result;
}
