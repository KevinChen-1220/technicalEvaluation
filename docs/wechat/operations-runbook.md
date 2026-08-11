# SkillScope 微信小程序运维手册

## EdgeOne 环境与密钥

开发、preview 和 production EdgeOne deployment 分离。小程序端只公开 `TARO_APP_EDGEONE_API_BASE_URL`，且必须是 HTTPS origin 根路径；`WECHAT_APP_SECRET`、`SESSION_HMAC_KEY`、`OWNER_HMAC_KEY`、`OPENID_ENCRYPTION_KEY`、`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY` 和 `CONTENT_SAFETY_PROVIDER` 只能配置在 EdgeOne 服务端环境变量中。

`/api/generation` 使用微信登录态校验用户归属，并对输入与输出保持 fail-closed。只有 `SKILLSCOPE_ENV=development` 与 `SKILLSCOPE_ALLOW_UNSAFE_MODERATION=true` 同时精确匹配时才允许本地不安全绕过；`test`、`staging`、`production` 或未知值一律 fail closed。正式发布要求 `SKILLSCOPE_ENV=production`、真实非占位内容安全配置和 production HTTPS origin。

正式 preflight 只验证配置形状，不会请求审核 provider，因此不证明服务真实可用。正式发布前必须分别在 preview 与 production EdgeOne deployment 完成外部 hosted smoke，验证隐私同意、输入审核、输出审核、模型生成、HTML/XML 解析失败、超时和故障关闭路径；缺少证据时继续记录为 blocker。

## 发布披露与验证

Taro 构建通过 `TARO_APP_RELEASE_DISCLOSURE_FILE` 选择仓库根相对或绝对 JSON。未指定时使用开发披露，设置页显示 `待配置`。production JSON 的必填字段为空或包含 `待配置`、`TBD`、`example`、`placeholder`、`changeme` 时，Taro config 会直接终止构建。

正式构建完成后运行 `node scripts/verify-wechat-disclosure.mjs --file <真实披露.json> --mode production --dist apps/wechat/dist`。独立 disclosure 验证器会核对包内披露值与 JSON 一致，并拒绝包内残留的 `待配置`。

本地发布候选统一执行 `npm run verify:wechat-release`。该命令会跑 core、WeChat、EdgeOne 测试、typecheck、web build、asset check、EdgeOne build、production `build:weapp`、source/dist secret scan、release disclosure 验证、npm audit 记录和微信开发者工具 CLI 证据采集。

Profile 说明见 `docs/wechat/release-profiles.md`。development/trial 可在测试或发布验证中显式开启 fixture；formal profile 禁止 fixture，要求真实 production EdgeOne HTTPS origin 与 production disclosure。

`npm run verify:wechat-release:formal-preflight -- --disclosure-file <真实披露.json>` 只做 formal 配置预检。正式候选必须执行完整的 `npm run verify:wechat-release:formal -- --disclosure-file <真实披露.json>`；附加 `--file`、`--mode`、`--dist`、`--preflight-only`、`--check-only`、重复参数或未知参数都会在预检和构建前失败。

## 微信上传与域名

- `npm run wechat:ci:dry-run`：只检查 project path、版本、描述和参数摘要，不要求 AppID/私钥。
- `npm run wechat:ci:preview`：需要 `WECHAT_APP_ID`、`WECHAT_PRIVATE_KEY_PATH`、`WECHAT_RELEASE_VERSION`、`WECHAT_RELEASE_DESC`。
- `npm run wechat:ci:upload`：同 preview，并使用 `WECHAT_CI_ROBOT` 选择 1-30 号 CI 机器人。
- 微信后台必须登记 preview 和 production HTTPS origin 为 `request合法域名`；不登记或填写 `/api` 路径时不得上传。

`apps/wechat/project.config.json` 保持 `touristappid`，真实 AppID 写入本机 `apps/wechat/project.private.config.json`。真实私有配置和 `private.*.key` 已在 `.gitignore` 中禁止提交。

## 数据保留、告警和响应

Blob 中的生成作业、草稿、完成记录和反馈按服务端保留策略定期清理。日志不得包含 OpenID、题目全文、答案、API Key 或带凭证的 endpoint。

- 生成延迟：P95 超过 120 秒持续 10 分钟。
- 解析失败：`INVALID_MODEL_RESPONSE` 超过生成作业 5%。
- Provider 或内容安全失败：连续 5 分钟异常或 `CONTENT_BLOCKED` 异常突增。
- 同步冲突、Blob 访问失败或保留清理失败：立即记录 deployment URL、build SHA、错误码和影响范围。

先查看 EdgeOne Node Functions 的结构化事件，再按错误码定位：配置错误检查服务端环境变量，Provider 错误检查模型服务，解析失败检查模型输出契约，内容安全错误检查审核服务。P1 问题先停止灰度、在微信后台回退稳定版，并重新部署上一版 EdgeOne build。
