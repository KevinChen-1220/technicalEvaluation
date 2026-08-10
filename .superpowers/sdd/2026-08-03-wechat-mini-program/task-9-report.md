# Task 9 Report: WeChat Mini Program Release Handoff

## Status

DONE locally. No merge, push, release creation, or `progress.md` change was performed in this worker.

The remaining actions require real WeChat subject/AppID, legal filing and disclosure, production CloudBase credentials, authenticated WeChat DevTools, real devices, or WeChat review approval.

## Changed Files

- Release handoff docs: `docs/wechat/release-checklist.md`, `docs/wechat/deployment-runbook.md`, `docs/wechat/review-submission.md`, `docs/wechat/release-completion-matrix.md`.
- Machine-readable release record template: `docs/wechat/release-manifest.template.json`.
- GitHub Actions: `.github/workflows/wechat-release.yml`, plus `ci.yml` and `pages.yml` running workflow/release static checks.
- GitHub issue templates: `.github/ISSUE_TEMPLATE/wechat_filing.yml`, `.github/ISSUE_TEMPLATE/wechat_production_smoke.yml`.
- Static verification: `scripts/verify-github-workflows.mjs`, `package.json`, `package-lock.json`, and `scripts/verify-wechat-release.mjs`.
- Tests: `services/cloudbase/test/releaseVerification.test.ts`.
- README: development, architecture, WeChat Mini Program, and release-handoff links.
- Evidence refreshed: `docs/wechat/release-evidence/2026-08-10-command-output.md`.

## TDD Evidence

- RED: `npm run test:cloudbase -- --runInBand releaseVerification.test.ts` failed on missing Task9 docs, manifest, workflow, issue templates, README links, and npm script.
- GREEN: after adding the handoff assets and verifier, focused CloudBase release verification passed.
- RED/GREEN review fix: added failing coverage for GitHub Actions immutable SHA pins, then pinned official `actions/*` usages to full commit SHAs and updated `verify:github-workflows`.
- RED/GREEN review fix: added failing coverage for `workflow_dispatch` input interpolation in `run` scripts, then moved `disclosure_file` through `DISCLOSURE_FILE` environment variables and added a non-empty file guard.
- RED/GREEN doc clarity fix: added failing coverage for filing/smoke issue cross-links, `CONTENT_SAFETY_PROVIDER`, and PowerShell/Bash upload examples, then updated the templates/docs.
- RED/GREEN P2 review fix: 9 workflow mutations were first accepted by the old raw-text verifier (comment spoof, echo spoof, missing `needs`, reversed upload order, workflow/job permission escalation, secret outside upload `env`, missing secret hidden in a comment, and altered environment). The structured verifier then rejected every mutation.
- RED/GREEN secret-expression hardening: a tenth mutation using a conditional lowercase secret expression outside upload `env` was first accepted, then rejected after secret collection was changed to inspect every parsed GitHub expression and normalize secret names.
- RED/GREEN final workflow P2 fix: 13 new mutations were first accepted for guarded/continue-on-error/timed/custom-shell critical steps, failure-swallowing or multiline commands, bracket/dynamic secret expressions, wrong env-to-secret mappings, aliases, and job-scoped secret exposure. Two inherited job semantics mutations were then first accepted and fixed for custom `defaults.run.shell` and job-level `timeout-minutes`.
- Exact-command coverage also includes explicit `&& true`, `; exit 0`, and pipeline mutations. These share the already-red/green exact-command gate with `|| true` and multiline suffixes. The workflow verifier now has 28 cumulative mutation cases.

## P2 Structured Workflow Review Fix

- `scripts/verify-github-workflows.mjs` now validates release workflow semantics from parsed YAML JSON only. Comments and arbitrary raw YAML substrings do not satisfy release gates.
- `upload.needs` must resolve to exactly `release-checks`; workflow and every job must declare exactly `contents: read` permissions.
- Required `release-checks` commands are matched against complete parsed `step.run` values, so comments and `echo` commands cannot impersonate them.
- The formal verifier and WeChat upload are identified by their unique step names; each `run` value must equal one allowed command in full. Step-level `if`, `continue-on-error`, `timeout-minutes`, and `shell` are forbidden, as are inherited custom run shells and upload job timeouts. Formal verification must precede upload and `upload.needs` remains exactly `release-checks`.
- Secret references are collected from parsed expression values using dot, quoted bracket, and dynamic bracket forms. Dynamic indexes are forbidden. Workflow/job/release-checks and non-whitelisted upload locations cannot reference secrets.
- Six required env keys are bound one-to-one to exact `${{ secrets.NAME }}` values on the three protected upload steps. Aliases, swapped names, bracket substitutions, missing keys, and job-level secret exposure are rejected.
- The upload environment must be exactly `wechat-production`, without extra dynamic fields.
- The verifier accepts `--release-workflow <path>` only to pressure-test real validation behavior against temporary mutation fixtures.

## Review

- Independent read-only Claude CLI review found no Critical issues.
- First review Important item fixed: official GitHub Actions are pinned to full commit SHAs in `ci.yml`, `pages.yml`, and `wechat-release.yml`.
- Second review Important item fixed: `workflow_dispatch` `disclosure_file` is no longer interpolated directly in shell `run` scripts.
- Task 9 P2 follow-up fixed: release workflow checks no longer depend on raw-text `includes` or section slicing.
- Three read-only Claude CLI review attempts across the P2 follow-ups timed out without output, including a final stdin-only diff review. No reviewer result was treated as approval; mutation tests, full release verification, and a manual diff audit were used as the submission gates.
- Audit finding remains informational and documented in `docs/wechat/release-audit.md`: `npm audit --omit=optional --json` reports 125 advisories in upstream/dependency paths. This does not block local handoff, but production owners should track it before formal release.

## Verification

- `npm run verify:github-workflows`: passed.
- Focused GREEN after final workflow P2 mutations: `npm run test:cloudbase -- --runInBand releaseVerification.test.ts`: 17 suites / 171 tests passed.
- Full local release verifier: `npm run verify:wechat-release`: passed for development profile.
- Root tests: 34 suites / 263 tests passed.
- WeChat tests: 15 suites / 77 tests passed.
- CloudBase tests: 17 suites / 171 tests passed.
- Typechecks: root, WeChat, and CloudBase passed inside `verify:wechat-release`.
- Builds: CloudBase, Expo web export, and WeChat `build:weapp` passed inside `verify:wechat-release`.
- Secret scans: source and WeChat dist passed inside `verify:wechat-release`, then source/dist were run again after evidence refresh.
- `npm run wechat:ci:dry-run -- --version 0.0.0-task9 --description "Task 9 dry run"`: passed without AppID/private key.
- Expected blocker: `npm run verify:wechat-release:formal` failed before builds with `formal profile requires a production CloudBase environment id`.
- Expected blocker: `npm run verify:wechat-release:formal-preflight -- --disclosure-file docs/wechat/release-disclosure.production.template.json` failed on production `serviceOperator`, `modelDisclosure`, `generativeAiRegistration`, and `miniProgramFiling` placeholders.
- Full evidence: `docs/wechat/release-evidence/2026-08-10-command-output.md`.

## Completion Matrix

The repository-local matrix is `docs/wechat/release-completion-matrix.md`.

Locally verified:

- WeChat release handoff documents.
- CloudBase deployment/runbook guidance.
- Review submission guidance.
- Manifest template without secrets or invented identifiers.
- GitHub Actions release checks and upload job safety boundaries.
- Filing and production smoke issue templates.
- README links and WeChat development commands.

Externally ready:

- GitHub `wechat-production` environment approval and values.
- Production disclosure JSON generated from the template.
- Filing/smoke issues ready to be opened and closed by account owners.

Externally blocked:

- Real WeChat subject, AppID, upload private key, and DevTools login.
- Real CloudBase production environment and deployed hosted smoke.
- Mini Program filing, privacy declaration, generated-AI disclosure/registration, and legal operator approval.
- iOS/Android real-device screenshots.
- WeChat review submission, approval, release, rollout, and rollback evidence.

## SHA

Final commit SHA is reported by the controller after committing.
