# 门户留言咨询 `portal-consult`

## 前台

- 只有 `portal.html` 加载 `src/portal-contact.js` 和横幅按钮，更多动态、详情、收藏和控制台不带这个入口。控制台客服里的「系统反馈」是另一套回执演示。
- 必填咨询类型、姓名、单位、联系电话、咨询内容（最多 50 字）。类型四项：合作咨询、问题咨询、使用反馈、功能建议。电话允许数字和常用分隔符且 7–20 字符，缺字段时显示错误。提交成功关闭/重置表单，取消仅关闭，Esc 或遮罩可关闭。

## 后台和数据

- `admin.html#consult` → `pages/consult-admin.html` / `src/consult-admin.js`，查看咨询时间、类型、姓名、单位、联系电话、正文；按日期区间、类型、姓名、电话和正文条件筛选，10 条/页，导出符合条件的数据为 CSV；使用 `BaigeConsultStore`（`src/portal-consult-store.js` 的 `baige.portal.consults.v1`）。
- 留言从前台写当前浏览器，后台读取共享的数据源。不实际发送电话/邮件通知，字段定义可记录，真实姓名电话正文不要复制到记忆。

## 验收

`tests/portal-contact.test.cjs`：只在门户首页加载、表单字段/枚举、前台提交后台可见、后台筛选与导出。
