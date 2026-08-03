# WeChat Mini Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task with review checkpoints.

**Goal:** Ship a WeChat Mini Program with assessment parity, cloud generation, cross-device history, and no client-side LLM secrets.

**Architecture:** Incrementally form a workspace containing the existing Expo app, a Taro 4 React Mini Program, a framework-independent assessment core, and CloudBase services. Keep the Expo app green after every extraction and use asynchronous batch generation for large papers.

**Tech Stack:** TypeScript, React, Expo, Taro 4, WeChat Mini Program, Tencent CloudBase, Jest.

## Global Constraints

- Do not expose model credentials or arbitrary provider settings in the Mini Program.
- Do not rewrite or migrate the Expo SQLite database during the shared-core extraction.
- Keep existing assessment JSON backward compatible.
- Persist a generated paper before navigation to the answer route.
- Persist every answer change locally, then synchronize it to CloudBase.
- Use WeChat identity on the server for record ownership.
- Complete privacy, filing, category, and model-compliance checks before release.

---

### Task 1: Establish Workspace and Shared-Core Boundaries

**Files:**
- Modify: `package.json`
- Create: `apps/wechat/package.json`
- Create: `packages/assessment-core/package.json`
- Move or wrap: pure modules under `src/features/assessment/`
- Add: shared contract tests and Expo compatibility tests

- [ ] Inventory imports and identify modules free of React Native, Expo, SQLite, and browser APIs.
- [ ] Write tests proving current validation, scoring, draft navigation, and wrong-answer review behavior through the future package exports.
- [ ] Configure npm workspaces without moving the Expo entry point yet.
- [ ] Extract pure modules into `packages/assessment-core`; leave compatibility re-exports for the Expo app.
- [ ] Run the complete Expo tests, typecheck, web build, and asset verification.
- [ ] Commit as `refactor: extract shared assessment core`.

### Task 2: Scaffold the Taro Mini Program

**Files:**
- Create: `apps/wechat/config/`
- Create: `apps/wechat/src/app.config.ts`
- Create: `apps/wechat/src/app.ts`
- Create: `apps/wechat/src/pages/generate/`
- Create: `apps/wechat/src/pages/history/`
- Create: environment config templates without secrets

- [ ] Scaffold Taro 4 React and pin supported Node/package versions.
- [ ] Configure `dev:weapp`, `build:weapp`, lint, typecheck, and tests.
- [ ] Add routes and a native bottom tab bar for Generate, History, and Settings.
- [ ] Build the Chinese-default shell with language derived from user input for generated content.
- [ ] Import `assessment-core` through workspace exports and verify a production `weapp` build.
- [ ] Commit as `feat: scaffold WeChat Mini Program`.

### Task 3: Implement CloudBase Data Contracts and Security Rules

**Files:**
- Create: `services/cloudbase/README.md`
- Create: `services/cloudbase/database/collections.json`
- Create: `services/cloudbase/database/indexes.json`
- Create: `services/cloudbase/database/security-rules.json`
- Create: `services/cloudbase/shared/contracts.ts`

- [ ] Define versioned contracts for `generation_jobs`, `assessments`, and `user_settings`.
- [ ] Write authorization tests that derive ownership from trusted WeChat context.
- [ ] Add indexes for owner/status/update-time queries and job leases.
- [ ] Add optimistic `revision` semantics for assessment updates.
- [ ] Document development and production environment provisioning.
- [ ] Commit as `feat: define CloudBase assessment storage`.

### Task 4: Build the Asynchronous Generation Service

**Files:**
- Create: `services/cloudbase/functions/create-generation-job/`
- Create: `services/cloudbase/functions/get-generation-job/`
- Create: `services/cloudbase/functions/generation-worker/`
- Reuse: `packages/assessment-core` parsing and validation

- [ ] Write contract tests for creating, polling, completing, failing, and retrying a job.
- [ ] Validate topic, notes, question count, quota, and request ownership server-side.
- [ ] Store provider configuration only in CloudBase environment secrets.
- [ ] Generate bounded question batches, parse/repair once, validate, deduplicate, and validate the assembled paper.
- [ ] Persist the complete paper and mark the job complete in an idempotent transaction.
- [ ] Add worker lease recovery, safe error codes, structured metrics, and redacted logs.
- [ ] Commit as `feat: add cloud assessment generation jobs`.

### Task 5: Implement Generation and Answering UI

**Files:**
- Create: `apps/wechat/src/pages/generate/`
- Create: `apps/wechat/src/pages/answer/`
- Create: `apps/wechat/src/components/QuestionMaterials/`
- Create: `apps/wechat/src/services/generation.ts`

- [ ] Write view-model tests for request state, polling, cancellation, and retryable failures.
- [ ] Put progress animation inside the generate button and disable duplicate submissions.
- [ ] Navigate to answering only after the cloud assessment exists.
- [ ] Render long prompts in a vertical scroll area, wide tables horizontally, and charts with native components.
- [ ] Cache each answer immediately and enqueue a cloud update with the current revision.
- [ ] Verify keyboard avoidance, safe areas, image fallback, and question scroll reset on iPhone-sized devices.
- [ ] Commit as `feat: add Mini Program assessment flow`.

### Task 6: Implement History, Resume, and Results

**Files:**
- Create: `apps/wechat/src/pages/history/`
- Create: `apps/wechat/src/pages/result/`
- Create: `apps/wechat/src/services/assessment-sync.ts`
- Reuse: navigation, scoring, and review models from `assessment-core`

- [ ] Write tests for cloud/local reconciliation, first-unanswered resume, and completed history reopening.
- [ ] Refresh cloud history while rendering cached records immediately.
- [ ] Resume drafts at the first unanswered question.
- [ ] Submit with idempotent score calculation and persist completion timestamps.
- [ ] Show every wrong question, selected/correct options, and explanation inline on the result route.
- [ ] Verify the same saved answers produce identical Expo and Mini Program scores.
- [ ] Commit as `feat: add Mini Program history and results`.

### Task 7: Add Privacy, Safety, and Operations

**Files:**
- Create: `apps/wechat/src/pages/privacy/`
- Create: `apps/wechat/src/pages/report/`
- Create: `docs/wechat/privacy-data-map.md`
- Create: `docs/wechat/operations-runbook.md`
- Create: release environment templates

- [ ] Inventory collected data and remove unnecessary profile/phone permissions.
- [ ] Add privacy consent/version recording and a complaint/report entry.
- [ ] Add server rate limits, daily quotas, content checks, and retention jobs.
- [ ] Display the production model and required filing/registration information.
- [ ] Configure alerts for job latency, parse failures, provider failures, and quota exhaustion.
- [ ] Perform a secret scan of both source and compiled Mini Program output.
- [ ] Commit as `feat: add Mini Program privacy and operations`.

### Task 8: Test in WeChat DevTools and on Real Devices

**Verification:**
- Run shared-core and both-client unit tests.
- Run Expo typecheck/build/asset checks.
- Run Taro typecheck and `build:weapp`.
- Import compiled output into WeChat DevTools and clear all warnings.
- Test preview and trial versions on representative iOS and Android devices.

- [ ] Cover new user generation, 100-question generation, interrupted polling, offline answer caching, cross-device resume, submission, and completed history.
- [ ] Test long prompts, wide tables, bar charts, unavailable images, keyboard avoidance, tab safe areas, and loading states.
- [ ] Verify production domain, CloudBase permissions, quotas, and monitoring with non-sensitive test credentials.
- [ ] Record screenshots and test evidence in `docs/wechat/release-evidence/`.
- [ ] Commit as `test: verify WeChat Mini Program release candidate`.

### Task 9: Complete Filing and Submit for Review

- [ ] Register/verify the Mini Program subject and AppID.
- [ ] Select the accurate service category and provide required qualifications.
- [ ] Complete Mini Program filing and WeChat privacy declaration.
- [ ] Confirm the production model's filing/registration eligibility and disclosures.
- [ ] Upload the reviewed production build, add review instructions and test path, and submit.
- [ ] After approval, release gradually, monitor generation and sync metrics, then expand traffic.
- [ ] Tag the release and record AppID, version, CloudBase environment, and rollback version in the runbook without recording secrets.

## Definition of Done

The plan is complete only when the production Mini Program passes review and a real user can generate a paper, continue it on another device, submit it, and reopen the inline review, while compiled artifacts contain no model secrets and the existing Expo app remains green.
