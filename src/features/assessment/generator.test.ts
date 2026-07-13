import { samplePaper } from './samplePaper';
import type { AssessmentPaper } from './types';
import { buildAssessmentPrompt, extractJsonObject, generateAssessment } from './generator';
import type { ModelConfig } from '../config/modelConfig';

const config: ModelConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'assessment-model',
};

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

describe('buildAssessmentPrompt', () => {
  it('asks for strict JSON, exact question count, supported types, answers, explanations, and scoring levels', () => {
    const prompt = buildAssessmentPrompt({
      topic: 'SQL optimization',
      questionCount: 100,
      notes: 'Focus on indexing and query plans.',
    });

    expect(prompt).toContain('SQL optimization');
    expect(prompt).toContain('exactly 100 questions');
    expect(prompt).toContain('single_choice');
    expect(prompt).toContain('multiple_choice');
    expect(prompt).toContain('true_false');
    expect(prompt).toContain('correctOptionIds');
    expect(prompt).toContain('detailed explanation');
    expect(prompt).toContain('cover 0 through 100 percent without gaps');
    expect(prompt).toContain('Return one JSON object only. Do not wrap it in Markdown.');
  });
});

describe('extractJsonObject', () => {
  it('extracts the first JSON object from provider text', () => {
    expect(extractJsonObject('Here is the paper:\n{"id":"paper-1","questions":[]}')).toEqual({
      id: 'paper-1',
      questions: [],
    });
  });

  it('throws when provider text does not contain a JSON object', () => {
    expect(() => extractJsonObject('no json here')).toThrow('Model response did not contain a JSON object.');
  });

  it('throws a targeted error when provider text is HTML or XML instead of JSON', () => {
    expect(() => extractJsonObject('<html><body>Login required</body></html>')).toThrow(
      'Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.',
    );
    expect(() => extractJsonObject('<?xml version="1.0"?><error>blocked</error>')).toThrow(
      'Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.',
    );
  });
});

describe('generateAssessment', () => {
  it('calls the completion function, validates the returned JSON, and returns the paper', async () => {
    const completionFn = jest.fn().mockResolvedValue(JSON.stringify(validGeneratedPaper));

    await expect(
      generateAssessment({ topic: 'iOS', questionCount: 50, notes: 'Practical questions.' }, config, completionFn),
    ).resolves.toEqual(validGeneratedPaper);

    expect(completionFn).toHaveBeenCalledWith(config, [
      { role: 'system', content: 'You generate deterministic, valid JSON assessment papers for mobile apps.' },
      expect.objectContaining({ role: 'user', content: expect.stringContaining('iOS') }),
    ]);
  });

  it('throws readable validation errors when generated JSON is invalid', async () => {
    const completionFn = jest.fn().mockResolvedValue(JSON.stringify({ ...validGeneratedPaper, questions: [] }));

    await expect(generateAssessment({ topic: 'iOS', questionCount: 50 }, config, completionFn)).rejects.toThrow(
      'Generated assessment is invalid: Expected 50 questions but received 0.',
    );
  });
});
