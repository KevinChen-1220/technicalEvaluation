# Chinese Generation Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Chinese the default creation language and require generated assessment content to follow the user's input language.

**Architecture:** Keep language behavior inside the existing prompt builder rather than adding UI state or schema fields. The UI supplies Chinese defaults, while the generator preserves stable English JSON keys and enums for parsing.

**Tech Stack:** React Native, Expo, TypeScript, Jest

## Global Constraints

- Chinese topics must produce Simplified Chinese user-facing assessment content.
- The topic is the sole language source; notes do not override it when their language differs.
- English topics must produce English user-facing assessment content; other languages follow the same rule.
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

- [x] **Step 1: Write the failing test**

Add Chinese-topic/English-notes, English-topic/Chinese-notes, and Spanish-topic
cases. Assert that the topic is the sole output-language source, notes do not
override it, non-Chinese topics do not default to Chinese, and machine-readable
values such as `single_choice` and `easy` remain unchanged.

- [x] **Step 2: Run the focused test to verify it fails**

Run: `npm test -- src/features/assessment/generator.test.ts --runInBand`

Expected: FAIL because the prompt has no language-following requirement.

- [x] **Step 3: Implement the minimal prompt change**

Add requirements explaining that `topic`, scoring titles and summaries,
knowledge points, prompts, option text, and explanations must follow the topic
language; notes do not override it; Chinese topics use Simplified Chinese; and
schema keys and enums stay in English.

- [x] **Step 4: Run the focused test**

Run: `npm test -- src/features/assessment/generator.test.ts --runInBand`

Expected: PASS.

### Task 2: Chinese Creation Defaults

**Files:**
- Create: `src/features/assessment/assessmentBriefDefaults.ts`
- Create: `src/features/assessment/assessmentBriefDefaults.test.ts`
- Modify: `App.tsx`

**Interfaces:**
- Consumes: existing `topic` and `notes` state
- Produces: Chinese initial values and Chinese placeholders on the assessment brief

- [x] **Step 1: Change the defaults**

Create and test `defaultAssessmentBrief` with topic `iOS 开发能力` and notes
`兼顾基础知识、调试、架构和边界情况。`, then consume it from `App.tsx`.

- [x] **Step 2: Change the placeholders**

Set the topic placeholder to `例如：后端架构能力` and notes placeholder to
`可选：补充重点考察方向`.

- [x] **Step 3: Run verification**

Run:

```powershell
npm test -- --runInBand
npm run typecheck
npm run build:web
```

Expected: all commands pass.
