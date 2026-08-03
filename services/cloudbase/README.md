# CloudBase persistence contracts

This package defines the versioned persistence boundary for CloudBase. It does not contain an environment ID, AppID, endpoint, credential, or API key.

## Ownership and client access

Cloud functions obtain their opaque trusted context only from `server/trustedContext.ts`, whose server-only adapter calls `wx-server-sdk` `getWXContext()` itself. Contract callers receive no context factory or callback. That runtime `OPENID` is the only accepted ownership source; request-body/event owner, user ID, `_openid`, and revision values never establish authority.

Mini Program clients can read only their own `generation_jobs`, `assessments`, and `user_settings` records. All database writes are denied to clients and go through authenticated cloud functions, where the admin SDK bypasses client rules. `user_settings` mutations are restricted at runtime to locale, display preferences, and privacy-consent metadata; updates reproject the record to those persisted fields so legacy or corrupt provider fields are removed.

See the official CloudBase documentation for [database security rules](https://docs.cloudbase.net/database/security-rules) and [cloud function security rules](https://docs.cloudbase.net/cloud-function/security-rules).

## Asynchronous generation functions

`create-generation-job` and `get-generation-job` derive ownership with `server/trustedContext.ts`; request event fields never establish identity. The create function trims and validates input, applies a fixed five-job UTC daily quota, and uses a deterministic server-side job ID when `clientRequestId` is present. The polling function returns only public job status fields and gives the same typed response for missing and foreign IDs.

`generation-worker` claims one queued or expired-lease job with a single conditional database update, then renews its two-minute lease after each exact 10-question batch. It writes the deterministic assessment draft before completing the job, so a stale worker can resume completion without duplicating provider work or storage.

Set `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` only in each CloudBase server environment. Do not place their values in source, client configuration, deployment output, logs, or function responses. The worker reads provider responses only after successful HTTP status and reduces all failures to the documented safe error codes.

Run `npm run build:cloudbase` at the repository root. Deploy each directory under `services/cloudbase/dist/` as the matching CloudBase function; each bundle keeps `wx-server-sdk` external and pins runtime installation to `4.0.2`. Configure `generation-worker` as a server-side scheduled trigger, not a client-invokable function.

## Provision environments

1. In the CloudBase console, create a development environment and a separate production environment. Keep their names in deployment tooling or console configuration, never source control.
2. In each environment, create `generation_jobs`, `assessments`, and `user_settings`. Apply the schemas in `database/collections.json` as the application contract, then create every index in `database/indexes.json` through the console or deployment pipeline.
3. For each named collection, open its CloudBase database security-rule editor and apply the complete matching top-level file in `database/security-rules/`: `generation_jobs.json`, `assessments.json`, or `user_settings.json`. Do not wrap these files in a collection map.
4. In the environment-level Cloud Functions permission editor, apply `database/function-invoke-rules.json` exactly as written. Its `"*"` deny rule blocks any unlisted client invocation; each named mutation/read function requires authenticated `auth != null`.
5. Use non-production test users and quotas in development. Configure production secrets only in the production CloudBase environment's secret manager. Reapply and validate rules and indexes independently before promotion.

## Verify

Run `npm run test:cloudbase` and `npm run typecheck:cloudbase` from the repository root. Run the deployment configuration checks in a non-production environment before applying the same configuration to production.
