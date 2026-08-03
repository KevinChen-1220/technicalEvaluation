# CloudBase persistence contracts

This package defines the versioned persistence boundary for CloudBase. It does not contain an environment ID, AppID, endpoint, credential, or API key.

## Ownership and client access

Cloud functions must create the opaque `TrustedWeChatContext` with an injected runtime `getWXContext` callback before calling the builders in `shared/contracts.ts`. The callback's `OPENID` is the only accepted ownership source. Request-body/event owner, user ID, `_openid`, and revision values never establish authority.

Mini Program clients can read only their own `generation_jobs`, `assessments`, and `user_settings` records. All database writes are denied to clients and go through authenticated cloud functions, where the admin SDK bypasses client rules. `user_settings` mutations are restricted at runtime to locale, display preferences, and privacy-consent metadata.

See the official CloudBase documentation for [database security rules](https://docs.cloudbase.net/database/security-rules) and [cloud function security rules](https://docs.cloudbase.net/cloud-function/security-rules).

## Provision environments

1. In the CloudBase console, create a development environment and a separate production environment. Keep their names in deployment tooling or console configuration, never source control.
2. In each environment, create `generation_jobs`, `assessments`, and `user_settings`. Apply the schemas in `database/collections.json` as the application contract, then create every index in `database/indexes.json` through the console or deployment pipeline.
3. For each named collection, open its CloudBase database security-rule editor and apply the complete matching top-level file in `database/security-rules/`: `generation_jobs.json`, `assessments.json`, or `user_settings.json`. Do not wrap these files in a collection map.
4. In the environment-level Cloud Functions permission editor, apply `database/function-invoke-rules.json` exactly as written. Its `"*"` deny rule blocks any unlisted client invocation; each named mutation/read function requires authenticated `auth != null`.
5. Use non-production test users and quotas in development. Configure production secrets only in the production CloudBase environment's secret manager. Reapply and validate rules and indexes independently before promotion.

## Verify

Run `npm run test:cloudbase` and `npm run typecheck:cloudbase` from the repository root. Run the deployment configuration checks in a non-production environment before applying the same configuration to production.
