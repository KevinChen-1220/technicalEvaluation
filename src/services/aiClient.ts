import type { ModelConfig } from '../features/config/modelConfig';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export async function createChatCompletion(config: ModelConfig, messages: ChatMessage[]): Promise<string> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    throw new Error(`Model provider returned ${response.status}: ${await response.text()}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Model provider did not return message content.');
  }

  return content;
}
