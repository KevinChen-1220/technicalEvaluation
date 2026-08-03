import { samplePaper } from './samplePaper';
import type { AssessmentPaper } from './types';
import { findFirstUnansweredQuestionIndex } from './questionNavigation';

const paper: AssessmentPaper = {
  ...samplePaper,
  questionCount: 50,
  questions: samplePaper.questions.slice(0, 2),
};

describe('findFirstUnansweredQuestionIndex', () => {
  it('opens at the first question when there are no answers', () => {
    expect(findFirstUnansweredQuestionIndex(paper, {})).toBe(0);
  });

  it('opens at the first unanswered question', () => {
    expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'] })).toBe(1);
    expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'], q2: [] })).toBe(1);
  });

  it('falls back to the first question when every question is answered', () => {
    expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'], q2: ['B'] })).toBe(0);
  });
});
