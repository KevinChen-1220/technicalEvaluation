# 2026-08-13 EdgeOne 微信小程序发布候选验证输出

Profile: development/local release candidate
Generated at: 2026-08-13T00:00:00+08:00
Branch: `codex/edgeone-free-backend`
Head: `e6aa8df`

## Review Gates

- Task 7 scoped release-engineering review: PASS after fixes `872916c` and `30037e1`.
- Task 8 whole-branch review: PASS after fixes through `e6aa8df`.
- Remaining production evidence is external: real EdgeOne deployment, WeChat request domain, real-device smoke, WeChat review, and final publish.

## Commands

### npm test -- --runInBand

Status: exit 0

```text
Test Suites: 52 passed, 52 total
Tests:       434 passed, 434 total
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
