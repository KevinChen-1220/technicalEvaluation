# 2026-08-10 微信开发者工具 CLI 记录

CLI: C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat
Project: E:\Project\technicalEvaluation\apps\wechat

## islogin

Command: C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat islogin --port 42905
Status: exit 0

```text
{"login":true}
- initialize
(node:24540) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `微信开发者工具 --trace-deprecation ...` to show where the warning was created)
√ IDE server has started, listening on http://127.0.0.1:42905
- preparing
√ islogin
```

## open project hidden

Command: C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat open --project E:\Project\technicalEvaluation\apps\wechat --port 42905
Status: exit 0

```text
- initialize
(node:26020) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `微信开发者工具 --trace-deprecation ...` to show where the warning was created)
√ IDE server has started, listening on http://127.0.0.1:42905
- preparing
√ open
```

## auto project trust

Command: C:\Program Files (x86)\Tencent\微信web开发者工具\cli.bat auto --project E:\Project\technicalEvaluation\apps\wechat --trust-project --port 42905
Status: exit 0

```text
- initialize
(node:21084) [DEP0040] DeprecationWarning: The `punycode` module is deprecated. Please use a userland alternative instead.
(Use `微信开发者工具 --trace-deprecation ...` to show where the warning was created)
√ IDE server has started, listening on http://127.0.0.1:42905
- preparing
- Fetching AppID () permissions
√ Using AppID: wx31dd3d7448aac8e3
√ auto
```

## 结论

- 该文件记录 CLI 的真实返回；`islogin`、`open --project` 和 `auto --trust-project` 均需 exit 0 才能视为 DevTools CLI smoke 通过。
- 该 smoke 只证明本机 DevTools 已登录、项目可打开并被信任；不证明真机、体验版、正式 request 合法域名或微信审核通过。
