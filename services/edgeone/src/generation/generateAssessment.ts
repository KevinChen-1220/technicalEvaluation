import { ASSESSMENT_QUESTION_COUNT, validateAssessmentPaper, type AssessmentPaper, type AssessmentQuestion } from '@dynamic-assessment/assessment-core';
import type { AssessmentRecord } from '../storage/assessmentRepository';
import type { CompletionInput } from './openAIClient';
import { parseAssessmentBatch } from './parseAssessment';
import type { Deadline } from '../http/deadline';
import { assertWithinDeadline, withinDeadline } from '../http/deadline';
import { ApiError } from '../http/errors';

const batchSize = 10;
const totalBatches = ASSESSMENT_QUESTION_COUNT / batchSize;
const maxBatchAttempts = 2;

export type GenerateAssessmentInput = {
  topic: string;
  notes?: string;
  ownerKey: string;
  openId: string;
  assessmentId: string;
};

export interface GenerateAssessmentDependencies {
  complete(input: CompletionInput, deadline?: Deadline): Promise<string>;
  checkText(content: string, openId: string, deadline?: Deadline): Promise<void>;
  createIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord>;
  now(): Date;
}

export async function generateFiftyQuestionAssessment(
  input: GenerateAssessmentInput,
  dependencies: GenerateAssessmentDependencies,
  deadline?: Deadline,
): Promise<AssessmentRecord> {
  if (deadline !== undefined) assertWithinDeadline(deadline);
  await dependencies.checkText(JSON.stringify({
    topic: input.topic,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  }), input.openId, deadline);
  if (deadline !== undefined) assertWithinDeadline(deadline);
  const generatedAt = dependencies.now().toISOString();
  const questions: AssessmentQuestion[] = [];
  let scoring: AssessmentPaper['scoring'] | undefined;
  for (let batchNumber = 0; batchNumber < totalBatches; batchNumber += 1) {
    const includeScoring = batchNumber === 0;
    const batch = await generateBatchWithRetry({
      topic: input.topic,
      ...(input.notes === undefined ? {} : { notes: input.notes }),
      questionCount: batchSize,
      batchNumber,
      totalBatches,
      includeScoring,
    }, includeScoring, dependencies, deadline);
    questions.push(...batch.questions);
    if (batch.scoring !== undefined) scoring = batch.scoring;
  }
  if (scoring === undefined) throw invalidModelResponse();
  const paper = {
    id: input.assessmentId,
    topic: input.topic,
    questionCount: ASSESSMENT_QUESTION_COUNT,
    generatedAt,
    scoring,
    questions: questions.map((question, index) => ({ ...question, id: `q${index + 1}` })),
  };
  const validation = validateAssessmentPaper(paper);
  if (!validation.ok || validation.paper.questionCount !== ASSESSMENT_QUESTION_COUNT) throw invalidModelResponse();
  await dependencies.checkText(moderationText(paper), input.openId, deadline);
  if (deadline !== undefined) assertWithinDeadline(deadline);
  const persistence = dependencies.createIfAbsent({
    id: input.assessmentId,
    ownerKey: input.ownerKey,
    revision: 1,
    status: 'draft',
    paper: validation.paper,
    answers: {},
    result: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    submittedAt: null,
  });
  return deadline === undefined ? await persistence : await withinDeadline(persistence, deadline);
}

async function generateBatchWithRetry(
  completionInput: CompletionInput,
  includeScoring: boolean,
  dependencies: GenerateAssessmentDependencies,
  deadline?: Deadline,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxBatchAttempts; attempt += 1) {
    try {
      const raw = await dependencies.complete(completionInput, deadline);
      if (deadline !== undefined) assertWithinDeadline(deadline);
      return parseAssessmentBatch(raw, includeScoring);
    } catch (error) {
      lastError = error;
      if (!isRetryableBatchError(error) || attempt === maxBatchAttempts) break;
      if (deadline !== undefined) assertWithinDeadline(deadline);
    }
  }
  throw lastError;
}

function isRetryableBatchError(error: unknown): boolean {
  return error instanceof ApiError
    && error.retryable
    && (error.code === 'INVALID_MODEL_RESPONSE' || error.code === 'PROVIDER_ERROR' || error.code === 'REQUEST_TIMEOUT');
}

function invalidModelResponse(): ApiError {
  return new ApiError('INVALID_MODEL_RESPONSE', 502, true);
}

function moderationText(paper: AssessmentPaper): string {
  return JSON.stringify(paper);
}
