# SkillScope 微信小程序审核提交说明

本文件用于把本地发布候选提交到微信审核。它不声明审核已通过，也不填写真实主体、AppID、备案或生产凭据。所有 `待配置` 都要由发布负责人从微信公众平台、EdgeOne 控制台和法定材料中替换。

版本号 -> 上传命令 -> 审核备注 -> 截图 -> AI -> 驳回 -> 重新提交是审核工作的主线。

## 1. 版本与 manifest

1. 从 `docs/wechat/release-manifest.template.json` 复制出本次发布记录。
2. 填写 commit SHA、tag、WeChat 版本号、EdgeOne project、deployment URL、production HTTPS origin、build SHA、Blob namespace、审核单链接、灰度比例和回滚版本。
3. 填写真实服务运营主体、小程序备案号、隐私版本、模型披露、生成式 AI 备案或登记信息。
4. manifest 不能包含上传私钥、模型密钥、OpenID、手机号或后台访问凭据。

## 2. 本地正式验证

```sh
npm ci
npm run verify:github-workflows
npm run verify:wechat-release:formal -- --disclosure-file docs/wechat/release-disclosure.production.json
npm run wechat:ci:dry-run -- --version <版本号> --description "SkillScope <版本号> 审核候选"
```

如果 formal verifier 因 `待配置`、开发 origin、fixture、内容安全占位值或包内 disclosure 不一致而失败，不能提交审核。仓库模板失败是正确行为；只有真实 production disclosure、EdgeOne production HTTPS origin 和服务端变量齐全时才会通过。

## 3. 上传命令

本机上传，PowerShell：

```sh
$env:WECHAT_APP_ID="<真实 AppID>"
$env:WECHAT_PRIVATE_KEY_PATH="<本机上传私钥路径>"
$env:WECHAT_RELEASE_VERSION="<版本号>"
$env:WECHAT_RELEASE_DESC="SkillScope <版本号> 审核候选：技能测评生成、答题、历史复盘、隐私和投诉入口"
$env:WECHAT_CI_ROBOT="1"
npm run wechat:ci:upload
```

本机上传，Bash：

```sh
export WECHAT_APP_ID="<真实 AppID>"
export WECHAT_PRIVATE_KEY_PATH="<本机上传私钥路径>"
export WECHAT_RELEASE_VERSION="<版本号>"
export WECHAT_RELEASE_DESC="SkillScope <版本号> 审核候选：技能测评生成、答题、历史复盘、隐私和投诉入口"
export WECHAT_CI_ROBOT="1"
npm run wechat:ci:upload
```

GitHub Actions 上传：

1. 打开 `WeChat Mini Program Release` workflow。
2. 手动 `workflow_dispatch`，`publish_target=upload`，填写版本、描述、robot 和 production disclosure 文件路径。
3. 等待 `release-checks` 通过。
4. 由 required reviewer 批准 `wechat-production` environment 后，upload job 才能读取 environment values。

Fork/PR 不会触发 upload job，也不能读取这些 values。

## 4. 审核备注模板

```text
SkillScope 是一个技能测评小程序。用户输入主题和可选侧重点后，系统通过服务端模型生成固定 50 道单选、多选或判断题；用户答题后获得本地/服务端评分、知识点统计、错题复盘和题目解析。

首次进入会展示隐私保护指引。小程序不主动获取手机号、头像、昵称或通讯录；答题记录与设置按微信登录态隔离保存在 EdgeOne Blob。投诉入口：我的/隐私页面 -> 反馈。

AI 生成内容说明：题目由用户主题触发生成，仅用于学习自测参考。生产模型、备案/登记信息和服务运营主体见设置页与隐私页。

测试路径：首次进入 -> 同意隐私 -> 生成页输入“TypeScript 基础” -> 生成 50 题 -> 答题 -> 提交 -> 查看结果与历史。无需审核员提供测试账号。
```

## 5. 截图与证据

按 `docs/wechat/release-evidence/screenshot-naming.md` 命名，不得包含真实 OpenID、手机号、上传私钥路径、模型密钥或后台凭据。

必备截图：

- 隐私 gate、隐私详情页、投诉入口。
- 设置页的服务运营主体、模型披露、小程序备案号和隐私版本。
- 生成页：默认中文、英文输入生成英文题目的示例。
- preview 与 production EdgeOne HTTPS origin 的 request 合法域名配置和真机请求结果。
- 答题页：单选、多选、判断、图片失败回退、宽表格横向滚动、柱状图。
- 历史页：草稿恢复、已完成结果、错题复盘。
- iPhone 底部安全区和键盘避让。

## 6. 驳回 triage

- 类目/资质驳回：由主体负责人调整微信后台类目或补资质，代码不伪造业务范围。
- 隐私驳回：对照 `docs/wechat/privacy-data-map.md` 和微信后台隐私声明，确认 EdgeOne 存储、输入主题、答题记录和投诉反馈字段一致。
- AI 披露驳回：核对设置页/隐私页、production disclosure、manifest 和备案/登记材料是否一致。
- 内容安全驳回：查看 EdgeOne 输入/输出审核日志，只记录错误码和 job id，不导出用户题目全文。
- 功能驳回：复现审核路径，补充自动化测试或真机证据，再上传新版本。

## 7. 重新提交

1. 创建或更新 filing/smoke issue，记录驳回原因和外部材料变更。
2. 若需要代码修复，走 PR、CI、release checks 和 formal verifier。
3. 重新生成 manifest，更新版本号和审核备注。
4. 通过 miniprogram-ci 或 GitHub Actions 上传新草稿，再在微信公众平台提交审核。

官方参考：微信公众平台 <https://mp.weixin.qq.com/>，miniprogram-ci <https://www.npmjs.com/package/miniprogram-ci>。
