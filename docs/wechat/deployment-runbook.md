# SkillScope 微信小程序 EdgeOne 部署 runbook

本 runbook 面向拥有真实微信主体、AppID 和 EdgeOne 项目权限的发布负责人。仓库提供可构建的 EdgeOne/Taro 产物，但不能代替账号认证、法定备案、生产凭据、登录 DevTools、真机和微信审核。

## 0. 输入材料

- 真实微信小程序 AppID，写入本机 `apps/wechat/project.private.config.json`，不得提交。
- EdgeOne project ID、production deployment URL 与 production HTTPS origin；origin 必须是根路径。
- production disclosure：从 `docs/wechat/release-disclosure.production.template.json` 复制为真实文件并填写服务运营主体、隐私版本、模型披露和小程序备案号。
- EdgeOne 服务端环境变量清单见 `docs/wechat/edgeone-env.production.example`。其中 `GENERATION_ENABLED` 与 `EDGEONE_DEPLOYMENT_VERSION` 是运行时门禁和 health 校验所需配置；`OPENID_ENCRYPTION_KEY`、会话签名、微信与模型凭据必须完整。
- GitHub environment `wechat-production` 的审批人和上传配置。

## 1. EdgeOne project 与 Blob

1. 创建开发、preview 与 production deployment；production 不得使用 `dev`、`test`、`example`、`placeholder` 或 `待配置` 的 origin。
2. 以 `services/edgeone/edgeone.json` 部署 Node Functions，确认 `/api/session`、`/api/generation`、`/api/assessments`、`/api/settings`、`/api/reports` 和 `/api/health` 均可路由。
3. 配置 Blob 命名空间与访问策略；用户数据只能由服务端按会话归属读取，不能直接暴露给小程序。
4. 在 EdgeOne 项目中录入服务端环境变量。GitHub protected environment `wechat-production` 只保存 `EDGEONE_API_TOKEN`、`EDGEONE_PROJECT_NAME`、`EDGEONE_DEPLOYMENT_VERSION`、`TARO_APP_EDGEONE_API_BASE_URL`、`WECHAT_APP_ID`、`WECHAT_PRIVATE_KEY_PEM` 和 release inputs，用于 EdgeOne CLI 部署和微信上传；微信会话、OpenID 加密、模型、审核与熔断运行时值只存在于 EdgeOne。不得把真实值写进仓库、issue、截图、日志或 release manifest，也不得使用 `TARO_APP_*` 前缀。
5. 记录 EdgeOne project ID、deployment URL、deployment version、Node Functions build SHA 和 Blob namespace 到 release manifest。

## 2. 构建与部署顺序

```sh
npm ci
npm run test -- --runInBand
npm run test:wechat -- --runInBand
npm run test:edgeone -- --runInBand
npm run typecheck
npm run typecheck:wechat
npm run typecheck:edgeone
npm run build:edgeone
npm run verify:github-workflows
```

部署 Node Functions 与 Blob 配置后，先对 preview deployment 运行 smoke，再切换 production deployment。CI 使用精确锁定的 `edgeone@1.6.23` 执行 `edgeone makers deploy`；生产 wrapper 会先验证当前 `/api/health` 的 `configurationReady=true` 与 `generationEnabled`，部署后解析 CLI 输出中的 HTTPS origin 并与 `TARO_APP_EDGEONE_API_BASE_URL` 比对，再要求 health 版本匹配。若 EdgeOne CLI 不输出 URL，默认失败；只有确认供应商该版本不输出 URL 时，才可临时设置 `EDGEONE_ALLOW_MISSING_DEPLOYMENT_ORIGIN=true` 并在 release manifest 记录人工验证证据。`npm run edgeone:deploy -- --dry-run` 不读取凭据，只验证部署包。已在本机通过 `edgeone makers login/link` 绑定项目时，可用 `npm run edgeone:deploy -- --production --local-login` 复用本机登录态；脚本会从 `services/edgeone/.edgeone/project.json` 读取项目名，并且只在 `services/edgeone` 目录打包部署，避免把整个仓库上传。

## 3. 小程序 production 配置

小程序端只使用公开的 HTTPS origin：

```sh
TARO_APP_RELEASE_PROFILE=formal
TARO_APP_RELEASE_FIXTURE_MODE=disabled
TARO_APP_EDGEONE_API_BASE_URL=https://api.example.com
TARO_APP_RELEASE_DISCLOSURE_FILE=docs/wechat/release-disclosure.production.json
```

在微信公众平台的开发管理 -> 开发设置中，把完全相同的 production HTTPS origin 加入 `request合法域名`。不允许填写 `/api` 子路径，客户端会自行拼接 API 路径。

## 4. preview 与 production smoke

在 preview deployment 完成一次完整 smoke；将相同证据在 production deployment 复测后，才能关闭 `.github/ISSUE_TEMPLATE/wechat_production_smoke.yml` 创建的 issue。

- 新用户进入隐私 gate，拒绝不能生成，接受后可同步设置。
- 固定 50 题生成：generation job 进入 queued/running/completed，本地草稿和 Blob 记录均可恢复。
- 模型返回非 JSON、超大响应、HTML/XML 响应时失败为 `INVALID_MODEL_RESPONSE`，不保存残缺题目。
- 输入和输出审核分别覆盖 allowed、blocked、timeout/fail closed。
- 离线答题、本地 pending queue、跨设备 revision 冲突、提交评分、错题复盘和历史恢复。
- iPhone 安全区、键盘避让、生成按钮 loading、宽表格和图片失败回退以真机截图记录。

## 5. 回滚与恢复

1. 每次上传前填写 release manifest，记录 commit、tag、WeChat 版本、EdgeOne project、deployment URL、build SHA、artifact hash、审核单和回滚版本。
2. 正式发布先灰度低比例，监控生成延迟、解析失败、内容审核失败、配额耗尽、同步冲突和投诉量。
3. P1 问题时停止灰度扩量，在微信公众平台回退上一版审核通过版本，并在 EdgeOne 重新部署上一版 Node Functions build。
4. Blob 数据恢复前先导出受影响对象清单；恢复只能按会话归属处理，不能批量覆盖用户的新答案。

## 6. 监控入口

- EdgeOne deployment 与 Node Functions 日志：关注 generation、session、同步、审核与 Blob 访问的结构化错误码。
- 微信后台版本管理：关注审核状态、发布灰度和用户反馈。
- GitHub Actions：`WeChat Mini Program Release` 的 `release-checks` 不读凭据，`upload` 必须走 `wechat-production` 环境审批。

## 7. 免费套餐与密钥轮换

- 本项目以 EdgeOne Makers 免费套餐为运行边界。上线前在控制台核对当期免费额度和政策变化，当前工程不会自动开通付费套餐，也不会在额度耗尽时自动扩容。
- 服务端以每日生成次数、滚动 60 秒窗口和 `GENERATION_ENABLED=false` 熔断保护免费额度。触及额度、平台限制或异常峰值时保持关闭生成并返回可识别的限制错误，待运营方人工评估后恢复。
- EdgeOne 的免费额度不包含所选 LLM 供应商的费用。模型 API、内容审核或第三方网关可能单独计费，运营方须在上线前确认余额、限额与账单归属。
- 每次正式发布前复核微信 `request合法域名` 与 production HTTPS origin 完全一致。根域名不得包含 `/api`、端口、查询参数或凭据。
- EdgeOne runtime 环境变量、`EDGEONE_API_TOKEN`、微信 AppSecret、HMAC key、`OPENID_ENCRYPTION_KEY`、微信上传私钥、LLM key 和内容审核凭据至少按供应商策略及事故后立即轮换。服务端值只在 EdgeOne runtime 轮换；GitHub 只轮换其部署和上传输入。轮换时先在 preview 验证新值，再更新 production，保留旧会话兼容窗口并记录版本，不将值写入日志、截图或 Git。

官方参考：EdgeOne <https://edgeone.ai/>，微信小程序 request 合法域名 <https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html>。
