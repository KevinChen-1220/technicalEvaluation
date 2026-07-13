# Mobile Tabs and Assessment History Design

## Context

SkillScope currently uses a single-screen state machine in `App.tsx`. The model provider configuration has already been moved out of the assessment creation form into a dedicated settings screen, but the app still behaves more like a linear prototype than a standard mobile app. It also does not preserve completed assessments after the user leaves the result screen.

The next iteration should make the app feel like a standard mobile experience and add local assessment history. The user confirmed the full-history approach: each submitted assessment should save the full paper, user answers, computed result, and submission time so results and explanations can be reviewed later.

## Goals

- Present the app with standard mobile bottom navigation.
- Provide three primary tabs: `Assess`, `History`, and `Settings`.
- Keep model provider configuration in `Settings`.
- Save every submitted assessment locally after scoring.
- Let users open a history item and review the same result page and question explanations from the original attempt.
- Show each reviewed question with the user's previous selection, the correct answer, difficulty, knowledge point, and detailed explanation.

## Non-Goals

- No cloud sync, account system, database server, or multi-device history.
- No editing completed answers from history.
- No deleting individual history records in this iteration.
- No separate analytics dashboard beyond the existing score, level, accuracy, wrong-question list, and knowledge-point breakdown.

## Product Design

The top-level UI becomes a mobile tab layout:

- `Assess`: create or generate a new assessment. It shows provider status, topic, notes, question-count selector, generate action, and sample paper action.
- `History`: show previous attempts. Empty history shows a quiet empty state. Each history row shows topic, score, accuracy, question count, and submission time.
- `Settings`: manage `Base URL`, `API Key`, and `Model`; save and test the OpenAI-compatible provider.

Answering, results, and question review remain full-screen task flows opened from the tabs. Results are reused for both current submissions and history replay. History replay is read-only: it restores the saved paper, answers, and result, then displays the same results and question explanation screens without changing the saved record.

## Data Model

Add a history record type:

```ts
export type AssessmentHistoryRecord = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult;
  submittedAt: string;
};
```

Records are ordered newest first. The record `id` can be derived from `paper.id`, timestamp, and a short random suffix to avoid collisions.

## Persistence

Use local JSON persistence for history records. The storage module should expose:

```ts
export type HistoryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function createHistoryRecord(
  paper: AssessmentPaper,
  answers: Record<string, string[]>,
  result: AssessmentResult,
  submittedAt?: string,
): AssessmentHistoryRecord;

export async function loadAssessmentHistory(storage?: HistoryStorage): Promise<AssessmentHistoryRecord[]>;

export async function saveAssessmentHistoryRecord(
  record: AssessmentHistoryRecord,
  storage?: HistoryStorage,
): Promise<AssessmentHistoryRecord[]>;
```

In the app, use browser/local storage where available for web and an in-memory fallback when persistent storage is unavailable. This keeps the first mobile-style iteration dependency-light. A later native-first iteration can replace the storage adapter with AsyncStorage without changing the history record API.

## Behavior

When the user submits an assessment:

1. Validate every question has at least one selected answer.
2. Compute `AssessmentResult` locally.
3. Create and save an `AssessmentHistoryRecord`.
4. Update the in-memory history list.
5. Show the result screen.

When the user opens a history item:

1. Restore `paper`, `answers`, and `result` from the selected record.
2. Enter the result screen in history-review mode.
3. Let the user open question details to compare previous answer, correct answer, and explanation.

If history loading fails, the app should show an empty history state and keep the assessment flow usable.

## Visual Direction

Use restrained, standard mobile UI patterns:

- Bottom tab bar with three text tabs.
- Compact header areas instead of oversized hero composition.
- White surfaces, light gray page background, restrained accent color, 8px radii.
- Dense but readable history rows.
- Fixed-height controls where practical to reduce layout jump.

## Testing Strategy

Add deterministic unit tests for:

- history record creation
- newest-first insertion
- persistence round trip
- corrupt history recovery

Continue running:

```bash
npm test
npm run typecheck
npx expo config --type public
```

Use browser smoke testing for:

- bottom tabs are visible
- `Settings` contains provider fields
- `History` empty state appears
- sample assessment submission creates a history entry
- opening the history entry displays the saved result and explanation

## Acceptance Criteria

- The app has `Assess`, `History`, and `Settings` bottom navigation.
- LLM provider fields are available only in `Settings`, not in the assessment creation form.
- Completed assessments are saved locally with paper, answers, result, and submission time.
- History lists saved attempts newest first.
- Opening a history item reuses the result and question explanation flow.
- Question review shows the user's previous answer, correct answer, detailed explanation, difficulty, and knowledge point.
- Existing generation, sample paper, scoring, and settings tests still pass.
