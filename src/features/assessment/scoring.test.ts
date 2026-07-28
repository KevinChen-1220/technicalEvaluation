import { samplePaper } from './samplePaper';
import { scoreAssessment } from './scoring';
import type { AssessmentSession } from './types';

describe('scoreAssessment', () => {
  it('scores exact matches, rejects partial multiple-choice answers, and aggregates knowledge points', () => {
    const session: AssessmentSession = {
      paperId: samplePaper.id,
      answers: {
        q1: ['B'],
        q2: ['A'],
        q3: ['A'],
        q4: ['A', 'C'],
      },
      submittedAt: '2026-07-09T00:00:00.000Z',
    };

    const result = scoreAssessment(samplePaper, session);

    expect(result.totalQuestions).toBe(4);
    expect(result.correctCount).toBe(3);
    expect(result.score).toBe(3);
    expect(result.accuracy).toBe(75);
    expect(result.level.title).toBe('熟练掌握');
    expect(result.wrongQuestionIds).toEqual(['q4']);
    expect(result.questionResults).toEqual([
      { questionId: 'q1', isCorrect: true, userOptionIds: ['B'], correctOptionIds: ['B'] },
      { questionId: 'q2', isCorrect: true, userOptionIds: ['A'], correctOptionIds: ['A'] },
      { questionId: 'q3', isCorrect: true, userOptionIds: ['A'], correctOptionIds: ['A'] },
      { questionId: 'q4', isCorrect: false, userOptionIds: ['A', 'C'], correctOptionIds: ['A', 'B', 'C'] },
    ]);
    expect(result.knowledgePointResults).toHaveLength(3);
    expect(result.knowledgePointResults).toEqual(expect.arrayContaining([
      { knowledgePoint: '并发编程', total: 2, correct: 1, accuracy: 50 },
      { knowledgePoint: '内存管理', total: 1, correct: 1, accuracy: 100 },
      { knowledgePoint: '应用架构', total: 1, correct: 1, accuracy: 100 },
    ]));
  });
});
