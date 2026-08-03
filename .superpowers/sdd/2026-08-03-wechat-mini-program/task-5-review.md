# Task 5 Independent Code Review

## Verdict

**CHANGES REQUIRED**. The implementation is well scoped and its current automated checks pass, but the live CloudBase path cannot start as committed and there are multiple answer-integrity failures that can lose or disclose assessment data.

## Findings

### [P1] Initialize the WeChat Cloud SDK before any function call

**Location:** `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat\src\app.tsx:4`

The app root only returns its children, while the first cloud operation goes directly through `Taro.cloud.callFunction` at `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat\src\services\cloud.ts:75`. Taro requires `Taro.cloud.init(...)` once before any cloud API call. Therefore generation, persisted-paper loading, and answer synchronization all fail in an authorized Mini Program even though the production bundle compiles. Initialize the selected CloudBase environment during app launch and add a runtime-boundary test that proves initialization precedes the first call. Taro's API reference explicitly states this ordering requirement: https://docs.taro.zone/docs/3.x/apis/cloud/

### [P1] Do not return answer keys and explanations for draft assessments

**Location:** `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\services\cloudbase\server\assessment\service.ts:81`

`toPublicAssessment()` returns `record.paper` unchanged at line 84. `AssessmentPaper` contains every question's `correctOptionIds` and `explanation`, so a user can read all answers before submission from the cloud response or versioned local storage. That defeats the integrity of a skill assessment, and it conflicts with the planned Task 6 flow where correct answers and explanations are revealed in completed-history review. Return a redacted draft-paper DTO and expose answer keys only after server-side completion; keep the full paper solely in trusted storage for validation and scoring. Add tests for both draft redaction and completed review disclosure.

### [P1] Rebase every remaining pending item after a conflict or later items overwrite server answers

**Location:** `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat\src\answer\syncQueue.ts:126`

On conflict, only the queue-head item's `answers` snapshot is replaced with the merged server/local state. After its retry succeeds, subsequent items keep their pre-conflict full-answer snapshots. The drain loop merely changes their `expectedRevision` at lines 89-93, then sends those stale full snapshots at line 96. For example, if the server adds an answer to `q3` while local pending items change `q1` and `q2`, the first retry preserves `q3`, but the second pending item immediately deletes it on the server. Rebase or coalesce all remaining items onto the merged state before continuing, and add a test with at least one unrelated server-only answer plus two pending local items.

### [P1] Persisted pending IDs collide after an app restart and can silently drop a new answer

**Location:** `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat\src\answer\syncQueue.ts:12`

`pendingSequence` resets to zero whenever the Mini Program process restarts, while pending records survive in storage. A stored `pending-1` followed by a new selection creates another `pending-1` at line 44. When the older request succeeds, `removePending()` at lines 148-151 removes both records, so the newer answer remains only in the local assessment and is no longer queued for cloud synchronization. Use collision-resistant persisted IDs (or eliminate per-event IDs by coalescing per assessment), and test restart-with-existing-pending followed by a new selection.

### [P2] Validate cloud response shapes and terminate malformed or incomplete jobs

**Location:** `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat\src\services\cloud.ts:50`

`getGenerationJob()` validates only `status` before casting the whole response, and `getAssessment()` at lines 55-60 performs no runtime validation at all. A nominal `{ status: 'completed' }` response passes the adapter; because it lacks `assessmentId`, the controller skips the terminal branch at `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat\src\generation\controller.ts:84`, reports `polling`, and continues forever. Invalid revisions or malformed assessments can likewise be cached through unchecked casts. Parse all public responses into validated DTOs, reject incomplete completed jobs with a safe localized error, and add an overall polling deadline/call timeout so a provider or contract regression cannot leave the button permanently active.

## Confirmed Strengths

- Trusted ownership comes only from `getWXContext()`; client-supplied owner/provider fields are ignored.
- Assessment writes use `_id + _openid + revision` in the CloudBase conditional update, and foreign/missing records share a sanitized response.
- Public client payload construction excludes owner, provider, endpoint, and secret fields.
- Selection writes the assessment and pending queue synchronously before scheduling network work.
- The standalone numbered prompt, separate metadata, rich native materials, scroll reset, keyboard properties, and safe-area backgrounds are present in source.
- Function invoke rules include both new assessment functions behind authenticated invocation.

## Verification

- `npm run test:wechat`: 6 suites, 22 tests passed.
- `npm run typecheck:wechat`: passed.
- `npm run typecheck:cloudbase`: passed.
- `npm run typecheck`: passed.
- `git diff --check 18e0301..7b5012da956787325d1a876f8b086cbc24f12b0f`: passed.
- Existing generated artifacts for the WeChat app and both new CloudBase functions were inspected; the app bundle also contains no cloud initialization. Builds were not rerun because this review was restricted to writing only this review file.

## Residual External Risk

After the findings are fixed, an authorized AppID/CloudBase environment is still required to verify function deployment and invoke rules, device safe-area and image rendering, offline recovery, and real concurrent CAS behavior. These external checks do not replace the missing local contract and restart tests above.
