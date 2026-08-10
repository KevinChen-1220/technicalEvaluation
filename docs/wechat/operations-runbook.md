# SkillScope 微信小程序运维手册

## 环境与密钥

开发和生产 CloudBase 环境分离。小程序端只公开 AppID 和 CloudBase env ID；`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER` 只能配置在 CloudBase 服务端环境变量中。

`create-generation-job` 使用微信 `security.msgSecCheck` 处理用户输入，因为它由小程序用户触发，可以带受信 OpenID。`generation-worker` 是定时/后台异步 worker，不能假设存在小程序云调用凭证或 `wxCloudApiToken`，所以输出审核必须走服务端 HTTPS `CONTENT_SAFETY_*`。

审核默认 fail-closed。只有 `SKILLSCOPE_ENV=development` 且 `SKILLSCOPE_ALLOW_UNSAFE_MODERATION=true` 同时精确匹配时才允许本地不安全绕过；环境未设置、拼写错误、`test`、`staging`、`production` 或其他未知值全部 fail closed。formal verifier 会拒绝绕过，并要求 `SKILLSCOPE_ENV=production`、`security.msgSecCheck` capability，以及服务端 `CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER` 均为真实非占位值。`待配置`、`placeholder`、`changeme`、`example`、`TBD` 等值会被拒绝，URL 还必须是无凭证的 HTTPS 地址。这些变量只配置在 CloudBase 服务端，不得使用 `TARO_APP_*` 前缀。

formal preflight 只验证配置形状和部署能力声明，不会向审核 provider 发请求，因此不证明内容安全服务的真实可用性。正式发布前必须在已部署的生产 CloudBase 环境完成外部 hosted smoke，验证输入 `security.msgSecCheck` 和输出 HTTPS moderation 的允许、阻断、超时及故障关闭路径；没有该外部 smoke 证据时必须继续记录为 blocker。

`generation-worker` 由每分钟 timer 触发，2 分钟 lease 防止并发重复消费，600 秒函数 timeout 覆盖最多 10 次 provider call。函数 invoke rule 保持 deny client。

输出审核使用独立的 5 秒 `AbortController` 超时，并将响应体限制为 16 KiB；超时、响应过大、非 JSON、非 2xx 或审核服务异常均 fail closed，不保存模型输出。

## 发布披露

Taro 构建通过 `TARO_APP_RELEASE_DISCLOSURE_FILE` 选择仓库根相对或绝对 JSON。未指定时使用开发披露，设置页显示 `待配置`。production JSON 的必填字段为空或包含 `待配置`、`TBD`、`example`、`placeholder`、`changeme` 时，Taro config 会直接终止构建。

正式构建完成后运行 `node scripts/verify-wechat-release.mjs --file <真实披露.json> --mode production --dist apps/wechat/dist`。验证器会核对包内披露值与 JSON 一致，并拒绝包内残留的 `待配置`。生产披露 JSON 由运营方在发布环境提供，不在仓库模板中伪造。

## 发布验证与上传

本地发布候选统一执行 `npm run verify:wechat-release`。该命令会跑 Expo/WeChat/CloudBase/core 测试、typecheck、web build、asset check、CloudBase build、production `build:weapp`、source/dist secret scan、release disclosure 验证、npm audit 记录和微信开发者工具 CLI 证据采集。

Profile 说明见 `docs/wechat/release-profiles.md`。development/trial 可以显式开启 `TARO_APP_RELEASE_FIXTURE_MODE=enabled` 做无模型密钥的 DevTools fixture 烟测；formal profile 禁止 fixture，且要求真实生产 CloudBase env id 和生产 disclosure。

`npm run verify:wechat-release:formal-preflight -- --disclosure-file <真实披露.json>` 只做 formal 配置预检，不能作为发布候选验证成功。正式候选必须执行完整的 `npm run verify:wechat-release:formal -- --disclosure-file <真实披露.json>`。

微信 CI 上传脚本：

- `npm run wechat:ci:dry-run`：只检查 project path、版本、描述和参数摘要，不要求 AppID/私钥。
- `npm run wechat:ci:preview`：需要 `WECHAT_APP_ID`、`WECHAT_PRIVATE_KEY_PATH`、`WECHAT_RELEASE_VERSION`、`WECHAT_RELEASE_DESC`。
- `npm run wechat:ci:upload`：同 preview，并使用 `WECHAT_CI_ROBOT` 选择 1-30 号 CI 机器人。

`apps/wechat/project.config.json` 保持 `touristappid`，真实 AppID 写入本机 `apps/wechat/project.private.config.json`。复制 `apps/wechat/project.private.config.example.json` 后填写；真实私有配置和 `private.*.key` 已在 `.gitignore` 中禁止提交。

微信开发者工具 CLI 记录通过 `npm run wechat:devtools:smoke` 生成到 `docs/wechat/release-evidence/2026-08-10-devtools-cli.md`。未登录、无 AppID、无真机时只能记录外部 blocker，不能声明截图或真机通过。

## 数据保留

每日清理任务按 `RETENTION_BATCH_SIZE` 分批执行。默认参数为：生成作业 1 天、日配额和短窗桶 2 天、长期未更新草稿 30 天、已完成测评 365 天、投诉反馈 365 天。分别通过 `GENERATION_JOB_RETENTION_DAYS`、`QUOTA_RETENTION_DAYS`、`RATE_LIMIT_RETENTION_DAYS`、`DRAFT_ASSESSMENT_RETENTION_DAYS`、`COMPLETED_ASSESSMENT_RETENTION_DAYS`、`REPORT_RETENTION_DAYS` 配置；草稿严格按 `updatedAt` 清理。

## 告警阈值

- 生成延迟：P95 超过 120 秒持续 10 分钟。
- 解析失败：`INVALID_MODEL_RESPONSE` 超过生成作业 5%。
- Provider 失败：`PROVIDER_ERROR` 超过生成作业 3%。
- 内容审核失败或阻断：`CONTENT_BLOCKED` 突增或连续 5 分钟失败。
- 配额/限流耗尽：`QUOTA_EXCEEDED` 或 `RATE_LIMITED` 突增。
- 作业卡住：`running` 且 `leaseExpiresAt` 过期超过 10 分钟。
- 同步冲突：`sync_conflict` 连续升高。
- 保留清理失败：`retention_cleanup_completed` 缺失超过 24 小时。

## 处理流程

先查看 CloudBase 函数日志中的结构化事件，再按安全码定位：配置错误检查环境变量，Provider 错误检查模型服务，解析失败检查模型输出契约，内容安全错误检查审核服务。日志不得包含 OpenID、题目全文、答案、API Key 或带凭证的 endpoint。
