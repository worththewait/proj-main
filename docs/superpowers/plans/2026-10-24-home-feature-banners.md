# 常用功能宽图与自定义实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将常用功能改为铺满内容宽度的图片入口，并支持逐项上传图片、编辑图上文字、预览及持久保存。

**Architecture:** 保持现有独立 HTML、保留式 iframe 与普通脚本架构。主任务负责页面、CSS 和三个默认 SVG 宽图；行为子任务独立负责首页渲染、设置草稿、图片处理和测试，按下面接口集成。

**Tech Stack:** HTML/CSS、浏览器 FileReader/Image/Canvas、localStorage、Node 内置测试。

**Spec:** `docs/superpowers/specs/2026-10-24-home-feature-banners-design.md`

## Global Constraints

- 已批准需求直接实施，无新增依赖，无真实服务器上传。
- 仅修改首页相关页面／资源；完整目录及现有问答、权限语义保持。
- 旧 `baige.homepage.v1` 兼容，新增配置可选；失败不得静默谎报保存。
- 当前目录不是 Git 仓库，直接在用户工作区编辑，修改前已备份到临时目录。

## Review Focus

- 取消、更换常用项和异步图片解码交错时，不得覆盖已保存内容或将旧上传写入新草稿。
- 不合法文件、过大文件、解码失败、存储不足均有反馈和恢复路径。
- 自定义文字和图片必须经验证，避免 HTML 注入或外部图片请求。
- 白色或复杂自定义图片上文字保持可读，长标题和窄桌面不溢出。
- 无权限／待审批卡片仍走原有流程；预览内不能产生真实功能跳转。

## Task 1: 设置与图片行为（行为子任务）

**Files:** `src/pages/home-dashboard.js`；可新增 `src/home-card-images.js`；`tests/home-dashboard.test.cjs`；必要的新图片行为测试。

**Interfaces:** 页面提供 `#homepageCardSettings` 容器，位于常用项选择器之后。默认素材为 `home-banner-language.svg`、`home-banner-document.svg`、`home-banner-research.svg`，均在 `assets/` 且为 720×360。

- [x] 添加旧配置兼容、自定义文字／图片持久化、取消不落盘、恢复默认草稿、无效图片／上传竞态测试，并确认新行为在旧实现下失败。
- [x] 扩展现有配置和渲染，保持旧快捷提问和权限处理。
- [x] 卡片输出 `.home-common-card` 按钮，内部 `.home-common-visual` 含图片和 `.home-common-title`，下方仅 `.home-common-description`。上传图的 visual 加 `.is-custom-image`；权限标签放入 visual；默认不显示进入文字。
- [x] 设置预览使用 `.home-card-preview.home-common-visual`，同样包含图片与标题。设置项 `.home-card-setting`，内容区 `.home-card-setting-controls`，操作区 `.home-card-setting-actions`，字段 `.home-card-text-field`，提示 `.home-card-upload-note`，整项标题 `.home-card-setting-heading`。
- [x] 本地上传 PNG/JPEG/WebP ≤10MB，规范到约 1200×600、编码后每图不超过约 260KB 字符；文字 1—16 字符，保存前验证。
- [x] 等待正在处理的图片再保存；保留草稿并显示错误。图片 helper 若拆分则通过普通 script 在 dashboard 前加载。
- [x] 运行新测试与全部现有行为测试，报告测试数及真实限制。

## Task 2: 视觉与集成（主任务）

**Files:** `pages/home.html`、`home-dashboard.css`、三个 `assets/home-banner-*.svg`、`index.html`、`src/data.js`。

- [x] 从已有 SVG 图形延伸默认宽图，左图右文，右侧保留清晰文字区域；原工具页素材不变。
- [x] 三列全宽、间距 32px、约 2:1 图片、下方一行说明，无白色外壳。标题与查看全部沿全页边界。
- [x] 设置弹窗新增卡片设置区域和上传提示，复用当前交互约定；短窗口内滚动，底部保存／取消保持可见。
- [x] 按行为接口样式化图片、文字、预览、上传和默认恢复，补齐焦点／悬停／错误／处理中状态。
- [x] 更新相关本地资源版本，检查静态资源引用。

## Task 3: 浏览器与交付（主任务）

- [x] 1120px 与 1440px 桌面检查全宽、文字对比、单行说明、无横向溢出。
- [x] UI 验证上传、改字、预览、取消、保存、刷新、逐项恢复及全局默认恢复。
- [x] 验证普通入口与未开通入口仍工作；问答现有测试通过。
- [x] 独立复核图片与设置代码，修复实际问题；更新 README／DESIGN 和截图。


## 验收记录（2026-10-24）

- 40 项 Node 行为测试全部通过；18 份脚本语法检查通过。14 个 HTML 页面无重复 ID 或缺失的 ARIA 引用，97 项静态本地引用均存在，三个动态默认宽图文件均存在。
- 通过本地 HTTP 预览实际选择 PNG 图片，浏览器输出 1200×600 JPEG；改字即时更新，保存并刷新后图片与文字恢复。
- 实际验证单项恢复后取消、全局恢复后取消均保留已保存设置；最终全局恢复并保存，交付默认首页配图。
- 16 个中文字在 210×105 预览内完整显示；1120×620 窗口下弹窗内部滚动，底部保存与取消可见。
- 1120 与 1440 桌面全宽三等列、32px 间距，无横向溢出；OCR 入口进入现有工具页签，标准编制入口显示原申请弹窗。
- 两项独立只读审查完成。修复上传控件默认样式、设置标题多余外边距和长名称末行单字的问题；未发现阻断交付的持久化或上传竞态缺陷。
- 截图：`docs/previews/baige-home-banners.jpg`、`docs/previews/baige-home-banners-1120.jpg`、`docs/previews/baige-home-banner-settings.jpg`。
- README 与 DESIGN 已更新。本次真实浏览器验证通过 HTTP 预览完成；仍使用普通相对资源与脚本加载，不新增服务或构建依赖。
