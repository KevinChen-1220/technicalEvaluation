# SkillScope 微信小程序发布 profiles

## development

- 用途：本地构建、微信开发者工具导入、CloudBase 开发环境验证。
- CloudBase：使用开发环境 env id；允许低配额和测试用户。
- Fixture：允许 `TARO_APP_RELEASE_FIXTURE_MODE=enabled` 编译 deterministic fixture，用于没有模型密钥时验证 50/100 题、宽表格、柱状图、图片失败回退、历史、提交和结果复盘。
- Disclosure：使用 `docs/wechat/release-disclosure.development.json`，页面可以显示 `待配置`，但不能声明正式发布。

## trial

- 用途：微信后台体验版/试用版。
- CloudBase：使用预发布或灰度环境；服务端仍只通过 CloudBase 环境变量保存模型与内容安全密钥。
- Fixture：默认禁用。只有发布负责人明确需要离线烟测时才开启，构建产物不得上传为正式版本。
- Disclosure：允许使用 development disclosure，但 release evidence 必须标记为 trial，不得标记为 formal。

## formal

- 用途：提交微信审核和正式发布。
- CloudBase：必须使用生产 env id，不能包含 `dev`、`test`、`example`、`placeholder` 或 `待配置`。
- Fixture：禁止开启。Taro config 和 `verify:wechat-release:formal` 都会拒绝 fixture。
- 验证：`verify:wechat-release:formal` 先做 production disclosure 与 moderation preflight，再删除旧的 WeChat/CloudBase dist，同轮执行 formal build、scans 和 artifact disclosure 比对；旧 dist 不能作为正式证据。
- Disclosure：必须使用真实服务运营主体、模型披露、生成式 AI 备案/登记信息、小程序备案号和隐私政策版本。production JSON 不在仓库模板里伪造真实值。

## 回滚

1. 在微信公众平台版本管理里保留上一版稳定开发版/体验版说明。
2. 发布后先灰度低比例流量，监控 CloudBase 生成延迟、解析失败、内容安全失败、配额耗尽和同步冲突。
3. 如果出现 P1 线上问题，停止灰度扩量，回退到上一版审核通过版本，并记录回滚版本号、CloudBase env id、触发原因和恢复时间。
4. 禁止在回滚记录中保存 AppSecret、上传私钥、模型 API Key、用户 OpenID 或完整题目内容。
