import {
  buildWrongQuestionReviews,
  getWrongQuestionPageRange,
  wrongQuestionReviewBatchSize,
} from '@dynamic-assessment/assessment-core';
import type { QuestionMaterial } from '@dynamic-assessment/assessment-core';
import type { CachedAssessment, CachedCompletedAssessment } from '../storage/assessmentCache';

export type ResultWrongQuestionOption = {
  id: string;
  text: string;
  selected: boolean;
  correct: boolean;
  badge: '正确答案' | '你的选择' | '正确选择' | null;
};

export type ResultWrongQuestion = {
  questionId: string;
  questionNumber: number;
  prompt: string;
  materials?: QuestionMaterial[];
  wasUnanswered: boolean;
  selectedAnswerText: string;
  correctAnswerText: string;
  explanation: string;
  options: ResultWrongQuestionOption[];
};

export function buildResultViewModel(record: CachedAssessment, requestedPage: number) {
  if (record.status !== 'completed') {
    throw new Error('Result view requires a completed assessment.');
  }
  return buildCompletedResultViewModel(record, requestedPage);
}

function buildCompletedResultViewModel(record: CachedCompletedAssessment, requestedPage: number) {
  const allWrong = buildWrongQuestionReviews(record.paper, record.answers, record.result);
  const range = getWrongQuestionPageRange(requestedPage, allWrong.length);
  const pageItems = allWrong.slice(range.start, range.end).map((item): ResultWrongQuestion => {
    const selected = new Set(item.userOptionIds);
    const correct = new Set(item.correctOptionIds);
    const optionText = new Map(item.question.options.map((option) => [option.id, option.text]));
    const materials = item.question.materials === undefined ? {} : { materials: item.question.materials };
    return {
      questionId: item.question.id,
      questionNumber: item.questionNumber,
      prompt: item.question.prompt,
      ...materials,
      wasUnanswered: item.wasUnanswered,
      selectedAnswerText: item.wasUnanswered ? '未作答' : item.userOptionIds.map((id) => optionText.get(id) ?? id).join('、'),
      correctAnswerText: item.correctOptionIds.map((id) => optionText.get(id) ?? id).join('、'),
      explanation: item.question.explanation,
      options: item.options.map((option) => ({
        id: option.id,
        text: option.text,
        selected: selected.has(option.id),
        correct: correct.has(option.id),
        badge: correct.has(option.id) && selected.has(option.id)
          ? '正确选择'
          : correct.has(option.id)
            ? '正确答案'
            : selected.has(option.id)
              ? '你的选择'
              : null,
      })),
    };
  });

  return {
    topic: record.paper.topic,
    summary: {
      levelTitle: record.result.level.title,
      levelSummary: record.result.level.summary,
      score: record.result.score,
      correctCount: record.result.correctCount,
      totalQuestions: record.result.totalQuestions,
      accuracy: record.result.accuracy,
    },
    knowledgePoints: record.result.knowledgePointResults,
    wrongQuestions: pageItems,
    pagination: {
      page: range.page,
      pageCount: range.pageCount,
      total: allWrong.length,
      pageSize: wrongQuestionReviewBatchSize,
      startNumber: allWrong.length === 0 ? 0 : range.start + 1,
      endNumber: range.end,
      hasPrevious: range.page > 0,
      hasNext: range.page < range.pageCount - 1,
    },
  };
}
