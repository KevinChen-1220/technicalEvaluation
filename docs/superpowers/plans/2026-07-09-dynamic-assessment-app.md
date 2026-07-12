# Dynamic Assessment App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Expo + React Native + TypeScript mobile app that lets users configure an OpenAI-compatible model, generate 50/100-question ability assessments, answer locally, score locally, and review detailed wrong-answer explanations.

**Architecture:** The app is a pure client Expo application. Core assessment behavior lives in focused TypeScript modules under `src/features/assessment`, model provider configuration lives under `src/features/config`, and `App.tsx` coordinates a small screen-state flow without a backend or global state framework.

**Tech Stack:** Expo, React Native, TypeScript, Jest, Expo SecureStore, OpenAI-compatible Chat Completions over `fetch`.

## Global Constraints

- No backend API service in the first version.
- Users configure their own OpenAI-compatible `Base URL`, `API Key`, and `Model` in the app.
- Generate a full assessment in one model call whenever possible.
- Support 50-question and 100-question assessments.
- Include the correct answer and detailed explanation for every generated question.
- Avoid follow-up model calls for normal scoring and results.
- Supported question types are `single_choice`, `multiple_choice`, and `true_false`.
- Local scoring gives one point per fully correct question and no partial credit.
- API Key is stored through Expo SecureStore.
- Assessment topics and generated content are sent directly from the device to the user-configured provider.
- The UI must clearly state that user-entered topics and generated assessment prompts are sent to the configured provider.
- Use TDD for production logic; deterministic tests must not require network calls.

---

## File Structure

- Create: `package.json` — npm scripts and dependencies for Expo, Jest, and TypeScript.
- Create: `app.json` — Expo application metadata.
- Create: `babel.config.js` — Expo Babel preset.
- Create: `tsconfig.json` — strict TypeScript settings.
- Create: `jest.config.js` — Jest transform settings for TypeScript source tests.
- Create: `.gitignore` — Node, Expo, and local artifact ignores.
- Create: `App.tsx` — mobile UI flow, screen state, generation orchestration, answering, results, and wrong-question review.
- Create: `src/features/assessment/types.ts` — assessment domain types.
- Create: `src/features/assessment/scoring.ts` — local scoring and knowledge-point aggregation.
- Create: `src/features/assessment/scoring.test.ts` — scoring TDD coverage.
- Create: `src/features/assessment/validation.ts` — generated paper validation.
- Create: `src/features/assessment/validation.test.ts` — validation TDD coverage.
- Create: `src/features/assessment/generator.ts` — prompt building, model response JSON extraction, and paper generation.
- Create: `src/features/assessment/generator.test.ts` — generator TDD coverage for prompt and JSON extraction.
- Create: `src/features/assessment/samplePaper.ts` — deterministic sample paper for development and UI fallback.
- Create: `src/features/config/modelConfig.ts` — config types and validation.
- Create: `src/features/config/modelConfig.test.ts` — config validation TDD coverage.
- Create: `src/features/config/secureConfigStore.ts` — Expo SecureStore wrapper.
- Create: `src/services/aiClient.ts` — OpenAI-compatible chat completion client.
- Create: `src/services/aiClient.test.ts` — request/response behavior TDD coverage using mocked `fetch`.
- Create: `src/theme.ts` — intentional visual direction, colors, spacing, typography tokens.

---

### Task 1: Project Scaffold and Config Validation

**Files:**
- Create: `package.json`
- Create: `app.json`
- Create: `babel.config.js`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `.gitignore`
- Create: `src/features/config/modelConfig.ts`
- Test: `src/features/config/modelConfig.test.ts`

**Interfaces:**
- Produces: `ModelConfig`, `ConfigValidationResult`, and `validateModelConfig(config: Partial<ModelConfig>): ConfigValidationResult`
- Consumes: none

- [x] **Step 1: Create project configuration files**

Create `package.json`:

```json
{
  "name": "dynamic-assessment-app",
  "version": "1.0.0",
  "private": true,
  "main": "node_modules/expo/AppEntry.js",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web",
    "test": "jest --runInBand",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@expo/metro-runtime": "~6.1.2",
    "expo": "~53.0.22",
    "expo-secure-store": "~14.2.3",
    "expo-status-bar": "~2.2.3",
    "react": "19.0.0",
    "react-native": "0.79.5",
    "react-native-web": "~0.20.0"
  },
  "devDependencies": {
    "@types/jest": "^29.5.14",
    "@types/react": "~19.0.10",
    "jest": "^29.7.0",
    "ts-jest": "^29.4.0",
    "typescript": "~5.8.3"
  }
}
```

Create `app.json`:

```json
{
  "expo": {
    "name": "SkillScope",
    "slug": "dynamic-assessment-app",
    "version": "1.0.0",
    "orientation": "portrait",
    "userInterfaceStyle": "light",
    "assetBundlePatterns": ["**/*"],
    "ios": { "supportsTablet": true },
    "android": { "adaptiveIcon": { "backgroundColor": "#F6EEDB" } },
    "web": { "bundler": "metro" }
  }
}
```

Create `babel.config.js`:

```js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
```

Create `tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["App.tsx", "src/**/*.ts", "src/**/*.tsx"]
}
```

Create `jest.config.js`:

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
};
```

Create `.gitignore`:

```gitignore
node_modules/
.expo/
dist/
coverage/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.DS_Store
.superpowers/sdd/
```

- [x] **Step 2: Install dependencies**

Run: `npm install`
Expected: dependencies install and `package-lock.json` is created.

- [x] **Step 3: Write the failing config validation test**

Create `src/features/config/modelConfig.test.ts`:

```ts
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
```

- [x] **Step 4: Run test to verify it fails**

Run: `npm test -- src/features/config/modelConfig.test.ts`
Expected: FAIL because `src/features/config/modelConfig.ts` does not exist.

- [x] **Step 5: Write minimal implementation**

Create `src/features/config/modelConfig.ts`:

```ts
export type ModelConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
};

export type ConfigValidationResult = {
  ok: boolean;
  errors: string[];
};

export function validateModelConfig(config: Partial<ModelConfig>): ConfigValidationResult {
  const errors: string[] = [];

  if (!config.baseUrl || !isValidUrl(config.baseUrl)) {
    errors.push('Base URL must be a valid URL.');
  }

  if (!config.apiKey?.trim()) {
    errors.push('API Key is required.');
  }

  if (!config.model?.trim()) {
    errors.push('Model is required.');
  }

  return { ok: errors.length === 0, errors };
}

function isValidUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
```

- [x] **Step 6: Run test to verify it passes**

Run: `npm test -- src/features/config/modelConfig.test.ts`
Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add .
git commit -m "chore: scaffold expo assessment app"
```

---

### Task 2: Assessment Types, Sample Data, and Local Scoring

**Files:**
- Create: `src/features/assessment/types.ts`
- Create: `src/features/assessment/samplePaper.ts`
- Create: `src/features/assessment/scoring.ts`
- Test: `src/features/assessment/scoring.test.ts`

**Interfaces:**
- Consumes: `AssessmentPaper`, `AssessmentSession`, `ScoringLevel`
- Produces: `scoreAssessment(paper: AssessmentPaper, session: AssessmentSession): AssessmentResult`

- [x] **Step 1: Write the failing scoring test**

Create `src/features/assessment/scoring.test.ts`:

```ts
import { samplePaper } from './samplePaper';
import { scoreAssessment } from './scoring';
import type { AssessmentSession } from './types';

describe('scoreAssessment', () => {
  it('scores exact matches, rejects partial multiple-choice answers, and aggregates knowledge points', () => {
    const session: AssessmentSession = {
      paperId: samplePaper.id,
      answers: {
        q1: ['B'],
        q2: ['A'],
        q3: ['A'],
        q4: ['A', 'C'],
      },
      submittedAt: '2026-07-09T00:00:00.000Z',
    };

    const result = scoreAssessment(samplePaper, session);

    expect(result.totalQuestions).toBe(4);
    expect(result.correctCount).toBe(3);
    expect(result.score).toBe(3);
    expect(result.accuracy).toBe(75);
    expect(result.level.title).toBe('Proficient');
    expect(result.wrongQuestionIds).toEqual(['q4']);
    expect(result.questionResults).toEqual([
      { questionId: 'q1', isCorrect: true, userOptionIds: ['B'], correctOptionIds: ['B'] },
      { questionId: 'q2', isCorrect: true, userOptionIds: ['A'], correctOptionIds: ['A'] },
      { questionId: 'q3', isCorrect: true, userOptionIds: ['A'], correctOptionIds: ['A'] },
      { questionId: 'q4', isCorrect: false, userOptionIds: ['A', 'C'], correctOptionIds: ['A', 'B', 'C'] },
    ]);
    expect(result.knowledgePointResults).toEqual([
      { knowledgePoint: 'Architecture', total: 1, correct: 1, accuracy: 100 },
      { knowledgePoint: 'Concurrency', total: 2, correct: 1, accuracy: 50 },
      { knowledgePoint: 'Memory', total: 1, correct: 1, accuracy: 100 },
    ]);
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/assessment/scoring.test.ts`
Expected: FAIL because assessment modules do not exist.

- [x] **Step 3: Create types and sample data**

Create `src/features/assessment/types.ts`:

```ts
export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export type QuestionDifficulty = 'easy' | 'medium' | 'hard';

export type AssessmentOption = {
  id: string;
  text: string;
};

export type AssessmentQuestion = {
  id: string;
  type: QuestionType;
  difficulty: QuestionDifficulty;
  knowledgePoint: string;
  prompt: string;
  options: AssessmentOption[];
  correctOptionIds: string[];
  explanation: string;
};

export type ScoringLevel = {
  minPercent: number;
  maxPercent: number;
  title: string;
  summary: string;
};

export type AssessmentPaper = {
  id: string;
  topic: string;
  questionCount: 50 | 100;
  generatedAt: string;
  scoring: {
    maxScore: number;
    levels: ScoringLevel[];
  };
  questions: AssessmentQuestion[];
};

export type AssessmentSession = {
  paperId: string;
  answers: Record<string, string[]>;
  submittedAt?: string;
};

export type KnowledgePointResult = {
  knowledgePoint: string;
  total: number;
  correct: number;
  accuracy: number;
};

export type QuestionResult = {
  questionId: string;
  isCorrect: boolean;
  userOptionIds: string[];
  correctOptionIds: string[];
};

export type AssessmentResult = {
  totalQuestions: number;
  correctCount: number;
  score: number;
  accuracy: number;
  level: ScoringLevel;
  questionResults: QuestionResult[];
  knowledgePointResults: KnowledgePointResult[];
  wrongQuestionIds: string[];
};
```

Create `src/features/assessment/samplePaper.ts` with four deterministic questions cast as `AssessmentPaper` so UI can demo without network:

```ts
import type { AssessmentPaper } from './types';

const levels = [
  { minPercent: 0, maxPercent: 59, title: 'Needs Practice', summary: 'Core concepts need more review before independent work.' },
  { minPercent: 60, maxPercent: 79, title: 'Proficient', summary: 'You understand the main ideas and should focus on weak knowledge points.' },
  { minPercent: 80, maxPercent: 100, title: 'Advanced', summary: 'You show strong command and can handle complex scenarios.' },
];

export const samplePaper = {
  id: 'sample-ios-paper',
  topic: 'iOS Development',
  questionCount: 50,
  generatedAt: '2026-07-09T00:00:00.000Z',
  scoring: { maxScore: 4, levels },
  questions: [
    {
      id: 'q1',
      type: 'single_choice',
      difficulty: 'easy',
      knowledgePoint: 'Memory',
      prompt: 'Which Swift keyword prevents a reference cycle in a closure capture list?',
      options: [
        { id: 'A', text: 'strong' },
        { id: 'B', text: 'weak' },
        { id: 'C', text: 'copy' },
        { id: 'D', text: 'atomic' },
      ],
      correctOptionIds: ['B'],
      explanation: '`weak` avoids increasing the reference count and prevents retain cycles when the captured object can become nil.',
    },
    {
      id: 'q2',
      type: 'true_false',
      difficulty: 'medium',
      knowledgePoint: 'Concurrency',
      prompt: 'UI updates in UIKit and SwiftUI should be performed on the main thread.',
      options: [
        { id: 'A', text: 'True' },
        { id: 'B', text: 'False' },
      ],
      correctOptionIds: ['A'],
      explanation: 'Apple UI frameworks are main-thread-bound, so UI mutations should be dispatched to the main actor or main queue.',
    },
    {
      id: 'q3',
      type: 'single_choice',
      difficulty: 'medium',
      knowledgePoint: 'Architecture',
      prompt: 'What is the main purpose of separating view models from views?',
      options: [
        { id: 'A', text: 'Keep presentation logic testable and reduce view responsibilities' },
        { id: 'B', text: 'Force every screen to use network requests' },
        { id: 'C', text: 'Disable state updates' },
        { id: 'D', text: 'Replace all model objects' },
      ],
      correctOptionIds: ['A'],
      explanation: 'A view model prepares display state and actions for the view, which keeps view code smaller and easier to test.',
    },
    {
      id: 'q4',
      type: 'multiple_choice',
      difficulty: 'hard',
      knowledgePoint: 'Concurrency',
      prompt: 'Which techniques can help make concurrent code safer in Swift?',
      options: [
        { id: 'A', text: 'Actor isolation' },
        { id: 'B', text: 'Structured concurrency' },
        { id: 'C', text: 'MainActor for UI-bound state' },
        { id: 'D', text: 'Mutating shared state from arbitrary queues' },
      ],
      correctOptionIds: ['A', 'B', 'C'],
      explanation: 'Actors, structured concurrency, and main-actor isolation reduce data races and make ownership clearer.',
    },
  ],
} satisfies AssessmentPaper;
```

- [x] **Step 4: Write minimal scoring implementation**

Create `src/features/assessment/scoring.ts`:

```ts
import type { AssessmentPaper, AssessmentResult, AssessmentSession, KnowledgePointResult, QuestionResult, ScoringLevel } from './types';

export function scoreAssessment(paper: AssessmentPaper, session: AssessmentSession): AssessmentResult {
  const questionResults: QuestionResult[] = paper.questions.map((question) => {
    const userOptionIds = normalizeIds(session.answers[question.id] ?? []);
    const correctOptionIds = normalizeIds(question.correctOptionIds);
    return {
      questionId: question.id,
      isCorrect: optionSetsEqual(userOptionIds, correctOptionIds),
      userOptionIds,
      correctOptionIds,
    };
  });

  const correctCount = questionResults.filter((result) => result.isCorrect).length;
  const totalQuestions = paper.questions.length;
  const accuracy = totalQuestions === 0 ? 0 : Math.round((correctCount / totalQuestions) * 100);

  return {
    totalQuestions,
    correctCount,
    score: correctCount,
    accuracy,
    level: findLevel(paper.scoring.levels, accuracy),
    questionResults,
    knowledgePointResults: buildKnowledgePointResults(paper, questionResults),
    wrongQuestionIds: questionResults.filter((result) => !result.isCorrect).map((result) => result.questionId),
  };
}

function normalizeIds(ids: string[]): string[] {
  return [...new Set(ids)].sort();
}

function optionSetsEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function findLevel(levels: ScoringLevel[], accuracy: number): ScoringLevel {
  return levels.find((level) => accuracy >= level.minPercent && accuracy <= level.maxPercent) ?? levels[levels.length - 1] ?? {
    minPercent: 0,
    maxPercent: 100,
    title: 'Result',
    summary: 'No scoring level was provided.',
  };
}

function buildKnowledgePointResults(paper: AssessmentPaper, questionResults: QuestionResult[]): KnowledgePointResult[] {
  const resultsById = new Map(questionResults.map((result) => [result.questionId, result]));
  const aggregate = new Map<string, { total: number; correct: number }>();

  for (const question of paper.questions) {
    const current = aggregate.get(question.knowledgePoint) ?? { total: 0, correct: 0 };
    current.total += 1;
    if (resultsById.get(question.id)?.isCorrect) {
      current.correct += 1;
    }
    aggregate.set(question.knowledgePoint, current);
  }

  return [...aggregate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([knowledgePoint, value]) => ({
      knowledgePoint,
      total: value.total,
      correct: value.correct,
      accuracy: Math.round((value.correct / value.total) * 100),
    }));
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/assessment/scoring.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/features/assessment
npm test -- src/features/assessment/scoring.test.ts
git commit -m "feat: add local assessment scoring"
```

---

### Task 3: Generated Assessment Validation

**Files:**
- Create: `src/features/assessment/validation.ts`
- Test: `src/features/assessment/validation.test.ts`

**Interfaces:**
- Consumes: `AssessmentPaper`
- Produces: `ValidationResult`, `validateAssessmentPaper(input: unknown): ValidationResult`

- [x] **Step 1: Write the failing validation test**

Create `src/features/assessment/validation.test.ts`:

```ts
import { samplePaper } from './samplePaper';
import { validateAssessmentPaper } from './validation';

describe('validateAssessmentPaper', () => {
  it('accepts a structurally valid generated paper', () => {
    expect(validateAssessmentPaper(samplePaper)).toEqual({ ok: true, errors: [], paper: samplePaper });
  });

  it('rejects unsupported types, missing explanations, bad answers, and question-count mismatches', () => {
    const invalid = {
      ...samplePaper,
      questionCount: 50,
      questions: [
        { ...samplePaper.questions[0], type: 'essay', explanation: '', correctOptionIds: ['Z'] },
      ],
    };

    expect(validateAssessmentPaper(invalid)).toEqual({
      ok: false,
      errors: [
        'Question count must match the number of questions.',
        'Question q1 has an unsupported type.',
        'Question q1 has correct options that do not exist.',
        'Question q1 must include a detailed explanation.',
      ],
    });
  });

  it('rejects scoring levels that do not cover 0 through 100 percent', () => {
    const invalid = {
      ...samplePaper,
      scoring: { maxScore: 4, levels: [{ minPercent: 10, maxPercent: 90, title: 'Partial', summary: 'Incomplete.' }] },
    };

    expect(validateAssessmentPaper(invalid)).toEqual({
      ok: false,
      errors: ['Scoring levels must cover 0 through 100 percent.'],
    });
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/assessment/validation.test.ts`
Expected: FAIL because validation module does not exist.

- [x] **Step 3: Write minimal validation implementation**

Create `src/features/assessment/validation.ts`:

```ts
import type { AssessmentPaper, QuestionType } from './types';

const supportedTypes = new Set<QuestionType>(['single_choice', 'multiple_choice', 'true_false']);

export type ValidationResult =
  | { ok: true; errors: []; paper: AssessmentPaper }
  | { ok: false; errors: string[] };

export function validateAssessmentPaper(input: unknown): ValidationResult {
  const errors: string[] = [];

  if (!isRecord(input)) {
    return { ok: false, errors: ['Assessment response must be a JSON object.'] };
  }

  const questions = Array.isArray(input.questions) ? input.questions : [];
  const questionCount = input.questionCount;

  if ((questionCount !== 50 && questionCount !== 100) || questions.length !== questionCount) {
    errors.push('Question count must match the number of questions.');
  }

  for (const rawQuestion of questions) {
    if (!isRecord(rawQuestion)) {
      errors.push('Every question must be a JSON object.');
      continue;
    }

    const questionId = typeof rawQuestion.id === 'string' && rawQuestion.id.trim() ? rawQuestion.id : 'unknown';
    const options = Array.isArray(rawQuestion.options) ? rawQuestion.options : [];
    const optionIds = new Set(
      options.filter(isRecord).map((option) => option.id).filter((id): id is string => typeof id === 'string'),
    );
    const correctOptionIds = Array.isArray(rawQuestion.correctOptionIds) ? rawQuestion.correctOptionIds : [];

    if (!supportedTypes.has(rawQuestion.type as QuestionType)) {
      errors.push(`Question ${questionId} has an unsupported type.`);
    }

    if (options.length < 2) {
      errors.push(`Question ${questionId} must include at least two options.`);
    }

    if (correctOptionIds.some((id) => typeof id !== 'string' || !optionIds.has(id))) {
      errors.push(`Question ${questionId} has correct options that do not exist.`);
    }

    if ((rawQuestion.type === 'single_choice' || rawQuestion.type === 'true_false') && correctOptionIds.length !== 1) {
      errors.push(`Question ${questionId} must have exactly one correct option.`);
    }

    if (rawQuestion.type === 'multiple_choice' && correctOptionIds.length < 1) {
      errors.push(`Question ${questionId} must have at least one correct option.`);
    }

    if (typeof rawQuestion.explanation !== 'string' || !rawQuestion.explanation.trim()) {
      errors.push(`Question ${questionId} must include a detailed explanation.`);
    }
  }

  if (!scoringCoversFullRange(input.scoring)) {
    errors.push('Scoring levels must cover 0 through 100 percent.');
  }

  return errors.length === 0 ? { ok: true, errors: [], paper: input as AssessmentPaper } : { ok: false, errors };
}

function scoringCoversFullRange(scoring: unknown): boolean {
  if (!isRecord(scoring) || !Array.isArray(scoring.levels) || scoring.levels.length === 0) {
    return false;
  }

  const levels = scoring.levels.filter(isRecord);
  return levels.some((level) => level.minPercent === 0) && levels.some((level) => level.maxPercent === 100);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `npm test -- src/features/assessment/validation.test.ts`
Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add src/features/assessment/validation.ts src/features/assessment/validation.test.ts
git commit -m "feat: validate generated assessment papers"
```

---

### Task 4: AI Client and Assessment Generator

**Files:**
- Create: `src/services/aiClient.ts`
- Test: `src/services/aiClient.test.ts`
- Create: `src/features/assessment/generator.ts`
- Test: `src/features/assessment/generator.test.ts`

**Interfaces:**
- Consumes: `ModelConfig`, `AssessmentPaper`, `validateAssessmentPaper`
- Produces: `createChatCompletion(config, messages, fetchImpl?)`, `buildAssessmentPrompt(request)`, `extractJsonObject(content)`, `generateAssessment(request, config)`

- [x] **Step 1: Write failing AI client tests**

Create `src/services/aiClient.test.ts`:

```ts
import { createChatCompletion } from './aiClient';

describe('createChatCompletion', () => {
  it('sends an OpenAI-compatible chat completion request and returns message content', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }] }),
    });

    const content = await createChatCompletion(
      { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'test-model' },
      [{ role: 'user', content: 'hello' }],
      fetchMock,
    );

    expect(content).toBe('{"ok":true}');
    expect(fetchMock).toHaveBeenCalledWith('https://api.example.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer sk-test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'test-model', messages: [{ role: 'user', content: 'hello' }], temperature: 0.2 }),
    });
  });

  it('throws readable provider errors', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'Unauthorized' });

    await expect(
      createChatCompletion({ baseUrl: 'https://api.example.com/v1/', apiKey: 'bad', model: 'test-model' }, [{ role: 'user', content: 'hello' }], fetchMock),
    ).rejects.toThrow('Model provider returned 401: Unauthorized');
  });
});
```

- [x] **Step 2: Run client test to verify it fails**

Run: `npm test -- src/services/aiClient.test.ts`
Expected: FAIL because `aiClient.ts` does not exist.

- [x] **Step 3: Implement AI client**

Create `src/services/aiClient.ts`:

```ts
import type { ModelConfig } from '../features/config/modelConfig';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

type FetchLike = typeof fetch;

export async function createChatCompletion(config: ModelConfig, messages: ChatMessage[], fetchImpl: FetchLike = fetch): Promise<string> {
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: config.model, messages, temperature: 0.2 }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Model provider returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Model provider returned an empty response.');
  }
  return content;
}
```

- [x] **Step 4: Run client test to verify it passes**

Run: `npm test -- src/services/aiClient.test.ts`
Expected: PASS.

- [x] **Step 5: Write failing generator tests**

Create `src/features/assessment/generator.test.ts`:

```ts
import { samplePaper } from './samplePaper';
import { buildAssessmentPrompt, extractJsonObject, generateAssessment } from './generator';

describe('assessment generator', () => {
  it('builds a prompt that asks for strict JSON, the selected topic, and the selected question count', () => {
    const prompt = buildAssessmentPrompt({ topic: 'SQL optimization', questionCount: 100, notes: 'Focus on indexes.' });

    expect(prompt).toContain('SQL optimization');
    expect(prompt).toContain('exactly 100 questions');
    expect(prompt).toContain('Focus on indexes.');
    expect(prompt).toContain('Return one JSON object only');
    expect(prompt).toContain('single_choice');
    expect(prompt).toContain('multiple_choice');
    expect(prompt).toContain('true_false');
  });

  it('extracts JSON from plain JSON and fenced model output', () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('generates and validates an assessment paper from a model response', async () => {
    const createCompletion = jest.fn().mockResolvedValue(JSON.stringify(samplePaper));

    const paper = await generateAssessment(
      { topic: 'iOS development', questionCount: 50 },
      { baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test', model: 'test-model' },
      createCompletion,
    );

    expect(paper).toEqual(samplePaper);
    expect(createCompletion).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 6: Run generator test to verify it fails**

Run: `npm test -- src/features/assessment/generator.test.ts`
Expected: FAIL because generator module does not exist.

- [x] **Step 7: Implement generator**

Create `src/features/assessment/generator.ts`:

```ts
import type { ModelConfig } from '../config/modelConfig';
import type { AssessmentPaper } from './types';
import { validateAssessmentPaper } from './validation';
import { createChatCompletion, type ChatMessage } from '../../services/aiClient';

export type AssessmentGenerationRequest = {
  topic: string;
  questionCount: 50 | 100;
  notes?: string;
};

type CompletionFn = (config: ModelConfig, messages: ChatMessage[]) => Promise<string>;

export function buildAssessmentPrompt(request: AssessmentGenerationRequest): string {
  const notes = request.notes?.trim() ? `\nAdditional requirements: ${request.notes.trim()}` : '';
  return `Create an ability assessment for topic: ${request.topic.trim()}.
Return one JSON object only. Do not wrap it in Markdown.
The JSON must match this structure: {"id":"string","topic":"string","questionCount":50,"generatedAt":"ISO string","scoring":{"maxScore":number,"levels":[{"minPercent":0,"maxPercent":59,"title":"string","summary":"string"}]},"questions":[{"id":"q1","type":"single_choice","difficulty":"easy","knowledgePoint":"string","prompt":"string","options":[{"id":"A","text":"string"}],"correctOptionIds":["A"],"explanation":"string"}]}.
Generate exactly ${request.questionCount} questions.
Use only these question types: single_choice, multiple_choice, true_false.
Use stable option IDs like A, B, C, D.
Every question must include correctOptionIds and a detailed explanation.
Scoring levels must cover 0 through 100 percent without gaps.
Set maxScore equal to the number of questions.${notes}`;
}

export function extractJsonObject(content: string): unknown {
  const trimmed = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('Model response did not contain a JSON object.');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

export async function generateAssessment(
  request: AssessmentGenerationRequest,
  config: ModelConfig,
  completionFn: CompletionFn = createChatCompletion,
): Promise<AssessmentPaper> {
  const content = await completionFn(config, [
    { role: 'system', content: 'You generate deterministic, valid JSON assessment papers for mobile apps.' },
    { role: 'user', content: buildAssessmentPrompt(request) },
  ]);
  const parsed = extractJsonObject(content);
  const validation = validateAssessmentPaper(parsed);
  if (!validation.ok) {
    throw new Error(`Generated assessment is invalid: ${validation.errors.join(' ')}`);
  }
  return validation.paper;
}
```

- [x] **Step 8: Run generator and client tests to verify they pass**

Run: `npm test -- src/services/aiClient.test.ts src/features/assessment/generator.test.ts`
Expected: PASS.

- [x] **Step 9: Commit**

```bash
git add src/services src/features/assessment/generator.ts src/features/assessment/generator.test.ts
git commit -m "feat: generate assessments from openai compatible models"
```

---

### Task 5: Secure Config Store and Mobile App UI

**Files:**
- Create: `src/features/config/secureConfigStore.ts`
- Create: `src/theme.ts`
- Create: `App.tsx`

**Interfaces:**
- Consumes: `ModelConfig`, `validateModelConfig`, `generateAssessment`, `scoreAssessment`, `samplePaper`
- Produces: mobile UI screens for config, creation, answering, results, and wrong-question details

- [x] **Step 1: Create SecureStore wrapper**

Create `src/features/config/secureConfigStore.ts`:

```ts
import * as SecureStore from 'expo-secure-store';
import type { ModelConfig } from './modelConfig';

const configKey = 'skill_scope_model_config';

export async function saveModelConfig(config: ModelConfig): Promise<void> {
  await SecureStore.setItemAsync(configKey, JSON.stringify(config));
}

export async function loadModelConfig(): Promise<ModelConfig | null> {
  const raw = await SecureStore.getItemAsync(configKey);
  if (!raw) return null;
  return JSON.parse(raw) as ModelConfig;
}
```

- [x] **Step 2: Create visual theme tokens**

Create `src/theme.ts`:

```ts
export const theme = {
  colors: {
    ink: '#241F18',
    muted: '#746A5D',
    paper: '#F6EEDB',
    card: '#FFF9ED',
    ember: '#D8572A',
    moss: '#466A4B',
    sky: '#BFD7EA',
    border: '#E0CFAE',
    danger: '#9F2D20',
  },
  radius: {
    card: 28,
    pill: 999,
  },
  spacing: {
    xs: 6,
    sm: 10,
    md: 16,
    lg: 24,
    xl: 34,
  },
  type: {
    display: 'Georgia',
    body: 'Avenir Next',
  },
};
```

- [x] **Step 3: Create App UI**

Create `App.tsx` with screen-state flow:

```tsx
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { generateAssessment } from './src/features/assessment/generator';
import { samplePaper } from './src/features/assessment/samplePaper';
import { scoreAssessment } from './src/features/assessment/scoring';
import type { AssessmentPaper, AssessmentResult, AssessmentSession } from './src/features/assessment/types';
import { loadModelConfig, saveModelConfig } from './src/features/config/secureConfigStore';
import { type ModelConfig, validateModelConfig } from './src/features/config/modelConfig';
import { theme } from './src/theme';

type Screen = 'create' | 'answer' | 'result' | 'review';

const emptyConfig: ModelConfig = { baseUrl: '', apiKey: '', model: '' };

export default function App() {
  const [screen, setScreen] = useState<Screen>('create');
  const [config, setConfig] = useState<ModelConfig>(emptyConfig);
  const [topic, setTopic] = useState('iOS development capability');
  const [notes, setNotes] = useState('Balance fundamentals, practical debugging, architecture, and edge cases.');
  const [questionCount, setQuestionCount] = useState<50 | 100>(50);
  const [paper, setPaper] = useState<AssessmentPaper>(samplePaper);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [questionIndex, setQuestionIndex] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [reviewQuestionId, setReviewQuestionId] = useState<string | null>(null);

  useEffect(() => {
    loadModelConfig().then((saved) => {
      if (saved) setConfig(saved);
    });
  }, []);

  const session: AssessmentSession = useMemo(() => ({ paperId: paper.id, answers }), [answers, paper.id]);
  const result: AssessmentResult = useMemo(() => scoreAssessment(paper, session), [paper, session]);
  const currentQuestion = paper.questions[questionIndex];
  const reviewQuestion = paper.questions.find((question) => question.id === reviewQuestionId) ?? paper.questions[0];

  async function handleSaveConfig() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert('Configuration needs attention', validation.errors.join('\n'));
      return;
    }
    await saveModelConfig(config);
    Alert.alert('Configuration saved', 'Your API key stays on this device and is sent only to your configured provider.');
  }

  async function handleGenerate() {
    const validation = validateModelConfig(config);
    if (!validation.ok) {
      Alert.alert('Add model configuration first', validation.errors.join('\n'));
      return;
    }
    if (!topic.trim()) {
      Alert.alert('Topic required', 'Enter the capability you want to assess.');
      return;
    }
    setIsGenerating(true);
    setGenerationError(null);
    try {
      const generated = await generateAssessment({ topic, questionCount, notes }, config);
      setPaper(generated);
      setAnswers({});
      setQuestionIndex(0);
      setScreen('answer');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown generation error.';
      setGenerationError(questionCount === 100 ? `${message} Try 50 questions if the provider truncated the output.` : message);
    } finally {
      setIsGenerating(false);
    }
  }

  function toggleAnswer(optionId: string) {
    if (!currentQuestion) return;
    setAnswers((previous) => {
      const current = previous[currentQuestion.id] ?? [];
      const next = currentQuestion.type === 'multiple_choice'
        ? current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId]
        : [optionId];
      return { ...previous, [currentQuestion.id]: next };
    });
  }

  function submitAnswers() {
    const unanswered = paper.questions.filter((question) => !answers[question.id]?.length);
    if (unanswered.length > 0) {
      Alert.alert('Keep going', `${unanswered.length} questions still need an answer.`);
      return;
    }
    setScreen('result');
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.container}>
        {screen === 'create' && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>SkillScope</Text>
            <Text style={styles.title}>Generate a rigorous ability test from any topic.</Text>
            <Text style={styles.notice}>Your topic and generated prompt are sent directly to the model provider you configure. No backend is used.</Text>
            <Section title="Model Provider">
              <Input label="Base URL" value={config.baseUrl} onChangeText={(baseUrl) => setConfig((value) => ({ ...value, baseUrl }))} placeholder="https://api.openai.com/v1" />
              <Input label="API Key" value={config.apiKey} onChangeText={(apiKey) => setConfig((value) => ({ ...value, apiKey }))} placeholder="sk-..." secureTextEntry />
              <Input label="Model" value={config.model} onChangeText={(model) => setConfig((value) => ({ ...value, model }))} placeholder="gpt-4.1-mini" />
              <Button label="Save Configuration" onPress={handleSaveConfig} tone="secondary" />
            </Section>
            <Section title="Assessment Brief">
              <Input label="Topic" value={topic} onChangeText={setTopic} placeholder="Backend architecture capability" />
              <Input label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional focus areas" multiline />
              <View style={styles.row}>
                <Chip label="50 questions" active={questionCount === 50} onPress={() => setQuestionCount(50)} />
                <Chip label="100 questions" active={questionCount === 100} onPress={() => setQuestionCount(100)} />
              </View>
              {generationError ? <Text style={styles.error}>{generationError}</Text> : null}
              <Button label={isGenerating ? 'Generating...' : 'Generate Assessment'} onPress={handleGenerate} disabled={isGenerating} />
              {isGenerating ? <ActivityIndicator color={theme.colors.ember} /> : null}
              <Button label="Use Sample Paper" onPress={() => { setPaper(samplePaper); setAnswers({}); setQuestionIndex(0); setScreen('answer'); }} tone="secondary" />
            </Section>
          </View>
        )}

        {screen === 'answer' && currentQuestion && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>{paper.topic}</Text>
            <Text style={styles.progress}>Question {questionIndex + 1} of {paper.questions.length} · {currentQuestion.difficulty} · {currentQuestion.knowledgePoint}</Text>
            <Text style={styles.question}>{currentQuestion.prompt}</Text>
            <View style={styles.stack}>
              {currentQuestion.options.map((option) => {
                const active = answers[currentQuestion.id]?.includes(option.id) ?? false;
                return <Option key={option.id} label={`${option.id}. ${option.text}`} active={active} onPress={() => toggleAnswer(option.id)} />;
              })}
            </View>
            <View style={styles.row}>
              <Button label="Previous" onPress={() => setQuestionIndex((index) => Math.max(0, index - 1))} tone="secondary" disabled={questionIndex === 0} />
              {questionIndex === paper.questions.length - 1 ? (
                <Button label="Submit" onPress={submitAnswers} />
              ) : (
                <Button label="Next" onPress={() => setQuestionIndex((index) => Math.min(paper.questions.length - 1, index + 1))} />
              )}
            </View>
          </View>
        )}

        {screen === 'result' && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>Result</Text>
            <Text style={styles.title}>{result.level.title}</Text>
            <Text style={styles.score}>{result.score}/{result.totalQuestions} · {result.accuracy}%</Text>
            <Text style={styles.notice}>{result.level.summary}</Text>
            <Section title="Knowledge Points">
              {result.knowledgePointResults.map((item) => (
                <Text key={item.knowledgePoint} style={styles.metric}>{item.knowledgePoint}: {item.correct}/{item.total} ({item.accuracy}%)</Text>
              ))}
            </Section>
            <Section title={`Wrong Questions (${result.wrongQuestionIds.length})`}>
              {result.wrongQuestionIds.length === 0 ? <Text style={styles.notice}>No wrong answers. Strong work.</Text> : null}
              {result.wrongQuestionIds.map((id) => {
                const question = paper.questions.find((item) => item.id === id);
                return question ? <Button key={id} label={question.prompt} onPress={() => { setReviewQuestionId(id); setScreen('review'); }} tone="secondary" /> : null;
              })}
            </Section>
            <Button label="Create Another Assessment" onPress={() => setScreen('create')} tone="secondary" />
          </View>
        )}

        {screen === 'review' && reviewQuestion && (
          <View style={styles.stack}>
            <Text style={styles.kicker}>{reviewQuestion.knowledgePoint}</Text>
            <Text style={styles.question}>{reviewQuestion.prompt}</Text>
            <Text style={styles.metric}>Your answer: {formatOptions(reviewQuestion, answers[reviewQuestion.id] ?? [])}</Text>
            <Text style={styles.metric}>Correct answer: {formatOptions(reviewQuestion, reviewQuestion.correctOptionIds)}</Text>
            <Text style={styles.notice}>{reviewQuestion.explanation}</Text>
            <Button label="Back to Results" onPress={() => setScreen('result')} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <View style={styles.card}><Text style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

function Input(props: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; secureTextEntry?: boolean; multiline?: boolean }) {
  return <View><Text style={styles.label}>{props.label}</Text><TextInput {...props} style={[styles.input, props.multiline && styles.textArea]} placeholderTextColor={theme.colors.muted} /></View>;
}

function Button({ label, onPress, tone = 'primary', disabled = false }: { label: string; onPress: () => void; tone?: 'primary' | 'secondary'; disabled?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} style={[styles.button, tone === 'secondary' && styles.secondaryButton, disabled && styles.disabled]}><Text style={[styles.buttonText, tone === 'secondary' && styles.secondaryButtonText]}>{label}</Text></Pressable>;
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.chip, active && styles.activeChip]}><Text style={[styles.chipText, active && styles.activeChipText]}>{label}</Text></Pressable>;
}

function Option({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.option, active && styles.activeOption]}><Text style={styles.optionText}>{label}</Text></Pressable>;
}

function formatOptions(question: { options: { id: string; text: string }[] }, ids: string[]): string {
  return ids.map((id) => question.options.find((option) => option.id === id)?.text ?? id).join(', ') || 'No answer';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: theme.colors.paper },
  container: { padding: theme.spacing.lg, gap: theme.spacing.lg },
  stack: { gap: theme.spacing.md },
  row: { flexDirection: 'row', gap: theme.spacing.sm, flexWrap: 'wrap' },
  kicker: { color: theme.colors.ember, fontFamily: theme.type.body, fontSize: 13, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: theme.colors.ink, fontFamily: theme.type.display, fontSize: 40, lineHeight: 45, fontWeight: '700' },
  question: { color: theme.colors.ink, fontFamily: theme.type.display, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  progress: { color: theme.colors.muted, fontFamily: theme.type.body, fontSize: 14, fontWeight: '700' },
  notice: { color: theme.colors.muted, fontFamily: theme.type.body, fontSize: 15, lineHeight: 22 },
  error: { color: theme.colors.danger, fontFamily: theme.type.body, fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: theme.colors.card, borderColor: theme.colors.border, borderRadius: theme.radius.card, borderWidth: 1, gap: theme.spacing.md, padding: theme.spacing.lg },
  sectionTitle: { color: theme.colors.ink, fontFamily: theme.type.display, fontSize: 23, fontWeight: '700' },
  label: { color: theme.colors.muted, fontFamily: theme.type.body, fontSize: 12, fontWeight: '800', letterSpacing: 1, marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border, borderRadius: 18, borderWidth: 1, color: theme.colors.ink, fontFamily: theme.type.body, fontSize: 16, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  textArea: { minHeight: 86, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: theme.colors.ink, borderRadius: theme.radius.pill, paddingHorizontal: theme.spacing.lg, paddingVertical: 14 },
  secondaryButton: { backgroundColor: theme.colors.sky },
  disabled: { opacity: 0.45 },
  buttonText: { color: theme.colors.card, fontFamily: theme.type.body, fontSize: 15, fontWeight: '800' },
  secondaryButtonText: { color: theme.colors.ink },
  chip: { borderColor: theme.colors.border, borderRadius: theme.radius.pill, borderWidth: 1, paddingHorizontal: theme.spacing.md, paddingVertical: theme.spacing.sm },
  activeChip: { backgroundColor: theme.colors.moss, borderColor: theme.colors.moss },
  chipText: { color: theme.colors.ink, fontFamily: theme.type.body, fontWeight: '800' },
  activeChipText: { color: '#FFFFFF' },
  option: { backgroundColor: '#FFFFFF', borderColor: theme.colors.border, borderRadius: 22, borderWidth: 1, padding: theme.spacing.md },
  activeOption: { backgroundColor: '#F8D8BF', borderColor: theme.colors.ember },
  optionText: { color: theme.colors.ink, fontFamily: theme.type.body, fontSize: 16, lineHeight: 22 },
  score: { color: theme.colors.ember, fontFamily: theme.type.display, fontSize: 36, fontWeight: '700' },
  metric: { color: theme.colors.ink, fontFamily: theme.type.body, fontSize: 16, lineHeight: 23 },
});
```

- [x] **Step 4: Run full verification**

Run: `npm test`
Expected: all tests PASS.

Run: `npm run typecheck`
Expected: TypeScript exits 0.

- [x] **Step 5: Commit**

```bash
git add App.tsx src/features/config/secureConfigStore.ts src/theme.ts
git commit -m "feat: build mobile assessment flow"
```

---

### Task 6: Final Verification and Documentation

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: implemented app and scripts
- Produces: local run instructions, privacy notes, and verification evidence

- [x] **Step 1: Create README**

Create `README.md`:

```md
# SkillScope

SkillScope is an Expo mobile app for generating ability assessments from any topic. Users configure their own OpenAI-compatible model provider, generate a complete 50-question or 100-question assessment, answer on device, and receive local scoring plus wrong-answer explanations.

## Features

- OpenAI-compatible configuration: Base URL, API Key, Model
- No backend service
- 50-question and 100-question assessment generation
- Single-choice, multiple-choice, and true/false questions
- Local scoring after generation
- Knowledge-point breakdown
- Wrong-answer review with detailed explanations

## Privacy Model

The app does not run a backend. Your API key is stored on device with Expo SecureStore. Assessment topics and generation prompts are sent directly from your device to the model provider you configure.

## Development

```bash
npm install
npm test
npm run typecheck
npm run start
```

Use **Use Sample Paper** in the app to test the full answering and scoring flow without calling a model provider.
```

- [x] **Step 2: Run test suite**

Run: `npm test`
Expected: all tests PASS.

- [x] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: TypeScript exits 0.

- [x] **Step 4: Run Expo config check**

Run: `npx expo config --type public`
Expected: command exits 0 and prints Expo config.

- [x] **Step 5: Commit**

```bash
git add README.md docs/superpowers/plans/2026-07-09-dynamic-assessment-app.md
git commit -m "docs: add assessment app implementation plan and readme"
```

---

## Execution Record

Completed on Windows after migrating the repository root from the nested macOS extraction layout to `E:\Project\technicalEvaluation`.

Implementation notes:

- The app was implemented on `main` after completing the temporary `dynamic-assessment-app-implementation` worktree and merging it back.
- `react-dom` was added explicitly because `react-native-web` requires it as a peer dependency.
- `@expo/metro-runtime` was aligned to `~5.0.5` and `react-native` to `0.79.6` because Expo SDK 53's dependency validation requested those versions.
- `npm install` used `https://registry.npmmirror.com` during setup because direct npm registry requests repeatedly returned `ECONNRESET` in this environment.
- Local Expo web preview was run with `--offline` because Expo CLI's dependency doctor could not fetch remote version metadata during startup.

Final verification commands:

```bash
npm test
npm run typecheck
npx expo config --type public
```

Final publishing target:

- GitHub repository: `https://github.com/KevinChen-1220/technicalEvaluation`
- Default branch: `main`
