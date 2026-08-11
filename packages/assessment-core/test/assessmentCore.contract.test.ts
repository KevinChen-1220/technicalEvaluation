import {
  buildWrongQuestionReviews,
  ASSESSMENT_QUESTION_COUNT,
  findFirstUnansweredQuestionIndex,
  scoreAssessment,
  validateAssessmentPaper,
  validateAssessmentQuestions,
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
  it('exports the fixed question count for newly generated assessments', () => {
    expect(ASSESSMENT_QUESTION_COUNT).toBe(50);
  });

  it('validates a compatible assessment JSON paper', () => {
    expect(validateAssessmentPaper(paper)).toEqual({ ok: true, errors: [], paper });
  });

  it('keeps a legacy 100-question assessment readable', () => {
    const legacyPaper: AssessmentPaper = {
      ...paper,
      questionCount: 100,
      scoring: { ...paper.scoring, maxScore: 100 },
      questions: Array.from({ length: 100 }, (_, index) => ({
        ...paper.questions[index % paper.questions.length]!,
        id: `legacy-q${index + 1}`,
      })),
    };

    expect(validateAssessmentPaper(legacyPaper)).toEqual({ ok: true, errors: [], paper: legacyPaper });
  });

  it('validates a generated question list through the public package export', () => {
    const questions = paper.questions.slice(0, 10);

    expect(validateAssessmentQuestions(questions)).toEqual({
      ok: true,
      errors: [],
      questions,
    });
  });

  it('rejects duplicate option IDs and correct answers outside the option list', () => {
    const question = {
      ...paper.questions[0]!,
      options: [
        { id: 'A', text: 'First' },
        { id: 'A', text: 'Duplicate' },
      ],
      correctOptionIds: ['B'],
    };

    expect(validateAssessmentQuestions([question])).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Question q1 option ID A must be unique.',
        'Question q1 correct option B does not exist in options.',
      ]),
    });
  });

  it('returns validation errors for non-object question entries', () => {
    expect(validateAssessmentQuestions([null])).toEqual({
      ok: false,
      errors: ['Question 1 must be a JSON object.'],
    });
  });

  it('returns errors instead of throwing for non-string question fields', () => {
    const malformed = {
      ...paper.questions[0]!,
      prompt: 42,
      knowledgePoint: 99,
      explanation: false,
      options: [
        { id: 1, text: 2 },
        null,
      ],
      correctOptionIds: [1],
    };

    expect(() => validateAssessmentQuestions([malformed])).not.toThrow();
    expect(validateAssessmentQuestions([malformed])).toEqual({
      ok: false,
      errors: expect.arrayContaining([
        'Question q1 prompt is required.',
        'Question q1 knowledgePoint is required.',
        'Question q1 explanation is required.',
        'Question q1 option ID is required.',
        'Question q1 option must be a JSON object.',
      ]),
    });
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
