# SkillScope 依赖安全审计

Review date: 2026-08-10

## 处理原则

- 只自动修复不会破坏 Expo 53、React Native 0.79、React 19、Taro 4.2.1、React 18 小程序组合的 direct 或兼容升级。
- 不使用 `npm audit fix --force`，避免把 Taro/Expo 构建链强制升级到不兼容版本。
- Mini Program 正式包通过 source/dist secret scan 阻断模型密钥、内容安全密钥、上传私钥路径、OpenID 和服务端环境变量名泄露。

## 当前结论

- `miniprogram-ci@2.1.31` 为 Task 8 新增 devDependency，只用于本机/CI 发布脚本；dry-run 不需要上传私钥，preview/upload 从环境变量读取真实 AppID 和私钥路径。
- `npm audit --omit=optional --json` 于 2026-08-10 运行，退出码为 1，统计为 low 1、moderate 44、high 36、critical 44、total 125。
- `npm audit fix --package-lock-only --dry-run --ignore-scripts --no-audit --no-fund --json` 在 180 秒后仍未返回，停止其遗留进程；未采纳不可审阅的自动修复计划。
- 仓库已有 advisories 多数来自 Expo/Taro/Webpack/Babel/PostCSS/miniprogram-ci 等开发构建链。它们不进入 CloudBase 运行时函数，也不会被打入正式小程序业务包。
- 生产运行面仍以 CloudBase 函数 bundle、微信小程序 dist、服务端环境变量和数据库规则为主；对应 bundle 会在 `verify:wechat-release` 中重新构建并扫描。

## npm audit 处置表

| Package path | Severity | Production reachability | Disposition |
| --- | --- | --- | --- |
| `apps/wechat/node_modules/@tarojs/*`, root `node_modules/@tarojs/*` | moderate/high/critical | WeChat build tooling and Taro runtime dependency tree; exact Taro 4.2.1 family is required by the implementation. | Not auto-fixed. npm suggests downgrades to 3.x/1.x or incompatible package changes, which would break the pinned Taro 4.2.1/React 18 Mini Program stack. Mitigation: production `dist` is rebuilt and scanned; no model secrets or fixture code may remain. |
| `node_modules/react-native` and Expo CLI/config chain | moderate/high | Expo development/build tooling and React Native app runtime, separate from WeChat formal package. | Not auto-fixed. npm suggests React Native 0.72 or Expo 57 major changes, outside Task 8 and incompatible with the current Expo 53 baseline. Mitigation: Expo tests/typecheck/web build/asset checks stay in release verification. |
| `node_modules/wx-server-sdk` -> `@cloudbase/node-sdk`/`@cloudbase/database`/`axios` | high | CloudBase server runtime dependency installed in function bundles as pinned `wx-server-sdk@4.0.2`. | Not auto-fixed. npm suggests downgrade to `wx-server-sdk@2.5.3`, conflicting with the Task 3/4 SDK boundary and CloudBase function tests. Mitigation: functions never expose provider secrets, use trusted context, bounded HTTPS moderation, redacted logs, CAS writes, and deployment smoke remains external. |
| `node_modules/miniprogram-ci/**` including Babel, `adm-zip`, `terser`, `tmp`, `protobufjs`, `uuid` | low/moderate/high/critical | Dev-only preview/upload automation. Not bundled into Expo, CloudBase functions, or WeChat production dist. | Accepted for Task 8 because `miniprogram-ci@2.1.31` is the latest npm version observed on 2026-08-10 and many nested findings have `fixAvailable: false`. Mitigation: dry-run does not load credentials, preview/upload require explicit env, and private key paths are redacted. |
| `webpack`, `webpack-dev-server`, `serialize-javascript`, `swiper`, `request`, `tough-cookie`, `qs`, `undici`, `tar` transitives | moderate/high/critical | Mostly development server/build chain transitives; some are nested under Taro/miniprogram-ci/Expo. | No safe isolated direct upgrade identified. Force fixes would move framework majors. Mitigation: do not run dev servers in production; release verification rebuilds production artifacts and scans compiled output. |

## 后续审计要求

每次准备 formal profile 前都要重新运行 `npm audit --omit=optional --json`，并把新增 direct dependency 或生产可达 dependency 的结论写入本文件。
