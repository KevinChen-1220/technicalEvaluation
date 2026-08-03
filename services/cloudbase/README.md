# CloudBase persistence contracts

This package defines the versioned persistence boundary for CloudBase. It does not contain an environment ID, AppID, endpoint, credential, or API key.

## Ownership and client access

Cloud functions must pass their trusted WeChat context to the builders in `shared/contracts.ts`. The only accepted ownership source is `context.OPENID`; request body owner, user ID, `_openid`, and revision values are ignored by the contract input types and must never establish authority.

Mini Program clients can read only their own `generation_jobs` and `assessments` records. Their database writes are denied and must go through authenticated cloud functions, where the admin SDK bypasses the client rules. `user_settings` client reads and writes are allowed only when `auth.openid` exactly matches the record `_openid`. Settings may contain locale, display preferences, and privacy-consent metadata only.

See the official CloudBase documentation for [database security rules](https://docs.cloudbase.net/database/security-rules) and [cloud function security rules](https://docs.cloudbase.net/cloud-function/security-rules).

## Provision environments

1. In the CloudBase console, create a development environment and a separate production environment. Keep their names in deployment tooling or console configuration, never source control.
2. In each environment, create `generation_jobs`, `assessments`, and `user_settings`. Apply the schemas in `database/collections.json` as the application contract, then create every index in `database/indexes.json` through the console or deployment pipeline.
3. Apply `database/security-rules.json` as the database client access policy. Deploy the authenticated cloud functions and configure their invoke restrictions from `database/function-invoke-rules.json`.
4. Use non-production test users and quotas in development. Configure production secrets only in the production CloudBase environment's secret manager. Reapply and validate rules and indexes independently before promotion.

## Verify

Run `npm run test:cloudbase` and `npm run typecheck:cloudbase` from the repository root. Run the deployment configuration checks in a non-production environment before applying the same configuration to production.
