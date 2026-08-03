import type { AssessmentOption, AssessmentPaper, AssessmentQuestion, AssessmentResult } from './types';

export type ReviewOptionState = 'neutral' | 'correct' | 'selected_wrong';

export type WrongQuestionReviewOption = AssessmentOption & {
  isCorrect: boolean;
  isSelected: boolean;
  state: ReviewOptionState;
};

export type WrongQuestionReviewItem = {
  question: AssessmentQuestion;
  questionNumber: number;
  options: WrongQuestionReviewOption[];
  userOptionIds: string[];
  correctOptionIds: string[];
  wasUnanswered: boolean;
};

export const wrongQuestionReviewBatchSize = 10;

export function getWrongQuestionPageRange(
  requestedPage: number,
  total: number,
  batchSize = wrongQuestionReviewBatchSize,
): { page: number; start: number; end: number; pageCount: number } {
  const pageCount = Math.max(1, Math.ceil(total / batchSize));
  const page = Math.min(Math.max(0, requestedPage), pageCount - 1);
  const start = page * batchSize;
  return { page, start, end: Math.min(total, start + batchSize), pageCount };
}

export function buildWrongQuestionReviews(
  paper: AssessmentPaper,
  answers: Record<string, string[]>,
  result: AssessmentResult,
): WrongQuestionReviewItem[] {
  const wrongQuestionIds = new Set(result.wrongQuestionIds);

  return paper.questions.flatMap((question, index) => {
    if (!wrongQuestionIds.has(question.id)) return [];

    const userOptionIds = answers[question.id] ?? [];
    const selectedOptionIds = new Set(userOptionIds);
    const correctOptionIds = new Set(question.correctOptionIds);
    const options = question.options.map((option): WrongQuestionReviewOption => {
      const isCorrect = correctOptionIds.has(option.id);
      const isSelected = selectedOptionIds.has(option.id);
      return {
        ...option,
        isCorrect,
        isSelected,
        state: isCorrect ? 'correct' : isSelected ? 'selected_wrong' : 'neutral',
      };
    });

    return [{
      question,
      questionNumber: index + 1,
      options,
      userOptionIds,
      correctOptionIds: question.correctOptionIds,
      wasUnanswered: userOptionIds.length === 0,
    }];
  });
}
