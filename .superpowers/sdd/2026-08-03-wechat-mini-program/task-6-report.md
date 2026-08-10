# Task 6 Report: Mini Program History, Resume, Sync, and Results

## Status

Implemented in the isolated worktree on branch `codex/wechat-mini-program`. Final commit SHA is reported in the task response because embedding a commit's own SHA in this committed file would change that SHA.

## Changed Files

- `apps/wechat/src/storage/assessmentCache.ts`: added indexed local history storage, draft/completed cache DTOs, batch saves, and pending-removal support.
- `apps/wechat/src/services/assessment-sync.ts`: added cached-first history state, deterministic local/cloud/pending reconciliation, completed-cloud authority, first-unanswered routing, and pending sync replay triggers.
- `apps/wechat/src/services/submit-assessment.ts`: added local completeness checks, pending flush gating, safe complete payload shaping, and completed DTO persistence.
- `apps/wechat/src/services/result-view-model.ts`: added persisted-result view model with knowledge metrics, inline wrong-question details, badges, unanswered state, and 10-item replacement pagination.
- `apps/wechat/src/services/cloud.ts`: added `list-assessments` and `complete-assessment` adapters, safe payload whitelisting, completed-only answer/explanation DTO validation, and result parsing.
- `apps/wechat/src/pages/history/index.tsx`, `pages/answer/index.tsx`, `pages/result/*`, `src/app.config.ts`, and `src/app.css`: added mobile history rows, draft resume, final submit, result route, inline review UI, pagination scroll, loading/empty/offline/retry states, and production page registration.
- `apps/wechat/src/answer/syncQueue.ts`: refreshed local `updatedAt` on answer changes and treated completed conflict records as authoritative.
- `services/cloudbase/server/assessment/service.ts`: added trusted-owner list and complete services, server-side scoring, incomplete rejection, CAS completion, idempotent completed response, and completed-only full result DTOs.
- `services/cloudbase/server/adapters/cloudBaseAssessmentRepository.ts`: added owner-scoped updated-desc cursor list query.
- `services/cloudbase/functions/list-assessments/*`, `functions/complete-assessment/*`, `scripts/build.mjs`, `deploy/cloudbaserc.json`, `database/function-invoke-rules.json`, and `database/indexes.json`: added deployable CloudBase functions, invoke permissions, and owner/update cursor index.
- `apps/wechat/test/*` and `services/cloudbase/test/*`: added and updated coverage for Task 6 requirements.

## RED Evidence

- WeChat RED: `assessment-sync`, `submit-assessment`, and `result-view-model` modules were missing; cloud adapter lacked `listAssessments` and `completeAssessment`; new cache fields were absent from `CachedAssessment`.
- CloudBase RED: `listAssessments` and `completeAssessment` were not exported; `list-assessments` and `complete-assessment` function entries and build artifacts were missing; deploy config and invoke rules did not include the new functions.
- Reconciliation RED: the history controller did not accept or trigger `syncPendingUpdate` after preserving pending local answers from a higher-revision cloud draft.
- Behavioral RED assertions covered cached-first ordering, cloud refresh, revision reconciliation, pending-local preservation, completed-cloud authority, first-unanswered resume, fully answered draft fallback, incomplete submit, server-side score tamper resistance, completion idempotency, foreign ownership, result ordering/state, and 10-item replacement pagination.

## Verification

- Focused WeChat: `npm run test:wechat -- --runTestsByPath apps/wechat/test/assessmentSync.test.ts apps/wechat/test/submitFlow.test.ts apps/wechat/test/resultViewModel.test.ts apps/wechat/test/cloud.test.ts` passed, 4 suites / 24 tests.
- Focused CloudBase: `npm run test:cloudbase -- --runTestsByPath services/cloudbase/test/assessmentService.test.ts services/cloudbase/test/assessmentFunctionEntries.test.ts services/cloudbase/test/assessmentBuildArtifacts.test.ts` passed, 13 suites / 98 tests.
- All WeChat: `npm run test:wechat` passed, 13 suites / 52 tests.
- All CloudBase: `npm run test:cloudbase` passed, 13 suites / 98 tests.
- Core: `npm test -- --runTestsByPath packages/assessment-core/test/assessmentCore.contract.test.ts` passed, 1 suite / 8 tests.
- Root: `npm test` passed, 30 suites / 190 tests.
- Typecheck: `npm run typecheck:wechat`, `npm run typecheck:cloudbase`, and `npm run typecheck` all passed.
- Builds: `npm run build:cloudbase` passed; `TARO_APP_CLOUDBASE_ENV_ID=task6-public-env npm run build:weapp` passed with Taro 4.2.1.
- Diff hygiene: `git diff --check` passed.
- Mini Program secret scan: targeted search of `apps/wechat/src` and `apps/wechat/dist` found no literal LLM/API key patterns or client-side LLM config names.

## Concerns

- No real WeChat AppID, logged-in DevTools, or deployed CloudBase environment was available, so live preview/device verification and hosted CAS behavior still require an authorized environment.
- The Task 6 report records the final commit SHA in the response rather than inside this file to avoid the self-referential commit-hash problem.

## Independent Review Fix

The two P2 findings in `task-6-review.md` were fixed without expanding into Task 7:

- History refresh now rebuilds its returned records from the cache after pending replay completes. History open compares the rendered row with the current cache and cannot write a lower revision over a newer cached assessment.
- Reconciliation now overlays every pending `changedQuestionIds` answer onto the selected draft regardless of equal, cloud-newer, or local-newer revision ordering. The merged pending update keeps the selected draft revision as its CAS expectation and is always replayed.

### Review Fix RED Evidence

- The new history regression first failed because the open-record freshness boundary was absent. A controller mutation check restoring the old pre-replay return then failed with revision `4` instead of replayed cache revision `5`; restoring the cache rebuild returned the suite to green.
- The equal-revision regression then failed with `q1: ['server']` instead of the pending `q1: ['b']` after a subsequent local `q2` edit, proving the existing branch silently replaced a pending answer.

### Review Fix Verification

- Task 6 focused: `npm run test:wechat -- --runTestsByPath apps/wechat/test/assessmentSync.test.ts apps/wechat/test/submitFlow.test.ts apps/wechat/test/resultViewModel.test.ts apps/wechat/test/cloud.test.ts` passed, 4 suites / 28 tests.
- All WeChat: `npm run test:wechat` passed, 13 suites / 56 tests.
- Root: `npm test` passed, 30 suites / 190 tests.
- Typecheck: `npm run typecheck:wechat`, `npm run typecheck:cloudbase`, and `npm run typecheck` passed.
- Production Mini Program build: `TARO_APP_CLOUDBASE_ENV_ID=task6-public-env npm run build:weapp` passed with Taro 4.2.1.
- Completed-cloud authority and stale pending removal passed in `assessmentSync.test.ts`; true replacement pagination at 10 items per page passed in `resultViewModel.test.ts` as part of the focused run.
