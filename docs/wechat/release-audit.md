# SkillScope 依赖安全审计

Review date: 2026-08-11

## 审计结论

`npm audit --omit=optional --json` 的结果必须随每次 formal 发布候选重新记录；不能把 advisory 描述为已修复，也不能未审阅地执行强制降级。正式发布前仍需评估生产可达依赖和替代版本。

## 可达性分类

### Build-only

`miniprogram-ci`、Webpack、Babel、PostCSS、开发服务器、压缩器及其传递依赖只在本机或 CI 构建、预览、上传阶段执行。它们不应出现在 `apps/wechat/dist` 或 `services/edgeone` 部署产物中。风险控制是发布机最小权限、上传私钥只从环境变量读取、dry-run 不加载密钥、构建输出执行 secret scan。

### Mini Program runtime

`@tarojs/runtime`、`@tarojs/components`、React 18 适配层以及相关 Taro runtime 代码是正式小程序生产可达依赖。bundle 证据是同轮 formal build 生成的 `apps/wechat/dist/taro.js`、`apps/wechat/dist/app.js`、`apps/wechat/dist/common.js`、`apps/wechat/dist/runtime.js` 和页面 bundle；`scan:secrets:wechat-dist` 只证明未发现约定的秘密/测试标记，不证明 runtime advisory 不可利用。

### EdgeOne runtime

`services/edgeone` 的 Node Functions、Blob 适配层及其生产依赖属于服务端生产可达面。bundle 证据是由 `npm run build:edgeone` 生成的部署产物及 release manifest 中记录的 Node Functions build SHA。会话签发、所有者隔离、输入/输出审核 fail-closed、响应大小/超时上限和日志脱敏是现有缓解，不能替代依赖升级和生产监控。

Expo / React Native 应用是另一套生产运行面，不进入微信小程序或 EdgeOne deployment；其 advisory 仍由 root test、typecheck、web build 和 asset verification 覆盖，需要在移动应用发布前单独处置。

## 发布门槛

每次 formal profile 都必须从 clean artifact 开始，同轮执行 EdgeOne build、Mini Program formal build、source/dist scans、artifact disclosure 比对和 build SHA 记录。任何新增 direct dependency、生产可达 advisory 或 bundle 路径变化都必须更新本文件。
