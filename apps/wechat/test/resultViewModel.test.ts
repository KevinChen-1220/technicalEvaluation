import { buildResultViewModel } from '../src/services/result-view-model';
import type { CachedAssessment } from '../src/storage/assessmentCache';

describe('result view model', () => {
  test('uses the persisted result to order wrong items and mark selected/correct/unanswered states', () => {
    const view = buildResultViewModel(completedAssessment({ wrongQuestionIds: ['q3', 'q1'] }), 0);

    expect(view.summary).toEqual({
      levelTitle: '进阶',
      levelSummary: '继续补齐薄弱点',
      score: 48,
      correctCount: 48,
      totalQuestions: 50,
      accuracy: 96,
    });
    expect(view.knowledgePoints).toEqual([
      { knowledgePoint: '基础', total: 2, correct: 1, accuracy: 50 },
      { knowledgePoint: '实战', total: 1, correct: 0, accuracy: 0 },
    ]);
    expect(view.wrongQuestions.map((item) => item.questionNumber)).toEqual([1, 3]);
    expect(view.wrongQuestions[0]).toMatchObject({
      questionNumber: 1,
      wasUnanswered: false,
      correctAnswerText: 'A',
      explanation: 'Q1 explanation',
      options: [
        { id: 'a', badge: '正确答案', selected: false, correct: true },
        { id: 'b', badge: '你的选择', selected: true, correct: false },
      ],
    });
    expect(view.wrongQuestions[1]).toMatchObject({
      questionNumber: 3,
      wasUnanswered: true,
      selectedAnswerText: '未作答',
    });
  });

  test('uses true replacement pagination with at most ten rich wrong questions per page', () => {
    const view = buildResultViewModel(completedAssessment({
      questionCount: 50,
      wrongQuestionIds: Array.from({ length: 23 }, (_, index) => `q${index + 1}`),
    }), 2);

    expect(view.pagination).toEqual({
      page: 2,
      pageCount: 3,
      total: 23,
      pageSize: 10,
      startNumber: 21,
      endNumber: 23,
      hasPrevious: true,
      hasNext: false,
    });
    expect(view.wrongQuestions).toHaveLength(3);
    expect(view.wrongQuestions.map((item) => item.questionNumber)).toEqual([21, 22, 23]);
  });
});

function completedAssessment(options: {
  questionCount?: 50 | 100;
  wrongQuestionIds: string[];
}): CachedAssessment {
  const questionCount = options.questionCount ?? 50;
  const questions = Array.from({ length: questionCount }, (_, index) => {
    const id = `q${index + 1}`;
    return {
      id,
      type: 'single_choice' as const,
      difficulty: 'easy' as const,
      knowledgePoint: index % 2 === 0 ? '基础' : '实战',
      prompt: `Q${index + 1}`,
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
      correctOptionIds: ['a'],
      explanation: `Q${index + 1} explanation`,
    };
  });
  const wrongSet = new Set(options.wrongQuestionIds);
  const answers = Object.fromEntries(questions.map((question) => [
    question.id,
    question.id === 'q3' ? [] : wrongSet.has(question.id) ? ['b'] : ['a'],
  ]));
  return {
    id: 'assessment-1',
    revision: 5,
    status: 'completed',
    createdAt: '2026-08-03T08:00:00.000Z',
    updatedAt: '2026-08-03T10:00:00.000Z',
    completedAt: '2026-08-03T10:00:00.000Z',
    answers,
    paper: {
      id: 'paper-1',
      topic: 'TypeScript',
      questionCount,
      generatedAt: '2026-08-03T08:00:00.000Z',
      scoring: { maxScore: 100, levels: [{ minPercent: 0, maxPercent: 100, title: '进阶', summary: '继续补齐薄弱点' }] },
      questions,
    },
    result: {
      totalQuestions: questionCount,
      correctCount: questionCount - wrongSet.size,
      score: questionCount - wrongSet.size,
      accuracy: Math.round(((questionCount - wrongSet.size) / questionCount) * 100),
      level: { minPercent: 0, maxPercent: 100, title: '进阶', summary: '继续补齐薄弱点' },
      questionResults: questions.map((question) => ({
        questionId: question.id,
        isCorrect: !wrongSet.has(question.id),
        userOptionIds: answers[question.id]!,
        correctOptionIds: ['a'],
      })),
      knowledgePointResults: [
        { knowledgePoint: '基础', total: 2, correct: 1, accuracy: 50 },
        { knowledgePoint: '实战', total: 1, correct: 0, accuracy: 0 },
      ],
      wrongQuestionIds: options.wrongQuestionIds,
    },
  } as CachedAssessment;
}
