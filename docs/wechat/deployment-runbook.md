# SkillScope 微信小程序部署 runbook

本 runbook 面向拥有真实微信主体、AppID 和 CloudBase 权限的发布负责人。仓库已经提供可构建的 CloudBase/Taro 产物，但不能代替账号认证、法定备案、生产凭据、登录 DevTools、真机和微信审核。

## 0. 输入材料

- 真实微信小程序 AppID，写入本机 `apps/wechat/project.private.config.json`，不得提交。
- CloudBase 开发和生产环境 ID，生产值写入发布环境变量，不得使用 `待配置`。
- 生产 disclosure：从 `docs/wechat/release-disclosure.production.template.json` 复制为真实文件并填写服务运营主体、隐私版本、模型披露、小程序备案号。
- 服务端变量：`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER`。
- GitHub environment `wechat-production` 的审批人和上传配置。

## 1. CloudBase 环境

集合 -> 索引 -> 安全规则 -> 函数调用规则 -> 定时触发器 -> 环境变量 -> 回滚是生产部署的固定顺序。

1. 创建两个环境：`skillscope-dev` 用于体验版，`skillscope-prod` 用于正式发布。实际 env id 以控制台为准。
2. 在两个环境创建集合：`assessments`、`generation_jobs`、`daily_generation_quotas`、`generation_rate_limits`、`user_settings`、`user_reports`。
3. 导入 `services/cloudbase/database/indexes.json` 中的索引，重点确认 `assessments.owner_updated_at`、`generation_jobs.owner_client_request_id`、`generation_jobs.status_lease_expires_at`。
4. 导入 `services/cloudbase/database/security-rules/*.json`，每个集合规则都必须保留 `_openid` 隔离。
5. 导入 `services/cloudbase/database/function-invoke-rules.json`。`generation-worker` 没有显式开放，默认 `*` 为 deny，不能让客户端调用。
6. 开启 OpenAPI 能力：`create-generation-job` 需要 `security.msgSecCheck`。
7. 部署函数后确认定时触发器：`generation-worker-every-minute` 为每分钟，`daily-retention-cleanup` 为每日 03:00。

## 2. 构建与部署顺序

```sh
npm ci
npm run test -- --runInBand
npm run test:wechat -- --runInBand
npm run test:cloudbase -- --runInBand
npm run typecheck
npm run typecheck:wechat
npm run typecheck:cloudbase
npm run build:cloudbase
npm run verify:github-workflows
```

CloudBase 产物位于 `services/cloudbase/dist`。使用 CloudBase 控制台或官方 CLI 从该目录部署函数、规则、索引和触发器；部署记录写入 release manifest。仓库不假设本机已经登录 CloudBase，因此不会伪造部署成功。

部署函数顺序：

1. 读写设置与隐私：`get-user-settings`、`update-user-settings`。
2. 生成链路：`create-generation-job`、`get-generation-job`、`generation-worker`。
3. 测评同步：`get-assessment`、`update-assessment`、`list-assessments`、`complete-assessment`。
4. 反馈和保留：`create-report`、`retention-cleanup`。

## 3. 生产环境变量

生产函数变量从 `services/cloudbase/env.production.example` 复制到 CloudBase 控制台或部署系统。不得把真实值写进仓库、issue、截图或日志。

- `SKILLSCOPE_ENV=production`
- `SKILLSCOPE_ALLOW_UNSAFE_MODERATION=false`
- `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`
- `CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER`
- Retention 参数保持默认，除非合规负责人批准。

小程序端只使用公开 env id：

```sh
TARO_APP_RELEASE_PROFILE=formal
TARO_APP_RELEASE_FIXTURE_MODE=disabled
TARO_APP_CLOUDBASE_ENV_ID=<真实生产环境>
TARO_APP_RELEASE_DISCLOSURE_FILE=docs/wechat/release-disclosure.production.json
```

## 4. 发布前 smoke

在生产 CloudBase 环境完成以下外部 smoke 后，才能关闭 `.github/ISSUE_TEMPLATE/wechat_production_smoke.yml` 创建的 issue。

- 新用户进入隐私 gate，拒绝不能生成，接受后写入 `user_settings`。
- 50 题和 100 题生成：job 进入 queued/running/completed，worker 批量写入 `assessments`。
- 模型返回非 JSON、超大响应、HTML/XML 响应时失败为 `INVALID_MODEL_RESPONSE`，不保存残缺题目。
- 输入和输出审核分别覆盖 allowed、blocked、timeout/fail closed。
- 离线答题、本地 pending queue、跨设备 revision 冲突、提交评分、错题复盘和历史恢复。
- 投诉/反馈不要求 assessmentId 的 privacy/other 路径可提交，question_error/content_safety 需要 owned assessment。
- iPhone 安全区、键盘避让、生成按钮 loading、宽表格和图片失败回退用真机截图记录。

## 5. 回滚

1. 每次上传前填写 release manifest，记录 commit、tag、WeChat 版本、CloudBase env、artifact hash、审核单和回滚版本。
2. 正式发布先灰度低比例，监控生成延迟、解析失败、内容审核失败、配额耗尽、同步冲突和投诉量。
3. P1 问题时停止灰度扩量，在微信公众平台回退上一版审核通过版本。
4. CloudBase 回滚优先重部署上一版 `services/cloudbase/dist`；必要时暂停 `generation-worker` timer，避免继续消费异常 job。
5. 数据恢复前先导出受影响集合，恢复只处理 `_openid` 隔离内的数据，不能批量覆盖用户新答案。

## 6. 数据迁移和恢复

当前 Task9 不包含破坏性 schema migration。新增索引和规则为向前兼容；若生产集合已有数据，先在开发环境导入匿名样本验证查询计划，再在生产低峰期应用索引。恢复策略以 CloudBase 集合导出为准，任何人工修复都要记录 issue、操作人、时间、集合、筛选条件和影响范围。

## 7. 监控入口

- CloudBase 函数日志：关注 `generation_job_*`、`worker_*`、`retention_cleanup_completed`、`report_created`。
- 微信后台版本管理：关注审核状态、发布灰度和用户反馈。
- GitHub Actions：`WeChat Mini Program Release` 的 `release-checks` 不读凭据，`upload` 必须走 `wechat-production` 环境审批。

官方参考：CloudBase 云函数 <https://docs.cloudbase.net/cloud-function/introduce>，函数安全规则 <https://docs.cloudbase.net/cloud-function/security-rules>。
