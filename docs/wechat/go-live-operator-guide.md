# SkillScope 微信小程序上线操作指南

本指南只列出真正需要账号管理员手动完成的上线步骤。Codex 可以执行本地构建、测试、EdgeOne CLI 部署、GitHub 配置和上传命令；扫码、实名认证、人脸核验、备案确认、隐私声明提交、审核提交和最终发布必须由管理员完成。

## 阶段 1：主体、AppID 与披露

1. 在微信公众平台完成主体认证，创建小程序并记录真实 AppID。
2. 在本机创建 `apps/wechat/project.private.config.json`，填入 AppID；不要提交该文件。
3. 完成服务类目、小程序备案、隐私保护指引、投诉入口和生成式 AI 披露。
4. 将真实生产披露保存为 `docs/wechat/release-disclosure.production.json`，其中不得保留 `待配置`。

**验收：** 运营主体、备案、隐私、模型披露可在微信后台和小程序设置页相互核对。

## 阶段 2：部署 EdgeOne

1. 创建 EdgeOne project，并准备 preview 与 production deployment。
2. 在 EdgeOne 中部署 `services/edgeone` 的 Node Functions，启用 Blob 存储。
3. 在服务端填写微信会话、模型、内容安全和签名所需环境变量；禁止把任何密钥放入 Taro 环境变量、release manifest 或 GitHub issue。
4. 记录 project ID、deployment URL、production HTTPS origin、deployment version、Node Functions build SHA 和 Blob namespace。

**验收：** `/api/health`、`/api/session`、`/api/generation`、`/api/assessments`、`/api/settings` 与 `/api/reports` 在 preview 可用，production origin 为无路径的 HTTPS origin。

## 阶段 3：微信网络与构建

1. 在微信后台“开发管理 -> 开发设置”添加 preview 和 production HTTPS origin 为 `request合法域名`。不要填写 `/api`；客户端会拼接 API 路径。
2. 在发布机设置 `TARO_APP_EDGEONE_API_BASE_URL=<production HTTPS origin>`、`TARO_APP_RELEASE_PROFILE=formal`、`TARO_APP_RELEASE_FIXTURE_MODE=disabled`。
3. 执行：

```sh
npm ci
npm run verify:github-workflows
npm run verify:wechat-release:formal -- --disclosure-file docs/wechat/release-disclosure.production.json
npm run wechat:ci:dry-run
```

**验收：** formal verifier、source/dist secret scan、EdgeOne build 和微信构建均通过。

## 阶段 4：preview 和 production smoke

1. 用真实 iOS 与 Android 设备对 preview 做完整 smoke。
2. 切换到 production deployment 后，重复 smoke，记录相同的请求、截图和错误路径。
3. 使用 `docs/wechat/release-evidence/external-smoke-checklist.md` 和 `wechat_production_smoke` issue 归档证据。

**验收：** 50 题生成、HTML/XML 解析失败、隐私拒绝/同意、答题、历史、离线队列、安全区和键盘避让均已覆盖。

## 阶段 5：上传、审核和发布

1. 填写 release manifest，不包含任何 secret。
2. 按 `docs/wechat/review-submission.md` 上传草稿并在微信后台提交审核。
3. 审核通过后先小比例灰度，监控 EdgeOne Node Functions 错误码、生成延迟、内容安全失败、Blob 访问和同步冲突。
4. P1 问题时停止扩量、回退微信稳定版，并重新部署上一版 EdgeOne build。

**验收：** 微信上线状态、manifest、production smoke 和回滚记录完整对应同一 commit SHA。
