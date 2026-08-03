import type { AssessmentPaper } from '@dynamic-assessment/assessment-core';
import {
  updateAssessmentWithCompareAndSwap,
  type Assessment,
  type AssessmentCompareAndSwapPersistence,
} from '../../shared/contracts';
import { readTrustedOpenId } from '../trustedContext';

export type PublicAssessment = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  status: 'draft' | 'completed';
  revision: number;
};

export type AssessmentRepository = AssessmentCompareAndSwapPersistence & {
  findOwnedAssessment(id: string, ownerOpenId: string): Promise<Assessment | null>;
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

function toPublicAssessment(record: Assessment): PublicAssessment {
  return {
    id: record._id,
    paper: record.paper,
    answers: record.answers,
    status: record.status,
    revision: record.revision,
  };
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
