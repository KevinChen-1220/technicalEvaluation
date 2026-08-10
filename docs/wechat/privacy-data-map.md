# SkillScope 微信小程序隐私数据地图

| 数据 | 来源 | 用途 | 存储 | 保留 |
| --- | --- | --- | --- | --- |
| 微信 OpenID | 微信登录态 | 记录归属、同步历史、限流 | CloudBase `_openid` | 随用户记录保留 |
| 测评主题/补充说明 | 用户输入 | 生成试题、内容安全审核 | `generation_jobs.request` | 作业过期后清理 |
| 生成试题 | 模型输出 | 作答与复盘 | `assessments.paper` | 默认 365 天，可配置 |
| 作答记录/成绩 | 用户作答 | 继续作答、历史与结果页 | `assessments.answers/result` | 默认 365 天，可配置 |
| 隐私同意版本/时间 | 用户点击同意 | 生成 gate 和合规记录 | `user_settings` | 随设置记录保留 |
| 投诉反馈 | 用户提交 | 处理题目、内容或隐私问题 | `user_reports` | 默认 365 天，可配置 |
| 配额/短窗限流桶 | 服务端事务 | 防滥用 | `daily_generation_quotas` / `generation_rate_limits` | 默认 2 天内清理 |

首个版本不收集头像、昵称、手机号、通讯录、位置、相册、相机、麦克风、剪贴板数据。CloudBase 客户端数据库直写全部关闭，敏感写入只能通过受信云函数完成。
