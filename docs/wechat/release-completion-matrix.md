# SkillScope 微信小程序完成矩阵

状态定义：

- 本地已验证：仓库中已有代码、文档、测试或脚本证据。
- 外部就绪：本地已经给出模板、命令或 issue 入口，但需要账号负责人填写真实材料。
- 外部阻塞：必须等待真实微信主体/AppID/备案/生产 credentials/DevTools 登录/真机/微信审核。

任何外部阻塞项仍为 `待配置` 时不得进入正式审核，不能用示例值替代真实材料。

| 要求 | 状态 | 证据 | 剩余动作 |
| --- | --- | --- | --- |
| 共享技能测评 core | 本地已验证 | `packages/assessment-core`，`npm test -- --runInBand` | 无 |
| 微信小程序 Taro UI | 本地已验证 | `apps/wechat`，`npm run test:wechat -- --runInBand`，`npm run build:weapp` | 真机截图仍属外部阻塞 |
| EdgeOne Node Functions 与 Blob | 本地已验证 | `services/edgeone`，`npm run test:edgeone -- --runInBand`，`npm run build:edgeone`，`docs/wechat/release-evidence/2026-08-13-edgeone-command-output.md` | 生产 EdgeOne 部署权限、Blob 命名空间和 HTTPS origin 外部阻塞 |
| 异步生成、重试恢复和解析防护 | 本地已验证 | `services/edgeone/test/generation.test.ts`，`apps/wechat/test/generationController.test.ts` | 真实模型 hosted smoke 外部阻塞 |
| 365 天保留与免费额度清理 | 本地已验证 | `services/edgeone/test/assessmentRepository.test.ts`，`services/edgeone/test/settingsAndReports.test.ts` | 生产 Blob 监控和定期抽查外部就绪 |
| 隐私、投诉和数据保留 | 本地已验证 | `docs/wechat/privacy-policy.zh-CN.md`，`docs/wechat/privacy-data-map.md`，`docs/wechat/operations-runbook.md` | 微信后台隐私声明外部阻塞 |
| 发布 profile 和 disclosure gate | 本地已验证 | `scripts/verify-wechat-release.mjs`，`scripts/verify-wechat-disclosure.mjs` | 真实 production disclosure 外部阻塞 |
| 中文 release checklist | 本地已验证 | `docs/wechat/release-checklist.md` | 发布负责人逐项关闭 |
| 部署 runbook | 本地已验证 | `docs/wechat/deployment-runbook.md` | EdgeOne project、Blob 和 deployment 配置 |
| 审核提交说明 | 本地已验证 | `docs/wechat/review-submission.md` | 微信公众平台提交审核 |
| Machine-readable manifest 模板 | 本地已验证 | `docs/wechat/release-manifest.template.json` | 用真实值生成每次发布 manifest |
| GitHub release checks | 本地已验证 | `.github/workflows/wechat-release.yml`，`npm run verify:github-workflows`，`docs/wechat/release-evidence/2026-08-13-edgeone-command-output.md` | GitHub Actions 在线运行结果外部就绪 |
| 手动上传 job | 外部就绪 | `.github/workflows/wechat-release.yml` 的 `upload` job | 配置 `wechat-production` environment approval、EdgeOne deploy inputs 和微信上传私钥 |
| Fork/PR 不接触敏感配置 | 本地已验证 | `release-checks` job 无 `secrets.`，不使用 `pull_request_target`；upload job 不持有服务端 runtime secret | GitHub UI environment 保护外部就绪 |
| EdgeOne 服务端密钥边界 | 本地已验证 | `scripts/verify-edgeone-release.mjs`，`.github/workflows/wechat-release.yml`，`docs/wechat/edgeone-env.production.example` | 服务端 runtime secret 只在 EdgeOne console 配置；GitHub 只保存 deploy/upload 输入 |
| Filing issue template | 本地已验证 | `.github/ISSUE_TEMPLATE/wechat_filing.yml` | 账号负责人填写真实 AppID、备案、隐私、生成式人工智能材料 |
| Production smoke issue template | 本地已验证 | `.github/ISSUE_TEMPLATE/wechat_production_smoke.yml` | 真机、EdgeOne、截图、回滚证据外部阻塞 |
| 微信主体认证 | 外部阻塞 | `docs/wechat/release-checklist.md` | 运营主体在微信公众平台完成 |
| 真实 AppID 和上传私钥 | 外部阻塞 | `apps/wechat/project.private.config.example.json`，`.gitignore` | 管理员下载上传私钥并配置本机/GitHub environment；AppID 已由用户提供为 `wx31dd3d7448aac8e3` |
| 小程序 ICP 备案 | 外部阻塞 | `docs/wechat/release-checklist.md`，filing issue | 运营主体完成工信部/微信流程 |
| 生成式 AI 备案或登记披露 | 外部阻塞 | `docs/wechat/release-checklist.md`，`docs/wechat/review-submission.md` | 依据服务主体和模型提供方确认 |
| 微信开发者工具登录 | 外部阻塞 | `docs/wechat/release-evidence/2026-08-10-devtools-cli.md` | 本机登录真实账号后重跑 smoke |
| iOS/Android 真机验证 | 外部阻塞 | `docs/wechat/release-evidence/external-smoke-checklist.md` | 真实设备完成并上传截图 |
| 微信审核和发布 | 外部阻塞 | `docs/wechat/review-submission.md` | 在微信公众平台提交、处理驳回、灰度发布 |

结论：Task8 本地交付的完成条件是本矩阵中所有“本地已验证”和“外部就绪”项有仓库证据，且剩余项只依赖真实微信主体、法定备案声明、EdgeOne 生产 credentials/runtime 配置、GitHub environment 审批、微信 request 合法域名、真机或微信审核。
