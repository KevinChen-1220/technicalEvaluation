import { samplePaper } from './samplePaper';
import type { AssessmentPaper } from './types';
import { validateAssessmentPaper } from './validation';

const validGeneratedPaper: AssessmentPaper = {
  ...samplePaper,
  questionCount: 50,
  scoring: {
    ...samplePaper.scoring,
    maxScore: 50,
  },
  questions: Array.from({ length: 50 }, (_, index) => ({
    ...samplePaper.questions[index % samplePaper.questions.length]!,
    id: `q${index + 1}`,
  })),
};

describe('validateAssessmentPaper', () => {
  it('accepts a structurally valid generated paper', () => {
    expect(validateAssessmentPaper(validGeneratedPaper)).toEqual({ ok: true, errors: [], paper: validGeneratedPaper });
  });

  it('rejects unsupported types, missing explanations, bad answers, and question-count mismatches', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questionCount: 100,
      questions: [
        {
          ...validGeneratedPaper.questions[0],
          type: 'essay',
          explanation: '',
          correctOptionIds: ['Z'],
        },
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: [
        'Expected 100 questions but received 1.',
        'Question q1 has unsupported type essay.',
        'Question q1 correct option Z does not exist in options.',
        'Question q1 explanation is required.',
      ],
    });
  });

  it('rejects single-choice questions with multiple correct answers and multiple-choice questions with no correct answers', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        { ...validGeneratedPaper.questions[0]!, correctOptionIds: ['A', 'B'] },
        { ...validGeneratedPaper.questions[3]!, correctOptionIds: [] },
        ...validGeneratedPaper.questions.slice(2),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: [
        'Question q1 single_choice questions must have exactly one correct option.',
        'Question q4 multiple_choice questions must have at least one correct option.',
      ],
    });
  });

  it('rejects questions without prompt text, knowledge point, and option text', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      questions: [
        {
          ...validGeneratedPaper.questions[0]!,
          prompt: '',
          knowledgePoint: '',
          options: [
            { id: 'A', text: '' },
            { id: 'B', text: 'Valid option' },
          ],
          correctOptionIds: ['B'],
        },
        ...validGeneratedPaper.questions.slice(1),
      ],
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: [
        'Question q1 prompt is required.',
        'Question q1 knowledgePoint is required.',
        'Question q1 option A text is required.',
      ],
    });
  });

  it('rejects scoring levels that do not cover 0 through 100 percent', () => {
    const invalidPaper = {
      ...validGeneratedPaper,
      scoring: {
        ...validGeneratedPaper.scoring,
        levels: [
          { minPercent: 10, maxPercent: 49, title: 'Low', summary: 'Low score.' },
          { minPercent: 50, maxPercent: 100, title: 'High', summary: 'High score.' },
        ],
      },
    };

    expect(validateAssessmentPaper(invalidPaper)).toEqual({
      ok: false,
      errors: ['Scoring levels must cover 0 through 100 percent without gaps.'],
    });
  });
});
