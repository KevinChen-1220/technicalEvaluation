import { jsonrepair } from 'jsonrepair';
import { ASSESSMENT_QUESTION_COUNT, validateAssessmentPaper, type AssessmentPaper } from '@dynamic-assessment/assessment-core';
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
    const questions = parsed.questions.map((question, index) => (
      isRecord(question) ? { ...question, id: `q${index + 1}` } : question
    ));
    const paper = {
      id: input.assessmentId,
      topic: input.topic,
      questionCount: ASSESSMENT_QUESTION_COUNT,
      generatedAt: input.generatedAt,
      scoring: parsed.scoring,
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
