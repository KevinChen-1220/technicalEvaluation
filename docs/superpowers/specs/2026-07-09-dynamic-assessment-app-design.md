# Dynamic Assessment App Design

## Context

Build a new mobile application in `/Users/kevinchen/Documents/Codex/technicalEvaluation`.
The project is an Expo + React Native app that lets users generate and complete ability assessments for any topic.
Examples include iOS development, backend architecture, SQL optimization, English writing, product management, or any other user-provided capability.

The app has no backend. Users configure their own OpenAI-compatible API endpoint inside the app.
The app calls the model directly, generates a complete assessment once, and then performs answering, scoring, explanations, and final conclusions locally.

## Product Goals

- Let users evaluate an arbitrary capability topic from a mobile UI.
- Support OpenAI-compatible model providers through user-entered `Base URL`, `API Key`, and `Model`.
- Generate a full assessment in one model call whenever possible.
- Support 50-question and 100-question assessments.
- Include the correct answer and detailed explanation for every generated question.
- Avoid follow-up model calls for normal scoring and results.
- Provide clear wrong-answer review with detailed explanations and knowledge-point labels.

## Non-Goals

- No backend API service in the first version.
- No account system, sync, payment, or cloud storage.
- No built-in fixed job-direction question bank as the primary product model.
- No free-text questions in the first version, because local scoring should stay deterministic.
- No AI-generated post-submission report in the first version.

## Product Flow

1. User opens the app and configures a model provider.
2. User enters an assessment topic, selects 50 or 100 questions, and optionally adds generation notes.
3. App sends one OpenAI-compatible chat completion request.
4. Model returns a strict JSON assessment paper that includes:
   - questions
   - options
   - correct answers
   - detailed explanations
   - difficulty
   - knowledge points
   - local scoring levels
5. App validates and stores the paper in local state.
6. User answers questions in a mobile-friendly single-question flow.
7. User submits answers.
8. App scores locally, shows result level, score, accuracy, knowledge-point performance, and wrong questions.
9. User opens wrong-question details to read the explanation and compare their answer against the correct answer.

## Screens

### Model Configuration

Fields:

- `Base URL`
- `API Key`
- `Model`

Actions:

- Save configuration.
- Test connection with a minimal request.

Storage:

- API Key is saved through Expo SecureStore.
- Non-secret settings can be stored locally.

### Create Assessment

Fields:

- Topic text input.
- Question count selector: `50` or `100`.
- Optional generation notes.

Action:

- Generate assessment.

Validation:

- Topic must be non-empty after trimming.
- Model configuration must exist before generation.

### Generating

Displays:

- Current loading state.
- A message explaining that large assessments may take a while.
- Failure details when generation, JSON extraction, or schema validation fails.

Recovery:

- Retry with the same settings.
- Suggest switching from 100 questions to 50 questions if the model output is truncated or invalid.

### Answering

Displays:

- One question per screen.
- Question type.
- Difficulty.
- Knowledge point.
- Options.
- Current progress.

Actions:

- Select single answer.
- Toggle multiple answers.
- Move previous or next.
- Submit after all questions are answered.

### Results

Displays:

- Total score.
- Accuracy percentage.
- Result level title.
- Result level summary.
- Knowledge-point breakdown.
- Wrong-answer count.
- Wrong-question list.

### Wrong Question Detail

Displays:

- Original question.
- User answer.
- Correct answer.
- Detailed explanation.
- Difficulty.
- Knowledge point.

## Question Types

The first version supports:

- `single_choice`
- `multiple_choice`
- `true_false`

Scoring rules:

- Single choice: correct only when the selected option matches exactly.
- True/false: represented as two options and scored like single choice.
- Multiple choice: correct only when the selected option set exactly matches the correct option set.
- Each question is worth one point.
- No partial credit in the first version.

## Data Types

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
```

## Local Scoring Output

```ts
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

## Architecture

Use Expo + React Native + TypeScript.
The project is a pure client app.
State management stays lightweight and uses React state plus focused service modules rather than a global state framework.

Core modules:

- `aiClient`: Sends OpenAI-compatible chat completion requests.
- `assessmentGenerator`: Builds the generation prompt, calls `aiClient`, extracts strict JSON, and validates the returned assessment paper.
- `assessmentScoring`: Scores answers locally and produces result details.
- `secureConfigStore`: Saves and loads model configuration.
- `assessmentTypes`: Defines shared TypeScript types.
- `samplePaper`: Provides deterministic development data and tests without requiring network calls.

## AI Generation Strategy

The generation prompt must require one JSON object and no Markdown wrapper.
The generated JSON must conform to `AssessmentPaper`.
The prompt must ask for:

- exactly 50 or 100 questions based on user selection
- a mix of single-choice, multiple-choice, and true/false questions
- option IDs that are stable strings such as `A`, `B`, `C`, `D`
- detailed explanations for every question
- one concise knowledge point per question
- difficulty per question
- scoring levels that cover 0 through 100 percent without gaps

The app should request JSON-style output through prompt instructions, not provider-specific features, so it works across OpenAI-compatible providers.

## Validation Strategy

After receiving model output, the app validates:

- The response contains a JSON object.
- `questions.length` equals `questionCount`.
- Every question has a supported `type`.
- Every question has at least two options.
- Every `correctOptionIds` entry exists in `options`.
- Single-choice and true/false questions have exactly one correct option.
- Multiple-choice questions have one or more correct options.
- Every explanation is non-empty.
- Scoring levels cover the full range from 0 to 100 percent.

If validation fails, the app shows a readable error and offers retry.
If the requested count was 100, the app also suggests retrying with 50.

## Security and Privacy

The app does not operate a backend and does not collect user data.
The user controls the model provider and API key.
The API key should be stored through Expo SecureStore.
Assessment topics and generated content are sent directly from the device to the user-configured provider.
The UI must clearly state that user-entered topics and generated assessment prompts are sent to the configured provider.

## Error Handling

Configuration errors:

- Missing `Base URL`, `API Key`, or `Model` blocks generation.
- Invalid `Base URL` shows a validation message.

Network errors:

- Show a concise message and preserve the user's generation form.

Model errors:

- Show provider status or error text when available.

JSON errors:

- Show that the model response was not valid assessment JSON.
- Offer retry.
- Suggest reducing from 100 questions to 50 questions when applicable.

Answering errors:

- Prevent submission until every question has at least one selected answer.

## Testing Strategy

Use TDD for implementation.
Core behavior must be covered by unit tests before production code:

- local scoring
- knowledge-point aggregation
- scoring-level selection
- generated JSON extraction
- assessment schema validation
- config validation

UI screens should be structured around testable pure logic and small components.
The first version should include deterministic sample data so tests do not depend on external model calls.

## Acceptance Criteria

- A user can configure an OpenAI-compatible endpoint.
- A user can enter any assessment topic and request 50 or 100 questions.
- The app can generate and validate a complete assessment paper.
- The user can answer single-choice, multiple-choice, and true/false questions.
- The app scores entirely locally after generation.
- The result page shows score, accuracy, level, summary, knowledge-point breakdown, and wrong questions.
- Wrong-question details include the correct answer and detailed explanation.
- The normal assessment path does not require a backend or a second model call.
