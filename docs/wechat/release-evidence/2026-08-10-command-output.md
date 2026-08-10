# 2026-08-10 本地发布候选验证输出

Profile: development
Generated at: 2026-08-10T12:23:02.321Z

## Commands

static contracts: passed for development
clean release artifacts: apps/wechat/dist and services/cloudbase/dist removed
### npm run test -- --runInBand

Status: exit 0

```text
PASS src/features/config/modelConfigStore.test.ts
PASS src/features/assessment/wrongQuestionReview.test.ts
PASS services/cloudbase/test/cloudBaseGenerationRepository.test.ts
PASS packages/assessment-core/test/assessmentCore.contract.test.ts
PASS src/features/assessment/samplePaper.test.ts
PASS src/features/assessment/legacyHistoryMigration.test.ts
PASS services/cloudbase/test/cloudBaseAssessmentRepository.test.ts
PASS src/features/assessment/scoring.test.ts
PASS src/layout/mobileLayout.test.ts
PASS services/cloudbase/test/cloudBaseRetentionRepository.test.ts
PASS src/features/config/modelConfig.test.ts
PASS src/features/assessment/questionNavigation.test.ts
PASS src/components/loadingAnimation.test.ts
PASS src/features/assessment/assessmentBriefDefaults.test.ts

Test Suites: 34 passed, 34 total
Tests:       277 passed, 277 total
Snapshots:   0 total
Time:        8.988 s
Ran all test suites.
```

### npm run test:wechat -- --runInBand

Status: exit 0

```text
PASS test/releaseFixtureClient.test.ts
PASS test/cloud.test.ts
PASS test/assessmentSync.test.ts
PASS test/generationController.test.ts
PASS test/privacyFlow.test.ts
PASS test/draftSync.test.ts
PASS test/submitFlow.test.ts
PASS test/viewModel.test.ts
PASS test/resultViewModel.test.ts
PASS test/navigation.test.ts
PASS test/materialLayout.test.ts
PASS test/cloudRuntime.test.ts
PASS test/appStartup.test.ts
PASS test/draftDto.test.ts

Test Suites: 15 passed, 15 total
Tests:       77 passed, 77 total
Snapshots:   0 total
Time:        4.042 s
Ran all test suites.
```

### npm run test:cloudbase -- --runInBand

Status: exit 0

```text
PASS test/buildArtifacts.test.ts
PASS test/generationWorker.test.ts
PASS test/privacySafetyOps.test.ts
PASS test/contentSafetyAdapters.test.ts
PASS test/assessmentService.test.ts
PASS test/contracts.review.test.ts
PASS test/assessmentFunctionEntries.test.ts
PASS test/generationJobs.test.ts
PASS test/openAICompletionClient.test.ts
PASS test/cloudBaseDailyQuota.test.ts
PASS test/contracts.test.ts
PASS test/cloudBaseGenerationRepository.test.ts
PASS test/cloudBaseAssessmentRepository.test.ts
PASS test/cloudBaseRetentionRepository.test.ts

Test Suites: 17 passed, 17 total
Tests:       185 passed, 185 total
Snapshots:   0 total
Time:        7.795 s, estimated 9 s
Ran all test suites matching /services\\cloudbase\\test/i.
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

### npm run typecheck:cloudbase

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 typecheck:cloudbase
> npm --workspace @dynamic-assessment/cloudbase run typecheck


> @dynamic-assessment/cloudbase@1.0.0 typecheck
> tsc --noEmit -p tsconfig.json
```

### npm run build:cloudbase

Status: exit 0

```text
> dynamic-assessment-app@1.0.0 build:cloudbase
> npm --workspace @dynamic-assessment/cloudbase run build


> @dynamic-assessment/cloudbase@1.0.0 build
> node scripts/build.mjs
```

### npm run build:web

Status: exit 0

```text
> expo export --platform web


Using (experimental) base path: /technicalEvaluation
Starting Metro Bundler
Web Bundled 189ms node_modules\expo\AppEntry.js (203 modules)

› Assets (1):
node_modules\expo-sqlite\web\wa-sqlite\wa-sqlite.b87fca4d817b5bd329636d467d159c21.wasm (617 kB)

› web bundles (2):
_expo/static/js/web/AppEntry-8450ed86f78fe7dd283de3f938f5904f.js (608 kB)
_expo/static/js/web/worker-b82a192ce4e20d535b4fddf4f545a072.js (124 kB)

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


● Webpack █████████████████████████ sealing (78%)
 chunk modules optimization


● Webpack █████████████████████████ sealing (88%)
 runtime requirements


● Webpack █████████████████████████ sealing (92%) asset processing
 CssMinimizerPlugin


● Webpack █████████████████████████ sealing (92%) asset processing
 RealContentHashPlugin


√ Webpack
  Compiled successfully in 3.06s
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
      "moderate": 44,
      "high": 36,
      "critical": 44,
      "total": 125
    },
    "dependencies": {
      "prod": 988,
      "dev": 1414,
      "optional": 128,
      "peer": 46,
      "peerOptional": 0,
      "total": 2477
    }
  }
}
```

### C:\Program Files\nodejs\node.exe scripts/wechat-devtools-smoke.mjs

Status: exit 0 (informational)

```text
WeChat DevTools CLI initialization blocker recorded
```


## Artifact Hashes

- apps/wechat/dist/app.json: 839821f2c2685ee8656f7b543dae00d7f4511ebc74bf23ffd30253d1d127c6c6
- apps/wechat/dist/app.js: dba05d0faf7f47415b297b2318d669351cb320041f2418fe7a7fbb4f6ab35c08
- services/cloudbase/dist/cloudbaserc.json: 782aafab342bb93a781ede059a0dc9739bae128aa9fe583cabc8d4b13cd57abf

## External Blockers

- 仍需真实 WeChat AppID、登录态、上传私钥、CloudBase 环境和真机预览结果。
- 当前证据只覆盖本机可执行验证，不声明微信审核或真机通过。

