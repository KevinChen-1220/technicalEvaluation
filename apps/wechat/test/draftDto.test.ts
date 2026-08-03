import type { CachedAssessment } from '../src/storage/assessmentCache';

describe('safe client assessment DTO', () => {
  test('represents answerable questions without answer keys or explanations', () => {
    const question: CachedAssessment['paper']['questions'][number] = {
      id: 'q1',
      type: 'single_choice',
      difficulty: 'easy',
      knowledgePoint: 'types',
      prompt: 'Pick one',
      options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }],
    };

    expect(question).not.toHaveProperty('correctOptionIds');
    expect(question).not.toHaveProperty('explanation');
  });
});
