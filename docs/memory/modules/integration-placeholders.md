# 尚未接入的菜单入口 `integration-placeholders`

- `src/data.js` / `src/pages/placeholder.js` 定义集成中落地方式，目标可导航不代表业务已提供。`qa` 的智能问数占位另见 [百舸问答](qa.md)，智能工具的集成中入口另见 [智能工具](smart-tools.md)。
- 百舸分析 `pages/analysis.html` 为「正在集成」。前沿工具 `pages/frontier.html` 按 `全球鹰 / 智研通` 显示选中子项和父模块说明；智研通是默认未开通演示项。智能开发平台 `pages/platform.html` 为「正在集成」。数据平台 `pages/data-platform.html` 有数据标注平台、爬虫平台、数据中台，选中子项只改落地标题。数智系统 `pages/digital.html` 有标准编制、专利编制两张独立入口页 `pages/digital-standard.html`、`pages/digital-patent.html`，目前展示工作区介绍和集成提示。
- 相关模块仍有真实路由、目录分类、图标、菜单授权；不要给占位入口编造已上线流程、数据、效果。实现独立业务后建立专属记忆，把对照关系改为新模块链接。验收 `tests/feature-directory.test.cjs`、`tests/sidebar-permissions.test.cjs`、`tests/question-handoff.test.cjs`，重点核对子路由准确进入与角色可见性。
