# Task 8 Final Review Fix Wave Report

## RED Evidence

### Generation recovery, retry, and client limits

Command:

```sh
npm run test:wechat -- --runInBand apps/wechat/test/cloud.test.ts apps/wechat/test/generationController.test.ts
```

Output: exit 1. The new restart-recovery assertion received no re-POST calls, explicit retry produced only one create call, `FREE_TIER_LIMIT` and `GENERATION_DISABLED` localized as the generic network error, and the adapter rejected `retry` because it was not part of `NewAssessmentRequest`.

### Blob retention, immutable pruning, and circuit breaker

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/assessmentRepository.test.ts services/edgeone/test/settingsAndReports.test.ts services/edgeone/test/routes.contract.test.ts
```

Output: exit 1. A completed assessment older than 365 days remained listed, two immutable assessment revisions remained after CAS, the Blob breaker allowed a 201 generation response, and expired reports remained after a new report was created.

### Production secret boundary

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/releaseVerification.test.ts
```

Output: exit 1. The deployment wrapper stopped on missing local runtime values before checking the deployment origin, and the workflow still referenced server-only GitHub secrets.

## GREEN Evidence

### Generation recovery, retry, and client limits

Command:

```sh
npm run test:wechat -- --runInBand apps/wechat/test/cloud.test.ts apps/wechat/test/generationController.test.ts
```

Output: exit 0. `2` suites passed; `20` tests passed.

### Blob retention, immutable pruning, circuit breaker, and secret boundary

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/assessmentRepository.test.ts services/edgeone/test/settingsAndReports.test.ts services/edgeone/test/routes.contract.test.ts services/edgeone/test/releaseVerification.test.ts
```

Output: exit 0. `18` suites passed; `144` tests passed.

### Static EdgeOne release contract

Command:

```sh
npm run verify:edgeone-release -- --check-only
```

Output: exit 0. `EdgeOne release verification passed`.

## Final Verification Summary

Command:

```sh
npm run test:wechat -- --runInBand
```

Output: exit 0. `16` suites passed; `85` tests passed.

Command:

```sh
npm run test:edgeone -- --runInBand
```

Output: exit 0. `18` suites passed; `144` tests passed.

Command:

```sh
npm run verify:github-workflows
```

Output: exit 0. `GitHub workflow verification passed`.

Command:

```sh
npm run verify:edgeone-release -- --check-only
```

Output: exit 0. `EdgeOne release verification passed`.

Command:

```sh
npm run typecheck:wechat
npm run typecheck:edgeone
npm run build:edgeone
```

Output: all commands exited 0.

The fix wave verifies explicit generation retries, idempotent restart recovery, free-tier error localization, bounded assessment/report cleanup, immutable revision pruning, the Blob-backed circuit breaker, and the EdgeOne-only server-runtime secret boundary.

## Round 2 RED Evidence

Command:

```sh
npm run test:wechat -- --runInBand apps/wechat/test/generationController.test.ts
```

Output: exit 1. After a `createJob` error marked `retryable: true`, the first Retry call omitted `retry: true`.

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/assessmentRepository.test.ts
```

Output: exit 1. A delayed revision-2 cleanup made the real repository return no latest assessment after revision 3 committed; the matching delayed index cleanup lost the revision-3 index summary.

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 1. An expired legacy report sorted after 201 retained report keys remained present after report creation cleanup.

## Round 2 GREEN Evidence

Command:

```sh
npm run test:wechat -- --runInBand apps/wechat/test/generationController.test.ts
```

Output: exit 0. `1` suite passed; `16` tests passed.

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/assessmentRepository.test.ts
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: both commands exited 0. `18` suites passed; `147` tests passed.

## Round 2 Final Verification

Command:

```sh
npm run test:wechat -- --runInBand
npm run test:edgeone -- --runInBand
npm run build:edgeone
```

Output: all commands exited 0. WeChat: `16` suites and `86` tests passed. EdgeOne: `18` suites and `147` tests passed. The EdgeOne cloud-function artifacts were regenerated from the tested sources.

## Round 3 RED Evidence

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 1. The new regression `cleans an expired records report left behind when ordered index creation fails` failed because `reports/owner-a/records/orphan.json` still contained the expired orphan after later report creation cleanup:

```text
expect(received).resolves.toBeNull()

Received: {"createdAt": "2026-08-10T00:00:00.000Z", "id": "orphan", "ownerKey": "owner-a", "reason": "other", "updatedAt": "2026-08-10T00:00:00.000Z"}
```

## Round 3 GREEN Evidence

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 0. `18` suites passed; `148` tests passed.

## Round 3 Final Verification

Command:

```sh
npm run test:edgeone -- --runInBand
```

Output: exit 0. `18` suites passed; `148` tests passed.

Command:

```sh
npm run build:edgeone
```

Output: exit 0. EdgeOne cloud-function artifacts were regenerated from the tested sources.

## Round 4 RED Evidence

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 1. The new regression `does not scan every healthy record during report creation cleanup` failed because one report creation read every healthy record under `records/`:

```text
Expected: <= 20
Received:    500
```

## Round 4 GREEN Evidence

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 0. `18` suites passed; `150` tests passed.

## Round 4 Final Verification

Command:

```sh
npm run test:edgeone -- --runInBand
```

Output: exit 0. `18` suites passed; `150` tests passed.

Command:

```sh
npm run build:edgeone
```

Output: exit 0. EdgeOne cloud-function artifacts were regenerated from the tested sources.

## Round 5 RED Evidence

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 1. The orphan reconciliation regression left `records/z-expired.json` behind after repeated bounded passes, the record-write failure left its ordered index behind, and later cleanup did not remove that dangling retained index. Strengthened reruns also exited 1 when a healthy retained index sorted before the dangling index and when an index contained an invalid timestamp.

## Round 5 GREEN Evidence

Command:

```sh
npm run test:edgeone -- --runInBand services/edgeone/test/settingsAndReports.test.ts
```

Output: exit 0. `18` suites passed; `154` tests passed. The regression coverage verifies persisted orphan sweep progress, compensating index deletion, recovery after compensation failure, invalid-index cleanup, and the existing bounded healthy-record read limit.

## Round 5 Final Verification

Command:

```sh
npm run test:edgeone -- --runInBand
```

Output: exit 0. `18` suites passed; `154` tests passed.

Command:

```sh
npm run build:edgeone
```

Output: exit 0. EdgeOne cloud-function artifacts were regenerated from the tested sources.

Command:

```sh
git diff --check
```

Output: exit 0. No whitespace errors were reported; Git emitted only line-ending conversion warnings for the Windows worktree.
