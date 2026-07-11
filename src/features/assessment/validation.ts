import type { AssessmentPaper, AssessmentQuestion, QuestionDifficulty, QuestionType, ScoringLevel } from './types';

const supportedTypes = new Set<QuestionType>(['single_choice', 'multiple_choice', 'true_false']);
const supportedDifficulties = new Set<QuestionDifficulty>(['easy', 'medium', 'hard']);

export type ValidationResult =
  | { ok: true; errors: []; paper: AssessmentPaper }
  | { ok: false; errors: string[]; paper?: never };

export function validateAssessmentPaper(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ['Assessment paper must be a JSON object.'] };
  }

  const paper = input as AssessmentPaper;

  if (paper.questionCount !== 50 && paper.questionCount !== 100) {
    errors.push('Question count must be 50 or 100.');
  }

  if (!Array.isArray(paper.questions)) {
    errors.push('Questions must be an array.');
  } else if ((paper.questionCount === 50 || paper.questionCount === 100) && paper.questions.length !== paper.questionCount) {
    errors.push(`Expected ${paper.questionCount} questions but received ${paper.questions.length}.`);
  }

  if (!isRecord(paper.scoring) || !Array.isArray(paper.scoring.levels)) {
    errors.push('Scoring levels are required.');
  } else if (!levelsCoverFullRange(paper.scoring.levels)) {
    errors.push('Scoring levels must cover 0 through 100 percent without gaps.');
  }

  if (Array.isArray(paper.questions)) {
    for (const question of paper.questions) {
      validateQuestion(question, errors);
    }
  }

  return errors.length === 0 ? { ok: true, errors: [], paper } : { ok: false, errors };
}

function validateQuestion(question: AssessmentQuestion, errors: string[]): void {
  const label = question?.id || 'unknown';
  const optionIds = new Set(Array.isArray(question.options) ? question.options.map((option) => option.id) : []);

  if (!supportedTypes.has(question.type)) {
    errors.push(`Question ${label} has unsupported type ${String(question.type)}.`);
  }

  if (!supportedDifficulties.has(question.difficulty)) {
    errors.push(`Question ${label} has unsupported difficulty ${String(question.difficulty)}.`);
  }

  if (!Array.isArray(question.options) || question.options.length < 2) {
    errors.push(`Question ${label} must have at least two options.`);
  }

  if (!Array.isArray(question.correctOptionIds)) {
    errors.push(`Question ${label} correctOptionIds must be an array.`);
  } else {
    for (const optionId of question.correctOptionIds) {
      if (!optionIds.has(optionId)) {
        errors.push(`Question ${label} correct option ${optionId} does not exist in options.`);
      }
    }
  }

  if ((question.type === 'single_choice' || question.type === 'true_false') && question.correctOptionIds?.length !== 1) {
    errors.push(`Question ${label} ${question.type} questions must have exactly one correct option.`);
  }

  if (question.type === 'multiple_choice' && (!question.correctOptionIds || question.correctOptionIds.length < 1)) {
    errors.push(`Question ${label} multiple_choice questions must have at least one correct option.`);
  }

  if (!question.explanation?.trim()) {
    errors.push(`Question ${label} explanation is required.`);
  }
}

function levelsCoverFullRange(levels: ScoringLevel[]): boolean {
  if (levels.length === 0) return false;

  const sorted = [...levels].sort((left, right) => left.minPercent - right.minPercent);
  let expectedMin = 0;

  for (const level of sorted) {
    if (level.minPercent !== expectedMin || level.maxPercent < level.minPercent) {
      return false;
    }
    expectedMin = level.maxPercent + 1;
  }

  return sorted[sorted.length - 1]?.maxPercent === 100;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
