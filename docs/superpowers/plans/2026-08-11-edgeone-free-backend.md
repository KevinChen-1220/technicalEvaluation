# EdgeOne Free Backend Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the WeChat Mini Program CloudBase runtime with an EdgeOne Makers free backend and make every new assessment exactly 50 questions.

**Architecture:** Keep the existing local-first Mini Program cache and shared assessment contracts. Add a Node Functions workspace for EdgeOne with WeChat session exchange, HMAC owner keys, Blob-backed metadata and assessment documents, synchronous idempotent 50-question generation in five 10-question model batches, and REST endpoints; replace `Taro.cloud.callFunction` with an authenticated HTTPS client.

**Tech Stack:** TypeScript, Taro 4, React 18, Jest, esbuild, EdgeOne Makers Node Functions, EdgeOne Blob, WeChat REST APIs, OpenAI-compatible LLM APIs.

## Global Constraints

- New assessments always contain exactly 50 questions; no 50/100 selector or request field remains.
- Existing 100-question local records remain readable.
- Five LLM requests produce fixed 10-question batches that are combined into one 50-question assessment inside a 120-second Cloud Function.
- A response is persisted only after JSON repair, schema validation, exact-count validation, and fail-closed moderation all pass.
- Free-tier exhaustion returns `FREE_TIER_LIMIT`; code never enables or requests a paid plan.
- AppSecret, model keys, HMAC keys, and access tokens never enter client bundles, logs, fixtures, or Git.
- The EdgeOne built-in free model is not a formal-production dependency.
- Tests are written before implementation and every task ends with a focused commit.

---

### Task 1: Fixed 50-Question Product Contract

**Files:**
- Modify: `packages/assessment-core/src/types.ts`
- Modify: `packages/assessment-core/src/index.ts`
- Modify: `packages/assessment-core/test/assessmentCore.contract.test.ts`
- Modify: `apps/wechat/src/shell/viewModel.ts`
- Modify: `apps/wechat/src/pages/generate/index.tsx`
- Modify: `apps/wechat/src/storage/generationIntent.ts`
- Modify: `apps/wechat/src/services/cloud.ts`
- Modify: `apps/wechat/src/fixtures/releaseFixtureClient.ts`
- Modify: `apps/wechat/test/viewModel.test.ts`
- Modify: `apps/wechat/test/releaseFixtureClient.test.ts`
- Modify: `src/features/assessment/generator.ts`
- Modify: `src/features/assessment/generator.test.ts`

**Interfaces:**
- Produces: `ASSESSMENT_QUESTION_COUNT: 50` from `@dynamic-assessment/assessment-core`.
- Produces: generation inputs shaped as `{ topic: string; notes?: string; clientRequestId?: string }`.
- Preserves: `AssessmentPaper.questionCount: 50 | 100` for legacy history reads.

- [ ] **Step 1: Write failing fixed-count contract tests**

```ts
expect(ASSESSMENT_QUESTION_COUNT).toBe(50);
expect(createGenerationInput({ topic: 'TypeScript' })).toEqual({
  topic: 'TypeScript',
  questionCount: 50,
});
expect(generatePageSource).not.toContain('count-control');
```

- [ ] **Step 2: Run focused tests and confirm they fail**

Run: `npm test -- --runInBand packages/assessment-core/test/assessmentCore.contract.test.ts && npm run test:wechat -- --runInBand test/viewModel.test.ts test/releaseFixtureClient.test.ts`

Expected: FAIL because the constant is absent and 100-question generation remains supported.

- [ ] **Step 3: Add the shared constant and remove count choice from new-generation DTOs**

```ts
export const ASSESSMENT_QUESTION_COUNT = 50 as const;

export type NewAssessmentRequest = {
  topic: string;
  notes?: string;
  clientRequestId?: string;
};
```

Keep `validateAssessmentPaper` compatible with 50 and 100 so old records still open. Every prompt and newly constructed paper uses `ASSESSMENT_QUESTION_COUNT`.

- [ ] **Step 4: Remove the Mini Program segmented count control and normalize legacy intents to 50**

The generate page keeps only topic, notes, and the generate button. `generationIntent` accepts old persisted intents but rewrites their next request to 50.

- [ ] **Step 5: Run affected tests and typechecks**

Run: `npm test -- --runInBand packages/assessment-core/test/assessmentCore.contract.test.ts src/features/assessment/generator.test.ts && npm run test:wechat -- --runInBand && npm run typecheck && npm run typecheck:wechat`

Expected: PASS; fixture generation has 50 questions and legacy 100-question paper validation remains covered.

- [ ] **Step 6: Commit**

```bash
git add packages/assessment-core src/features/assessment apps/wechat/src apps/wechat/test
git commit -m "feat: fix new assessments at fifty questions"
```

---

### Task 2: EdgeOne Workspace and Deployable Node Functions

**Files:**
- Create: `services/edgeone/package.json`
- Create: `services/edgeone/tsconfig.json`
- Create: `services/edgeone/edgeone.json`
- Create: `services/edgeone/src/platform/context.ts`
- Create: `services/edgeone/src/storage/ports.ts`
- Create: `services/edgeone/src/http/envelope.ts`
- Create: `services/edgeone/src/routes/health.ts`
- Create: `services/edgeone/node-functions/api/health.ts`
- Create: `services/edgeone/scripts/build.mjs`
- Create: `services/edgeone/test/buildArtifacts.test.ts`
- Create: `services/edgeone/test/healthRoute.test.ts`
- Modify: `package.json`
- Modify: `jest.config.js`

**Interfaces:**
- Produces: `BlobPort.get/put/delete/list` with optional strong-consistency reads, and `EdgeOneContext = { request: Request; env: Record<string, string | undefined>; blob: BlobPort }`.
- Produces: `success(data, status?)` and `failure(code, retryable, status)` JSON response helpers.
- Produces: `npm run build:edgeone`, `npm run test:edgeone`, and `npm run typecheck:edgeone`.

- [ ] **Step 1: Write failing artifact and health tests**

```ts
expect(config.cloudFunctions.maxDuration).toBe(120);
expect(await route(request, context)).toMatchObject({
  status: 200,
  body: { ok: true, data: { service: 'skillscope-edgeone' } },
});
```

- [ ] **Step 2: Run tests and confirm workspace/scripts are missing**

Run: `npm run test:edgeone -- --runInBand`

Expected: FAIL because the workspace does not exist.

- [ ] **Step 3: Scaffold the workspace and platform-neutral context**

Use `esbuild` to bundle each `node-functions/api/*.ts` entry into `services/edgeone/dist/node-functions/api/*.js`. Define the minimal Blob port here; the EdgeOne SDK adapter is injected through context rather than imported by domain services.

`edgeone.json` must contain:

```json
{
  "cloudFunctions": { "nodejs": { "maxDuration": 120 } },
  "headers": [
    { "source": "/api/*", "headers": [{ "key": "Cache-Control", "value": "no-store" }] }
  ]
}
```

- [ ] **Step 4: Implement health route and EdgeOne entry adapter**

Health output includes service, commit/version, and `generationEnabled`, but never echoes environment values.

- [ ] **Step 5: Run workspace tests, typecheck, and build**

Run: `npm run test:edgeone -- --runInBand && npm run typecheck:edgeone && npm run build:edgeone`

Expected: PASS and `services/edgeone/cloud-functions/api/health.js` exists. A package dry-run includes the built functions and excludes tests.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json jest.config.js services/edgeone
git commit -m "feat: scaffold EdgeOne Makers backend"
```

---

### Task 3: WeChat Session Exchange and Owner Isolation

**Files:**
- Create: `services/edgeone/src/auth/wechatSession.ts`
- Create: `services/edgeone/src/auth/sessionToken.ts`
- Create: `services/edgeone/src/auth/ownerKey.ts`
- Create: `services/edgeone/src/routes/session.ts`
- Create: `services/edgeone/node-functions/api/session.ts`
- Create: `services/edgeone/test/wechatSession.test.ts`
- Create: `services/edgeone/test/sessionToken.test.ts`
- Create: `services/edgeone/test/ownerIsolation.test.ts`

**Interfaces:**
- Produces: `exchangeWeChatCode(code, env, fetch): Promise<{ openId: string }>`.
- Produces: `issueSession(openId, dependencies): Promise<{ token: string; expiresAt: string }>`.
- Produces: `requireSession(request, dependencies): Promise<{ ownerKey: string; openId: string }>`; `openId` remains server-only for moderation.
- Consumes: `BlobPort` from Task 2.

- [ ] **Step 1: Write failing tests for code exchange, token hashing, expiration, and forged owners**

```ts
await expect(exchangeWeChatCode('', env, fetch)).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
expect(storedSession).not.toContain(openId);
await expect(requireSession(expiredRequest, deps)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
```

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm run test:edgeone -- --runInBand test/wechatSession.test.ts test/sessionToken.test.ts test/ownerIsolation.test.ts`

- [ ] **Step 3: Implement `jscode2session` with strict HTTPS and safe errors**

Require `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `SESSION_HMAC_KEY`, `OWNER_HMAC_KEY`, and `OPENID_ENCRYPTION_KEY`. Never log the request URL because it contains the AppSecret.

- [ ] **Step 4: Implement opaque 256-bit sessions**

Store only `sha256(token)`, HMAC owner key, AES-256-GCM encrypted OpenID, and expiry in Blob at `sessions/<tokenHash>.json`. Use strong-consistency reads, constant-time token checks, and seven-day expiration. Decrypt OpenID only for server-side WeChat moderation.

- [ ] **Step 5: Add `/api/session` and authorization middleware**

`POST { code }` returns `{ token, expiresAt }`; every non-health route rejects missing/invalid bearer tokens.

- [ ] **Step 6: Run focused tests and secret scan**

Run: `npm run test:edgeone -- --runInBand test/wechatSession.test.ts test/sessionToken.test.ts test/ownerIsolation.test.ts && npm run scan:secrets:source`

- [ ] **Step 7: Commit**

```bash
git add services/edgeone
git commit -m "feat: add secure WeChat sessions"
```

---

### Task 4: Free-Tier Blob Persistence

**Files:**
- Create: `services/edgeone/src/storage/edgeOneStores.ts`
- Create: `services/edgeone/src/storage/memoryStores.ts`
- Create: `services/edgeone/src/storage/assessmentRepository.ts`
- Create: `services/edgeone/src/storage/settingsRepository.ts`
- Create: `services/edgeone/src/storage/quotaRepository.ts`
- Create: `services/edgeone/src/storage/reportRepository.ts`
- Create: `services/edgeone/test/storageContracts.test.ts`
- Create: `services/edgeone/test/assessmentRepository.test.ts`
- Create: `services/edgeone/test/quotaRepository.test.ts`

**Interfaces:**
- Consumes: `BlobPort.get/put/delete/list` from Task 2.
- Produces: `AssessmentRepository` methods `get`, `list`, `createIfAbsent`, `compareAndSwap`, `complete`.
- Produces: quota decision `'allowed' | 'rate_limited' | 'quota_exceeded' | 'generation_disabled'`.

- [ ] **Step 1: Write one contract suite run against memory and EdgeOne-shaped adapters**

```ts
expect(await repository.createIfAbsent(record)).toEqual(record);
expect(await repository.compareAndSwap({ ...update, expectedRevision: 1 })).toMatchObject({ type: 'updated', revision: 2 });
expect(await repository.compareAndSwap({ ...update, expectedRevision: 1 })).toMatchObject({ type: 'conflict' });
```

- [ ] **Step 2: Run tests and confirm missing implementations**

Run: `npm run test:edgeone -- --runInBand test/storageContracts.test.ts test/assessmentRepository.test.ts test/quotaRepository.test.ts`

- [ ] **Step 3: Implement namespaced keys and 200-item owner indexes**

Assessment documents live at `assessments/<ownerKey>/<id>.json`; indexes contain summaries only. Use revision compare-and-swap semantics and return the just-written object without reading eventual-consistency storage again.

- [ ] **Step 4: Implement settings, quota, reports, and retention filtering**

Daily generation limit is 5 and the short-window limit is one request per 60 seconds. Expired drafts/reports are omitted and deleted opportunistically in bounded batches.

- [ ] **Step 5: Run tests and typecheck**

Run: `npm run test:edgeone -- --runInBand test/storageContracts.test.ts test/assessmentRepository.test.ts test/quotaRepository.test.ts && npm run typecheck:edgeone`

- [ ] **Step 6: Commit**

```bash
git add services/edgeone
git commit -m "feat: add EdgeOne free-tier persistence"
```

---

### Task 5: Batched Generation, Moderation, and REST Business Routes

**Files:**
- Create: `services/edgeone/src/generation/openAIClient.ts`
- Create: `services/edgeone/src/generation/parseAssessment.ts`
- Create: `services/edgeone/src/generation/generateAssessment.ts`
- Create: `services/edgeone/src/moderation/wechatAccessToken.ts`
- Create: `services/edgeone/src/moderation/wechatTextSecurity.ts`
- Create: `services/edgeone/src/routes/generation.ts`
- Create: `services/edgeone/src/routes/assessments.ts`
- Create: `services/edgeone/src/routes/settings.ts`
- Create: `services/edgeone/src/routes/reports.ts`
- Create: `services/edgeone/node-functions/api/generation.ts`
- Create: `services/edgeone/node-functions/api/assessments/[[path]].ts`
- Create: `services/edgeone/node-functions/api/settings.ts`
- Create: `services/edgeone/node-functions/api/reports.ts`
- Create: `services/edgeone/test/generation.test.ts`
- Create: `services/edgeone/test/moderation.test.ts`
- Create: `services/edgeone/test/routes.contract.test.ts`

**Interfaces:**
- Produces: `generateFiftyQuestionAssessment(input, deps): Promise<Assessment>`.
- Produces REST envelopes compatible with the Mini Program cache DTOs.
- Consumes Task 3 authorization and Task 4 repositories.

- [ ] **Step 1: Write failing generation tests**

Cover exactly 50 questions, 49/51 rejection, HTML/XML rejection, JSON repair, 2 MiB cap, 105-second abort, input/output moderation failure, idempotent retry, and no partial writes.

```ts
await expect(generateFiftyQuestionAssessment(input, deps49)).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' });
expect(repository.createIfAbsent).not.toHaveBeenCalled();
```

- [ ] **Step 2: Write failing route contract tests**

Exercise privacy consent, list/get/update/complete, revision conflicts, reports without assessment IDs, owned-assessment checks, and `FREE_TIER_LIMIT`.

- [ ] **Step 3: Run focused tests and confirm failure**

Run: `npm run test:edgeone -- --runInBand test/generation.test.ts test/moderation.test.ts test/routes.contract.test.ts`

- [ ] **Step 4: Implement five-call 10-question prompts and parser**

Each system message contains `Generate exactly 10 assessment questions`. Request five batches, include scoring only in the first batch, normalize IDs to `q1` through `q50`, validate the full paper with assessment-core, and persist only after output moderation passes.

- [ ] **Step 5: Implement WeChat REST moderation**

Cache stable access tokens in Blob with strong-consistency reads, call `security.msgSecCheck`, split generated text into bounded chunks, and fail closed for API errors/timeouts.

- [ ] **Step 6: Implement authenticated business routes**

All handlers derive `ownerKey` from the session. The generation route reserves quota, handles idempotency, runs the five provider batch requests, persists, and returns a completed job-compatible envelope.

- [ ] **Step 7: Run all EdgeOne tests and build**

Run: `npm run test:edgeone -- --runInBand && npm run typecheck:edgeone && npm run build:edgeone`

- [ ] **Step 8: Commit**

```bash
git add services/edgeone
git commit -m "feat: implement EdgeOne assessment API"
```

---

### Task 6: Mini Program HTTPS Client Migration

**Files:**
- Create: `apps/wechat/src/services/sessionClient.ts`
- Create: `apps/wechat/src/services/edgeOneRuntime.ts`
- Modify: `apps/wechat/src/services/cloud.ts`
- Modify: `apps/wechat/src/services/cloudRuntime.ts`
- Modify: `apps/wechat/src/storage/runtime.ts`
- Modify: `apps/wechat/src/app.tsx`
- Modify: `apps/wechat/src/privacy/consent.ts`
- Modify: `apps/wechat/test/cloudRuntime.test.ts`
- Modify: `apps/wechat/test/cloud.test.ts`
- Modify: `apps/wechat/test/appStartup.test.ts`
- Modify: `apps/wechat/test/privacyFlow.test.ts`
- Create: `apps/wechat/test/sessionClient.test.ts`

**Interfaces:**
- Produces: `EdgeOneRuntime.request<T>({ path, method, body, timeoutMs }): Promise<T>`.
- Produces: `SessionClient.ensureSession(): Promise<string>` with one 401 refresh.
- Preserves existing `cloudClient` method surface so controllers and sync queues require minimal changes.

- [ ] **Step 1: Replace runtime tests with HTTPS/session expectations**

```ts
expect(request).toHaveBeenCalledWith(expect.objectContaining({
  url: 'https://api.example.edgeone.run/api/generation',
  header: { Authorization: 'Bearer session-token' },
}));
```

Add tests for missing API URL, non-HTTPS URL, login failure, 401 refresh once, 120-second generation timeout, normal 15-second CRUD timeout, and offline fallback.

- [ ] **Step 2: Run Mini Program focused tests and confirm failure**

Run: `npm run test:wechat -- --runInBand test/cloudRuntime.test.ts test/cloud.test.ts test/sessionClient.test.ts test/appStartup.test.ts`

- [ ] **Step 3: Implement `Taro.request` EdgeOne runtime and session persistence**

Read only `TARO_APP_EDGEONE_API_BASE_URL` from the bundle. Store the opaque session token and expiry in Taro storage; never store AppSecret or provider keys.

- [ ] **Step 4: Map current cloud client methods to REST endpoints**

Keep `createGenerationJob/getGenerationJob/getAssessment/updateAssessment/listAssessments/completeAssessment/getUserSettings/acceptPrivacyPolicy/createReport`. Generation returns a completed compatible job, so the existing controller finishes without polling delay.

- [ ] **Step 5: Initialize session on startup without blocking local history**

Network failure marks cloud sync offline while local answer/history remains available. Privacy consent continues to be required server-side before generation.

- [ ] **Step 6: Run all Mini Program tests, typecheck, and build**

Run: `npm run test:wechat -- --runInBand && npm run typecheck:wechat && npm run build:weapp`

- [ ] **Step 7: Commit**

```bash
git add apps/wechat package.json package-lock.json
git commit -m "feat: connect Mini Program to EdgeOne API"
```

---

### Task 7: EdgeOne Release Gates and Documentation

**Files:**
- Create: `scripts/verify-edgeone-release.mjs`
- Create: `scripts/edgeone-deploy.mjs`
- Modify: `scripts/verify-wechat-release.mjs`
- Modify: `scripts/verify-wechat-formal-preflight.mjs`
- Modify: `scripts/scan-secrets.mjs`
- Modify: `.github/workflows/wechat-release.yml`
- Modify: `docs/wechat/deployment-runbook.md`
- Modify: `docs/wechat/release-checklist.md`
- Modify: `docs/wechat/go-live-operator-guide.md`
- Create: `docs/wechat/edgeone-env.production.example`
- Modify: `services/cloudbase/test/releaseVerification.test.ts`
- Create: `services/edgeone/test/releaseVerification.test.ts`

**Interfaces:**
- Produces: `npm run verify:edgeone-release` and `npm run edgeone:deploy`.
- Formal environment allowlist: `EDGEONE_API_TOKEN`, `EDGEONE_PROJECT_NAME`, `WECHAT_APP_ID`, `WECHAT_APP_SECRET`, `SESSION_HMAC_KEY`, `OWNER_HMAC_KEY`, `OPENID_ENCRYPTION_KEY`, `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`.

- [ ] **Step 1: Write failing release tests**

Require EdgeOne build/test/typecheck, a 120-second config, HTTPS API URL, fixed-count UI, source/dist secret scans, no `TARO_APP_CLOUDBASE_ENV_ID`, and no formal CloudBase deployment step.

- [ ] **Step 2: Run release tests and confirm current CloudBase workflow fails the new contract**

Run: `npm test -- --runInBand services/edgeone/test/releaseVerification.test.ts services/cloudbase/test/releaseVerification.test.ts`

- [ ] **Step 3: Implement EdgeOne verifier and deployment wrapper**

The deployment wrapper invokes the pinned EdgeOne CLI, prints only project/version, and redacts tokens and local secret paths. Dry-run validates artifacts without credentials.

- [ ] **Step 4: Replace formal workflow deployment**

PR/push checks run EdgeOne tests and build without secrets. Manual production deployment uses protected environment `wechat-production`, writes no secret files, deploys EdgeOne first, then builds/uploads the Mini Program with the resulting API URL.

- [ ] **Step 5: Update operator docs and disclosure**

Remove instructions to create paid CloudBase resources. Document EdgeOne free limits, hard generation shutdown, request-domain setup, environment variables, policy-change monitoring, and the separate cost status of the chosen LLM provider.

- [ ] **Step 6: Run workflow verification and secret scans**

Run: `npm run verify:github-workflows && npm run verify:edgeone-release -- --check-only && npm run scan:secrets:source`

- [ ] **Step 7: Commit**

```bash
git add scripts .github package.json package-lock.json docs/wechat services/edgeone/test services/cloudbase/test
git commit -m "ci: release WeChat backend through EdgeOne"
```

---

### Task 8: Whole-System Review, Verification, and Deployment Handoff

**Files:**
- Modify: `docs/wechat/release-completion-matrix.md`
- Modify: `docs/wechat/release-evidence/2026-08-11-edgeone-command-output.md`
- Modify: `.superpowers/sdd/*` review reports generated by the workflow

**Interfaces:**
- Consumes all prior task outputs.
- Produces a clean release candidate and exact remaining external EdgeOne/WeChat console actions.

- [ ] **Step 1: Run functional and security reviewers**

Use `superpowers:requesting-code-review` for fixed-count behavior, session isolation, storage consistency, LLM parsing, fail-closed moderation, free-tier controls, workflow secret boundaries, and legacy history compatibility.

- [ ] **Step 2: Fix every accepted finding test-first**

For each finding, add a regression test, reproduce the failure, implement the fix, and rerun the focused suite before requesting re-review.

- [ ] **Step 3: Run complete local verification**

```bash
npm test -- --runInBand
npm run test:wechat -- --runInBand
npm run test:cloudbase -- --runInBand
npm run test:edgeone -- --runInBand
npm run typecheck
npm run typecheck:wechat
npm run typecheck:cloudbase
npm run typecheck:edgeone
npm run build:web
npm run build:weapp
npm run build:cloudbase
npm run build:edgeone
npm run verify:web
npm run verify:assets
npm run verify:github-workflows
npm run scan:secrets:source
npm run scan:secrets:wechat-dist
npm run verify:edgeone-release
```

Expected: all blocking commands exit 0; only documented external login/domain/production secrets/review gates remain.

- [ ] **Step 4: Commit verification evidence**

```bash
git add docs/wechat/release-completion-matrix.md docs/wechat/release-evidence .superpowers/sdd
git commit -m "test: verify EdgeOne WeChat release candidate"
```

- [ ] **Step 5: Merge, push, and verify GitHub Actions**

Fast-forward the feature branch into `main`, push, and wait for CI, Pages, and WeChat release checks to succeed.

- [ ] **Step 6: Deploy when EdgeOne credentials are available**

Run the protected EdgeOne deployment, add the resulting exact `https://<project>.edgeone.run` origin to WeChat request domains, build the formal Mini Program, upload an experience version, and execute the real-device smoke checklist.
