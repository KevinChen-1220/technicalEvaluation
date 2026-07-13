import type { ModelConfig } from '../features/config/modelConfig';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function createChatCompletion(config: ModelConfig, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
    }),
  });
  const responseText = await response.text();

  if (!response.ok) {
    throw new Error(`Model provider returned ${response.status}: ${summarizeProviderText(responseText)}`);
  }

  const contentType = response.headers.get('Content-Type') ?? response.headers.get('content-type') ?? '';
  const mediaType = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (mediaType && !mediaType.includes('json')) {
    throw new Error(
      `Model provider returned ${mediaType} instead of JSON. Check that Base URL points to an OpenAI-compatible /v1 endpoint.`,
    );
  }

  let data: {
    choices?: Array<{ message?: { content?: string } }>;
  };

  try {
    data = JSON.parse(responseText) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
  } catch {
    throw new Error(`Model provider response was not valid JSON: ${summarizeProviderText(responseText)}`);
  }

  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Model provider did not return message content.');
  }

  return content;
}

function summarizeProviderText(value: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact || 'empty response';
}
