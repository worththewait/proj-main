# 功能管理 Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development. Keep the existing checkout and agent branch; do not commit or contact remotes during implementation.

**Goal:** 在现有后台新增功能管理，编辑现有 27 项功能的图标、大图及两套分类，并在同浏览器前台生效。

**Architecture:** 使用独立的 `BaigeFeatureConfig` 本地配置模型，以稳定功能 ID 关联原导航，不改变路由、权限和功能名称。后台列表与编辑面板消费同一模型；首页目录、常用/推荐和智能工具在激活或收到存储变更时重新读取。

**Tech Stack:** 项目原生 HTML/CSS/JavaScript、localStorage、Node 原生测试、CUA 浏览器验证。

**Spec:** 用户本轮已批准的聊天方案与四项回答。

## Global Constraints

- 首页分类与工具分类分别管理；默认保留现有两套分类及 27 个独立功能。
- 支持分类新增、改名、删除；有成员时必须迁入另一个分类；每套至少保留一个分类。
- 每项功能可配置图标和大图，大图仅智能工具现有三个热门工具入口使用。不得将目录改成大图卡片。
- 功能名、路由及权限规则保持原状；同名但不同路由的功能不可合并。
- 内置图标选择及本地栅格图片上传；不接受自定义 SVG/HTML 或远程图片地址。
- 保存失败保留草稿；取消/关闭未保存编辑需保护；图片处理期间不能保存。
- 保留前一轮未提交的问答改动。

## Review Focus

1. 被删除的已使用分类应原子迁移，不能丢失功能或改变路由。
2. 存储损坏/不可用/配额不足应回退默认或明确失败，不能假报成功。
3. 同名的智能工具与数智系统入口必须独立保存。
4. 已缓存的首页和工具页在后台保存后应更新；已打开工具工作区不得被清空。
5. 关闭、取消、连续选择图片及切换功能时，草稿和异步图片处理不能串项。

## Shared Interface

`src/feature-config.js` 暴露 `window.BaigeFeatureConfig`：

- `storageKey`; `defaults()` / `read()` 返回 `{version:1,categories:{home:[{id,label}],tools:[{id,label}]},features:{[id]:{icon,iconImage,image,homeCategory,toolCategory}}}`。
- `catalog(config = read())` 返回现有全部功能的有效元数据，含 `id,route,child,name,description,icon,iconImage,image,homeCategory,toolCategory,homeCategoryLabel,toolCategoryLabel,tone,isTool,usesImage`。
- `idFor(route, child = '')` / `get(id, config = read())` 进行稳定定位；沿用 `tool:名称`、`route:路由`、`route:路由:子项`，问答首项为 `route:qa`。
- `iconMarkup(entry)` 输出白名单内置图标或经过验证的图片图标，图片类名 `feature-custom-icon`。
- `saveFeature(id, patch)`；`addCategory(scope,label)`；`renameCategory(scope,id,label)`；`deleteCategory(scope,id,targetId)`：验证、合并最新配置、写入成功后返回配置，失败抛出可读错误。
- `subscribe(listener)` 返回取消函数，监听相关 storage / 本页保存事件。
- `iconOptions` 为 `{id,label}` 数组，来自项目已有业务图标集。
- 分类 scope 固定 `home` / `tools`；工具分类不适用于非工具项，工具默认分类 ID 为 `documents` / `writing` / `research`。

### Task 1: 共享配置及图片处理

**Files:** `src/feature-config.js`, `src/home-card-images.js`, `tests/feature-config.test.cjs`, relevant image tests.

- [ ] 写行为测试并确认失败：默认完整性、独立 ID、编辑持久化、分类增改删及成员迁移、无效输入、存储失败。
- [ ] 实现上述接口；默认图标以首页为准（提示词生成 bulb）。默认大图来自三个热门工具资产，其余为空。
- [ ] 扩展现有图片处理器支持方形图标，保留原轮播和宽图行为。
- [ ] 跑所属测试；回报 API 与验证证据。

### Task 2: 后台页面

**Files:** `pages/feature-admin.html`, `feature-admin.css`, `src/pages/feature-admin.js`, `admin.html`, `admin.js`, `tests/feature-admin.test.cjs`.

- [ ] 先定义并验证管理操作测试；不要写镜像 CSS 测试。
- [ ] 导航新增“功能管理”；页面功能列表 / 分类管理两页签。
- [ ] 功能列表搜索、两维分类筛选、10 项分页；表格展示图标、名称、分类、大图缩略图及编辑操作。
- [ ] 编辑右侧面板：内置/上传图标、大图上传/恢复默认、所属分类及预览、保存/取消；本地演示范围明确。
- [ ] 两套分类增改删，显示使用数量，删除占用分类时选择迁入分类；处理空态、错误、焦点及未保存草稿。
- [ ] 跑所属测试，等待集成浏览器验证。

### Task 3: 前台接入

**Files:** `src/pages/landing.js`, `src/pages/home-dashboard.js`, `src/home-config.js`, `src/pages/smart-tools.js`, `pages/home.html`, `pages/smart-tools.html`, `styles.css`, relevant tests.

- [ ] 先验证现有前台行为基线，并为分类/图标/热门图同步增加有效回归测试。
- [ ] 插入共享模型加载；无配置时保留原布局与权限导航。
- [ ] 首页目录动态读取分类与功能覆盖；常用/推荐同步图标；分类检索支持改名。
- [ ] 智能工具动态分类、列表/详情图标及三个热门图同步。storage 或激活刷新目录时保留搜索及已打开工具工作区。
- [ ] 跑相关测试并回报。

### Task 4: 集成验证与交付

- [ ] 独立代码审查模型、编辑流程、前台同步与持久化。
- [ ] 全部 `node --test tests/*.test.cjs` 通过；`git diff --check` 通过。
- [ ] CUA 验证：后台导航、编辑/取消/保存、图片上传、分类新增/改名/迁移、前台同步、刷新保持；1280 桌面与项目最小宽度。
- [ ] 保存后台列表、编辑和前台效果截图，按用户要求提供入口、变更及真实验证结果。
