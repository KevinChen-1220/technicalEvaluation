import { samplePaper } from './samplePaper';
import { scoreAssessment } from './scoring';
import type { AssessmentPaper } from './types';
import { buildWrongQuestionReviews, getWrongQuestionPageRange } from './wrongQuestionReview';

const paper: AssessmentPaper = {
  ...samplePaper,
  questionCount: 50,
  questions: samplePaper.questions.slice(0, 2),
};

describe('buildWrongQuestionReviews', () => {
  it('returns wrong questions in paper order and derives option states', () => {
    const answers = { q1: ['A'], q2: [] };
    const scored = scoreAssessment(paper, { paperId: paper.id, answers });
    const result = { ...scored, wrongQuestionIds: ['q2', 'q1'] };

    const reviews = buildWrongQuestionReviews(paper, answers, result);

    expect(reviews.map((item) => item.question.id)).toEqual(['q1', 'q2']);
    expect(reviews[0]?.questionNumber).toBe(1);
    expect(reviews[0]?.options).toEqual([
      expect.objectContaining({ id: 'A', state: 'selected_wrong' }),
      expect.objectContaining({ id: 'B', state: 'correct' }),
      expect.objectContaining({ id: 'C', state: 'neutral' }),
      expect.objectContaining({ id: 'D', state: 'neutral' }),
    ]);
    expect(reviews[0]?.wasUnanswered).toBe(false);
  });

  it('marks a wrong question with no selected options as unanswered', () => {
    const answers = { q1: ['B'], q2: [] };
    const result = scoreAssessment(paper, { paperId: paper.id, answers });

    const reviews = buildWrongQuestionReviews(paper, answers, result);

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.question.id).toBe('q2');
    expect(reviews[0]?.wasUnanswered).toBe(true);
    expect(reviews[0]?.options.some((option) => option.state === 'selected_wrong')).toBe(false);
    expect(reviews[0]?.options.find((option) => option.id === 'A')?.state).toBe('correct');
  });
});

describe('getWrongQuestionPageRange', () => {
  it('returns a bounded replacement page instead of an accumulating limit', () => {
    expect(getWrongQuestionPageRange(0, 100)).toEqual({ page: 0, start: 0, end: 10, pageCount: 10 });
    expect(getWrongQuestionPageRange(9, 100)).toEqual({ page: 9, start: 90, end: 100, pageCount: 10 });
    expect(getWrongQuestionPageRange(20, 7)).toEqual({ page: 0, start: 0, end: 7, pageCount: 1 });
  });
});
