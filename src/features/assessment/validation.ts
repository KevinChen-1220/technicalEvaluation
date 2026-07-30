import type { AssessmentPaper, AssessmentQuestion, QuestionDifficulty, QuestionType, ScoringLevel } from './types';

const supportedTypes = new Set<QuestionType>(['single_choice', 'multiple_choice', 'true_false']);
const supportedDifficulties = new Set<QuestionDifficulty>(['easy', 'medium', 'hard']);
const minimumImageAspectRatio = 0.25;
const maximumImageAspectRatio = 4;

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

  if (!question.prompt?.trim()) {
    errors.push(`Question ${label} prompt is required.`);
  }

  if (!supportedTypes.has(question.type)) {
    errors.push(`Question ${label} has unsupported type ${String(question.type)}.`);
  }

  if (!supportedDifficulties.has(question.difficulty)) {
    errors.push(`Question ${label} has unsupported difficulty ${String(question.difficulty)}.`);
  }

  if (!question.knowledgePoint?.trim()) {
    errors.push(`Question ${label} knowledgePoint is required.`);
  }

  if (!Array.isArray(question.options) || question.options.length < 2) {
    errors.push(`Question ${label} must have at least two options.`);
  } else {
    for (const option of question.options) {
      if (!option.text?.trim()) {
        errors.push(`Question ${label} option ${option.id || 'unknown'} text is required.`);
      }
    }
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

  if (Object.prototype.hasOwnProperty.call(question, 'materials')) {
    validateQuestionMaterials(question.materials, label, errors);
  }
}

function validateQuestionMaterials(materials: unknown, label: string, errors: string[]): void {
  if (!Array.isArray(materials)) {
    errors.push(`Question ${label} materials must be an array.`);
    return;
  }

  for (const [index, material] of materials.entries()) {
    const materialLabel = `Question ${label} material ${index + 1}`;

    if (!isRecord(material)) {
      errors.push(`${materialLabel} must be a JSON object.`);
      continue;
    }

    switch (material.type) {
      case 'text':
        if (!isNonEmptyString(material.text)) {
          errors.push(`${materialLabel} text is required.`);
        }
        break;
      case 'image':
        validateImageMaterial(material, materialLabel, errors);
        break;
      case 'table':
        validateTableMaterial(material, materialLabel, errors);
        break;
      case 'bar_chart':
        validateBarChartMaterial(material, materialLabel, errors);
        break;
      default:
        errors.push(`${materialLabel} has unsupported type ${String(material.type)}.`);
    }
  }
}

function validateImageMaterial(material: Record<string, unknown>, label: string, errors: string[]): void {
  if (!isHttpsUri(material.uri)) {
    errors.push(`${label} image uri must be a valid HTTPS URL.`);
  }

  if (!isNonEmptyString(material.alt)) {
    errors.push(`${label} image alt is required.`);
  }

  if (material.caption !== undefined && !isNonEmptyString(material.caption)) {
    errors.push(`${label} image caption must be non-empty when provided.`);
  }

  if (
    material.aspectRatio !== undefined
    && (typeof material.aspectRatio !== 'number'
      || !Number.isFinite(material.aspectRatio)
      || material.aspectRatio < minimumImageAspectRatio
      || material.aspectRatio > maximumImageAspectRatio)
  ) {
    errors.push(`${label} image aspectRatio must be between ${minimumImageAspectRatio} and ${maximumImageAspectRatio}.`);
  }
}

function validateTableMaterial(material: Record<string, unknown>, label: string, errors: string[]): void {
  if (!isNonEmptyString(material.caption)) {
    errors.push(`${label} table caption is required.`);
  }

  if (!Array.isArray(material.columns) || material.columns.length === 0) {
    errors.push(`${label} table must have at least one column.`);
  } else {
    material.columns.forEach((column, index) => {
      if (!isNonEmptyString(column)) {
        errors.push(`${label} table column ${index + 1} text is required.`);
      }
    });
  }

  if (!Array.isArray(material.rows) || material.rows.length === 0) {
    errors.push(`${label} table must have at least one row.`);
    return;
  }

  material.rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row)) {
      errors.push(`${label} table row ${rowIndex + 1} must be an array.`);
      return;
    }

    if (Array.isArray(material.columns) && row.length !== material.columns.length) {
      errors.push(`${label} table row ${rowIndex + 1} must have ${material.columns.length} cells.`);
    }

    row.forEach((cell, cellIndex) => {
      if (!isNonEmptyString(cell)) {
        errors.push(`${label} table row ${rowIndex + 1} cell ${cellIndex + 1} text is required.`);
      }
    });
  });
}

function validateBarChartMaterial(material: Record<string, unknown>, label: string, errors: string[]): void {
  if (!isNonEmptyString(material.title)) {
    errors.push(`${label} bar_chart title is required.`);
  }

  if (!isNonEmptyString(material.unit)) {
    errors.push(`${label} bar_chart unit is required.`);
  }

  if (!Array.isArray(material.items) || material.items.length < 2) {
    errors.push(`${label} bar_chart must have at least two items.`);
    return;
  }

  material.items.forEach((item, index) => {
    const itemLabel = `${label} bar_chart item ${index + 1}`;

    if (!isRecord(item)) {
      errors.push(`${itemLabel} must be a JSON object.`);
      return;
    }

    if (!isNonEmptyString(item.label)) {
      errors.push(`${itemLabel} label is required.`);
    }

    if (typeof item.value !== 'number' || !Number.isFinite(item.value) || item.value < 0) {
      errors.push(`${itemLabel} value must be greater than or equal to 0.`);
    }

    if (item.displayValue !== undefined && !isNonEmptyString(item.displayValue)) {
      errors.push(`${itemLabel} displayValue must be non-empty when provided.`);
    }
  });
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

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isHttpsUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
