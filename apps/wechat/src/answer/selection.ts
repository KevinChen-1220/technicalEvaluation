import type { AssessmentQuestion } from '@dynamic-assessment/assessment-core';

export function selectOption(
  question: Pick<AssessmentQuestion, 'type'>,
  selectedOptionIds: string[],
  optionId: string,
): string[] {
  if (question.type !== 'multiple_choice') return [optionId];
  return selectedOptionIds.includes(optionId)
    ? selectedOptionIds.filter((selectedId) => selectedId !== optionId)
    : [...selectedOptionIds, optionId];
}
