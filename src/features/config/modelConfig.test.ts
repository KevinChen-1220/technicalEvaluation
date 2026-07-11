import { validateModelConfig } from './modelConfig';

describe('validateModelConfig', () => {
  it('accepts a complete OpenAI-compatible configuration', () => {
    expect(
      validateModelConfig({
        baseUrl: 'https://api.example.com/v1',
        apiKey: 'sk-test',
        model: 'assessment-model',
      }),
    ).toEqual({ ok: true, errors: [] });
  });

  it('rejects missing fields and invalid base URLs', () => {
    expect(
      validateModelConfig({
        baseUrl: 'not-a-url',
        apiKey: '',
        model: '   ',
      }),
    ).toEqual({
      ok: false,
      errors: ['Base URL must be a valid URL.', 'API Key is required.', 'Model is required.'],
    });
  });
});
