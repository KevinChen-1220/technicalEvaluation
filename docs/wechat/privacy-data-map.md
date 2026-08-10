# SkillScope 微信小程序隐私数据地图

| 数据 | 来源 | 用途 | 存储 | 保留 |
| --- | --- | --- | --- | --- |
| 微信 OpenID | 微信登录态 | 记录归属、同步历史、限流 | CloudBase `_openid` | 随用户记录保留 |
| 测评主题/补充说明 | 用户输入 | 生成试题、内容安全审核 | `generation_jobs.request` | 作业过期后清理 |
| 草稿试题/未完成作答 | 模型输出、用户作答 | 继续作答 | `assessments.paper/answers`，`status=draft` | 最后更新后默认 30 天，可通过 `DRAFT_ASSESSMENT_RETENTION_DAYS` 配置 |
| 已完成试题/作答/成绩 | 模型输出、用户作答 | 历史、结果与复盘 | `assessments.paper/answers/result`，`status=completed` | 完成后默认 365 天，可通过 `COMPLETED_ASSESSMENT_RETENTION_DAYS` 配置 |
| 隐私同意版本/时间 | 用户点击同意 | 生成 gate 和合规记录 | `user_settings` | 随设置记录保留 |
| 投诉反馈 | 用户提交 | 处理题目、内容或隐私问题 | `user_reports` | 默认 365 天，可配置 |
| 配额/短窗限流桶 | 服务端事务 | 防滥用 | `daily_generation_quotas` / `generation_rate_limits` | 默认 2 天内清理 |

首个版本不收集头像、昵称、手机号、通讯录、位置、相册、相机、麦克风、剪贴板数据。CloudBase 客户端数据库直写全部关闭，敏感写入只能通过受信云函数完成。

定时保留任务每类数据每次最多删除 `RETENTION_BATCH_SIZE` 条；草稿使用 `updatedAt` 判断是否长期未使用，用户继续作答会刷新该时间并重新计算保留期。
