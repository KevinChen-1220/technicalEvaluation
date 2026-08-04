import type {
  AnswerableAssessmentPaper,
  AnswerableAssessmentQuestion,
  AssessmentPaper,
  AssessmentResult,
} from '@dynamic-assessment/assessment-core';
import { scoreAssessment } from '@dynamic-assessment/assessment-core';
import {
  updateAssessmentWithCompareAndSwap,
  type Assessment,
  type AssessmentCompareAndSwapPersistence,
} from '../../shared/contracts';
import { readTrustedOpenId } from '../trustedContext';

export type PublicAssessment = {
  id: string;
  answers: Record<string, string[]>;
  revision: number;
  createdAt: string;
  updatedAt: string;
} & (
  | {
      paper: AnswerableAssessmentPaper;
      status: 'draft';
      completedAt: null;
      result: null;
    }
  | {
      paper: AssessmentPaper;
      status: 'completed';
      completedAt: string;
      result: AssessmentResult;
    }
);

export type PublicAssessmentSummary = {
  id: string;
  topic: string;
  status: 'draft' | 'completed';
  questionCount: number;
  answeredCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  score: number | null;
  correctCount: number | null;
  accuracy: number | null;
};

export type AssessmentRepository = AssessmentCompareAndSwapPersistence & {
  findOwnedAssessment(id: string, ownerOpenId: string): Promise<Assessment | null>;
  listOwnedAssessments(input: {
    ownerOpenId: string;
    limit: number;
    cursor: string | null;
  }): Promise<{ records: Assessment[]; nextCursor: string | null }>;
};

type AssessmentDependencies = { repository: AssessmentRepository };
type AssessmentUpdateDependencies = AssessmentDependencies & { clock: { now(): Date } };

const notFound = { type: 'not_found', errorCode: 'INVALID_REQUEST' } as const;
const invalid = { type: 'invalid', errorCode: 'INVALID_REQUEST' } as const;

export async function getAssessment(
  input: unknown,
  trustedContext: unknown,
  dependencies: AssessmentDependencies,
): Promise<
  | { type: 'found'; assessment: PublicAssessment }
  | typeof notFound
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  const assessmentId = parseAssessmentId(input);
  if (ownerOpenId === null || assessmentId === null) return notFound;
  const assessment = await dependencies.repository.findOwnedAssessment(assessmentId, ownerOpenId);
  return assessment === null ? notFound : { type: 'found', assessment: toPublicAssessment(assessment) };
}

export async function updateAssessmentAnswers(
  input: unknown,
  trustedContext: unknown,
  dependencies: AssessmentUpdateDependencies,
): Promise<
  | { type: 'updated'; revision: number }
  | { type: 'conflict'; current: PublicAssessment }
  | typeof notFound
  | typeof invalid
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  const parsed = parseUpdateInput(input);
  if (ownerOpenId === null || parsed === null) return invalid;

  const record = await dependencies.repository.findOwnedAssessment(parsed.assessmentId, ownerOpenId);
  if (record === null) return notFound;
  if (record.status !== 'draft' || !answersMatchPaper(parsed.answers, record.paper)) return invalid;

  const result = await updateAssessmentWithCompareAndSwap(
    dependencies.repository,
    record,
    {
      expectedRevision: parsed.expectedRevision,
      answers: parsed.answers,
      result: null,
      status: 'draft',
      completedAt: null,
    },
    trustedContext,
    dependencies.clock.now().toISOString(),
  );
  if (result.type === 'updated') {
    return { type: 'updated', revision: result.record.revision };
  }

  const current = await dependencies.repository.findOwnedAssessment(parsed.assessmentId, ownerOpenId);
  return current === null ? notFound : { type: 'conflict', current: toPublicAssessment(current) };
}

export async function listAssessments(
  input: unknown,
  trustedContext: unknown,
  dependencies: AssessmentDependencies,
): Promise<
  | {
      type: 'listed';
      summaries: PublicAssessmentSummary[];
      assessments: PublicAssessment[];
      nextCursor: string | null;
    }
  | typeof invalid
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  const parsed = parseListInput(input);
  if (ownerOpenId === null || parsed === null) return invalid;

  const page = await dependencies.repository.listOwnedAssessments({
    ownerOpenId,
    limit: parsed.pageSize,
    cursor: parsed.cursor,
  });

  return {
    type: 'listed',
    summaries: page.records.map(toPublicAssessmentSummary),
    assessments: page.records.map(toPublicAssessment),
    nextCursor: page.nextCursor,
  };
}

export async function completeAssessment(
  input: unknown,
  trustedContext: unknown,
  dependencies: AssessmentUpdateDependencies,
): Promise<
  | { type: 'completed'; assessment: Extract<PublicAssessment, { status: 'completed' }> }
  | { type: 'conflict'; current: PublicAssessment }
  | typeof notFound
  | typeof invalid
> {
  const ownerOpenId = readTrustedOpenId(trustedContext);
  const parsed = parseUpdateInput(input);
  if (ownerOpenId === null || parsed === null) return invalid;

  const record = await dependencies.repository.findOwnedAssessment(parsed.assessmentId, ownerOpenId);
  if (record === null) return notFound;
  if (record.status === 'completed') {
    if (record.result === null || record.completedAt === null) return invalid;
    return { type: 'completed', assessment: toPublicCompletedAssessment(record) };
  }
  if (!answersMatchPaper(parsed.answers, record.paper) || !answersComplete(parsed.answers, record.paper)) {
    return invalid;
  }

  const completedAt = dependencies.clock.now().toISOString();
  const result = scoreAssessment(record.paper, {
    paperId: record.paper.id,
    answers: parsed.answers,
    submittedAt: completedAt,
  });
  const update = await updateAssessmentWithCompareAndSwap(
    dependencies.repository,
    record,
    {
      expectedRevision: parsed.expectedRevision,
      answers: parsed.answers,
      result,
      status: 'completed',
      completedAt,
    },
    trustedContext,
    completedAt,
  );

  if (update.type === 'updated') {
    return { type: 'completed', assessment: toPublicCompletedAssessment(update.record) };
  }

  const current = await dependencies.repository.findOwnedAssessment(parsed.assessmentId, ownerOpenId);
  if (current === null) return notFound;
  if (current.status === 'completed' && current.result !== null && current.completedAt !== null) {
    return { type: 'completed', assessment: toPublicCompletedAssessment(current) };
  }
  return { type: 'conflict', current: toPublicAssessment(current) };
}

function toPublicAssessment(record: Assessment): PublicAssessment {
  if (record.status === 'completed' && record.result !== null && record.completedAt !== null) {
    return toPublicCompletedAssessment(record);
  }
  return {
    id: record._id,
    paper: toAnswerablePaper(record.paper),
    answers: record.answers,
    status: 'draft',
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: null,
    result: null,
  };
}

function toPublicCompletedAssessment(record: Assessment): Extract<PublicAssessment, { status: 'completed' }> {
  if (record.result === null || record.completedAt === null) {
    throw new Error('Completed assessment is missing persisted result.');
  }
  return {
    id: record._id,
    paper: record.paper,
    answers: record.answers,
    status: 'completed',
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    result: record.result,
  };
}

function toPublicAssessmentSummary(record: Assessment): PublicAssessmentSummary {
  return {
    id: record._id,
    topic: record.paper.topic,
    status: record.status,
    questionCount: record.paper.questions.length,
    answeredCount: record.paper.questions.filter((question) => (record.answers[question.id]?.length ?? 0) > 0).length,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
    score: record.result?.score ?? null,
    correctCount: record.result?.correctCount ?? null,
    accuracy: record.result?.accuracy ?? null,
  };
}

function toAnswerablePaper(paper: AssessmentPaper): AnswerableAssessmentPaper {
  return {
    ...paper,
    questions: paper.questions.map(toAnswerableQuestion),
  };
}

function toAnswerableQuestion(
  question: AssessmentPaper['questions'][number],
): AnswerableAssessmentQuestion {
  const { correctOptionIds: _correctOptionIds, explanation: _explanation, ...answerable } = question;
  return answerable;
}

function parseAssessmentId(input: unknown): string | null {
  if (!isRecord(input) || typeof input.assessmentId !== 'string') return null;
  const id = input.assessmentId.trim();
  return id.length === 0 ? null : id;
}

function parseUpdateInput(input: unknown): {
  assessmentId: string;
  answers: Record<string, string[]>;
  expectedRevision: number;
} | null {
  const assessmentId = parseAssessmentId(input);
  if (
    assessmentId === null
    || !isRecord(input)
    || !Number.isInteger(input.expectedRevision)
    || (input.expectedRevision as number) < 1
    || !isRecord(input.answers)
  ) return null;

  const answers: Record<string, string[]> = {};
  for (const [questionId, value] of Object.entries(input.answers)) {
    if (
      questionId.length === 0
      || !Array.isArray(value)
      || value.some((optionId) => typeof optionId !== 'string' || optionId.length === 0)
      || new Set(value).size !== value.length
    ) return null;
    answers[questionId] = value as string[];
  }
  return { assessmentId, answers, expectedRevision: input.expectedRevision as number };
}

function parseListInput(input: unknown): { cursor: string | null; pageSize: number } | null {
  if (input === undefined) return { cursor: null, pageSize: 20 };
  if (!isRecord(input)) return null;
  const cursor = input.cursor === undefined || input.cursor === null ? null : input.cursor;
  const pageSize = input.pageSize === undefined ? 20 : input.pageSize;
  if ((cursor !== null && (typeof cursor !== 'string' || cursor.length === 0)) || !Number.isInteger(pageSize)) {
    return null;
  }
  if ((pageSize as number) < 1 || (pageSize as number) > 20) return null;
  return { cursor, pageSize: pageSize as number };
}

function answersMatchPaper(answers: Record<string, string[]>, paper: AssessmentPaper): boolean {
  const questions = new Map(paper.questions.map((question) => [question.id, question]));
  return Object.entries(answers).every(([questionId, optionIds]) => {
    const question = questions.get(questionId);
    if (question === undefined) return false;
    if (question.type !== 'multiple_choice' && optionIds.length > 1) return false;
    const validOptions = new Set(question.options.map((option) => option.id));
    return optionIds.every((optionId) => validOptions.has(optionId));
  });
}

function answersComplete(answers: Record<string, string[]>, paper: AssessmentPaper): boolean {
  return paper.questions.every((question) => (answers[question.id]?.length ?? 0) > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
