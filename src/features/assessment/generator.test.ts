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
    expect(prompt).toContain('"prompt": "Full question text shown to the user"');
    expect(prompt).toContain('Every question must include a non-empty prompt field');
    expect(prompt).toContain('correctOptionIds');
    expect(prompt).toContain('detailed explanation');
    expect(prompt).toContain('cover 0 through 100 percent without gaps');
    expect(prompt).toContain('Return one JSON object only. Do not wrap it in Markdown.');
  });

  it('uses the topic as the sole language source for Chinese, English, or other-language input', () => {
    const chinesePrompt = buildAssessmentPrompt({
      topic: 'iOS 开发能力',
      questionCount: 50,
      notes: 'Focus on concurrency and memory management.',
    });
    const englishPrompt = buildAssessmentPrompt({
      topic: 'iOS development capability',
      questionCount: 50,
      notes: '重点考察并发与内存管理。',
    });
    const spanishPrompt = buildAssessmentPrompt({
      topic: 'Arquitectura de backend',
      questionCount: 50,
      notes: '重点考察可扩展性。',
    });

    for (const prompt of [chinesePrompt, englishPrompt, spanishPrompt]) {
      expect(prompt).toContain('Use the topic field as the sole source of truth for the output language');
      expect(prompt).toContain('Additional notes must not change the output language');
      expect(prompt).toContain('Chinese input, use Simplified Chinese');
      expect(prompt).toContain('English input, use English');
      expect(prompt).toContain('For any other language, preserve the topic language');
      expect(prompt).toContain('Do not default to Chinese when the topic is not Chinese');
      expect(prompt).toContain('Keep JSON property names, enum values, and option IDs in English');
      expect(prompt).toContain('single_choice');
      expect(prompt).toContain('"difficulty": "easy"');
    }

    expect(chinesePrompt).toContain('iOS 开发能力');
    expect(chinesePrompt).toContain('Focus on concurrency and memory management.');
    expect(englishPrompt).toContain('iOS development capability');
    expect(englishPrompt).toContain('重点考察并发与内存管理。');
    expect(spanishPrompt).toContain('Arquitectura de backend');
  });
});

describe('extractJsonObject', () => {
  it('extracts the first JSON object from provider text', () => {
    expect(extractJsonObject('Here is the paper:\n{"id":"paper-1","questions":[]}')).toEqual({
      id: 'paper-1',
      questions: [],
    });
  });

  it('repairs common model JSON formatting mistakes', () => {
    expect(extractJsonObject("```json\n{'id':'paper-1','questions':[],}\n```"))
      .toEqual({ id: 'paper-1', questions: [] });
    expect(extractJsonObject('{"id":"paper-1","questions":[]'))
      .toEqual({ id: 'paper-1', questions: [] });
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

  it('retries malformed model output with a corrective complete prompt', async () => {
    const completionFn = jest.fn()
      .mockResolvedValueOnce('{broken')
      .mockResolvedValueOnce(JSON.stringify(validGeneratedPaper));

    await expect(generateAssessment({ topic: 'iOS', questionCount: 50 }, config, completionFn)).resolves.toEqual(
      validGeneratedPaper,
    );

    expect(completionFn).toHaveBeenCalledTimes(2);
    const retryPrompt = completionFn.mock.calls[1]?.[1][1]?.content;
    expect(retryPrompt).toContain('Generated assessment is invalid:');
    expect(retryPrompt).toContain('Regenerate the complete JSON object from scratch.');
  });

  it('retries structurally invalid model output with its failure reason', async () => {
    const completionFn = jest.fn()
      .mockResolvedValueOnce(JSON.stringify({ ...validGeneratedPaper, questions: [] }))
      .mockResolvedValueOnce(JSON.stringify(validGeneratedPaper));

    await expect(generateAssessment({ topic: 'iOS', questionCount: 50 }, config, completionFn)).resolves.toEqual(
      validGeneratedPaper,
    );

    expect(completionFn).toHaveBeenCalledTimes(2);
    const retryPrompt = completionFn.mock.calls[1]?.[1][1]?.content;
    expect(retryPrompt).toContain('Generated assessment is invalid: Expected 50 questions but received 0.');
    expect(retryPrompt).toContain('Regenerate the complete JSON object from scratch.');
  });

  it('does not retry HTML or XML model output', async () => {
    const completionFn = jest.fn()
      .mockResolvedValueOnce('<html><body>Login required</body></html>')
      .mockResolvedValueOnce(JSON.stringify(validGeneratedPaper));

    await expect(generateAssessment({ topic: 'iOS', questionCount: 50 }, config, completionFn)).rejects.toThrow(
      'Model response looked like HTML/XML instead of assessment JSON. Check the provider endpoint and model response format.',
    );

    expect(completionFn).toHaveBeenCalledTimes(1);
  });
});
