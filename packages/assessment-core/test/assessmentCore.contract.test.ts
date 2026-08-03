import {
  buildWrongQuestionReviews,
  findFirstUnansweredQuestionIndex,
  scoreAssessment,
  validateAssessmentPaper,
  type AssessmentPaper,
} from '@dynamic-assessment/assessment-core';

const paper: AssessmentPaper = {
  id: 'contract-paper',
  topic: 'Core contract',
  questionCount: 50,
  generatedAt: '2026-08-03T00:00:00.000Z',
  scoring: {
    maxScore: 50,
    levels: [
      { minPercent: 0, maxPercent: 59, title: 'Needs practice', summary: 'Keep practicing.' },
      { minPercent: 60, maxPercent: 100, title: 'Ready', summary: 'You are ready.' },
    ],
  },
  questions: Array.from({ length: 50 }, (_, index) => ({
    id: `q${index + 1}`,
    type: 'single_choice' as const,
    difficulty: 'easy' as const,
    knowledgePoint: 'Contracts',
    prompt: `Question ${index + 1}`,
    options: [
      { id: 'A', text: 'Correct' },
      { id: 'B', text: 'Incorrect' },
    ],
    correctOptionIds: ['A'],
    explanation: 'A is correct.',
  })),
};

describe('assessment-core public contract', () => {
  it('validates a compatible assessment JSON paper', () => {
    expect(validateAssessmentPaper(paper)).toEqual({ ok: true, errors: [], paper });
  });

  it('scores exact answers through the public package export', () => {
    const result = scoreAssessment(paper, {
      paperId: paper.id,
      answers: { q1: ['A'] },
    });

    expect(result).toMatchObject({
      totalQuestions: 50,
      correctCount: 1,
      score: 1,
      accuracy: 2,
      wrongQuestionIds: expect.arrayContaining(['q2']),
    });
  });

  it('finds the first unanswered question through the public package export', () => {
    expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'] })).toBe(1);
  });

  it('builds an unanswered wrong-question review through the public package export', () => {
    const answers = { q1: ['A'] };
    const result = scoreAssessment(paper, { paperId: paper.id, answers });
    const reviews = buildWrongQuestionReviews(paper, answers, result);

    expect(reviews[0]).toMatchObject({
      questionNumber: 2,
      wasUnanswered: true,
      correctOptionIds: ['A'],
    });
    expect(reviews[0]?.options).toEqual([
      expect.objectContaining({ id: 'A', state: 'correct' }),
      expect.objectContaining({ id: 'B', state: 'neutral' }),
    ]);
  });
});
