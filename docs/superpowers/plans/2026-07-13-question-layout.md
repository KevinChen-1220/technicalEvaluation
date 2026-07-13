# Question Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate question progress, question title, and difficulty/knowledge metadata on answer and review screens.

**Architecture:** This is a presentation-only change in `App.tsx`. Existing assessment state, scoring, answer selection, history replay, and persistence remain unchanged.

**Tech Stack:** Expo, React Native, TypeScript, Jest.

## Global Constraints

- Do not change scoring, generation, history storage, or settings behavior.
- Keep mobile layout compact and readable.
- Preserve current sample assessment and history replay flows.

---

### Task 1: Question Title Hierarchy

**Files:**
- Modify: `App.tsx`

**Interfaces:**
- Consumes: existing `questionIndex`, `currentQuestion`, and `reviewQuestion` state.
- Produces: updated answer and review screen markup using existing state only.

- [ ] **Step 1: Update answer screen markup**

Change the progress text to only show `Question {questionIndex + 1} of {paper.questions.length}`. Change the question title to `{questionIndex + 1}. {currentQuestion.prompt}`. Add a quiet metadata line below it with `{currentQuestion.difficulty} · {currentQuestion.knowledgePoint}`.

- [ ] **Step 2: Update review screen markup**

Change the kicker from the knowledge point to `Review`. Render the question prompt as the independent title. Add a quiet metadata line below it with `{reviewQuestion.difficulty} · {reviewQuestion.knowledgePoint}`. Remove the separate `Difficulty:` metric line.

- [ ] **Step 3: Add style support**

Add a `questionMeta` style or reuse a suitable existing style so difficulty/knowledge reads as secondary metadata below the title.

- [ ] **Step 4: Verify**

Run `npm run typecheck`, `npm test -- --runInBand`, and a Web smoke check on the sample paper answer screen.
