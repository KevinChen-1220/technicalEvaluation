# SkillScope 微信小程序外部烟测 checklist

执行人只能在真实 WeChat AppID、登录态、CloudBase 环境和测试账号可用后勾选。未执行时保持未勾选，不能在 evidence 中声明通过。

- [ ] 新用户首次进入，看到隐私政策 gate，拒绝后不能生成，接受后记录版本。
- [ ] 50 题生成：CloudBase job queued/running/completed，进入答题页前本地已有 draft。
- [ ] 100 题生成：后台分批完成，不依赖一次超长客户端请求。
- [ ] 中断 polling：退出再进入后可以继续查询或在历史中看到 draft。
- [ ] 离线答题缓存：断网选择答案，本地立即保存，恢复网络后同步。
- [ ] App 重启：已答题目、pending 状态、隐私同意版本保持。
- [ ] 跨设备冲突：设备 A/B 编辑同一 draft，旧 revision 不覆盖新答案。
- [ ] 历史恢复：点击 draft 从第一道未答题开始。
- [ ] 未完成提交：显示剩余题数，不能提交。
- [ ] 完成提交：服务端评分，结果页显示 score、知识点、错题。
- [ ] 已完成历史：重新打开只展示答案、正确答案和解析，不允许继续改答案。
- [ ] 投诉/反馈：report route 可提交，不泄露 OpenID。
- [ ] 安全区：iPhone 底部 tab 与 safe area 背景一致。
- [ ] 键盘避让：底部输入框聚焦时内容可见。
- [ ] loading/cancel/retry：生成按钮内 loading、取消、失败重试状态一致。
- [ ] 隐私/设置：服务运营主体、模型披露、备案、隐私版本和投诉入口可见。
- [ ] 图片失败回退：HTTPS fixture 图片失败时显示替代内容。
- [ ] 宽表格横向滚动，柱状图在窄屏不重叠。

Screenshot set: see `docs/wechat/release-evidence/screenshot-naming.md`.
