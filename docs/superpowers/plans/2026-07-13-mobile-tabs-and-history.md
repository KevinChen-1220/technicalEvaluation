# Mobile Tabs and History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add standard mobile bottom navigation and full local assessment history replay.

**Architecture:** Keep the existing lightweight React state-machine approach in `App.tsx`, but split top-level app areas into `Assess`, `History`, and `Settings` tabs. Add focused history domain and storage modules under `src/features/assessment` so persistence and replay behavior can be tested independently from UI.

**Tech Stack:** Expo, React Native, TypeScript, Jest, browser/local storage adapter with in-memory fallback.

## Global Constraints

- No backend API service.
- No account system or cloud sync.
- LLM provider fields live in `Settings`, not in the assessment creation form.
- Save every submitted assessment with paper, answers, result, and submission time.
- History replay is read-only.
- Existing generation, sample paper, scoring, settings, and provider-response tests must continue to pass.
- Use TDD for new production logic.

---

## File Structure

- Modify: `src/features/assessment/types.ts` — add `AssessmentHistoryRecord`.
- Create: `src/features/assessment/historyStore.ts` — create records, load history, save history with newest-first ordering.
- Create: `src/features/assessment/historyStore.test.ts` — TDD coverage for history creation, persistence, ordering, and corrupt recovery.
- Modify: `App.tsx` — add bottom tabs, standard mobile layout, history list, history replay, and save-on-submit.
- Modify: `README.md` — mention history.

---

### Task 1: History Domain and Persistence

**Files:**
- Modify: `src/features/assessment/types.ts`
- Create: `src/features/assessment/historyStore.ts`
- Test: `src/features/assessment/historyStore.test.ts`

**Interfaces:**
- Consumes: `AssessmentPaper`, `AssessmentResult`, and `Record<string, string[]>`
- Produces: `AssessmentHistoryRecord`, `createHistoryRecord`, `loadAssessmentHistory`, `saveAssessmentHistoryRecord`

- [ ] **Step 1: Write failing history tests**

Create `src/features/assessment/historyStore.test.ts` with tests for:

```ts
import { samplePaper } from './samplePaper';
import { scoreAssessment } from './scoring';
import {
  createHistoryRecord,
  loadAssessmentHistory,
  saveAssessmentHistoryRecord,
  type HistoryStorage,
} from './historyStore';

function createMemoryStorage(initial: Record<string, string> = {}): HistoryStorage {
  const data = { ...initial };
  return {
    getItem: async (key) => data[key] ?? null,
    setItem: async (key, value) => {
      data[key] = value;
    },
  };
}

const answers = {
  q1: ['B'],
  q2: ['A'],
  q3: ['A'],
  q4: ['A', 'C'],
};
const result = scoreAssessment(samplePaper, { paperId: samplePaper.id, answers });

describe('assessment history storage', () => {
  it('creates a full replayable history record', () => {
    const record = createHistoryRecord(samplePaper, answers, result, '2026-07-13T00:00:00.000Z');

    expect(record).toMatchObject({
      paper: samplePaper,
      answers,
      result,
      submittedAt: '2026-07-13T00:00:00.000Z',
    });
    expect(record.id).toContain(samplePaper.id);
  });

  it('saves records newest first and loads them back', async () => {
    const storage = createMemoryStorage();
    const older = createHistoryRecord(samplePaper, answers, result, '2026-07-13T00:00:00.000Z');
    const newer = createHistoryRecord(samplePaper, answers, result, '2026-07-14T00:00:00.000Z');

    await saveAssessmentHistoryRecord(older, storage);
    const saved = await saveAssessmentHistoryRecord(newer, storage);

    expect(saved.map((record) => record.submittedAt)).toEqual([
      '2026-07-14T00:00:00.000Z',
      '2026-07-13T00:00:00.000Z',
    ]);
    await expect(loadAssessmentHistory(storage)).resolves.toEqual(saved);
  });

  it('recovers with empty history when stored JSON is corrupt', async () => {
    const storage = createMemoryStorage({ skill_scope_assessment_history: '<html>bad</html>' });

    await expect(loadAssessmentHistory(storage)).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run history test to verify it fails**

Run: `npm test -- src/features/assessment/historyStore.test.ts`

Expected: FAIL because `historyStore.ts` and `AssessmentHistoryRecord` do not exist.

- [ ] **Step 3: Implement history type and store**

Add to `src/features/assessment/types.ts`:

```ts
export type AssessmentHistoryRecord = {
  id: string;
  paper: AssessmentPaper;
  answers: Record<string, string[]>;
  result: AssessmentResult;
  submittedAt: string;
};
```

Create `src/features/assessment/historyStore.ts`:

```ts
import type { AssessmentHistoryRecord, AssessmentPaper, AssessmentResult } from './types';

const historyKey = 'skill_scope_assessment_history';

export type HistoryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

export function createHistoryRecord(
  paper: AssessmentPaper,
  answers: Record<string, string[]>,
  result: AssessmentResult,
  submittedAt = new Date().toISOString(),
): AssessmentHistoryRecord {
  return {
    id: `${paper.id}-${submittedAt}-${Math.random().toString(36).slice(2, 8)}`,
    paper,
    answers,
    result,
    submittedAt,
  };
}

export async function loadAssessmentHistory(storage: HistoryStorage = defaultHistoryStorage): Promise<AssessmentHistoryRecord[]> {
  try {
    const raw = await storage.getItem(historyKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAssessmentHistoryRecord(
  record: AssessmentHistoryRecord,
  storage: HistoryStorage = defaultHistoryStorage,
): Promise<AssessmentHistoryRecord[]> {
  const current = await loadAssessmentHistory(storage);
  const next = [record, ...current].sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  await storage.setItem(historyKey, JSON.stringify(next));
  return next;
}

const defaultHistoryStorage: HistoryStorage = {
  async getItem(key) {
    if (typeof globalThis.localStorage === 'undefined') return null;
    return globalThis.localStorage.getItem(key);
  },
  async setItem(key, value) {
    if (typeof globalThis.localStorage !== 'undefined') {
      globalThis.localStorage.setItem(key, value);
    }
  },
};
```

- [ ] **Step 4: Run history test to verify it passes**

Run: `npm test -- src/features/assessment/historyStore.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/features/assessment/types.ts src/features/assessment/historyStore.ts src/features/assessment/historyStore.test.ts
git commit -m "feat: add local assessment history storage"
```

---

### Task 2: Mobile Tabs and History Replay UI

**Files:**
- Modify: `App.tsx`
- Modify: `README.md`

**Interfaces:**
- Consumes: `AssessmentHistoryRecord`, `loadAssessmentHistory`, `createHistoryRecord`, `saveAssessmentHistoryRecord`
- Produces: mobile tab UI with `Assess`, `History`, `Settings`, history save-on-submit, and read-only result replay

- [ ] **Step 1: Update `App.tsx` UI state**

Add top-level tab state:

```ts
type MainTab = 'assess' | 'history' | 'settings';
type Screen = 'main' | 'answer' | 'result' | 'review';
```

Add history state:

```ts
const [activeTab, setActiveTab] = useState<MainTab>('assess');
const [history, setHistory] = useState<AssessmentHistoryRecord[]>([]);
const [resultMode, setResultMode] = useState<'current' | 'history'>('current');
```

Load history in `useEffect` alongside config.

- [ ] **Step 2: Save completed assessments**

In `submitAnswers`, compute `submittedAt`, score the session, create a history record, save it, update state, and show the result screen.

- [ ] **Step 3: Add tab layout**

Render `Assess`, `History`, and `Settings` inside `screen === 'main'`, with a fixed bottom tab bar. Move current create content into `Assess`, current settings content into `Settings`, and add a `History` list.

- [ ] **Step 4: Add history replay**

When a user taps a history row, restore that record's `paper`, `answers`, and `result`, set `resultMode` to `history`, and show the result screen. Result and review screens should display saved answers and explanations exactly like current attempts.

- [ ] **Step 5: Update README**

Add history to features:

```md
- Local history for completed assessments
```

- [ ] **Step 6: Run verification**

Run:

```bash
npm test
npm run typecheck
npx expo config --type public
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

Run:

```bash
git add App.tsx README.md
git commit -m "feat: add mobile tabs and history replay"
```

---

### Task 3: Runtime Smoke Test and Finish

**Files:**
- No source changes expected.

**Interfaces:**
- Consumes: implemented app
- Produces: verification evidence

- [ ] **Step 1: Start local web preview**

Run:

```bash
npm run web -- --port 8084 --offline
```

Expected: Expo web listens on `http://localhost:8084`.

- [ ] **Step 2: Browser smoke test**

Verify:

- Bottom tabs show `Assess`, `History`, `Settings`.
- `Settings` contains `Base URL`, `API Key`, and `Model`.
- `History` initially shows empty state.
- `Use Sample Paper` can be submitted.
- `History` then shows the completed sample attempt.
- Opening that attempt shows the saved result and wrong-question explanation.

- [ ] **Step 3: Final verification**

Run:

```bash
npm test
npm run typecheck
git status -sb
```

Expected: tests and typecheck pass; working tree is clean after commits.
