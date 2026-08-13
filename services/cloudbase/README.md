# CloudBase persistence contracts

This package is a legacy migration reference for the former CloudBase backend. The production WeChat Mini Program release path has moved to `services/edgeone` and `docs/wechat/deployment-runbook.md`.

Do not deploy this CloudBase package to production for SkillScope. Keep it only for historical contract tests, migration safety checks, and comparison against the EdgeOne Makers free-tier backend. It does not contain an environment ID, AppID, endpoint, credential, or API key.

## Ownership and client access

Cloud functions obtain their opaque trusted context only from `server/trustedContext.ts`, whose server-only adapter calls `wx-server-sdk` `getWXContext()` itself. Contract callers receive no context factory or callback. That runtime `OPENID` is the only accepted ownership source; request-body/event owner, user ID, `_openid`, and revision values never establish authority.

Mini Program clients can read only their own `generation_jobs`, `assessments`, and `user_settings` records. All database writes are denied to clients and go through authenticated cloud functions, where the admin SDK bypasses client rules. `user_settings` mutations are restricted at runtime to locale, display preferences, and privacy-consent metadata; updates reproject the record to those persisted fields so legacy or corrupt provider fields are removed.

See the official CloudBase documentation for [database security rules](https://docs.cloudbase.net/database/security-rules) and [cloud function security rules](https://docs.cloudbase.net/cloud-function/security-rules).

## Asynchronous generation functions

`create-generation-job` and `get-generation-job` derive ownership with `server/trustedContext.ts`; request event fields never establish identity. The create function trims and validates input, applies a fixed five-job UTC daily quota, and uses a deterministic server-side job ID when `clientRequestId` is present. The quota counter and queued job are committed together in one CloudBase transaction, so concurrent creates cannot exceed the limit and a failed job write cannot consume quota. First-use transaction reads normalize the exact `wx-server-sdk@4.0.2` missing-document error and null/undefined data as absent. A repeated idempotency key returns the stored job's actual status. The polling function returns only public job status fields and gives the same typed response for missing and foreign IDs.

`generation-worker` claims one queued or expired-lease job with a single conditional database update. Before every exact 10-question provider call it renews the two-minute lease with an owner-checked conditional update; the fetch signal aborts after 40 seconds, leaving an 80-second lease margin. It writes the deterministic assessment draft before completing the job, so a stale worker can resume completion without duplicating provider work or storage.

Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` only in each CloudBase server environment. The base URL must use HTTPS. Do not place their values in source, client configuration, deployment output, logs, or function responses. The worker reads provider responses only after successful HTTP status and reduces all failures to the documented safe error codes.

Run `npm run build:cloudbase` at the repository root. The build copies `deploy/cloudbaserc.json` to `dist/cloudbaserc.json`; deploy from that output config so `generation-worker` receives its deliberate 600-second timeout while create/poll remain at 15 seconds. Ten 40-second provider calls have a strict 400-second aggregate budget, leaving at least 120 seconds for cold start and database work. CloudBase event functions support 1-900 second timeouts; see the official [CloudBase function configuration reference](https://docs.cloudbase.net/cli-v1/functions/configs). Each bundle keeps `wx-server-sdk` external and pins runtime installation to `4.0.2`. Configure `generation-worker` as a server-side scheduled trigger, not a client-invokable function.

## Legacy provisioning reference

The following notes describe the retired CloudBase shape and are not production instructions:

1. Historical CloudBase environments used `generation_jobs`, `daily_generation_quotas`, `assessments`, and `user_settings`.
2. Historical security rules lived under `database/security-rules/`, and `daily_generation_quotas` denied client reads and writes.
3. Historical Cloud Function invocation rules lived in `database/function-invoke-rules.json`.
4. Any non-production experiment must use disposable test users and quotas, and must not be promoted as the SkillScope production backend.

## Verify

Run `npm run test:cloudbase` and `npm run typecheck:cloudbase` from the repository root only to keep migration contracts and legacy adapters compiling. Formal WeChat release verification, deployment, health checks, content safety, storage, and upload must use the EdgeOne path.
