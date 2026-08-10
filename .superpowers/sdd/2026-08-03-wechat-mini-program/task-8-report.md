# Task 8 Report: Mini Program Release Candidate Verification

## Status

DONE locally, with external WeChat account/AppID/login/device blockers recorded.

## Changed Files

- Release automation: `scripts/verify-wechat-release.mjs`, `scripts/wechat-miniprogram-ci.mjs`, `scripts/wechat-devtools-smoke.mjs`, root package scripts, and `miniprogram-ci@2.1.31`.
- WeChat release config: formal/development profile gating in `apps/wechat/config/index.ts`, shared `project.config.json`, gitignored private config/key patterns, and `apps/wechat/project.private.config.example.json`.
- Deterministic fixture mode: `apps/wechat/src/fixtures/releaseFixtureClient.ts`, compile-time fixture switch in `apps/wechat/src/services/cloud.ts`, and tests proving 50/100 questions, rich materials, history, settings, reports, completion, and >10 wrong-question review.
- Release docs/evidence: `docs/wechat/release-profiles.md`, `docs/wechat/release-audit.md`, `docs/wechat/release-evidence/*`, and updated `docs/wechat/operations-runbook.md`.

## TDD Evidence

- RED: `releaseFixtureClient.test.ts` failed because `../src/fixtures/releaseFixtureClient` did not exist.
- RED: `cloudBuildConfig.test.ts` failed because fixture mode was not injected and formal profile did not reject fixture mode or missing CloudBase env.
- RED: `releaseVerification.test.ts` failed because the single release verifier, private config template, miniprogram-ci dry-run wrapper, release docs, evidence files, and static verifier were missing.
- GREEN: focused suites passed after implementation: WeChat 2 suites / 14 tests; CloudBase release verification included 17 suites / 131 tests.

## Verification

- `npm run verify:wechat-release`: passed.
- Root tests: 34 suites / 223 tests.
- WeChat tests: 15 suites / 73 tests.
- CloudBase tests: 17 suites / 131 tests.
- Typechecks: root, WeChat, and CloudBase passed.
- Builds: CloudBase build, Expo web export, and production `build:weapp` passed.
- Web/native checks: `verify:web` and `verify:assets` passed.
- Secret scans: source and compiled WeChat dist passed.
- Release disclosure: development passed; formal production template failed as expected because real operator/model/AI filing/Mini Program filing values remain `待配置`.
- miniprogram-ci: dry-run passed without credentials and redacted private key paths.
- npm audit: `npm audit --omit=optional --json` returned 125 advisories (low 1, moderate 44, high 36, critical 44); disposition is documented in `docs/wechat/release-audit.md`. `npm audit fix --package-lock-only --dry-run` exceeded 180 seconds and was terminated without applying changes.

## Artifact Hashes

- `apps/wechat/dist/app.json`: `839821f2c2685ee8656f7b543dae00d7f4511ebc74bf23ffd30253d1d127c6c6`
- `apps/wechat/dist/app.js`: `dba05d0faf7f47415b297b2318d669351cb320041f2418fe7a7fbb4f6ab35c08`
- `services/cloudbase/dist/cloudbaserc.json`: `74fcdba47b7f6ab698f21c207149ff95470fcff06ef206d0b4331c20607c2f10`

## DevTools And Runtime Evidence

WeChat DevTools 2.02.2607271 is installed at `C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat`, but this Windows user has no initialized DevTools User Data `.cli`. The script records that blocker and skips `islogin`, `open --project`, and `compile --project` to avoid repeating long setlocal recursion/timeouts. No screenshot, preview, trial, formal review, or real-device pass is claimed.

## External Blockers

- Real WeChat Mini Program AppID, account login, upload private key, and optional IP whitelist.
- Real CloudBase development/production env ids, deployment permissions, and hosted function/database smoke tests.
- Production service operator, model disclosure, generative AI filing/registration, Mini Program filing, privacy declaration, and review materials.
- iOS/Android real-device smoke checklist and screenshot set.

## SHA

Final commit SHA is reported by the controller after committing to avoid a self-referential hash in this file.
