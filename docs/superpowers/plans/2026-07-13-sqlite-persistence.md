# SQLite Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ad hoc local storage with a SQLite-backed local database, save assessment drafts immediately, update answers on every change, and make model configuration persist reliably.

**Architecture:** Add a small persistence layer under `src/storage` and repository modules for assessments and model settings. The UI keeps existing state, but every generated/sample paper creates a draft record, every answer change updates it, and submit completes the same record.

**Tech Stack:** Expo SDK 53, React Native, TypeScript, Jest, `expo-sqlite`, Expo SecureStore.

## Global Constraints

- Use SQLite for durable local assessment and non-secret model setting storage.
- Keep the API key in SecureStore when available, with a web/local fallback only when SecureStore fails.
- Generated assessments must be saved immediately as drafts.
- Answer changes must update the local draft record.
- Submitting must update the same record to completed, not create a duplicate.
- Existing scoring, generation validation, and answer selection behavior must remain unchanged.

---

### Task 1: SQLite Adapter and Assessment Repository

**Files:**
- Create: `src/storage/database.ts`
- Create: `src/features/assessment/assessmentRepository.ts`
- Create: `src/features/assessment/assessmentRepository.test.ts`
- Modify: `src/features/assessment/types.ts`

**Interfaces:**
- Produces `AssessmentRecordStatus = 'draft' | 'completed'`.
- Produces `PersistedAssessmentRecord` with `id`, `paper`, `answers`, `result`, `status`, `createdAt`, `updatedAt`, `submittedAt`.
- Produces repository functions: `createAssessmentDraft`, `updateAssessmentAnswers`, `completeAssessment`, `listAssessmentRecords`.

- [ ] **Step 1: Write failing repository tests**

Create tests for draft creation, answer update, completion update, and newest-first listing using a memory repository database fake.

- [ ] **Step 2: Implement repository types and database interface**

Add the record types to `types.ts` and a minimal database interface in `src/storage/database.ts`.

- [ ] **Step 3: Implement repository functions**

Implement JSON serialization, table creation, insert/update/list behavior through the database interface.

- [ ] **Step 4: Verify**

Run `npm test -- assessmentRepository.test.ts --runInBand` and `npm run typecheck`.

### Task 2: Model Configuration Repository

**Files:**
- Create: `src/features/config/modelConfigStore.ts`
- Create: `src/features/config/modelConfigStore.test.ts`
- Modify: `src/features/config/secureConfigStore.ts`

**Interfaces:**
- Produces `saveModelConfig` and `loadModelConfig` that preserve the existing call sites.
- Stores `baseUrl` and `model` in SQLite-backed settings.
- Stores `apiKey` through SecureStore with fallback.

- [ ] **Step 1: Write failing config persistence tests**

Cover save/load, SecureStore fallback, and backward compatibility for old full-config JSON.

- [ ] **Step 2: Implement config store**

Create a repository that uses the database interface for non-secret fields and a secure key adapter for API key.

- [ ] **Step 3: Keep import compatibility**

Make `secureConfigStore.ts` re-export the new `saveModelConfig` and `loadModelConfig` so `App.tsx` does not need churn.

- [ ] **Step 4: Verify**

Run `npm test -- modelConfigStore.test.ts --runInBand` and `npm run typecheck`.

### Task 3: App Draft Save and History Resume

**Files:**
- Modify: `App.tsx`
- Modify: `src/features/assessment/historyStore.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes repository functions from Task 1.
- Keeps `history` state as persisted assessment records.

- [ ] **Step 1: Replace history store calls**

Load assessment records from SQLite repository. Show drafts and completed records in History with status labels.

- [ ] **Step 2: Save draft on generation/sample start**

After generation success or sample start, create a draft record immediately and set `currentRecordId`.

- [ ] **Step 3: Update draft on answer changes**

After answer state changes, update the current draft record with latest answers.

- [ ] **Step 4: Complete same record on submit**

Compute scoring result, update the current record as completed, refresh History, and show Result.

- [ ] **Step 5: Support opening drafts**

Opening a draft restores paper and answers and returns to the answer screen. Opening completed records restores result/review flow.

- [ ] **Step 6: Verify**

Run full tests, typecheck, Expo config, and web smoke.
