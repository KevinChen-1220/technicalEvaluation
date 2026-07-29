# Mobile Input and Generation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix iPhone safe-area and keyboard behavior, make generated JSON resilient, remove the sample-paper entry point, and move generation loading feedback inside the button.

**Architecture:** A reusable keyboard-aware screen container owns safe-area and scrolling behavior. Assessment generation gains strict-then-repair parsing plus one classified retry, while the app keeps no runtime paper until generation or history selection. Loading animation stays dependency-free through React Native `Animated`.

**Tech Stack:** Expo 53, React Native 0.79, TypeScript, Jest, `react-native-safe-area-context`, `jsonrepair`.

## Global Constraints

- App chrome remains Simplified Chinese; generated content language still follows the topic language.
- Network, authentication, and HTML/XML endpoint failures must not be retried automatically.
- At most two model completion requests may occur for one user generation action.
- The bottom Tab background and iPhone bottom safe area must both use `theme.colors.surface`.
- No third-party loading animation component is added.

---

### Task 1: Repair and Retry Generated JSON

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/features/assessment/generator.ts`
- Test: `src/features/assessment/generator.test.ts`

**Interfaces:**
- Consumes: `CompletionFn`, `validateAssessmentPaper`, and `jsonrepair(json: string): string`.
- Produces: unchanged `extractJsonObject(content: string): unknown` and `generateAssessment(...): Promise<AssessmentPaper>` APIs with repair and one retry.

- [ ] **Step 1: Write failing parser tests**

Add cases proving `extractJsonObject` accepts trailing commas, single quotes, fenced JSON, and a missing final brace while HTML/XML remains a targeted failure.

```ts
expect(extractJsonObject("```json\n{'id':'paper-1','questions':[],}\n```"))
  .toEqual({ id: 'paper-1', questions: [] });
expect(extractJsonObject('{"id":"paper-1","questions":[]'))
  .toEqual({ id: 'paper-1', questions: [] });
```

- [ ] **Step 2: Run parser tests and verify RED**

Run: `npm test -- --runInBand src/features/assessment/generator.test.ts`

Expected: malformed JSON cases fail with `Model response contained a JSON-looking block, but it was not valid JSON.`

- [ ] **Step 3: Install and implement strict-then-repair parsing**

Run: `npm install jsonrepair@3.15.0`

Attempt `JSON.parse(candidate)` first, then `JSON.parse(jsonrepair(candidate))`. Keep markup detection before repair and preserve existing public error messages when both attempts fail.

- [ ] **Step 4: Run parser tests and verify GREEN**

Run: `npm test -- --runInBand src/features/assessment/generator.test.ts`

Expected: parser tests pass.

- [ ] **Step 5: Write failing retry policy tests**

Add tests where the first completion is malformed or structurally invalid and the second is valid; assert two calls and a corrective second prompt. Add an HTML response test asserting one call only.

```ts
const completionFn = jest.fn()
  .mockResolvedValueOnce('{broken')
  .mockResolvedValueOnce(JSON.stringify(validGeneratedPaper));
await expect(generateAssessment(request, config, completionFn)).resolves.toEqual(validGeneratedPaper);
expect(completionFn).toHaveBeenCalledTimes(2);
```

- [ ] **Step 6: Run retry tests and verify RED**

Run: `npm test -- --runInBand src/features/assessment/generator.test.ts`

Expected: current implementation calls the completion function once.

- [ ] **Step 7: Implement one classified retry**

Wrap parse and validation failures in a retryable internal error. Rebuild the complete prompt for attempt two and append the first failure reason plus `Regenerate the complete JSON object from scratch.` Do not catch completion-function errors or markup errors.

- [ ] **Step 8: Run generator tests and commit**

Run: `npm test -- --runInBand src/features/assessment/generator.test.ts`

```bash
git add package.json package-lock.json src/features/assessment/generator.ts src/features/assessment/generator.test.ts
git commit -m "fix: stabilize generated assessment parsing"
```

### Task 2: Safe-Area and Keyboard-Aware Screen Layout

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/layout/mobileLayout.ts`
- Test: `src/layout/mobileLayout.test.ts`
- Create: `src/components/ScreenScroll.tsx`
- Modify: `App.tsx`

**Interfaces:**
- Produces: `getScreenPadding(insets, hasTabs)` and `getKeyboardBehavior(platform)` pure helpers.
- Produces: `ScreenScroll({ children, hasTabs? })` used by every app screen.

- [ ] **Step 1: Write failing layout helper tests**

```ts
expect(getScreenPadding({ top: 47, bottom: 34 }, true)).toEqual({
  paddingTop: 71,
  paddingBottom: 140,
});
expect(getKeyboardBehavior('ios')).toBe('padding');
expect(getKeyboardBehavior('android')).toBe('height');
```

- [ ] **Step 2: Run layout tests and verify RED**

Run: `npm test -- --runInBand src/layout/mobileLayout.test.ts`

Expected: module is missing.

- [ ] **Step 3: Install safe-area dependency and implement helpers**

Run: `npx expo install react-native-safe-area-context`

Use existing spacing values: top adds `theme.spacing.lg`; tab screens add `theme.spacing.xl + 72 + bottom`; non-tab screens add `theme.spacing.xl + bottom`.

- [ ] **Step 4: Implement `ScreenScroll`**

Compose `KeyboardAvoidingView` and `ScrollView` with:

```tsx
behavior={getKeyboardBehavior(Platform.OS)}
automaticallyAdjustKeyboardInsets
keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
keyboardShouldPersistTaps="handled"
```

- [ ] **Step 5: Replace screen scroll views and extend Tab background**

Wrap the app with `SafeAreaProvider`, remove core `SafeAreaView`, and use `useSafeAreaInsets()` inside app content. Pass `insets.bottom` to `TabBar`, whose `paddingBottom` becomes `theme.spacing.md + bottom` and whose white background reaches physical screen bottom.

- [ ] **Step 6: Run layout tests, typecheck, and commit**

Run: `npm test -- --runInBand src/layout/mobileLayout.test.ts && npm run typecheck`

```bash
git add package.json package-lock.json App.tsx src/layout src/components/ScreenScroll.tsx
git commit -m "fix: handle mobile safe areas and keyboards"
```

### Task 3: Remove Sample Entry and Add In-Button Loading

**Files:**
- Create: `src/components/LoadingDots.tsx`
- Create: `src/components/loadingAnimation.ts`
- Test: `src/components/loadingAnimation.test.ts`
- Modify: `App.tsx`
- Modify: `src/i18n/zhCN.ts`

**Interfaces:**
- Produces: `getLoadingDotDelay(index: 0 | 1 | 2): number` returning `0`, `140`, and `280` milliseconds.
- Produces: `LoadingDots` rendered by `Button` when `loading` is true.

- [ ] **Step 1: Write failing loading timing test**

```ts
expect([0, 1, 2].map((index) => getLoadingDotDelay(index as 0 | 1 | 2)))
  .toEqual([0, 140, 280]);
```

- [ ] **Step 2: Run timing test and verify RED**

Run: `npm test -- --runInBand src/components/loadingAnimation.test.ts`

Expected: module is missing.

- [ ] **Step 3: Implement loading animation**

Create three `Animated.Value`s. Loop staggered sequences that animate each dot from opacity `0.35` and translateY `2` to opacity `1` and translateY `-2`, then back. Stop loops and reset values on cleanup. Render the dots beside `zhCN.assess.generating` inside the existing button dimensions.

- [ ] **Step 4: Remove the sample-paper runtime feature**

Delete the `samplePaper` import, `startSamplePaper`, button, and `zhCN.assess.sample`. Initialize `paper` as `AssessmentPaper | null`; guard submit/result/review paths and require a paper only after generation or history selection.

- [ ] **Step 5: Remove the external spinner and verify**

Delete `ActivityIndicator` usage. Pass `loading={isGenerating}` to the generate button and keep other button behavior unchanged.

Run: `npm test -- --runInBand src/components/loadingAnimation.test.ts && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add App.tsx src/components src/i18n/zhCN.ts
git commit -m "feat: polish assessment generation controls"
```

### Task 4: Full Verification and Mobile Review

**Files:**
- Modify only if verification finds a scoped defect.

- [ ] **Step 1: Run automated verification**

```bash
npm test -- --runInBand
npm run typecheck
npm run build:web
npm run verify:web
npm run verify:assets
npx expo-doctor
```

- [ ] **Step 2: Verify iPhone-sized UI**

At `390x844` and `393x852`, inspect assess, settings, keyboard-focused lower inputs, history, answer, result, and review. Confirm the Tab background covers the bottom inset, no sample-paper button exists, and the loading button keeps its dimensions.

- [ ] **Step 3: Request independent code review**

Review the feature diff for retry classification, accidental double model calls, nullable-paper errors, safe-area regressions, animation cleanup, and missing tests. Fix all Critical and Important findings.

- [ ] **Step 4: Re-run fresh verification and integrate**

Run the full command set from Step 1 after review fixes, merge into `main`, push, and wait for both GitHub CI and Pages deployment.
