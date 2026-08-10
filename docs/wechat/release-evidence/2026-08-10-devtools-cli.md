# 2026-08-10 微信开发者工具 CLI 记录

CLI: C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat
Project: E:\Project\technicalEvaluation\.worktrees\wechat-mini-program\apps\wechat

Status: 微信开发者工具已安装，但 CLI 用户态未初始化。

```text
C:\Users\Administrator\AppData\Local\微信开发者工具\User Data does not exist; DevTools has not completed first-run initialization for this user.
```

## Skipped Commands

- `islogin`、`open --project`、`compile --project` 已作为外部 blocker 跳过，避免重复触发长时间 setlocal recursion 或 `.cli` 初始化失败。
- 先在微信开发者工具 GUI 中完成首次启动/登录并生成 User Data `.cli` 后，再重新运行 `npm run wechat:devtools:smoke`。

## 结论

- 未导入/编译/截图/真机验证；缺少 DevTools CLI 初始化态、真实 AppID 和登录态。
