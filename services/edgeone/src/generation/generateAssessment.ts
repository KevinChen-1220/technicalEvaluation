import type { AssessmentPaper } from '@dynamic-assessment/assessment-core';
import type { AssessmentRecord } from '../storage/assessmentRepository';
import type { CompletionInput } from './openAIClient';
import { parseAssessment } from './parseAssessment';
import type { Deadline } from '../http/deadline';
import { assertWithinDeadline, withinDeadline } from '../http/deadline';

export type GenerateAssessmentInput = CompletionInput & { ownerKey: string; openId: string; assessmentId: string };

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
  const raw = await dependencies.complete({
    topic: input.topic,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  }, deadline);
  if (deadline !== undefined) assertWithinDeadline(deadline);
  const generatedAt = dependencies.now().toISOString();
  const paper = parseAssessment(raw, { assessmentId: input.assessmentId, topic: input.topic, generatedAt });
  await dependencies.checkText(moderationText(paper), input.openId, deadline);
  if (deadline !== undefined) assertWithinDeadline(deadline);
  const persistence = dependencies.createIfAbsent({
    id: input.assessmentId,
    ownerKey: input.ownerKey,
    revision: 1,
    status: 'draft',
    paper,
    answers: {},
    result: null,
    createdAt: generatedAt,
    updatedAt: generatedAt,
    submittedAt: null,
  });
  return deadline === undefined ? await persistence : await withinDeadline(persistence, deadline);
}

function moderationText(paper: AssessmentPaper): string {
  return JSON.stringify(paper);
}
