import type { AssessmentQuestion } from '@dynamic-assessment/assessment-core';
import { ApiError } from '../src/http/errors';
import { requestOpenAICompletion } from '../src/generation/openAIClient';
import { generateFiftyQuestionAssessment } from '../src/generation/generateAssessment';
import { parseAssessment } from '../src/generation/parseAssessment';

const fixedNow = new Date('2026-08-11T08:00:00.000Z');

describe('batched assessment generation', () => {
  test('generates five 10-question batches, normalizes ids, moderates both sides, and persists exactly 50 questions once', async () => {
    const complete = jest.fn(async (request: { batchNumber?: number }) => {
      const start = ((request.batchNumber ?? 0) * 10) + 1;
      const body: Record<string, unknown> = {
        questions: makeQuestions(10, start).map((question, index) => ({ ...question, id: `model-${start + index}` })),
      };
      if (request.batchNumber === 0) body.scoring = scoring();
      return `Model preface\n\`\`\`json\n${JSON.stringify(body).replace(/}$/, ',}')}\n\`\`\`\nDone`;
    });
    const checkText = jest.fn(async (_content: string, _openId: string) => undefined);
    const createIfAbsent = jest.fn(async (record) => record);

    const assessment = await generateFiftyQuestionAssessment({
      ownerKey: 'owner-a', openId: 'private-open-id', assessmentId: 'assessment-a', topic: 'TypeScript 类型系统', notes: '重点考察泛型',
    }, { complete, checkText, createIfAbsent, now: () => fixedNow });

    expect(complete).toHaveBeenCalledTimes(5);
    expect(complete.mock.calls.map(([request]) => request)).toEqual(
      Array.from({ length: 5 }, (_, index) => expect.objectContaining({
        topic: 'TypeScript 类型系统',
        notes: '重点考察泛型',
        questionCount: 10,
        batchNumber: index,
        totalBatches: 5,
        includeScoring: index === 0,
      })),
    );
    expect(checkText).toHaveBeenCalledTimes(2);
    const moderatedOutput = String(checkText.mock.calls[1]?.[0]);
    expect(moderatedOutput).toContain('"scoring"');
    expect(moderatedOutput).toContain('"levels"');
    expect(moderatedOutput).toContain('"type":"single_choice"');
    expect(moderatedOutput).toContain('"difficulty":"easy"');
    expect(moderatedOutput).toContain('"correctOptionIds"');
    expect(moderatedOutput).toContain('"explanation"');
    expect(assessment.paper.questionCount).toBe(50);
    expect(assessment.paper.questions).toHaveLength(50);
    expect(assessment.paper.questions.map((question) => question.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `q${index + 1}`),
    );
    expect(createIfAbsent).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['9 questions', JSON.stringify({ questions: makeQuestions(9), scoring: scoring() })],
    ['11 questions', JSON.stringify({ questions: makeQuestions(11), scoring: scoring() })],
    ['HTML response', '<!doctype html><html><body>gateway error</body></html>'],
    ['XML response', '<?xml version="1.0"?><error>upstream</error>'],
    ['schema error', JSON.stringify({ questions: makeQuestions(50).map((question) => ({ ...question, prompt: '' })), scoring: scoring() })],
  ])('rejects %s without persisting a partial assessment', async (_label, raw) => {
    const createIfAbsent = jest.fn();
    await expect(generateFiftyQuestionAssessment({
      ownerKey: 'owner-a', openId: 'private-open-id', assessmentId: 'assessment-a', topic: 'JavaScript',
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
      ownerKey: 'owner-a', openId: 'private-open-id', assessmentId: 'assessment-a', topic: 'JavaScript', notes: 'closures',
    }, {
      complete: async (request) => JSON.stringify({
        questions: makeQuestions(10, (request.batchNumber ?? 0) * 10 + 1),
        ...(request.includeScoring ? { scoring: scoring() } : {}),
      }),
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

describe('canonical model parsing', () => {
  test('copies only allowed question fields and removes unknown answer aliases', () => {
    const questions = makeQuestions(50).map((question) => ({
      ...question,
      answer: ['b'],
      correctAnswer: 'b',
      rationale: 'leaked alias',
      options: question.options.map((option) => ({ ...option, isCorrect: option.id === 'b' })),
    }));
    const paper = parseAssessment(JSON.stringify({ questions, scoring: scoring(), answerKey: ['b'] }), {
      assessmentId: 'assessment-a', topic: 'TypeScript', generatedAt: fixedNow.toISOString(),
    });

    expect(paper.questions[0]).toEqual({
      id: 'q1', type: 'single_choice', difficulty: 'easy', knowledgePoint: 'Fundamentals', prompt: 'Question 1',
      options: [{ id: 'a', text: 'Option A' }, { id: 'b', text: 'Option B' }],
      correctOptionIds: ['a'], explanation: 'Option A is correct.',
    });
    expect(JSON.stringify(paper)).not.toContain('correctAnswer');
    expect(JSON.stringify(paper)).not.toContain('isCorrect');
    expect(JSON.stringify(paper)).not.toContain('answerKey');
  });

  test.each([
    ['string maxScore', { ...scoring(), maxScore: '50' }],
    ['string level bound', { maxScore: 50, levels: [{ minPercent: '0', maxPercent: 100, title: 'A', summary: 'B' }] }],
  ])('rejects malformed scoring: %s', (_label, malformedScoring) => {
    expect(() => parseAssessment(JSON.stringify({ questions: makeQuestions(50), scoring: malformedScoring }), {
      assessmentId: 'assessment-a', topic: 'TypeScript', generatedAt: fixedNow.toISOString(),
    })).toThrow(expect.objectContaining({ code: 'INVALID_MODEL_RESPONSE' }));
  });

  test.each([
    ['中文主题', '这是一道中文题目'],
    ['English topic', 'This is an English question'],
  ])('preserves generated language for %s', (topic, prompt) => {
    const questions = makeQuestions(50).map((question) => ({ ...question, prompt }));
    const paper = parseAssessment(JSON.stringify({ questions, scoring: scoring() }), {
      assessmentId: 'assessment-a', topic, generatedAt: fixedNow.toISOString(),
    });
    expect(paper.topic).toBe(topic);
    expect(paper.questions[0]?.prompt).toBe(prompt);
  });
});

describe('OpenAI-compatible completion boundary', () => {
  test('asks for exactly 10 questions for the requested batch and follows the input language', async () => {
    const fetch = jest.fn(async (_url: string, init?: RequestInit) => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ questions: makeQuestions(50), scoring: scoring() }) } }],
    })));
    await requestOpenAICompletion({
      topic: 'Python decorators', notes: 'advanced usage', questionCount: 10, batchNumber: 2, totalBatches: 5, includeScoring: false,
    }, {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model', fetch,
    });

    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = fetch.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
    expect(body.messages[0]?.content).toContain('Generate exactly 10 assessment questions');
    expect(body.messages.map((message) => message.content).join(' ')).toContain('same language as the topic and notes');
    expect(body.messages.map((message) => message.content).join(' ')).toContain('"batchNumber":3');
    expect(body.messages[0]?.content).toContain('omit scoring');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  test.each([
    ['中文默认主题', undefined],
    ['English topic', 'Write every question in English'],
  ])('sends the original input language without forcing Chinese: %s', async (topic, notes) => {
    const bodies: Array<{ messages: Array<{ content: string }> }> = [];
    await requestOpenAICompletion(batchInput(topic, notes), {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
      fetch: async (_url, init) => {
        bodies.push(JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> });
        return new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }));
      },
    });
    const prompt = bodies[0]!.messages.map((message) => message.content).join(' ');
    expect(prompt).toContain(topic);
    expect(prompt).toContain('same language as the topic and notes');
    expect(prompt).toContain('default to Chinese');
  });

  test('rejects a provider response larger than 2 MiB', async () => {
    const oversized = 'x'.repeat(2 * 1024 * 1024 + 1);
    await expect(requestOpenAICompletion(batchInput('JavaScript'), {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
      fetch: async () => new Response(oversized),
    })).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' });
  });

  test.each([
    ['HTTP error', new Response(new ReadableStream<Uint8Array>({}), { status: 503 })],
    ['declared oversized body', new Response(new ReadableStream<Uint8Array>({}), {
      headers: { 'content-length': String(2 * 1024 * 1024 + 1) },
    })],
  ])('cancels an unread provider body for %s', async (_label, sourceResponse) => {
    let cancelled = false;
    const response = new Response(new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
        return new Promise<void>(() => undefined);
      },
    }), { status: sourceResponse.status, headers: sourceResponse.headers });

    const operation = requestOpenAICompletion(batchInput('JavaScript'), {
      baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
      fetch: async () => response,
    });
    const outcome = await settlesWithin(operation, 100);
    expect(outcome).toEqual({ type: 'rejected', error: expect.objectContaining({
      code: expect.stringMatching(/PROVIDER_ERROR|INVALID_MODEL_RESPONSE/),
    }) });
    expect(cancelled).toBe(true);
  });

  test('aborts the provider after 105 seconds', async () => {
    jest.useFakeTimers();
    try {
      const operation = requestOpenAICompletion(batchInput('JavaScript'), {
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

  test('enforces the provider timeout when fetch ignores abort', async () => {
    jest.useFakeTimers();
    try {
      const operation = requestOpenAICompletion(batchInput('JavaScript'), {
        baseUrl: 'https://llm.example.test/v1', apiKey: 'runtime-key', model: 'provider/model',
        fetch: async () => await new Promise<Response>(() => undefined),
      });
      const rejection = expect(operation).rejects.toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
      await jest.advanceTimersByTimeAsync(105_000);
      await rejection;
    } finally {
      jest.useRealTimers();
    }
  });
});

function makeQuestions(count: number, start = 1): AssessmentQuestion[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `source-${start + index}`,
    type: 'single_choice',
    difficulty: index % 3 === 0 ? 'easy' : index % 3 === 1 ? 'medium' : 'hard',
    knowledgePoint: 'Fundamentals',
    prompt: `Question ${start + index}`,
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

function batchInput(topic: string, notes?: string) {
  return {
    topic,
    ...(notes === undefined ? {} : { notes }),
    questionCount: 10 as const,
    batchNumber: 0,
    totalBatches: 5,
    includeScoring: true,
  };
}

async function settlesWithin(operation: Promise<unknown>, milliseconds: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation.then(
        (value) => ({ type: 'resolved' as const, value }),
        (error: unknown) => ({ type: 'rejected' as const, error }),
      ),
      new Promise<{ type: 'timeout' }>((resolve) => {
        timer = setTimeout(() => resolve({ type: 'timeout' }), milliseconds);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
