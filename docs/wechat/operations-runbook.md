# SkillScope 微信小程序运维手册

## 环境与密钥

开发和生产 CloudBase 环境分离。小程序端只公开 AppID 和 CloudBase env ID；`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER` 只能配置在 CloudBase 服务端环境变量中。

`create-generation-job` 使用微信 `security.msgSecCheck` 处理用户输入，因为它由小程序用户触发，可以带受信 OpenID。`generation-worker` 是定时/后台异步 worker，不能假设存在小程序云调用凭证或 `wxCloudApiToken`，所以输出审核必须走服务端 HTTPS `CONTENT_SAFETY_*`。

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
