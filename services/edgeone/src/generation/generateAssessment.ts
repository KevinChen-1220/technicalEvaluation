import type { AssessmentPaper } from '@dynamic-assessment/assessment-core';
import type { AssessmentRecord } from '../storage/assessmentRepository';
import type { CompletionInput } from './openAIClient';
import { parseAssessment } from './parseAssessment';

export type GenerateAssessmentInput = CompletionInput & { ownerKey: string; assessmentId: string };

export interface GenerateAssessmentDependencies {
  complete(input: CompletionInput): Promise<string>;
  checkText(content: string): Promise<void>;
  createIfAbsent(record: AssessmentRecord): Promise<AssessmentRecord>;
  now(): Date;
}

export async function generateFiftyQuestionAssessment(
  input: GenerateAssessmentInput,
  dependencies: GenerateAssessmentDependencies,
): Promise<AssessmentRecord> {
  await dependencies.checkText(JSON.stringify({
    topic: input.topic,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  }));
  const raw = await dependencies.complete({
    topic: input.topic,
    ...(input.notes === undefined ? {} : { notes: input.notes }),
  });
  const generatedAt = dependencies.now().toISOString();
  const paper = parseAssessment(raw, { assessmentId: input.assessmentId, topic: input.topic, generatedAt });
  await dependencies.checkText(moderationText(paper));
  return await dependencies.createIfAbsent({
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
}

function moderationText(paper: AssessmentPaper): string {
  return JSON.stringify({
    topic: paper.topic,
    questions: paper.questions.map((question) => ({
      knowledgePoint: question.knowledgePoint,
      prompt: question.prompt,
      options: question.options.map((option) => option.text),
      explanation: question.explanation,
      materials: question.materials,
    })),
  });
}
