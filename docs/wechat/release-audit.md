# SkillScope 依赖安全审计

Review date: 2026-08-10

## 审计结论

`npm audit --omit=optional --json` 返回 125 条 advisory：low 1、moderate 44、high 36、critical 44。这个数字未被降低、过滤或描述为“仅开发依赖”。`npm audit fix --package-lock-only --dry-run` 在 180 秒后未完成并被终止；未运行 `--force`，也没有应用无法审阅的框架降级方案。

当前锁定组合是 Expo 53 / React Native 0.79 / React 19，以及 Taro 4.2.1 / React 18。npm 给出的部分修复会降到旧版 `wx-server-sdk`、跨 Taro/Expo major，或替换整段工具链，不能作为 Task 8 的安全自动修复。正式发布前仍需重新审计并评估替代版本；125 条 advisory 是已知残余风险，不是“已修复”。

## 可达性分类

### Build-only

`miniprogram-ci`、Webpack、Babel、PostCSS、开发服务器、压缩器及其 `adm-zip`、`tmp`、`terser` 等依赖只在本机或 CI 构建/预览/上传阶段执行。它们不应出现在 `apps/wechat/dist` 或 CloudBase 函数目录。风险控制是：发布机最小权限、上传私钥只从环境变量读取、dry-run 不加载密钥、构建输出执行 secret scan。Build-only 不等于无风险，因为恶意输入或受污染依赖仍可在发布机执行。

### Mini Program runtime

`@tarojs/runtime`、`@tarojs/components`、React 18 适配层以及相关 Taro runtime 代码是正式小程序生产可达依赖，不能与 CLI/webpack 一并描述为纯构建链。bundle 证据是同轮 formal build 生成的 `apps/wechat/dist/taro.js`、`apps/wechat/dist/app.js`、`apps/wechat/dist/common.js`、`apps/wechat/dist/runtime.js` 和各页面 bundle；`scan:secrets:wechat-dist` 只证明未发现约定的秘密/测试标记，不证明这些 runtime advisory 不可利用。

### CloudBase runtime

`wx-server-sdk@4.0.2` 及其 `@cloudbase/node-sdk`、`@cloudbase/database`、Axios 等传递依赖会随每个 CloudBase 函数部署，属于服务端生产可达依赖。bundle 证据是 `services/cloudbase/dist/<function>/index.js` 与同目录 `package.json`；构建测试要求凡 bundle 中 `require("wx-server-sdk")` 的函数都声明精确版本 `4.0.2`。npm 建议的 `wx-server-sdk@2.5.3` 降级与当前接口和测试基线冲突，因此未自动应用。现有缓解包括 trusted OpenID、CAS 更新、限额、输入/输出审核 fail-closed、响应大小/超时上限及日志脱敏，但不消除 SDK advisory。

Expo / React Native 应用是本仓库另一套生产运行面，不进入微信小程序或 CloudBase bundle；其 advisory 仍由 root test、typecheck、web build 和 asset verification 覆盖，并需要在移动应用发布前单独做 runtime 风险处置，不能归为 Build-only。

## 处置记录

| Package path | Severity | 分类 | 处置 |
| --- | --- | --- | --- |
| `apps/wechat/node_modules/@tarojs/*`, root `node_modules/@tarojs/*` | moderate/high/critical | Mini Program runtime 与部分 Build-only 工具混合 | 不强制升级；按实际 bundle 拆分评估，正式包同轮重建、扫描并记录 hash。 |
| `node_modules/wx-server-sdk` -> CloudBase/Axios tree | high | CloudBase runtime | 固定 `4.0.2` 并验证每个函数依赖；不接受不兼容降级，保留生产风险。 |
| `node_modules/miniprogram-ci/**` | low/moderate/high/critical | Build-only | 仅显式 preview/upload 使用；凭证不入库，发布机最小权限。 |
| Webpack/Babel/PostCSS/dev-server transitives | moderate/high/critical | Build-only | 不运行生产开发服务器；不使用 `--force`；后续升级框架后重审。 |
| Expo / React Native dependency tree | moderate/high | 独立移动应用 runtime | 不进入微信包；移动应用发布前单独审计，不以 Task 8 微信验证替代。 |

## 发布门槛

每次 formal profile 都必须从 clean artifact 开始，同轮执行 CloudBase build、Mini Program formal build、source/dist scans、artifact disclosure 比对和 hash 记录。任何新增 direct dependency、生产可达 advisory 或 bundle 路径变化都必须更新本文件。
