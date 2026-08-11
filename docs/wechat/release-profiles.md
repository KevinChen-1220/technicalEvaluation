# SkillScope 微信小程序发布 profiles

## development

- 用途：本地构建、微信开发者工具导入、EdgeOne development deployment 验证。
- API：使用 development HTTPS origin 根路径；服务端变量仍只保存在 EdgeOne。
- Fixture：仅测试/发布验证时允许 `TARO_APP_RELEASE_FIXTURE_MODE=enabled`，不得回归为面向用户的示例试卷功能。
- Disclosure：使用 `docs/wechat/release-disclosure.development.json`，页面可显示 `待配置`，但不得声明正式发布。

## trial

- 用途：微信后台体验版/试用版。
- API：使用 preview EdgeOne deployment 的 HTTPS origin，并加入微信 `request合法域名`。
- Fixture：默认禁用。需要离线验证时才可开启，构建产物不得上传为正式版本。
- Disclosure：允许 development disclosure，但 release evidence 必须标记为 trial，不得标记为 formal。

## formal

- 用途：提交微信审核和正式发布。
- API：必须使用 production EdgeOne HTTPS origin 根路径，不包含 `dev`、`test`、`example`、`placeholder`、`待配置`、端口或路径。
- Fixture：禁止开启。Taro config 和 `verify:wechat-release:formal` 都会拒绝 fixture。
- 验证：`verify:wechat-release:formal` 先做 production disclosure 与 moderation preflight，再删除旧的微信构建产物，同轮执行 EdgeOne build、formal build、scans 和 artifact disclosure 比对；旧 dist 不能作为正式证据。
- 模式边界：formal profile 只接受固定 `--profile formal` 与可选 `--disclosure-file`；明确拒绝 `--check-only`、`--file`、`--mode`、`--dist`、`--preflight-only`、重复参数和未知参数。`npm run verify:wechat-release:formal-preflight` 只用于部署前检查配置，不代表 formal 发布验证成功，也不会产生同轮构建与产物证据。
- Disclosure：必须使用真实服务运营主体、模型披露、生成式 AI 备案/登记信息、小程序备案号和隐私政策版本。production JSON 不在仓库模板里伪造真实值。

## 回滚

1. 在微信公众平台版本管理里保留上一版稳定开发版/体验版说明。
2. 发布后先灰度低比例流量，监控 EdgeOne 生成延迟、解析失败、内容安全失败、配额耗尽、Blob 访问和同步冲突。
3. 如果出现 P1 线上问题，停止灰度扩量，回退到上一版审核通过版本，并重新部署上一版 EdgeOne build。
4. 禁止在回滚记录中保存 AppSecret、上传私钥、模型凭据、用户 OpenID 或完整题目内容。
