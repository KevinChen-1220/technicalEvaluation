# SkillScope 截图命名规范

命名格式：`YYYY-MM-DD_<profile>_<platform>_<device>_<flow-step>.png`

示例：

- `2026-08-10_trial_ios_iphone-15_generate-privacy-consent.png`
- `2026-08-10_trial_ios_iphone-15_answer-keyboard-avoidance.png`
- `2026-08-10_trial_android_pixel-8_history-resume-first-unanswered.png`
- `2026-08-10_trial_android_pixel-8_result-wrong-question-page-2.png`

规则：

- `profile` 只能是 `development`、`trial` 或 `formal`。
- `platform` 只能是 `ios` 或 `android`。
- 不上传包含用户 OpenID、真实手机号、模型 API Key、上传私钥路径或后台 token 的截图。
- DevTools fixture 截图必须在 evidence 中明确标为 fixture，不能作为 formal 真机通过证据。
