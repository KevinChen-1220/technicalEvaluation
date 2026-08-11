import { scoreAssessment, type AssessmentPaper, type QuestionMaterial } from '@dynamic-assessment/assessment-core';
import { requireSession, sessionDependenciesFromEnvironment } from '../auth/sessionToken';
import { success } from '../http/envelope';
import type { EdgeOneContext } from '../platform/context';
import type { AssessmentRecord } from '../storage/assessmentRepository';
import { createEdgeOneStores } from '../storage/edgeOneStores';
import { invalidRequest, isRecord, methodNotAllowed, nonEmptyString, readJsonObject, routeFailure } from './support';

type Stores = ReturnType<typeof createEdgeOneStores>;
type Dependencies = { stores: Stores; now(): Date };

export async function createAssessmentsRoute(
  request: Request,
  context: EdgeOneContext,
  injected?: Dependencies,
): Promise<Response> {
  try {
    const identity = await requireSession(request, sessionDependenciesFromEnvironment(context.blob, context.env));
    const dependencies = injected ?? defaultDependencies(context);
    const segments = assessmentPath(request.url);

    if (segments.length === 0 && request.method === 'GET') {
      const summaries = await dependencies.stores.assessments.list(identity.ownerKey);
      const url = new URL(request.url);
      const pageSize = boundedPageSize(url.searchParams.get('pageSize'));
      const cursor = url.searchParams.get('cursor');
      const start = cursor === null ? 0 : Math.max(0, summaries.findIndex((summary) => summary.id === cursor) + 1);
      const page = summaries.slice(start, start + pageSize);
      const records = (await Promise.all(page.map(async (summary) => (
        await dependencies.stores.assessments.get(identity.ownerKey, summary.id)
      )))).filter((record): record is AssessmentRecord => record !== null);
      return success({
        type: 'listed' as const,
        summaries: records.map(toClientSummary),
        assessments: records.map(toClientAssessment),
        nextCursor: start + pageSize < summaries.length ? page[page.length - 1]?.id ?? null : null,
      });
    }
    if (segments.length === 0) throw methodNotAllowed();

    const assessmentId = segments[0];
    if (assessmentId === undefined) throw invalidRequest();
    if (segments.length === 1 && request.method === 'GET') {
      const record = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
      return record === null
        ? success({ type: 'not_found' as const, errorCode: 'INVALID_REQUEST' as const })
        : success({ type: 'found' as const, assessment: toClientAssessment(record) });
    }

    if (segments.length === 1 && (request.method === 'PUT' || request.method === 'PATCH')) {
      const body = await readJsonObject(request);
      const current = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
      if (current === null) return success({ type: 'not_found' as const, errorCode: 'INVALID_REQUEST' as const });
      const answers = parseAnswers(body.answers, current.paper);
      const expectedRevision = positiveInteger(body.expectedRevision);
      const result = await dependencies.stores.assessments.compareAndSwap({
        ownerKey: identity.ownerKey, id: assessmentId, answers, expectedRevision,
        updatedAt: dependencies.now().toISOString(),
      });
      if (result.type === 'conflict') {
        const latest = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
        if (latest === null) return success({ type: 'not_found' as const, errorCode: 'INVALID_REQUEST' as const });
        return success({ type: 'conflict' as const, current: toClientAssessment(latest) });
      }
      return success({ type: 'updated' as const, revision: result.record.revision });
    }
    if (segments.length === 1) throw methodNotAllowed();

    if (segments.length === 2 && segments[1] === 'complete' && request.method === 'POST') {
      const body = await readJsonObject(request);
      const current = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
      if (current === null) return success({ type: 'not_found' as const, errorCode: 'INVALID_REQUEST' as const });
      const answers = parseAnswers(body.answers, current.paper);
      assertCompleteAnswers(answers, current.paper);
      const expectedRevision = positiveInteger(body.expectedRevision);
      const completedAt = dependencies.now().toISOString();
      const result = await dependencies.stores.assessments.complete({
        ownerKey: identity.ownerKey,
        id: assessmentId,
        expectedRevision,
        answers,
        result: scoreAssessment(current.paper, { paperId: current.paper.id, answers, submittedAt: completedAt }),
        submittedAt: completedAt,
        updatedAt: completedAt,
      });
      if (result.type === 'conflict') {
        const latest = await dependencies.stores.assessments.get(identity.ownerKey, assessmentId);
        if (latest === null) return success({ type: 'not_found' as const, errorCode: 'INVALID_REQUEST' as const });
        return success({ type: 'conflict' as const, current: toClientAssessment(latest) });
      }
      return success({ type: 'completed' as const, assessment: toClientAssessment(result.record) });
    }
    if (segments.length === 2 && segments[1] === 'complete') throw methodNotAllowed();
    throw invalidRequest();
  } catch (error) {
    return routeFailure(error);
  }
}

function defaultDependencies(context: EdgeOneContext): Dependencies {
  const now = () => new Date();
  return { stores: createEdgeOneStores(context.blob, { now }), now };
}

function assessmentPath(rawUrl: string): string[] {
  const pathname = new URL(rawUrl).pathname;
  const prefix = '/api/assessments';
  if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) throw invalidRequest();
  return pathname.slice(prefix.length).split('/').filter(Boolean).map((segment) => nonEmptyString(decodeURIComponent(segment), 200));
}

function boundedPageSize(raw: string | null): number {
  if (raw === null) return 20;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 50) throw invalidRequest();
  return value;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) throw invalidRequest();
  return value;
}

function parseAnswers(value: unknown, paper: AssessmentPaper): Record<string, string[]> {
  if (!isRecord(value)) throw invalidRequest();
  const questions = new Map(paper.questions.map((question) => [question.id, question]));
  const answers: Record<string, string[]> = {};
  for (const [questionId, selected] of Object.entries(value)) {
    const question = questions.get(questionId);
    if (question === undefined || !Array.isArray(selected) || !selected.every((option) => typeof option === 'string')) {
      throw invalidRequest();
    }
    const unique = [...new Set(selected)];
    const allowed = new Set(question.options.map((option) => option.id));
    if (unique.length !== selected.length || unique.some((option) => !allowed.has(option))) throw invalidRequest();
    if ((question.type === 'single_choice' || question.type === 'true_false') && unique.length > 1) throw invalidRequest();
    answers[questionId] = unique;
  }
  return answers;
}

function assertCompleteAnswers(answers: Record<string, string[]>, paper: AssessmentPaper): void {
  if (Object.keys(answers).length !== paper.questions.length) throw invalidRequest();
  if (paper.questions.some((question) => (answers[question.id]?.length ?? 0) === 0)) throw invalidRequest();
}

function toClientAssessment(record: AssessmentRecord) {
  const base = {
    id: record.id,
    revision: record.revision,
    status: record.status,
    paper: record.status === 'draft' ? answerablePaper(record.paper) : record.paper,
    answers: record.answers,
    result: record.result,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.submittedAt,
  };
  return base;
}

function answerablePaper(paper: AssessmentPaper) {
  return {
    id: paper.id,
    topic: paper.topic,
    questionCount: paper.questionCount,
    generatedAt: paper.generatedAt,
    scoring: {
      maxScore: paper.scoring.maxScore,
      levels: paper.scoring.levels.map((level) => ({
        minPercent: level.minPercent, maxPercent: level.maxPercent, title: level.title, summary: level.summary,
      })),
    },
    questions: paper.questions.map((question) => ({
      id: question.id,
      type: question.type,
      difficulty: question.difficulty,
      knowledgePoint: question.knowledgePoint,
      prompt: question.prompt,
      options: question.options.map((option) => ({ id: option.id, text: option.text })),
      ...(question.materials === undefined ? {} : { materials: answerableMaterials(question.materials) }),
    })),
  };
}

function answerableMaterials(materials: QuestionMaterial[]) {
  return materials.map((material) => {
    switch (material.type) {
      case 'text':
        return { type: material.type, text: material.text };
      case 'image':
        return {
          type: material.type, uri: material.uri, alt: material.alt,
          ...(material.caption === undefined ? {} : { caption: material.caption }),
          ...(material.aspectRatio === undefined ? {} : { aspectRatio: material.aspectRatio }),
        };
      case 'table':
        return {
          type: material.type,
          ...(material.caption === undefined ? {} : { caption: material.caption }),
          columns: [...material.columns],
          rows: material.rows.map((row) => [...row]),
        };
      case 'bar_chart':
        return {
          type: material.type,
          ...(material.title === undefined ? {} : { title: material.title }),
          ...(material.unit === undefined ? {} : { unit: material.unit }),
          items: material.items.map((item) => ({
            label: item.label, value: item.value,
            ...(item.displayValue === undefined ? {} : { displayValue: item.displayValue }),
          })),
        };
    }
  });
}

function toClientSummary(record: AssessmentRecord) {
  const result = isRecord(record.result) ? record.result : null;
  return {
    id: record.id,
    topic: record.paper.topic,
    status: record.status,
    questionCount: record.paper.questions.length,
    answeredCount: Object.values(record.answers).filter((answer) => answer.length > 0).length,
    revision: record.revision,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.submittedAt,
    score: typeof result?.score === 'number' ? result.score : null,
    correctCount: typeof result?.correctCount === 'number' ? result.correctCount : null,
    accuracy: typeof result?.accuracy === 'number' ? result.accuracy : null,
  };
}
