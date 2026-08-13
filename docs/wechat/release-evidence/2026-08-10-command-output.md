# 2026-08-10 本地发布候选验证输出

Profile: development
Generated at: 2026-08-13T09:00:53.656Z

## Commands

static contracts: passed for development
clean release artifacts: apps/wechat/dist removed
### npm run test -- --runInBand

Status: exit 0

```text
PASS services/edgeone/test/sessionToken.test.ts
PASS src/features/assessment/wrongQuestionReview.test.ts
PASS src/features/config/modelConfigStore.test.ts
PASS services/edgeone/test/healthEntry.test.ts
PASS src/services/aiClient.test.ts
PASS src/layout/mobileLayout.test.ts
PASS services/edgeone/test/ownerIsolation.test.ts
PASS services/edgeone/test/blobAdapter.test.ts
PASS src/components/questionMaterialLayout.test.ts
PASS src/components/loadingAnimation.test.ts
PASS src/features/assessment/samplePaper.test.ts
PASS src/features/config/modelConfig.test.ts
PASS src/features/assessment/questionNavigation.test.ts
PASS src/features/assessment/assessmentBriefDefaults.test.ts

Test Suites: 52 passed, 52 total
Tests:       435 passed, 435 total
Snapshots:   0 total
Time:        25.232 s
Ran all test suites.
```

### npm run test:wechat -- --runInBand

Status: exit 0

```text
PASS test/assessmentSync.test.ts
PASS test/cloud.test.ts
PASS test/generationController.test.ts
PASS test/releaseFixtureClient.test.ts
PASS test/privacyFlow.test.ts
PASS test/draftDto.test.ts
PASS test/viewModel.test.ts
PASS test/resultViewModel.test.ts
PASS test/draftSync.test.ts
PASS test/submitFlow.test.ts
PASS test/cloudRuntime.test.ts
PASS test/navigation.test.ts
PASS test/materialLayout.test.ts
PASS test/appStartup.test.ts

Test Suites: 16 passed, 16 total
Tests:       86 passed, 86 total
Snapshots:   0 total
Time:        25.736 s
Ran all test suites.
```

### npm run test:edgeone -- --runInBand

Status: exit 0

```text
PASS test/assessmentRepository.test.ts
PASS test/generation.test.ts
PASS test/quotaRepository.test.ts
PASS test/settingsAndReports.test.ts
PASS test/deadline.test.ts
PASS test/sessionRoute.test.ts
PASS test/storageContracts.test.ts
PASS test/sessionToken.test.ts
PASS test/blobAdapter.test.ts
PASS test/ownerIsolation.test.ts
PASS test/jobRepository.test.ts
PASS test/healthRoute.test.ts
PASS test/healthEntry.test.ts
PASS test/wechatSession.test.ts

Test Suites: 18 passed, 18 total
Tests:       154 passed, 154 total
Snapshots:   0 total
Time:        3.7 s, estimated 7 s
Ran all test suites matching /services\\edgeone\\test/i.
```

### npm run typecheck

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 typecheck
> tsc --noEmit
```

### npm run typecheck:wechat

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 typecheck:wechat
> npm --workspace apps/wechat run typecheck


> @dynamic-assessment/wechat-mini-program@1.0.0 typecheck
> tsc --noEmit
```

### npm run typecheck:edgeone

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 typecheck:edgeone
> npm --workspace @dynamic-assessment/edgeone run typecheck


> @dynamic-assessment/edgeone@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json
```

### npm run build:edgeone

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 build:edgeone
> npm --workspace @dynamic-assessment/edgeone run build


> @dynamic-assessment/edgeone@1.0.0 build
> node scripts/build.mjs
```

### npm run verify:edgeone-release -- --check-only

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 verify:edgeone-release
> node scripts/verify-edgeone-release.mjs --check-only

EdgeOne release verification passed
```

### npm run build:web

Status: exit 0

```text

Using (experimental) base path: /technicalEvaluation
Starting Metro Bundler
Web node_modules\expo\AppEntry.js ▓▓▓▓▓▓▓▓▓▓░░░░░░ 66.6% (71/87)
Web node_modules\expo\AppEntry.js ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░ 99.9% (150/177)
Web Bundled 7340ms node_modules\expo\AppEntry.js (338 modules)

› Assets (1):
node_modules\expo-sqlite\web\wa-sqlite\wa-sqlite.b87fca4d817b5bd329636d467d159c21.wasm (617 kB)

› web bundles (2):
_expo/static/js/web/AppEntry-b943399923e99f9dfcd768315062c0bd.js (607 kB)
_expo/static/js/web/worker-58febc9ca618e05796c721b83fd8d5cc.js (124 kB)

› Files (3):
favicon.ico (14.5 kB)
index.html (2.49 kB)
metadata.json (49 B)

Exported: dist
```

### npm run verify:web

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 verify:web
> node scripts/verify-web-metadata.mjs

Web metadata verification passed.
```

### npm run verify:assets

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 verify:assets
> node scripts/verify-native-assets.mjs

Native asset verification passed.
```

### npm run verify:github-workflows

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 verify:github-workflows
> node scripts/verify-github-workflows.mjs

GitHub workflow verification passed
```

### npm run build:weapp

Status: exit 0

```text


● Webpack █████████████████████████ sealing (87%)
 code generation


● Webpack █████████████████████████ sealing (88%)
 runtime requirements


● Webpack █████████████████████████ sealing (92%) asset processing
 CssMinimizerPlugin


● Webpack █████████████████████████ sealing (92%) asset processing
 RealContentHashPlugin


√ Webpack
  Compiled successfully in 23.21s
```

### npm run scan:secrets:source

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 scan:secrets:source
> node scripts/scan-secrets.mjs --target source package.json packages apps services scripts docs

secret scan passed for source
```

### npm run scan:secrets:wechat-dist

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 scan:secrets:wechat-dist
> node scripts/scan-secrets.mjs --target dist apps/wechat/dist

secret scan passed for dist
```

### C:\Program Files\nodejs\node.exe scripts/verify-wechat-disclosure.mjs --file docs/wechat/release-disclosure.development.json --mode development

Status: exit 0

```text
release disclosure development verification passed
```

### npm audit --omit=optional --json

Status: exit 1 (informational)

```text
  },
  "metadata": {
    "vulnerabilities": {
      "info": 0,
      "low": 1,
      "moderate": 46,
      "high": 52,
      "critical": 44,
      "total": 143
    },
    "dependencies": {
      "prod": 992,
      "dev": 2275,
      "optional": 316,
      "peer": 134,
      "peerOptional": 0,
      "total": 3341
    }
  }
}
```

### C:\Program Files\nodejs\node.exe scripts/wechat-devtools-smoke.mjs

Status: exit 0 (informational)

```text
WeChat DevTools CLI evidence recorded
```


## Artifact Hashes

- apps/wechat/dist/app.json: 839821f2c2685ee8656f7b543dae00d7f4511ebc74bf23ffd30253d1d127c6c6
- apps/wechat/dist/app.js: 52a2b31b4bd46f02a4340426b5f4621509b3fe9ef624879146376ecb8eb9505b
- services/edgeone/edgeone.json: 9b3513b52d1ce7eac4fc77f8f62cc3abb5a511f9750265a96f91b5928e7c4448

## External Blockers

- 仍需真实 WeChat AppID、登录态、上传私钥、EdgeOne HTTPS 域名和真机预览结果。
- 当前证据只覆盖本机可执行验证，不声明微信审核或真机通过。

