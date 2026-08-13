import { jsonrepair } from 'jsonrepair';
import {
  ASSESSMENT_QUESTION_COUNT,
  validateAssessmentPaper,
  validateAssessmentQuestions,
  type AssessmentPaper,
  type AssessmentQuestion,
  type ScoringLevel,
} from '@dynamic-assessment/assessment-core';
import { ApiError } from '../http/errors';

export function parseAssessment(
  raw: string,
  input: { assessmentId: string; topic: string; generatedAt: string },
): AssessmentPaper {
  if (typeof raw !== 'string' || raw.trim().length === 0) throw invalidModelResponse();
  try {
    const { candidate, external } = extractJsonObject(raw);
    if (containsMarkup(external)) throw invalidModelResponse();
    const parsed: unknown = JSON.parse(jsonrepair(candidate));
    if (!isRecord(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length !== ASSESSMENT_QUESTION_COUNT) {
      throw invalidModelResponse();
    }
    const questions = parsed.questions.map((question, index) => canonicalQuestion(question, index));
    const paper = {
      id: input.assessmentId,
      topic: input.topic,
      questionCount: ASSESSMENT_QUESTION_COUNT,
      generatedAt: input.generatedAt,
      scoring: canonicalScoring(parsed.scoring),
      questions,
    };
    const validation = validateAssessmentPaper(paper);
    if (!validation.ok || validation.paper.questionCount !== ASSESSMENT_QUESTION_COUNT) throw invalidModelResponse();
    return validation.paper;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidModelResponse();
  }
}

export type ParsedAssessmentBatch = {
  questions: AssessmentQuestion[];
  scoring?: { maxScore: number; levels: ScoringLevel[] };
};

export function parseAssessmentBatch(raw: string, includeScoring: boolean): ParsedAssessmentBatch {
  if (typeof raw !== 'string' || raw.trim().length === 0) throw invalidModelResponse();
  try {
    const { candidate, external } = extractJsonObject(raw);
    if (containsMarkup(external)) throw invalidModelResponse();
    const parsed: unknown = JSON.parse(jsonrepair(candidate));
    if (!isRecord(parsed)) throw invalidModelResponse();
    const questionValidation = validateAssessmentQuestions(parsed.questions);
    if (!questionValidation.ok || questionValidation.questions.length !== 10) throw invalidModelResponse();
    if (!includeScoring) return { questions: questionValidation.questions };
    return { questions: questionValidation.questions, scoring: canonicalScoring(parsed.scoring) as { maxScore: number; levels: ScoringLevel[] } };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw invalidModelResponse();
  }
}

function canonicalQuestion(value: unknown, index: number): unknown {
  if (!isRecord(value)) return value;
  const question: Record<string, unknown> = {
    id: `q${index + 1}`,
    type: value.type,
    difficulty: value.difficulty,
    knowledgePoint: value.knowledgePoint,
    prompt: value.prompt,
    options: Array.isArray(value.options) ? value.options.map(canonicalOption) : value.options,
    correctOptionIds: value.correctOptionIds,
    explanation: value.explanation,
  };
  if (Object.prototype.hasOwnProperty.call(value, 'materials')) question.materials = canonicalMaterials(value.materials);
  return question;
}

function canonicalOption(value: unknown): unknown {
  return isRecord(value) ? { id: value.id, text: value.text } : value;
}

function canonicalMaterials(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((material) => {
    if (!isRecord(material)) return material;
    if (material.type === 'text') return { type: material.type, text: material.text };
    if (material.type === 'image') return compact({
      type: material.type, uri: material.uri, alt: material.alt,
      caption: material.caption, aspectRatio: material.aspectRatio,
    });
    if (material.type === 'table') return compact({
      type: material.type, caption: material.caption, columns: material.columns, rows: material.rows,
    });
    if (material.type === 'bar_chart') return compact({
      type: material.type, title: material.title, unit: material.unit,
      items: Array.isArray(material.items) ? material.items.map((item) => (
        isRecord(item) ? compact({ label: item.label, value: item.value, displayValue: item.displayValue }) : item
      )) : material.items,
    });
    return { type: material.type };
  });
}

function canonicalScoring(value: unknown): unknown {
  if (!isRecord(value) || !isFiniteNumber(value.maxScore) || value.maxScore <= 0 || !Array.isArray(value.levels)) {
    throw invalidModelResponse();
  }
  const levels = value.levels.map((level) => {
    if (!isRecord(level)
      || !isFiniteNumber(level.minPercent)
      || !isFiniteNumber(level.maxPercent)
      || typeof level.title !== 'string'
      || level.title.trim().length === 0
      || typeof level.summary !== 'string'
      || level.summary.trim().length === 0) {
      throw invalidModelResponse();
    }
    return {
      minPercent: level.minPercent,
      maxPercent: level.maxPercent,
      title: level.title,
      summary: level.summary,
    };
  });
  return { maxScore: value.maxScore, levels };
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function extractJsonObject(raw: string): { candidate: string; external: string } {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(raw);
  const source = fenced?.[1] ?? raw;
  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) throw invalidModelResponse();
  const outsideFence = fenced === null
    ? ''
    : `${raw.slice(0, fenced.index)}${raw.slice(fenced.index + fenced[0].length)}`;
  return {
    candidate: source.slice(firstBrace, lastBrace + 1),
    external: `${outsideFence}${source.slice(0, firstBrace)}${source.slice(lastBrace + 1)}`,
  };
}

function containsMarkup(value: string): boolean {
  return /(?:<!doctype\s+html|<\?xml\b|<\/?[a-z][^>]*>)/i.test(value);
}

function invalidModelResponse(): ApiError {
  return new ApiError('INVALID_MODEL_RESPONSE', 502, true);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
