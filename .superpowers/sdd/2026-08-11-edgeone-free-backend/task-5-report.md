# Task 5 Report: Single-Call Generation, Moderation, and REST Business Routes

## Status

Completed, including both strict review hardening rounds.

## Generation Contract

- Each new assessment requests exactly 50 questions in one OpenAI-compatible LLM call.
- The provider operation is capped at 105 seconds and the generation route starts a 115-second total deadline before authentication.
- The deadline covers authentication, request-body reads, privacy checks, job claims, quota, input moderation, the LLM call, response-body reads, output moderation, and persistence waits.
- Provider response streaming is capped at 2 MiB across all chunks. Stalled and rejected streams are cancelled and readers release their locks.
- The prompt follows the language of `topic` and `notes`; Chinese is only the fallback when the input language is unclear.
- Fenced JSON and harmless surrounding prose are extracted and repaired with `jsonrepair`.
- HTML/XML, malformed schemas, and 49/51-question outputs map to `INVALID_MODEL_RESPONSE`.
- Model output is copied through explicit allowlists. Question IDs are normalized to `q1` through `q50`, scoring values are strictly validated, and unknown answer aliases are discarded.
- Input and the complete user-visible paper, including topic, question fields, materials, and scoring level titles/summaries, pass WeChat moderation before persistence.
- No assessment record is written until parsing, schema validation, exact count validation, and output moderation all succeed.

## Session And Moderation Security

- `msg_sec_check` v2 requests include the authenticated user's server-side OpenID.
- Session Blob records store only AES-256-GCM `encryptedOpenId` fields (`iv`, `tag`, and `ciphertext`) plus token metadata and the HMAC-derived owner key.
- `OPENID_ENCRYPTION_KEY` must decode to exactly 32 bytes and is validated before the WeChat code exchange.
- AES-GCM additional authenticated data binds the ciphertext to the token hash and owner key. Tampering fails closed as `BACKEND_UNAVAILABLE`.
- OpenID remains absent from Blob paths, logs, errors, and REST responses.
- WeChat access-token cache keys are isolated by AppID and use strong Blob reads. Non-positive `expires_in` is rejected.
- Concurrent token refreshes use same-process single-flight scoped to the underlying EdgeOne Blob service. The refresh has an independent 15-second budget while each waiter observes its own deadline, so a short waiter cannot cancel a longer waiter.
- Cross-instance refreshes use strongly read, immutable revision locks with a 12-second lease and `onlyIfNew` claims. Only one contender refreshes, and an abandoned lock can be taken over after expiry.
- Blob token reads/writes, token fetches, moderation fetches, and response readers are deadline bounded. Fetch timeouts do not depend on the upstream honoring `AbortSignal`.
- Output moderation runs at most three requests concurrently and waits for already-started workers to settle before returning a failure.
- Explicit content violations map to non-retryable `CONTENT_BLOCKED`/422. WeChat HTTP, network, JSON, timeout, token, and Blob failures fail closed as retryable `BACKEND_UNAVAILABLE`/503.

## Persistence And REST Contracts

- Persistent generation attempts live under hashed `jobs/<owner>/<job>/attempts/<attempt>` paths.
- Running jobs include `updatedAt` and a two-minute `leaseUntil`. Claims and results are immutable and use `onlyIfNew`; concurrent duplicates or stale-lease takeovers have one winner and do not invoke the LLM twice for the same active attempt.
- Expired running jobs can be explicitly retried after a process crash. A job permits at most three attempts, after which it returns the stable non-retryable `JOB_ATTEMPT_LIMIT` failure.
- Completed retries return the same assessment, including recovery after a response is lost between assessment persistence and job completion.
- Failed jobs remain stable until `retry: true` explicitly opens a new attempt.
- Quota is reserved only after the first job claim. The immutable job-level `quota-reserved.json` marker and quota ledger reservation ID ensure retries reuse the original reservation; a failed-then-successful job increments the daily count once.
- Failure persistence uses a fresh two-second best-effort deadline, so an exhausted 115-second request deadline cannot leave a permanent running state. If that short write also fails, lease expiry permits recovery.
- Assessment completion requires one valid, non-empty answer for every one of the 50 questions.
- Draft paper DTOs recursively rebuild questions, options, materials, and scoring from allowed fields, preventing answer or explanation aliases from leaking.
- Generation, assessments, settings, and reports all require a session and derive `ownerKey` server-side.
- Unsupported methods return 405 `METHOD_NOT_ALLOWED`.
- Every error uses `{ code, message, retryable }`; existing success payloads remain compatible with Mini Program cache DTOs.

## TDD Evidence

- Session route tests first demonstrated that a malformed encryption key still allowed a WeChat request; preflight validation now rejects it before network access.
- Deadline tests first hung on stalled Blob reads/writes, single-flight waiting, and fetch implementations that ignored abort; explicit deadline races now terminate those operations.
- Stream tests first showed unread WeChat and provider error bodies were not cancelled; all rejection paths now cancel available bodies.
- A draft DTO test first exposed unknown answer fields nested inside `materials`; recursive material canonicalization removed the leak.
- Existing tests cover encrypted session storage, GCM tamper detection, moderation `openid`, job concurrency, failure retry, lost-response recovery, 49/51 questions, HTML/XML, JSON repair, schema rejection, language behavior, 2 MiB multi-chunk limits, stalled readers, and all business-route authentication.
- New red-green tests cover stale running takeover, concurrent takeover, three-attempt exhaustion, durable quota failures, one real-ledger reservation across failure/retry, failure writes after global timeout, never-resolving stream cancellation, per-waiter token deadlines, cross-instance refresh locking, expired-lock takeover, and stable process coordination across EdgeOne Blob wrappers.

## Verification

- `npm run test:edgeone -- --runInBand`: 17 suites, 116 tests passed.
- `npm run typecheck:edgeone`: passed.
- `npm run build:edgeone`: passed and regenerated all six Node Function bundles.
- `npm run scan:secrets:source`: passed.
- `node scripts/scan-secrets.mjs --target edgeone-dist services/edgeone/cloud-functions`: passed.
- `npm pack --dry-run --json --workspace @dynamic-assessment/edgeone`: passed; 8 deployable files, no TypeScript tests included.
- `git diff --check`: passed before final commit.

## Remaining Risk

- Live EdgeOne Preview verification still requires real runtime environment variables and reachable WeChat/model endpoints.
- `OPENID_ENCRYPTION_KEY` currently supports one active key. Rotating it would make sessions encrypted with the previous key unreadable; a future keyring migration should retain prior decrypt-only keys during rotation.
- The Mini Program HTTPS client migration remains Task 6; these REST contracts are ready for that adapter.
