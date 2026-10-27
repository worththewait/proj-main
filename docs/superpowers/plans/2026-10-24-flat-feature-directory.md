# 独立功能目录实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将首页底部目录实现为效果图中的 27 个独立入口、双列列表及悬停操作。

**Architecture:** 沿用普通 HTML/CSS/脚本、统一 iframe 导航与既有权限服务。行为任务重写首页目录渲染并保留委托导航；主任务负责隔离的目录样式及几何 SVG 图标，分别维护文件后集成。

**Tech Stack:** 原生 HTML/CSS/JavaScript、Node 内置测试，无构建依赖。

**Spec:** `docs/superpowers/specs/2026-10-24-flat-feature-directory-design.md`

## Global Constraints

- 已批准效果图，直接执行；当前目录无 Git 仓库，已备份待改文件到临时目录。
- 不改首页上半部、问答、知识库范围、自定义首页及导航定义。
- 27 项，7+20；数据集资源不拆。默认 24 可进入、3 需申请。
- 搜索和权限按具体入口计算，不留父子重复入口。悬停不改变行高。

## Review Focus

- 仅看已开通与父名称搜索交错时不得泄露或误显示不匹配子项。
- 申请异步完成后正确显示待审批，弹窗关闭焦点回到当前新入口。
- 默认分类、搜索清空与空态重置不丢状态。
- 普通路由和子路由必须传原始真实名称，未开通入口不直接导航。
- 长简介、短桌面、键盘与触摸下仍可识别操作，列表无横向溢出。

## Task 1：扁平目录与行为测试

**Files:** `src/pages/landing.js`、新 `tests/feature-directory.test.cjs`。

**Interfaces:** `#featureGroups`、`#featureResults`、`#featureSearch`、`#featureClear`、`#availableOnly`、`#featureSearchSummary` 保持。每项为 `button.home-directory-item`，含 `data-home-route`、`data-home-child`、`data-tone`；内容 `.home-directory-icon`、`.home-directory-copy`、`.home-directory-name`（strong 及状态）、`.home-directory-description`、`.home-directory-action`。列表容器 `.home-directory-grid`，标题复用 `.home-category-heading`。图标通过 `window.BaigeDirectoryIcons?.icon(name)`，缺失时回退 `BaigeUI.icon`；名称来自现有导航/工具数据。

- [x] 添加并先运行失败测试：27 唯一项/真实子路由；24 项可用过滤；名称及父名称搜索；清空恢复分类；空态重置；实际路由/申请分派及待审批更新/焦点恢复。
- [x] 删除父卡片展开与分组工具汇总逻辑，生成统一的独立入口；内容按批准效果图，保留原权限服务。
- [x] 更新状态后不丢焦点。只有当前目录条目触发通用点击，避免与常用入口重叠监听造成重复导航。
- [x] 新测试及既有全部行为测试通过。

## Task 2：视觉、图标与页面集成

**Files:** `home-dashboard.css`、`pages/home.html`、新 `src/home-directory-icons.js`、`index.html`、`src/data.js`。

- [x] 创建一致的本地 SVG 几何符号，52px 浅色图标底、约 30px 彩色符号。
- [x] 白色目录面，双列无边框条目，40—64px 列间距，名称约 18px、简介 13px；目录标题与分类搜索改为上下两行。
- [x] 预留操作行，hover/focus-visible 浅灰底、蓝标题、操作显现；键盘焦点轮廓、触摸可见操作、减少动态效果。
- [x] 页面引入图标 helper，更新相关缓存参数；没有影响共享页面的样式修改。

## Task 3：浏览器与交付

- [x] 1120px、1440px 检查静态与悬停、行高不跳动、简介截断和标题完整。
- [x] UI 验证搜索、分类、仅看已开通、空态重置、子项导航和申请待审批。
- [x] 独立审查实现，完整测试、语法及 HTML/静态引用检查通过。
- [x] 更新 README、DESIGN 和真实浏览器截图，记录验收结果。


## 验收记录（2026-10-24）

- 新增目录集成测试先失败 7 项，实现后通过；最后全套 47 项测试通过，19 份脚本语法检查通过。
- 14 个 HTML 页面无重复 ID 或缺失的静态 ARIA 引用，98 项本地资源引用均有效。
- 浏览器实际验证：27 项完整显示；默认已开通过滤为 24 项；搜索具体名称、父名称、跨分类查找、清空恢复此前分类及空态重置正确。
- 数据标注平台独立入口进入准确子路由。标准编制打开原权限弹窗，模拟申请后仅该项改为待审批，关闭后焦点恢复对应新按钮；待审批不被当作已开通。
- 鼠标悬停时背景 rgb(244,244,248)、名称 rgb(36,91,255)、操作文字显现；前后 27 行的位置和高度完全一致。键盘聚焦显示相同操作并有轮廓。
- 1120×760 和 1440×900 桌面均为两列，无横向溢出；检查工具与平台列表到底部，所有入口完整。
- 新增本地 SVG 图标 helper；没有新增依赖或改动共享导航、问答、自定义首页行为。
- 独立行为审查无 Important 问题，README 与 DESIGN 已同步。
- 截图：`docs/previews/baige-feature-directory-hover.jpg`、`docs/previews/baige-feature-directory-1120.jpg`、`docs/previews/baige-feature-directory-tools.jpg`。
- 真实浏览器验证通过本地 HTTP 预览完成，原型仍可按普通相对资源离线打开。
