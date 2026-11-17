# 控制台首页 `home`

## 入口和布局

- `index.html#home` 或 `pages/home.html`。默认白底控制台工作台：快速提问、我的常用 / 推荐、产品动态（大图轮播 + 最新三条）、底部了解平台功能。门户首页使用 `portal.html`，业务数据独立。
- 「我的常用」默认 PPT生成、文档翻译、OCR识别、思维导图生成；兼容旧 `commonIds` 和卡片配置，去重并取四个，不因推荐修改而覆盖。推荐由 [界面管理](interface-management.md) 配置，支持 0–4 项。受角色限制的账号从目录和快捷卡过滤未授权项，默认演示账号才可从未开通入口去申请。

## 提问联动

- `src/pages/home-dashboard.js` + `src/pages/home-knowledge.js`：空白拦截；纯 Enter 或发送按钮提交，输入法确认及 Shift+Enter 不发送。文本去掉首尾空白，最多 16,000 字符。通用 / 知识范围独立于联网搜索开关；联网搜索目前只展示演示开关和提示。
- 知识范围按行业、企业、部门跨分类多选，确定才生效，关闭丢弃草稿。只在知识模式将来源 ID 同问题交给外壳，通用模式不携带旧选择。主壳在合法子页就绪后转交，进入对话并自动发送一次；URL 不带问句/来源。单开首页、未授权或暂不可用时保留输入内容，分别给平台入口或开通流程。后续链路见 [百舸问答](qa.md)。

## 目录与轮播

- `src/pages/landing.js` + `src/feature-config.js`：展示 26 个独立目的地，带子项的模块拆到具体子入口，高质量数据集仍聚合成一项。目录支持切分类、文本搜索、只看可用。搜索跨分类匹配名称、描述、父模块和相关关键词，清空或 Esc 恢复原分类，删除分类时回「全部」。不从匹配某个子项扩散到无关同级项。
- `src/pages/home-carousel.js`：轮播可走左右箭头、圆点、暂停和自动播放；悬停、焦点、隐藏标签、外壳离开时暂停，减少动态效果时默认暂停，只有一张不显示翻页控制。点卡片走内部路由及权限校验，配置位置与字段见 [界面管理](interface-management.md)。
- 产品动态的完整浏览与后台维护见 [产品动态](product-updates.md)。首页不能混用门户「最新动态」、全局公告或情报收藏的数据。

## 文件与验收

`pages/home.html`、`home-dashboard.css`、`src/home-access.js`、`src/home-config.js`（`baige.home-config.v2`）、`src/pages/home-{dashboard,knowledge,carousel,updates}.js`、`src/pages/landing.js`。`tests/home-dashboard.test.cjs`、`tests/feature-directory.test.cjs`、`tests/home-carousel.test.cjs`、`tests/question-handoff.test.cjs` 覆盖允许/拦截、路由唯一性、缓存内页更新、输入法和提问交接。
