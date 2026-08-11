# SkillScope 外部 smoke checklist

执行人只能在真实 WeChat AppID、登录态、EdgeOne deployment 和测试账号可用后勾选。未执行时保持未勾选，不能在 evidence 中声明通过。

- [ ] preview HTTPS origin 已加入微信 `request合法域名`，session、生成、答题、历史和反馈请求均成功。
- [ ] production HTTPS origin 已加入微信 `request合法域名`，真机请求不依赖开发者工具的域名校验关闭选项。
- [ ] 固定 50 题生成：EdgeOne job queued/running/completed，进入答题页前本地已有 draft。
- [ ] HTML/XML、非 JSON、内容审核阻断和 120 秒超时均显示可理解错误，未保存残缺题目。
- [ ] 隐私拒绝时服务端拒绝生成；同意后设置、历史和 Blob 同步恢复。
- [ ] iOS/Android 真机覆盖安全区、键盘避让、loading、离线答题、结果和错题复盘。
- [ ] 记录 EdgeOne project、deployment URL、build SHA、截图链接、版本号和回滚版本；不记录密钥、token、OpenID、用户全文输入或答案。
