# SkillScope EdgeOne 免费后端迁移设计

## 目标

将微信小程序后端从发布后需要固定付费的 CloudBase 迁移到 EdgeOne Makers 免费版，并将所有新测评固定为 50 道题。迁移后保留生成、答题、自动保存、历史、跨设备同步、结果解析、隐私同意、举报、内容安全和发布门禁。

## 约束

- 新测评固定生成 50 道题，界面、共享契约和服务端都不再接受 100 题选项。
- 一次模型请求生成完整 50 题，不拆成 10 题批次。
- 模型响应必须完整通过解析、结构校验、题量校验和内容安全后才能写入；任何失败都不保存残缺试卷。
- EdgeOne Cloud Function 最大执行时间配置为 120 秒。
- EdgeOne Makers 内置免费模型只适合技术验证，正式环境继续使用运营方配置的 OpenAI 兼容模型端点。
- 免费额度耗尽时服务返回明确的 `FREE_TIER_LIMIT`，不得自动升级套餐或产生费用。
- AppID、AppSecret、模型密钥、会话签名密钥、OpenID 加密密钥和内容安全凭据只存在于 EdgeOne 环境变量。
- 本地 SQLite/微信存储仍是即时保存来源；远端同步失败不得阻止本地答题。

## 平台选型

选择 EdgeOne Makers，而不是 Supabase、Neon 或 Cloudflare：

- Cloud Functions 免费额度适合 120 秒的单次 LLM 请求。
- Blob 的 1 GB 免费空间足够少量用户的会话、配置、任务和试卷历史，并且可在 Node Cloud Functions 中使用。
- `edgeone.run` HTTPS API 与腾讯网络更适合作为微信小程序合法请求域名。
- 免费额度和构建额度超出时以拒绝请求为主，不启用自动付费。

该免费政策可能调整，因此设置页必须显示后端状态，运行手册必须要求定期检查 EdgeOne 用量与政策。

## 总体架构

```text
微信小程序
  -> 本地草稿/历史仓库
  -> HTTPS EdgeOne API
      -> 微信 code2session 身份交换
      -> HMAC 会话令牌
      -> OpenAI 兼容模型调用（固定 50 题）
      -> 微信内容安全 REST API
      -> EdgeOne Blob（会话、设置、配额、幂等任务、索引、测评、举报）
```

现有 `packages/assessment-core` 继续作为 Web、小程序和后端共享契约。`services/cloudbase` 暂时保留为历史实现和迁移参考，但正式发布校验不再构建或部署 CloudBase。

## 工作区结构

新增 `services/edgeone` workspace：

- `src/contracts`：HTTP 请求、响应和错误码。
- `src/auth`：微信登录、会话签发、会话验证。
- `src/storage`：Blob 对象端口、内存测试实现与 EdgeOne SDK 适配器。
- `src/generation`：固定 50 题提示词、模型调用、解析、校验和幂等执行。
- `src/moderation`：微信 access token 缓存及文本安全检查。
- `src/routes`：session、generation、assessments、settings、reports、health 路由。
- `node-functions/api`：EdgeOne 文件路由入口，仅负责把平台 context 转交给应用服务。
- `scripts/build.mjs`：使用 esbuild 生成项目根 `cloud-functions/api` 下的可部署 Node Functions。

小程序新增 `apps/wechat/src/api`：

- `sessionClient.ts`：调用 `Taro.login()` 并交换服务端 session token。
- `edgeOneClient.ts`：统一 HTTPS、认证、超时、错误映射和重试。
- `assessmentApi.ts`：把现有云函数 DTO 映射到 EdgeOne REST API。

## 身份与会话

1. 小程序调用 `Taro.login()` 获取一次性 code。
2. `POST /api/session` 将 code 发送给 EdgeOne。
3. 服务端使用 `WECHAT_APP_ID` 和 `WECHAT_APP_SECRET` 调用微信 `jscode2session`。
4. 服务端只使用返回的 OpenID 作为 owner，忽略客户端传来的 owner 字段。
5. 服务端返回随机 session token；Blob 会话对象只存 token 的 SHA-256、owner key、AES-256-GCM 加密的 OpenID 和过期时间。加密 OpenID 仅用于微信内容安全接口。
6. 后续请求使用 `Authorization: Bearer <token>`，默认 7 天过期；401 时客户端重新登录一次。

OpenID 不以明文写入 Blob，不进入日志、错误信息、Blob 路径或返回体。存储键使用 `HMAC(storageKey, openid)` 得到不可逆 owner key；会话对象中的 OpenID 密文使用独立 `OPENID_ENCRYPTION_KEY` 加密并带认证标签。

## 存储模型

Blob 元数据路径：

- `sessions/<tokenHash>.json`：owner key、加密 OpenID、创建时间、过期时间。
- `settings/<ownerKey>.json`：语言、隐私同意版本和显示偏好。
- `quotas/<ownerKey>/<yyyy-mm-dd>.json`：当日生成次数和最后请求时间。
- `jobs/<ownerKey>/<clientRequestId>.json`：生成状态、assessmentId、错误码和版本。
- `indexes/<ownerKey>.json`：按更新时间倒序的测评摘要，最多保留 200 条。

Blob 路径：

- `assessments/<ownerKey>/<assessmentId>.json`：完整测评、答案、结果、revision。
- `reports/<ownerKey>/<reportId>.json`：用户举报与处理状态。

Blob 默认最终一致；会话验证、配额、幂等任务和 revision 更新使用 SDK 的强一致读取模式。写入成功的响应直接返回已写对象，本地立即保存。更新使用 revision 乐观锁，冲突返回 `REVISION_CONFLICT`。

## 固定 50 题生成

- 共享常量 `ASSESSMENT_QUESTION_COUNT = 50` 是唯一题量来源。
- 生成页移除题量分段控件；请求 DTO 不再接受 `questionCount`。
- 旧本地或远端 100 题记录仍可查看和复盘，不进行破坏性迁移。
- 服务端提示词明确要求恰好 50 道，并要求稳定题目 ID、题型、选项、答案、解析、难度和可选材料。
- 模型响应最大 2 MiB，连接/首字节/总时长合计不超过 105 秒，为函数收尾保留至少 15 秒。
- 使用现有 JSON 提取与 `jsonrepair` 能力，但最终必须通过共享契约且 `questions.length === 50`。
- 输入主题先审查；模型输出按安全接口允许的长度切片审查。任一切片被拒绝或审核不可用时 fail closed。
- `clientRequestId` 保持幂等。已完成任务直接返回同一 assessment；失败任务允许显式重试并记录新 attempt。

## API

- `POST /api/session`：微信 code 换 session。
- `GET /api/health`：版本、后端状态和免费额度保护状态，不返回 secrets。
- `POST /api/generation`：验证隐私同意和配额，同步生成完整 50 题并持久化。
- `GET /api/assessments`：分页历史摘要。
- `GET /api/assessments/:id`：读取 owned assessment。
- `PUT /api/assessments/:id`：revision 条件更新草稿。
- `POST /api/assessments/:id/complete`：评分并保存完成状态。
- `GET /api/settings`、`PUT /api/settings`：用户设置和隐私同意。
- `POST /api/reports`：举报与反馈。

所有响应采用 `{ ok: true, data }` 或 `{ ok: false, error: { code, message, retryable } }`。公开错误码与现有 CloudBase 合同保持兼容，并新增 `FREE_TIER_LIMIT`、`SESSION_EXPIRED` 和 `BACKEND_UNAVAILABLE`。

## 免费额度保护

- 每位用户每天默认最多生成 5 份试卷，连续请求至少间隔 60 秒。
- 历史索引最多 200 条；草稿 30 天、已完成记录 365 天、举报 365 天。
- 每次生成前检查全局手动熔断对象 `ops/generation-disabled.json`。
- 设置页显示后端健康状态；达到额度或人工熔断时只禁止新生成，已有本地记录仍可答题和查看。
- EdgeOne 控制台保持免费套餐，不绑定自动升级策略。运行手册记录月度用量检查。

## 小程序行为

- 首次启动先建立 EdgeOne session，再拉取设置和历史；网络失败进入本地离线模式。
- 生成需要在线、有效 session 和已同意隐私；按钮内 loading 覆盖最长 120 秒。
- 生成成功响应到达时先写本地，再更新页面；服务端已经在响应前保存相同 assessment。
- 草稿变更继续本地即时保存并进入同步队列；重连后按 revision 上传。
- 历史页合并本地和远端摘要，远端短暂旧值不能覆盖更新的本地记录。

## 发布与迁移

1. EdgeOne 项目先部署预览环境，配置非生产微信账号和模型端点。
2. 本地和预览 smoke 通过后配置生产环境变量。
3. 将 EdgeOne API 域名加入微信公众平台 request 合法域名。
4. 正式构建必须包含 EdgeOne API URL，且不得包含 CloudBase env id 或 server secrets。
5. CloudBase 发布工作流替换为 EdgeOne build、secret scan、preview smoke 和 deploy 门禁。
6. 当前没有真实 CloudBase 用户数据，因此不执行远端数据迁移；旧本地历史通过现有本地仓库继续保留。

## 测试与验收

- 单元测试：会话签名、owner 隔离、固定 50 题、解析失败、内容安全、配额、revision 和存储键。
- 合同测试：所有 API DTO 与共享 assessment core 一致。
- 适配器测试：内存 Blob 和 EdgeOne Blob SDK 双实现行为一致，并验证敏感元数据使用强一致读取。
- 小程序测试：无题量选择、固定 50 请求、401 重登、离线、同步冲突和历史合并。
- 构建测试：Node Functions 产物、120 秒配置、环境变量 allowlist 和 dist secret scan。
- 发布 smoke：中文/英文各生成 50 题，立即历史可见，答题提交、重启恢复、跨设备同步、举报和内容拦截。

## 非目标

- 不保留新建 100 题入口。
- 不在客户端保存服务端模型密钥或微信 AppSecret。
- 不依赖 EdgeOne 内置免费模型作为正式生产模型。
- 不实现付费升级、支付、会员或商业化套餐。
- 不迁移不存在的 CloudBase 生产数据。
