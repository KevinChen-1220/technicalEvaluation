import { createChatCompletion } from './aiClient';
import type { ModelConfig } from '../features/config/modelConfig';

const config: ModelConfig = {
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'sk-test',
  model: 'assessment-model',
};

describe('createChatCompletion', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('sends an OpenAI-compatible chat completion request and returns message content', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }),
    } as Response);

    await expect(createChatCompletion(config, [{ role: 'user', content: 'Generate a paper.' }])).resolves.toBe('{"ok":true}');

    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer sk-test',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'assessment-model',
        messages: [{ role: 'user', content: 'Generate a paper.' }],
        temperature: 0.2,
      }),
    });
  });

  it('throws provider error text when the provider returns a non-2xx response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => 'invalid api key',
    } as Response);

    await expect(createChatCompletion(config, [])).rejects.toThrow('Model provider returned 401: invalid api key');
  });

  it('throws a readable error when the provider returns an HTML page instead of JSON', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }),
      text: async () => '<html><body>Not Found</body></html>',
    } as Response);

    await expect(createChatCompletion(config, [])).rejects.toThrow(
      'Model provider returned text/html instead of JSON. Check that Base URL points to an OpenAI-compatible /v1 endpoint.',
    );
  });

  it('throws when no message content is returned', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: new Headers({ 'Content-Type': 'application/json' }),
      text: async () => JSON.stringify({ choices: [] }),
    } as Response);

    await expect(createChatCompletion(config, [])).rejects.toThrow('Model provider did not return message content.');
  });
});
