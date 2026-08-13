# 2026-08-13 EdgeOne 微信小程序发布候选验证输出

Profile: development/local release candidate
Generated at: 2026-08-13T17:36:21+08:00
Branch: `main`
Head: `2a54026c91d52f769cb9a8b39f880cb8ceb97700`

## Review Gates

- Task 7 scoped release-engineering review: PASS after fixes `872916c` and `30037e1`.
- Task 8 whole-branch review: PASS after fixes through `e6aa8df`.
- Real EdgeOne deployment now builds and publishes Node Functions, including the five-batch 10-question generation flow. Remaining production evidence is external: runtime secret configuration, stable WeChat request domain, real-device smoke, WeChat review, and final publish.

## Commands

### npm test -- --runInBand

Status: exit 0

```text
Test Suites: 52 passed, 52 total
Tests:       435 passed, 435 total
Snapshots:   0 total
```

### npm run test:wechat -- --runInBand

Status: exit 0

```text
Test Suites: 16 passed, 16 total
Tests:       86 passed, 86 total
```

### npm run test:cloudbase -- --runInBand

Status: exit 0

```text
Test Suites: 17 passed, 17 total
Tests:       186 passed, 186 total
```

### npm run test:edgeone -- --runInBand

Status: exit 0

```text
Test Suites: 18 passed, 18 total
Tests:       154 passed, 154 total
```

### npx edgeone@1.6.23 makers build

Status: exit 0

Key output:

```text
Node functions build start
Node functions build completed successfully
```

Generated route config:

```text
^/api/generation$
^/api/health$
^/api/reports$
^/api/session$
^/api/settings$
^/api/assessments/(.*)$
```

### npx edgeone@1.6.23 makers deploy -n skillscope-wechat -e production --json

Status: exit 0

Deployment:

```text
Project ID: makers-xt0lfsjyivza
Deployment ID: dp5937p0xizn
Deploy URL origin: https://skillscope-wechat-7ii3kn8n.edgeone.cool
Console URL: https://console.cloud.tencent.com/edgeone/pages/project/makers-xt0lfsjyivza/deployment/dp5937p0xizn
```

Remote token-preview health check:

```json
{"ok":true,"data":{"service":"skillscope-edgeone","version":"unknown","configurationReady":false,"generationEnabled":false}}
```

The false configuration flags are expected before production runtime environment variables are configured in EdgeOne.
The EdgeOne CLI deployment log still reported `No environment variables found`; configure production runtime variables in the EdgeOne console before enabling generation.
The same default `edgeone.cool` origin without the deployment token returned HTTP 401, so a stable public HTTPS origin must still be bound before it can be used as the WeChat request legal domain. Do not save preview `eo_token` query parameters in committed release evidence.

### npx edgeone@1.6.23 makers env ls/pull/set

Status: exit 0 but no persisted environment values

```text
npx edgeone@1.6.23 makers env ls
<no output>
npx edgeone@1.6.23 makers env pull
ENV_LENGTH=0
npx edgeone@1.6.23 makers env set EDGEONE_DEPLOYMENT_VERSION <current-sha>
--- after set: ls ---
<no output>
--- after set: pull ---
ENV_LENGTH=0
```

This confirms that runtime environment variables still need to be entered in the EdgeOne console for this project. Use `node scripts/edgeone-runtime-env.mjs --app-id wx31dd3d7448aac8e3 --version <commit-sha>` to generate a console-only checklist with fresh random server keys.

### GitHub environment update

Status: exit 0

```text
gh secret set EDGEONE_DEPLOYMENT_VERSION --env wechat-production --body 2a54026c91d52f769cb9a8b39f880cb8ceb97700
```

### npm run verify:wechat-go-live -- --app-id wx31dd3d7448aac8e3 --api-base-url https://api.skillscope.cn --skip-health

Status: exit 1, expected until the missing external credentials and stable HTTPS domain are configured.

```text
health check skipped; run again without --skip-health before WeChat upload
GitHub environment wechat-production is missing TARO_APP_EDGEONE_API_BASE_URL
GitHub environment wechat-production is missing WECHAT_PRIVATE_KEY_PEM
```

This confirms the new go-live readiness gate can inspect the protected GitHub environment by secret name without exposing secret values. The command must pass without `--skip-health` before uploading a WeChat draft.

### Typecheck

Status: exit 0

```text
npm run typecheck
npm run typecheck:wechat
npm run typecheck:cloudbase
npm run typecheck:edgeone
```

### Builds

Status: exit 0

```text
npm run build:web
npm run build:weapp
npm run build:cloudbase
npm run build:edgeone
```

### Release Verifiers

Status: exit 0

```text
npm run verify:web
npm run verify:assets
npm run verify:github-workflows
npm run scan:secrets:source
npm run scan:secrets:wechat-dist
npm run verify:edgeone-release
```

Key output:

```text
Web metadata verification passed.
Native asset verification passed.
GitHub workflow verification passed
secret scan passed for source
secret scan passed for dist
EdgeOne release verification passed
```

## External Blockers

- EdgeOne production project, Blob namespace, runtime server secrets, and HTTPS origin must be configured in EdgeOne console.
- GitHub `wechat-production` environment must contain only deployment/upload inputs: EdgeOne API token, project name, deployment version, production API origin, WeChat AppID, and upload private key PEM.
- WeChat public platform must add the production HTTPS origin to `request合法域名`.
- Production deployment must pass remote `/api/health` with `configurationReady=true`, expected `generationEnabled`, and matching `EDGEONE_DEPLOYMENT_VERSION`.
- Real iOS/Android smoke, WeChat review submission, and final publish remain external manual gates.

## Latest go-live status update

Generated at: 2026-08-13T18:50:19+08:00
Head: `69c8c5ddf37675f27e95358736a228b4ef5e8e40`

Remote GitHub Actions for this head:

- CI: success, <https://github.com/KevinChen-1220/technicalEvaluation/actions/runs/31692429728>
- Pages: success, <https://github.com/KevinChen-1220/technicalEvaluation/actions/runs/31692429977>
- WeChat Mini Program Release: success, <https://github.com/KevinChen-1220/technicalEvaluation/actions/runs/31692429773>

`WeChat Mini Program Release` was triggered by `push`, so the protected `upload` job was skipped by design. A WeChat draft upload only runs from `workflow_dispatch` with `publish_target=upload`, after the `wechat-production` environment is approved.

Current protected GitHub environment secret names:

```text
EDGEONE_API_TOKEN
EDGEONE_DEPLOYMENT_VERSION
EDGEONE_PROJECT_NAME
WECHAT_APP_ID
```

Current go-live readiness check:

```text
npm run verify:wechat-go-live -- --app-id wx31dd3d7448aac8e3 --api-base-url https://api.skillscope.cn --skip-health

health check skipped; run again without --skip-health before WeChat upload
GitHub environment wechat-production is missing TARO_APP_EDGEONE_API_BASE_URL
GitHub environment wechat-production is missing WECHAT_PRIVATE_KEY_PEM
```

`https://api.skillscope.cn` is only a candidate production origin in this check. It is not proven ready until it is bound to EdgeOne, added to WeChat `request合法域名`, configured as `TARO_APP_EDGEONE_API_BASE_URL`, and passes the same command without `--skip-health`.
