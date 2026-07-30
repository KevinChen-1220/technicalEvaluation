# Rich Questions and Inline Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add structured rich question materials, reliable long-question scrolling, first-unanswered draft resume, and inline wrong-question explanations.

**Architecture:** Keep `prompt` as the backwards-compatible primary question text and add a validated `materials` discriminated union. Render materials through a focused component, keep navigation and result derivation in pure tested helpers, and simplify `App.tsx` by replacing the separate review screen with reusable inline review components.

**Tech Stack:** TypeScript, React 19, React Native 0.79, Expo 53, Jest, Expo SQLite.

## Global Constraints

- Existing papers without `materials` must remain readable without migration.
- Rich content supports only `text`, `image`, `table`, and `bar_chart` blocks.
- Image blocks accept only HTTPS URLs and must show an accessible fallback after load failure.
- No HTML, Markdown, OCR, image upload, binary image persistence, or charting dependency.
- Long questions scroll vertically; tables scroll horizontally; switching questions resets vertical position to the top.
- Drafts resume at the first unanswered question and fall back to question index `0` when all are answered.
- Wrong-question explanations render directly under the original question and options on the result screen.
- Generated material validation failures use the existing one-retry boundary.

---

### Task 1: Rich Question Contract and Validation

**Files:**
- Modify: `src/features/assessment/types.ts`
- Modify: `src/features/assessment/validation.ts`
- Modify: `src/features/assessment/validation.test.ts`
- Modify: `src/features/assessment/generator.ts`
- Modify: `src/features/assessment/generator.test.ts`
- Modify: `src/i18n/zhCN.ts`

**Interfaces:**
- Produces: `QuestionMaterial`, `QuestionTextMaterial`, `QuestionImageMaterial`, `QuestionTableMaterial`, and `QuestionBarChartMaterial`.
- Produces: optional `AssessmentQuestion.materials?: QuestionMaterial[]`.
- Preserves: `validateAssessmentPaper(input: unknown): ValidationResult`.
- Preserves: `buildAssessmentPrompt(request: AssessmentGenerationRequest): string`.

- [ ] **Step 1: Write failing rich-material validation tests**

Add a valid question containing all four blocks:

```ts
materials: [
  { type: 'text', text: '根据以下资料回答问题。' },
  {
    type: 'image',
    uri: 'https://example.com/chart.png',
    alt: '2019 至 2023 年增长趋势图',
    caption: '数据来源：示例统计年鉴',
    aspectRatio: 1.5,
  },
  {
    type: 'table',
    caption: '各地区产值',
    columns: ['地区', '2022', '2023'],
    rows: [['甲', '120', '135'], ['乙', '98', '110']],
  },
  {
    type: 'bar_chart',
    title: '2023 年产值',
    unit: '亿元',
    items: [
      { label: '甲', value: 135 },
      { label: '乙', value: 110, displayValue: '110 亿元' },
    ],
  },
]
```

Assert that `validateAssessmentPaper` accepts it. Add separate invalid cases for empty text, non-HTTPS image URI, missing alt, table row width mismatch, a one-item chart, and a negative chart value. Assert exact errors beginning with `Question q1 material 1`.

- [ ] **Step 2: Run validation tests and verify RED**

Run:

```powershell
npm test -- --runInBand src/features/assessment/validation.test.ts
```

Expected: FAIL because `materials` is not typed or validated.

- [ ] **Step 3: Add the material union and validator**

Define the discriminated union in `types.ts`. In `validation.ts`, call `validateQuestionMaterials(question, label, errors)` only when `materials` is present. Reject non-array values and validate every block without throwing on malformed unknown input.

Use these exact boundaries:

```ts
const minimumImageAspectRatio = 0.25;
const maximumImageAspectRatio = 4;

function isHttpsUri(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
```

Every error must identify the question and one-based material index.

- [ ] **Step 4: Run validation tests and verify GREEN**

Run the same targeted command and expect all validation tests to pass.

- [ ] **Step 5: Write failing generation-contract tests**

Extend the prompt test to require:

```ts
expect(prompt).toContain('"materials": [');
expect(prompt).toContain('"type": "table"');
expect(prompt).toContain('"type": "bar_chart"');
expect(prompt).toContain('Never invent an image URL');
expect(prompt).toContain('Use image blocks only when a real HTTPS image URL');
expect(prompt).toContain('Omit materials for an ordinary text-only question');
```

Add a generated-paper test whose first question contains a valid table and assert the parsed paper preserves that block unchanged.

- [ ] **Step 6: Run generation tests and verify RED**

Run:

```powershell
npm test -- --runInBand src/features/assessment/generator.test.ts
```

Expected: FAIL because the prompt does not describe rich materials.

- [ ] **Step 7: Extend the generation prompt and localized validation errors**

Add all four JSON shapes to the example and explicit usage rules from the design. Keep user-facing values in the topic language while field names and `type` values stay English. Add Chinese localization replacements for material validation messages in `zhCN.ts`.

- [ ] **Step 8: Run Task 1 tests, typecheck, and commit**

Run:

```powershell
npm test -- --runInBand src/features/assessment/validation.test.ts src/features/assessment/generator.test.ts
npm run typecheck
```

Commit:

```powershell
git add src/features/assessment/types.ts src/features/assessment/validation.ts src/features/assessment/validation.test.ts src/features/assessment/generator.ts src/features/assessment/generator.test.ts src/i18n/zhCN.ts
git commit -m "feat: support rich assessment materials"
```

---

### Task 2: Rich Material Rendering and Long-Question Scrolling

**Files:**
- Create: `src/components/questionMaterials.ts`
- Create: `src/components/questionMaterials.test.ts`
- Create: `src/components/QuestionMaterials.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: `QuestionMaterial` from Task 1.
- Produces: `getImageAspectRatio(aspectRatio?: number): number`.
- Produces: `getBarFillPercent(value: number, maximum: number): `${number}%``.
- Produces: `QuestionMaterials({ materials }: { materials?: QuestionMaterial[] })`.

- [ ] **Step 1: Write failing presentation-helper tests**

Create tests:

```ts
expect(getImageAspectRatio()).toBe(16 / 9);
expect(getImageAspectRatio(1.5)).toBe(1.5);
expect(getBarFillPercent(0, 200)).toBe('0%');
expect(getBarFillPercent(50, 200)).toBe('25%');
expect(getBarFillPercent(250, 200)).toBe('100%');
expect(getBarFillPercent(10, 0)).toBe('0%');
```

- [ ] **Step 2: Run helper tests and verify RED**

Run:

```powershell
npm test -- --runInBand src/components/questionMaterials.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement presentation helpers**

Clamp bar percentages to `0..100`, round to two decimal places, and default image aspect ratio to `16 / 9`.

- [ ] **Step 4: Run helper tests and verify GREEN**

Run the targeted test and expect all cases to pass.

- [ ] **Step 5: Implement `QuestionMaterials`**

Render:

- text as body copy;
- image with `Image`, `resizeMode="contain"`, declared/default aspect ratio, `accessibilityLabel`, caption, and per-image `onError` fallback;
- table inside a horizontal `ScrollView`, with each cell using a stable `120` point width;
- bar chart rows with visible labels, values, and proportional fills.

Use only theme colors and React Native primitives. Do not add a package.

- [ ] **Step 6: Integrate rich content and scroll reset**

In the answer screen, render:

```tsx
<QuestionMaterials materials={currentQuestion.materials} />
```

between the prompt/meta and options. Give the answer screen's `ScreenScroll` a React key:

```tsx
<ScreenScroll key={currentQuestion.id}>
```

This remounts the scroll container and returns it to the top whenever navigation changes the question. The existing vertical `ScrollView` continues to handle content taller than one screen.

- [ ] **Step 7: Run Task 2 tests, full typecheck, and commit**

Run:

```powershell
npm test -- --runInBand src/components/questionMaterials.test.ts
npm run typecheck
```

Commit:

```powershell
git add App.tsx src/components/questionMaterials.ts src/components/questionMaterials.test.ts src/components/QuestionMaterials.tsx
git commit -m "feat: render scrollable rich questions"
```

---

### Task 3: Resume Draft at First Unanswered Question

**Files:**
- Create: `src/features/assessment/questionNavigation.ts`
- Create: `src/features/assessment/questionNavigation.test.ts`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `findFirstUnansweredQuestionIndex(paper: AssessmentPaper, answers: Record<string, string[]>): number`.

- [ ] **Step 1: Write failing navigation tests**

Cover:

```ts
expect(findFirstUnansweredQuestionIndex(paper, {})).toBe(0);
expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'] })).toBe(1);
expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'], q2: [] })).toBe(1);
expect(findFirstUnansweredQuestionIndex(paper, { q1: ['A'], q2: ['B'] })).toBe(0);
```

Use a small typed paper fixture with two questions even though generated production papers contain 50 or 100 questions; the helper depends only on ordered questions.

- [ ] **Step 2: Run navigation tests and verify RED**

Run:

```powershell
npm test -- --runInBand src/features/assessment/questionNavigation.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement first-unanswered navigation**

Find the first question for which `answers[question.id]` is absent or has zero entries. Return its index, or `0` if no unanswered question exists.

- [ ] **Step 4: Integrate draft resume**

In `openHistoryRecord`, set:

```ts
setQuestionIndex(
  record.status === 'draft'
    ? findFirstUnansweredQuestionIndex(record.paper, record.answers)
    : 0,
);
```

Do not change completed-history routing.

- [ ] **Step 5: Run Task 3 tests, typecheck, and commit**

Run:

```powershell
npm test -- --runInBand src/features/assessment/questionNavigation.test.ts
npm run typecheck
```

Commit:

```powershell
git add App.tsx src/features/assessment/questionNavigation.ts src/features/assessment/questionNavigation.test.ts
git commit -m "fix: resume drafts at unanswered question"
```

---

### Task 4: Inline Wrong-Question Review

**Files:**
- Create: `src/features/assessment/wrongQuestionReview.ts`
- Create: `src/features/assessment/wrongQuestionReview.test.ts`
- Create: `src/components/WrongQuestionReview.tsx`
- Modify: `App.tsx`
- Modify: `src/i18n/zhCN.ts`

**Interfaces:**
- Consumes: `AssessmentPaper`, `AssessmentResult`, and saved answer IDs.
- Produces: `ReviewOptionState = 'neutral' | 'correct' | 'selected_wrong'`.
- Produces: `WrongQuestionReviewItem`.
- Produces: `buildWrongQuestionReviews(paper, answers, result): WrongQuestionReviewItem[]`.
- Produces: `WrongQuestionReview({ item }: { item: WrongQuestionReviewItem })`.

- [ ] **Step 1: Write failing review-model tests**

Build a paper whose wrong IDs are deliberately reversed in `result.wrongQuestionIds`. Assert `buildWrongQuestionReviews` returns wrong questions in paper order.

Assert option states:

```ts
expect(item.options).toEqual([
  expect.objectContaining({ id: 'A', state: 'selected_wrong' }),
  expect.objectContaining({ id: 'B', state: 'correct' }),
]);
expect(item.wasUnanswered).toBe(false);
```

Add an unanswered wrong question and assert `wasUnanswered` is true with no selected option.

- [ ] **Step 2: Run review-model tests and verify RED**

Run:

```powershell
npm test -- --runInBand src/features/assessment/wrongQuestionReview.test.ts
```

Expected: FAIL because the review model does not exist.

- [ ] **Step 3: Implement the review model**

Iterate `paper.questions`, filter by a `Set(result.wrongQuestionIds)`, and derive each option state with correct taking precedence over selected-wrong. Preserve the complete original question, one-based paper index, saved user option IDs, and correct option IDs.

- [ ] **Step 4: Run review-model tests and verify GREEN**

Run the targeted test and expect all cases to pass.

- [ ] **Step 5: Implement the inline review component**

Render the numbered prompt, metadata, `QuestionMaterials`, and all options. Use:

- green border/background and a “正确答案” label for correct options;
- red border/background and a “你的选择” label for selected wrong options;
- neutral styling for other options;
- “未作答” when no saved answer exists;
- an unnested explanation panel immediately below options with formatted correct answer text and `question.explanation`.

Add concise Chinese strings to `zhCN.result`.

- [ ] **Step 6: Replace the separate review page**

Remove:

- `'review'` from the screen union;
- `reviewQuestionId` and derived `reviewQuestion`;
- result-page buttons that navigate to review;
- the entire review screen branch;
- `formatOptions` if no longer used.

On the result screen, call `buildWrongQuestionReviews(paper, answers, result)` and render each item with `WrongQuestionReview`. Keep the score summary, knowledge metrics, and existing close action.

- [ ] **Step 7: Run Task 4 tests, typecheck, and commit**

Run:

```powershell
npm test -- --runInBand src/features/assessment/wrongQuestionReview.test.ts
npm run typecheck
```

Commit:

```powershell
git add App.tsx src/i18n/zhCN.ts src/features/assessment/wrongQuestionReview.ts src/features/assessment/wrongQuestionReview.test.ts src/components/WrongQuestionReview.tsx
git commit -m "feat: show wrong answers inline"
```

---

### Task 5: Integration, Visual Verification, and Release

**Files:**
- Modify only if verification reveals a defect in an already changed file.

**Interfaces:**
- Verifies all interfaces produced by Tasks 1-4.

- [ ] **Step 1: Run complete automated verification**

Run fail-fast:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:web
npm run verify:web
npm run verify:assets
npx expo-doctor
git diff --check
```

Expected: all Jest suites pass, TypeScript exits `0`, Expo export succeeds, both verifiers pass, and Expo Doctor reports all checks passing.

- [ ] **Step 2: Run mobile visual verification**

Serve the built app under `/technicalEvaluation/` and use a delayed local OpenAI-compatible mock that returns 50 valid questions. Its first question must contain:

- a prompt long enough to exceed one mobile viewport;
- a text material;
- an intentionally unreachable HTTPS image to exercise fallback;
- a wide table;
- a bar chart.

At a `393 x 852` viewport verify:

1. the full question scrolls vertically;
2. the table scrolls horizontally without widening the page;
3. image failure shows alt/fallback copy;
4. next-question navigation starts at the top;
5. a seeded draft with only question 1 answered opens on question 2;
6. after submission, wrong questions, option states, correct answers, and explanations are visible inline on the score screen;
7. no separate review page or review-navigation button remains.

- [ ] **Step 3: Request final code review**

Review the entire diff from the plan commit through the implementation head. Treat data compatibility, validation crashes, nested scrolling, draft index errors, incorrect option states, and result-history regressions as merge blockers.

- [ ] **Step 4: Integrate and publish**

After a clean review and fresh verification:

```powershell
git merge --ff-only codex/rich-questions-inline-review
git push origin main
```

Wait for CI and Pages workflows to finish successfully, then verify `https://kevinchen-1220.github.io/technicalEvaluation/` returns HTTP `200`.

