import type { AssessmentQuestion } from '@dynamic-assessment/assessment-core';
import { ApiError } from '../src/http/errors';
import { requestOpenAICompletion } from '../src/generation/openAIClient';
import { generateFiftyQuestionAssessment } from '../src/generation/generateAssessment';

const fixedNow = new Date('2026-08-11T08:00:00.000Z');

describe('single-call assessment generation', () => {
  test('repairs fenced JSON, normalizes ids, moderates both sides, and persists exactly 50 questions once', async () => {
    const questions = makeQuestions(50).map((question, index) => ({ ...question, id: `model-${index}` }));
    const raw = `Model preface\n\`\`\`json\n${JSON.stringify({ questions, scoring: scoring() }).replace(/}$/, ',}')}\n\`\`\`\nDone`;
    const complete = jest.fn(async () => raw);
    const checkText = jest.fn(async () => undefined);
    const createIfAbsent = jest.fn(async (record) => record);

    const assessment = await generateFiftyQuestionAssessment({
      ownerKey: 'owner-a', assessmentId: 'assessment-a', topic: 'TypeScript 类型系统', notes: '重点考察泛型',
    }, { complete, checkText, createIfAbsent, now: () => fixedNow });

    expect(complete).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledWith(expect.objectContaining({ topic: 'TypeScript 类型系统', notes: '重点考察泛型' }));
    expect(checkText).toHaveBeenCalledTimes(2);
    expect(assessment.paper.questionCount).toBe(50);
    expect(assessment.paper.questions).toHaveLength(50);
    expect(assessment.paper.questions.map((question) => question.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `q${index + 1}`),
    );
    expect(createIfAbsent).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['49 questions', JSON.stringify({ questions: makeQuestions(49), scoring: scoring() })],
    ['51 questions', JSON.stringify({ questions: makeQuestions(51), scoring: scoring() })],
    ['HTML response', '<!doctype html><html><body>gateway error</body></html>'],
    ['XML response', '<?xml version="1.0"?><error>upstream</error>'],
    ['schema error', JSON.stringify({ questions: makeQuestions(50).map((question) => ({ ...question, prompt: '' })), scoring: scoring() })],
  ])('rejects %s without persisting a partial assessment', async (_label, raw) => {
    const createIfAbsent = jest.fn();
    await expect(generateFiftyQuestionAssessment({
      ownerKey: 'owner-a', assessmentId: 'assessment-a', topic: 'JavaScript',
    }, {
      complete: async () => raw,
      checkText: async () => undefined,
      createIfAbsent,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' });
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  test.each(['input', 'output'] as const)('fails closed when %s moderation rejects and never persists', async (blockedStage) => {
    let checks = 0;
    const createIfAbsent = jest.fn();
    await expect(generateFiftyQuestionAssessment({
      ownerKey: 'owner-a', assessmentId: 'assessment-a', topic: 'JavaScript', notes: 'closures',
    }, {
      complete: async () => JSON.stringify({ questions: makeQuestions(50), scoring: scoring() }),
      checkText: async () => {
        checks += 1;
        if ((blockedStage === 'input' && checks === 1) || (blockedStage === 'output' && checks === 2)) {
          throw new ApiError('CONTENT_BLOCKED', 422);
        }
      },
      createIfAbsent,
      now: () => fixedNow,
    })).rejects.toMatchObject({ code: 'CONTENT_BLOCKED' });
    expect(createIfAbsent).not.toHaveBeenCalled();
  });
});

describe('OpenAI-compatible completion boundary', () => {
  test('uses one request, asks for exactly 50 questions, and follows the input language', async () => {
    const fetch = jest.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ questions: makeQuestions(50), scoring: scoring() }) } }],
    })));
    await requestOpenAICompletion({ topic: 'Python decorators', notes: 'advanced usage' }, {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model', fetch,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[0]?.content).toContain('Generate exactly 50 assessment questions');
    expect(body.messages.map((message) => message.content).join(' ')).toContain('same language as the topic and notes');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test('rejects a provider response larger than 2 MiB', async () => {
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    await expect(requestOpenAICompletion({ topic: 'JavaScript' }, {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
      fetch: async () => new Response(oversized),
    })).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' });
  });

  test('aborts the provider after 105 seconds', async () => {
    jest.useFakeTimers();
    try {
      const operation = requestOpenAICompletion({ topic: 'JavaScript' }, {
        baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
        fetch: async (_url, init) => await new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
      });
      const rejection = expect(operation).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
      await jest.advanceTimersByTimeAsync(105_000);
      await rejection;
    } finally {
      jest.useRealTimers();
    }
  });
});

function makeQuestions(count: number): AssessmentQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `source-${index + 1}`,
    type: 'single_choice',
    difficulty: index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard',
    knowledgePoint: 'Fundamentals',
    prompt: `Question ${index + 1}`,
    options: [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }],
    correctOptionIds: ['a'],
    explanation: 'Option A is correct.',
  }));
}

function scoring() {
  return {
    maxScore: 50,
    levels: [
      { minPercent: 0, maxPercent: 59, title: 'Needs work', summary: 'Keep learning.' },
      { minPercent: 60, maxPercent: 100, title: 'Ready', summary: 'Good foundation.' },
    ],
  };
}
