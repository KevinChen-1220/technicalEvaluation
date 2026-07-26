# Chinese Generation Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chinese the default creation language and require generated assessment content to follow the user's input language.

**Architecture:** Keep language behavior inside the existing prompt builder rather than adding UI state or schema fields. The UI supplies Chinese defaults, while the generator preserves stable English JSON keys and enums for parsing.

**Tech Stack:** React Native, Expo, TypeScript, Jest

## Global Constraints

- Chinese topic or notes must produce Simplified Chinese user-facing assessment content.
- English topic and notes must produce English user-facing assessment content; other languages follow the same rule.
- JSON property names, question type values, difficulty values, and option IDs remain unchanged.
- Do not add a language selector or change persisted assessment schemas.

---

### Task 1: Generation Language Contract

**Files:**
- Modify: `src/features/assessment/generator.test.ts`
- Modify: `src/features/assessment/generator.ts`

**Interfaces:**
- Consumes: `buildAssessmentPrompt(request: AssessmentGenerationRequest): string`
- Produces: a prompt that requires user-facing content to follow the input language while preserving machine-readable JSON tokens

- [ ] **Step 1: Write the failing test**

Add one test that calls `buildAssessmentPrompt` with topic `iOS 开发能力` and
notes `重点考察并发与内存管理。`, then expects the result to require Simplified
Chinese for user-facing content. Add another test with `iOS development
capability` and `Focus on concurrency and memory management.` that confirms
English input remains English. Both tests preserve `single_choice` and `easy`.

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/features/assessment/generator.test.ts --runInBand`

Expected: FAIL because the prompt has no language-following requirement.

- [ ] **Step 3: Implement the minimal prompt change**

Add requirements explaining that `topic`, scoring titles and summaries,
knowledge points, prompts, option text, and explanations must follow the input
language; Chinese input must use Simplified Chinese; schema keys and enums stay
in English.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- src/features/assessment/generator.test.ts --runInBand`

Expected: PASS.

### Task 2: Chinese Creation Defaults

**Files:**
- Modify: `App.tsx`

**Interfaces:**
- Consumes: existing `topic` and `notes` state
- Produces: Chinese initial values and Chinese placeholders on the assessment brief

- [ ] **Step 1: Change the defaults**

Set the initial topic to `iOS 开发能力` and notes to
`兼顾基础知识、调试、架构和边界情况。`.

- [ ] **Step 2: Change the placeholders**

Set the topic placeholder to `例如：后端架构能力` and notes placeholder to
`可选：补充重点考察方向`.

- [ ] **Step 3: Run verification**

Run:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:web
```

Expected: all commands pass.
