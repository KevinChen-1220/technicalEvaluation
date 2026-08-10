# SkillScope 微信小程序发布 checklist

本 checklist 用来确认本地代码已经交付到可发布状态，并把只能由真实主体完成的外部动作留给发布负责人。不得填写虚构 AppID、主体、备案号、模型备案或审核结论；`待配置` 必须保留到真实材料可核验为止。

## 发布边界

本地已交付：Taro 微信端、CloudBase 函数和数据库规则、隐私/投诉页面、异步生成、历史复盘、发布验证、secret scan、GitHub Actions release checks、手动上传 workflow 和 issue 追踪模板。

外部仍需：真实微信主体认证、真实 AppID、法定备案声明、生产 CloudBase credentials、微信开发者工具登录、真机烟测、微信审核和发布。

## 主体与小程序后台

主体认证 -> AppID -> 类目 -> ICP备案 -> 隐私声明 -> 生成式人工智能披露必须按这个顺序核对，任何一项为 `待配置` 时不得提交正式审核。

- [ ] 微信公众平台账号主体已完成认证，服务运营主体与 `release-disclosure.production.json` 一致。
- [ ] 真实 AppID 已写入本机 `apps/wechat/project.private.config.json`，公共 `project.config.json` 继续保持 `touristappid`。
- [ ] 服务类目与“技能测评 / 教育 / 工具”实际经营范围一致，所需资质文件来自主体方。
- [ ] 小程序 ICP 备案在工信部/微信后台流程完成，备案号写入生产 disclosure 和 release manifest。
- [ ] 小程序用户隐私保护指引已在微信后台配置，字段与 `docs/wechat/privacy-data-map.md` 一致。
- [ ] 投诉/举报路径 `/pages/report/index` 可访问，处理流程和反馈时限与页面文案一致。

## AI 与内容安全

- [ ] 生产模型名称、提供方、已备案模型或应用登记信息由运营方确认，不能用示例名称替代。
- [ ] 如果面向中国境内公众提供生成式 AI 能力，依据属地要求确认备案或登记责任；调用已备案模型也要确认是否需要应用/功能登记。
- [ ] 设置页和隐私页显著展示模型披露、备案号或上线编号；展示值必须与生产 disclosure 和 manifest 一致。
- [ ] 生成题目属于 AI 生成内容，正式材料需要说明“由用户输入主题后生成测评题目，结果供学习自测参考”。
- [ ] 输入审核使用微信 `security.msgSecCheck`；输出审核使用生产 `CONTENT_SAFETY_*` HTTPS 服务。正式发布不得启用开发绕过。
- [ ] 对 `CONTENT_BLOCKED`、`INVALID_MODEL_RESPONSE`、超时和审核服务不可用保持 fail closed，并在 CloudBase 日志中只记录结构化错误码。

## CloudBase 生产准备

- [ ] 开发和生产 CloudBase 环境分离，生产 env id 不包含 `dev`、`test`、`example`、`placeholder` 或 `待配置`。
- [ ] 生产集合、索引、安全规则和函数调用规则按 `docs/wechat/deployment-runbook.md` 部署。
- [ ] 所有服务端变量只配置在 CloudBase 函数环境，不使用 `TARO_APP_*` 暴露模型或审核凭据。
- [ ] `generation-worker` 和 `retention-cleanup` 定时触发器启用；`generation-worker` 客户端调用仍为 deny。
- [ ] 生产 hosted smoke 已覆盖输入审核、输出审核、模型生成、解析失败和故障关闭路径。

## GitHub 与上传权限

- [ ] GitHub environment `wechat-production` 已配置 required reviewers；上传 job 只能手动触发并等待环境审批。
- [ ] Environment values 配置：`WECHAT_APP_ID`、`WECHAT_PRIVATE_KEY_PEM`、`TARO_APP_CLOUDBASE_ENV_ID`、`CONTENT_SAFETY_URL`、`CONTENT_SAFETY_API_KEY`、`CONTENT_SAFETY_PROVIDER`。
- [ ] Fork/PR 只运行 `release-checks`，该 job 不引用 GitHub secrets。
- [ ] `docs/wechat/release-manifest.template.json` 复制为发布记录后填写真实值；manifest 不记录密钥、上传私钥或用户数据。

## 本地命令门禁

```sh
npm ci
npm run verify:github-workflows
npm run verify:wechat-release
npm run verify:wechat-release:formal -- --disclosure-file docs/wechat/release-disclosure.production.json
npm run wechat:ci:dry-run
```

`verify:wechat-release:formal` 只有在真实生产 disclosure、生产 CloudBase env id 和内容安全环境变量齐全时才能通过。仓库模板按预期失败，不能视为发布成功。

## 官方参考

- 微信公众平台：<https://mp.weixin.qq.com/>
- miniprogram-ci：<https://www.npmjs.com/package/miniprogram-ci>
- 工信部 ICP/IP 地址/域名信息备案管理系统：<https://beian.miit.gov.cn/>
- 国家网信办《生成式人工智能服务管理暂行办法》：<https://www.cac.gov.cn/2023-07/13/c_1690898327029107.htm>
- 国家网信办生成式 AI 备案/登记公告：<https://www.cac.gov.cn/2026-01/09/c_1769688009588554.htm>
- 《人工智能生成合成内容标识办法》：<https://www.cac.gov.cn/2025-03/14/c_1743654684782215.htm>
- CloudBase 云函数：<https://docs.cloudbase.net/cloud-function/introduce>
- CloudBase 云函数安全规则：<https://docs.cloudbase.net/cloud-function/security-rules>
