import type { AssessmentPaper } from './types';

export function findFirstUnansweredQuestionIndex(
  paper: AssessmentPaper,
  answers: Record<string, string[]>,
): number {
  const index = paper.questions.findIndex((question) => (answers[question.id]?.length ?? 0) === 0);
  return index >= 0 ? index : 0;
}
