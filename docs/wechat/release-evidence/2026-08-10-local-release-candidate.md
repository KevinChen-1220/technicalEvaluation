# 2026-08-10 SkillScope 本地发布候选证据

## Scope

本文件记录 Task 8 的本机可执行验证范围：共享 core、Expo、WeChat/Taro、CloudBase、隐私披露、CloudBase 规则、发布 profile、secret scan、miniprogram-ci dry-run、微信开发者工具 CLI 状态和 dependency audit。

## Environment Inventory

- Workspace: `E:\Project\technicalEvaluation\.worktrees\wechat-mini-program`
- Branch: `codex/wechat-mini-program`
- WeChat DevTools: 已安装 2.02.2607271，CLI 路径由 `WECHAT_DEVTOOLS_CLI` 或默认安装路径读取。
- WeChat AppID: 待配置。
- CloudBase production env id: 待配置。
- Upload private key: 待配置，禁止提交到仓库。

## Verification Matrix

| Area | Local command | Current status |
| --- | --- | --- |
| Shared core / Expo tests | `npm test -- --runInBand` | 通过：34 suites / 223 tests |
| WeChat tests/typecheck/build | `npm run test:wechat -- --runInBand`, `npm run typecheck:wechat`, `npm run build:weapp` | 通过：15 suites / 73 tests；Taro production build 5.80s |
| CloudBase tests/typecheck/build | `npm run test:cloudbase -- --runInBand`, `npm run typecheck:cloudbase`, `npm run build:cloudbase` | 通过：17 suites / 131 tests |
| Web/asset checks | `npm run build:web`, `npm run verify:web`, `npm run verify:assets` | 通过 |
| Release candidate | `npm run verify:wechat-release` | 通过，详见 `2026-08-10-command-output.md` |
| miniprogram-ci | `npm run wechat:ci:dry-run -- --version 0.0.0-task8 --description "Task 8 dry run"` | 通过；无 AppID/私钥要求，私钥路径不输出 |
| Formal disclosure gate | `npm run verify:wechat-release:formal` | 仓库 production template 按预期在构建前失败；临时有效 disclosure 完成 clean same-run formal 验证后已删除 |
| DevTools/real device | `npm run wechat:devtools:smoke` and manual checklist | 外部 blocker：DevTools User Data `.cli` 未初始化，需要登录/AppID/真机 |

## Artifact Hashes

- `apps/wechat/dist/app.json`: `839821f2c2685ee8656f7b543dae00d7f4511ebc74bf23ffd30253d1d127c6c6`
- `apps/wechat/dist/app.js`: `dba05d0faf7f47415b297b2318d669351cb320041f2418fe7a7fbb4f6ab35c08`
- `services/cloudbase/dist/cloudbaserc.json`: `74fcdba47b7f6ab698f21c207149ff95470fcff06ef206d0b4331c20607c2f10`

完整命令尾部输出见 `docs/wechat/release-evidence/2026-08-10-command-output.md`。

## External Blockers

- 真实微信小程序 AppID、账号登录态、上传私钥和 IP 白名单。
- 生产 CloudBase env id、函数部署权限、数据库规则/索引发布权限。
- 真实模型服务与生成式 AI 备案/登记、微信隐私声明、小程序备案和审核主体材料。
- iOS/Android 真机截图、体验版/正式审核通过记录。
