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
