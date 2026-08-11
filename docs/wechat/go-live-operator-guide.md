# SkillScope 微信小程序从当前状态到正式上线

本手册是生产上线的唯一顺序入口。任何阶段未通过时，不进入下一阶段。代码仓库中的 `deployment-runbook.md`、`release-checklist.md` 和 `review-submission.md` 分别提供部署、安全检查和审核材料细节。

## 当前状态

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 小程序代码、CloudBase 函数、发布校验 | 已完成 | `main` 已推送，GitHub CI 通过 |
| 微信公众平台主体和 AppID | 未确认 | 本机公共配置仍为 `touristappid` |
| 微信开发者工具 | 已安装，未就绪 | 服务端口关闭，登录状态无法检测 |
| CloudBase 生产环境 | 未确认 | 尚无生产环境 ID，CLI 未登录 |
| 生产 disclosure 和 manifest | 未创建 | 模板仍含 `待配置` |
| GitHub `wechat-production` environment | 未创建 | 尚无审批人和生产 secrets |
| 真机、微信审核、发布 | 未执行 | 必须在真实账号与生产环境就绪后执行 |

## 安全边界

- 可以在对话中提供：AppID、CloudBase 环境 ID、主体公开名称、备案号、服务类目、模型公开名称、备案或登记编号、版本号。
- 不要在对话、GitHub issue、仓库或截图中提供：AppSecret、LLM API Key、内容安全 API Key、微信上传私钥、腾讯云 SecretId/SecretKey、OpenID、手机号或身份证信息。
- 密钥只在微信公众平台、CloudBase 控制台或 GitHub Environment Secrets 页面中由账号管理员输入。
- Codex 可以执行本地构建、测试、文件生成、CloudBase CLI 部署、GitHub 配置和上传；扫码、实名认证、人脸核验、备案确认、隐私声明提交、审核提交和最终发布必须由管理员手动完成。

## 阶段 1：微信账号、主体和 AppID

**负责人：账号管理员。当前必须先完成此阶段。**

1. 打开 <https://mp.weixin.qq.com/>，注册或登录“小程序”账号，而不是公众号账号。
2. 在“设置与开发 -> 基本设置/主体信息”确认主体已完成认证，主体名称与实际运营方一致。
3. 在“设置与开发 -> 开发管理 -> 开发设置”找到 AppID。不要发送 AppSecret。
4. 在“成员管理”中确认负责上传和发布的微信号具有开发者或管理员权限。
5. 在“设置 -> 服务类目”选择与真实业务一致的类目。SkillScope 建议优先核对工具或教育相关类目，但最终必须以主体经营范围和微信后台可选类目为准。

**验收：** 可以登录后台，主体状态正常，已取得 `wx` 开头的真实 AppID，管理员具备开发权限。

**完成后发给 Codex：** `阶段1完成；AppID=...；主体公开名称=...；服务类目=...`。

## 阶段 2：备案、隐私和生成式 AI 合规

**负责人：主体管理员/合规负责人。可与后续技术准备并行，但正式审核前必须完成。**

1. 在微信公众平台进入“小程序备案”，按后台指引填写主体、负责人和服务内容，完成人脸核验并等待管局审核。
2. 备案通过后记录小程序备案号；若后台要求在页面展示备案号，保持与备案结果完全一致。
3. 在“小程序用户隐私保护指引”中声明实际处理的数据。逐项对照 `docs/wechat/privacy-data-map.md`，覆盖用户输入主题、答题记录、设置、投诉反馈和 CloudBase 存储。
4. 确认生产模型提供方、模型名称及其公开备案信息。若面向中国境内公众提供生成式 AI 功能，由合规负责人确认应用登记、模型备案和生成合成内容标识责任。
5. 确认页面披露内容：服务运营主体、隐私版本、模型提供方/模型名称、备案或登记编号、小程序备案号。

**验收：** 备案状态为已通过；隐私保护指引已提交且字段与数据地图一致；AI 披露值有可核验来源，不使用示例文本。

**完成后发给 Codex：** `阶段2完成；备案号=...；隐私版本=...；模型披露=...；生成式AI备案或登记=...`。只发送公开披露值。

## 阶段 3：微信开发者工具就绪

**负责人：账号管理员。**

1. 打开微信开发者工具并用阶段 1 中有权限的微信号扫码登录。
2. 打开“设置 -> 安全设置”，开启“服务端口”。
3. 保持开发者工具运行，等待 Codex 执行 `cli islogin` 验证。
4. Codex 将创建本机 `apps/wechat/project.private.config.json` 写入真实 AppID。该文件被 Git 忽略，不会上传。

**验收：** CLI 返回已登录，真实 AppID 的项目可以被开发者工具打开。

**完成后发给 Codex：** `阶段3完成，开发者工具已登录并开启服务端口`。

## 阶段 4：创建 CloudBase 生产环境

**负责人：腾讯云/云开发管理员。**

1. 从微信开发者工具“云开发”或腾讯云 CloudBase 控制台进入阶段 1 对应的小程序账号。
2. 创建独立生产环境，建议显示名 `skillscope-prod`；不要复用开发或测试环境。
3. 选择中国境内可用地域和满足调用量的计费方案，开通数据库、云函数和日志服务。
4. 记录真实环境 ID。环境 ID 不应包含 `dev`、`test`、`example`、`placeholder` 或 `待配置`。
5. 在控制台确认该环境已关联正确的小程序 AppID。

**验收：** CloudBase 控制台可进入，环境状态正常，拥有数据库和云函数部署权限。

**完成后发给 Codex：** `阶段4完成；生产环境ID=...`。

## 阶段 5：CloudBase 登录、数据和函数部署

**负责人：Codex 执行，管理员只处理授权页面和密钥输入。**

1. Codex 安装固定版本的 `@cloudbase/cli` 并执行 `tcb login`。
2. 浏览器出现腾讯云授权页面时，管理员核对账号与目标环境后点击同意授权。
3. Codex 构建 `services/cloudbase/dist`，按以下顺序部署：
   - 集合：`assessments`、`generation_jobs`、`daily_generation_quotas`、`generation_rate_limits`、`user_settings`、`user_reports`。
   - 索引：导入 `services/cloudbase/database/indexes.json`。
   - 数据库安全规则：导入 `services/cloudbase/database/security-rules/*.json`。
   - 函数调用规则：导入 `services/cloudbase/database/function-invoke-rules.json`。
   - 云函数：设置/隐私 -> 生成 -> 测评同步 -> 举报和保留。
   - 定时任务：`generation-worker-every-minute` 每分钟；`daily-retention-cleanup` 每日 03:00。
4. 管理员在 CloudBase 控制台的云函数环境变量中输入：
   - `SKILLSCOPE_ENV=production`
   - `SKILLSCOPE_ALLOW_UNSAFE_MODERATION=false`
   - `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`
   - `CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER`
   - `services/cloudbase/env.production.example` 中的 retention 参数
5. 不要把这些密钥发给 Codex；输入完成后只回复变量名均已配置。

**验收：** 所有函数部署成功；worker 不能被客户端直接调用；定时任务启用；生产日志中无密钥；输入和输出审核为 fail closed。

## 阶段 6：生产发布文件与 GitHub 环境

**负责人：Codex 生成文件和仓库配置，管理员输入 secrets。**

1. Codex 根据阶段 1、2、4 的公开值生成：
   - `docs/wechat/release-disclosure.production.json`
   - 本次 `docs/wechat/releases/<version>.json`
   - 本机 `apps/wechat/project.private.config.json`
2. Codex 创建 GitHub Environment `wechat-production`，将仓库管理员设为 required reviewer。
3. 管理员在 GitHub 仓库“Settings -> Environments -> wechat-production”添加：
   - `WECHAT_APP_ID`
   - `WECHAT_PRIVATE_KEY_PEM`
   - `TARO_APP_CLOUDBASE_ENV_ID`
   - `CONTENT_SAFETY_URL`
   - `CONTENT_SAFETY_API_KEY`
   - `CONTENT_SAFETY_PROVIDER`
4. `WECHAT_PRIVATE_KEY_PEM` 来自微信公众平台“开发设置 -> 小程序代码上传”生成的上传密钥；同时按微信后台要求配置上传 IP 白名单。

**验收：** GitHub 只显示 secret 名称和更新时间；正式 disclosure 无 `待配置`；私钥和 API Key 未进入 Git 历史。

## 阶段 7：正式发布验证

**负责人：Codex。**

Codex 执行：

```powershell
npm ci
npm run verify:github-workflows
$env:TARO_APP_CLOUDBASE_ENV_ID='<生产环境ID>'
$env:SKILLSCOPE_ENV='production'
$env:SKILLSCOPE_ALLOW_UNSAFE_MODERATION='false'
npm run verify:wechat-release:formal -- --disclosure-file docs/wechat/release-disclosure.production.json
npm run wechat:ci:dry-run -- --version '<版本号>' --description 'SkillScope <版本号> 审核候选'
```

**验收：** 测试、类型检查、构建、source/dist secret scan、formal verifier 和 dry-run 全部通过；产物 hash 写入 release manifest。

## 阶段 8：体验版上传和真机验收

**负责人：Codex 上传；管理员、测试人员真机操作。**

1. Codex 先使用 `wechat:ci:preview` 生成预览二维码，再触发 GitHub `WeChat Mini Program Release`，`publish_target=upload`。
2. GitHub required reviewer 核对 commit、版本号、生产环境 ID 和 disclosure 后批准上传。
3. 管理员在微信公众平台“版本管理”将该开发版本设为体验版并添加体验成员。
4. 至少使用一台带底部安全区的 iPhone 和一台 Android 真机执行 `deployment-runbook.md` 第 4 节全部 smoke。
5. 截图按 `docs/wechat/release-evidence/screenshot-naming.md` 命名，不包含 OpenID、手机号或密钥。

**验收：** 生成、答题、历史、同步、隐私拒绝/同意、举报、解析失败、内容拦截、键盘避让和安全区全部通过；CloudBase 日志无未处理异常。

## 阶段 9：提交微信审核

**负责人：微信管理员手动提交。**

1. 打开微信公众平台“管理 -> 版本管理”，选择已验收的开发版本，点击“提交审核”。
2. 填写实际服务类目、功能页面和版本说明；审核备注使用 `docs/wechat/review-submission.md` 第 4 节模板，并替换真实披露值。
3. 提交隐私保护指引、备案、AI 披露和类目资质材料。涉及验证码、扫码、人脸或管理员确认时由管理员完成。
4. 记录审核单链接、提交时间和版本号，发给 Codex 更新 release manifest。

**验收：** 后台状态为“审核中”。若驳回，将完整驳回原因和截图发给 Codex，不要只发错误标题；Codex 修复、验证并上传新版本后重复本阶段。

## 阶段 10：审核通过、灰度发布和正式上线

**负责人：微信管理员执行发布，Codex 协助监控。**

1. 审核通过后先确认 CloudBase 生产 smoke 仍正常，当前 commit 与审核版本一致。
2. 在“版本管理”点击“发布”。若后台支持分阶段发布，先选择低比例灰度；不具备分阶段能力时，在低流量时间发布。
3. 发布后由非开发者微信账号搜索或扫码进入正式小程序，重新执行最短主链：隐私同意 -> 中文生成 -> 英文生成 -> 答题 -> 提交 -> 历史 -> 举报。
4. 监控 CloudBase 的生成延迟、`INVALID_MODEL_RESPONSE`、内容审核失败、配额、同步冲突和投诉；发现 P1 问题时停止扩量或回退上一审核版本。
5. 稳定观察后扩大到 100%，在 manifest 中填写真实发布时间、审核记录、灰度比例和回滚版本。

**最终验收：** 普通用户可从微信正式环境访问；版本管理显示已发布；生产主链通过；监控无 P1/P2 阻断；release manifest 完整且不含密钥。

## 每次人工交接的回复格式

```text
阶段N完成
公开参数：...
后台状态：...
需要 Codex 接着执行：...
```

密钥只回复“已配置”，不要粘贴实际值。

## 官方入口

- 微信公众平台：<https://mp.weixin.qq.com/>
- 微信开发者工具 CLI：<https://developers.weixin.qq.com/miniprogram/dev/devtools/cli.html>
- 工信部备案系统：<https://beian.miit.gov.cn/>
- CloudBase CLI 登录：<https://docs.cloudbase.net/cli-v1/quick-start>
- CloudBase 云函数部署：<https://docs.cloudbase.net/cli-v1/functions/deploy>
- 生成式人工智能服务管理暂行办法：<https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm>
- 人工智能生成合成内容标识办法：<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm>
