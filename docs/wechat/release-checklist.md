# SkillScope 微信小程序发布 checklist

完整的逐步上线操作与人工/Codex 交接方式见 `docs/wechat/go-live-operator-guide.md`。本文件只保留正式发布门禁。不得填写虚构 AppID、主体、备案号、模型登记或审核结论；`待配置` 必须保留到真实材料可核验为止。

## 发布边界

本地已交付：Taro 微信端、EdgeOne Node Functions、Blob 持久化、隐私/投诉页面、异步生成、历史复盘、发布验证、secret scan、GitHub Actions release checks、手动上传 workflow 和 issue 追踪模板。

外部仍需：真实微信主体认证、真实 AppID、法定备案声明、生产 EdgeOne 项目和 HTTPS origin、微信开发者工具登录、真机烟测、微信审核和发布。

## 主体与小程序后台

主体认证 -> AppID -> 类目 -> ICP备案 -> 隐私声明 -> 生成式人工智能披露必须按顺序核对，任何一项为 `待配置` 时不得提交正式审核。

- [ ] 微信公众平台账号主体已完成认证，服务运营主体与 production disclosure 一致。
- [ ] 真实 AppID 已写入本机 `apps/wechat/project.private.config.json`，公共 `project.config.json` 保持 `touristappid`。
- [ ] 服务类目、ICP备案、用户隐私保护指引和投诉入口均已在微信后台完成。
- [ ] 设置页和隐私页展示的模型披露、备案号或上线编号与 production disclosure、release manifest 一致。

## EdgeOne 生产准备

- [ ] EdgeOne project 已创建，Node Functions 与 Blob 已部署到 production deployment。
- [ ] `TARO_APP_EDGEONE_API_BASE_URL` 为 production HTTPS origin 根路径，不含 `/api`、端口、查询参数或凭据。
- [ ] 所有服务端环境变量只在 EdgeOne 项目中配置；小程序只能读取 `TARO_APP_EDGEONE_API_BASE_URL`，不得打包模型、微信会话或审核凭据。
- [ ] Blob 命名空间、保留策略和恢复责任人已记录在 release manifest。
- [ ] 微信公众平台已把同一个 HTTPS origin 加入 `request合法域名`，并完成域名校验。
- [ ] preview smoke 与 production smoke 均已覆盖隐私 gate、50 题生成、HTML/XML 解析失败、审核阻断、离线答题和历史恢复。

## AI 与内容安全

- [ ] 生产模型名称、提供方、已备案模型或应用登记信息由运营方确认，不能用示例名称替代。
- [ ] 输入审核使用微信 `security.msgSecCheck`；输出审核使用生产 HTTPS 服务，正式发布不得启用开发绕过。
- [ ] 对 `CONTENT_BLOCKED`、`INVALID_MODEL_RESPONSE`、超时和审核服务不可用保持 fail closed，日志只记录结构化错误码。

## GitHub 与上传权限

- [ ] GitHub environment `wechat-production` 已配置 required reviewers；上传 job 只能手动触发并等待环境审批。
- [ ] `wechat-production` 中的发布变量仅包括 production HTTPS origin 和上传所需公开配置；服务端密钥只配置在 EdgeOne，不写入仓库、issue、截图或 manifest。
- [ ] Fork/PR 只运行 `release-checks`，该 job 不引用 GitHub secrets。
- [ ] 复制 `docs/wechat/release-manifest.template.json` 后填写 EdgeOne project、deployment URL、build SHA、Blob、审核单与回滚版本；manifest 不记录密钥或用户数据。

## 本地命令门禁

```sh
npm ci
npm run verify:github-workflows
npm run verify:wechat-release
npm run verify:wechat-release:formal -- --disclosure-file docs/wechat/release-disclosure.production.json
npm run wechat:ci:dry-run
```

`verify:wechat-release:formal` 只有在真实 production disclosure、production HTTPS origin 和内容安全环境变量齐全时才能通过。仓库模板按预期失败，不能视为发布成功。

## 官方参考

- 微信公众平台：<https://mp.weixin.qq.com/>
- 微信小程序 request 合法域名：<https://developers.weixin.qq.com/miniprogram/dev/framework/ability/network.html>
- EdgeOne：<https://edgeone.ai/>
