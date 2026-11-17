# 界面管理 `interface-management`

## 入口与职责

- `admin.html#interface` → `pages/interface-admin.html`，整合推荐功能、轮播图、产品动态、功能展示、分类体系，页签徽标显示实际配置数量。页签支持 `#recommend/#carousel/#updates/#features/#categories`；旧后台 `#features/#settings` 和 `?view=` 继续路由。原 `pages/feature-admin.html`、`pages/home-settings.html` 为兼容入口。
- `src/pages/interface-admin.js` 管页签和数量；`src/pages/home-admin.js`、`src/pages/home-carousel-editor.js` 管首页三项；`src/pages/feature-admin.js` 管功能及两套分类。后者是展示元数据，运行时权限由 [功能权限](function-access.md) 和 [角色管理](role-administration.md) 控制。

## 首页配置

- `BaigeHomeConfig`（`src/home-config.js`）分段保存 `recommendedIds/slides/updates` 到 `baige.home-config.v2`；迁移旧设置时不覆盖可用记录，保存一个分段不丢另两段。推荐从目录搜索/筛选，0–4 个、不重复，设置清空时前台不会回填四项；「我的常用」另有规则。
- 轮播可增加、删除、排序、上传裁剪、预览和保存。`BaigeHomeCarouselModel` 规定至少 1 张最多 8 张，非空标题最多 32 字、可空说明最多 80 字。**当前原型每张必须选择一个白名单内部功能目的地**；可选择未开通功能，首页点击时仍走权限策略。不支持任意外链。默认三张走问答、知识库和工具目录。
- 产品动态的发布、查找和跳转规则见 [产品动态](product-updates.md)。

## 功能展示与分类

- `BaigeFeatureConfig`（`src/feature-config.js`）从既有路由与工具得到固定注册表：编辑内置或上传图标、功能描述（不超过 160 字，无换行/控制字符）、首页分类、工具分类（仅工具）、可选大图。不能通过这页新建路由、改功能名称或变更权限；大图只由智能工具的热门区消费，配置大图不把条目加入热门。首页和智能工具展示共享图标/描述，子菜单和工作区标签的线性图标另由公共图标代码控制。
- `src/home-card-images.js` 提供 PNG/JPEG/WebP、安全 Data URL、10MB 源体积上限与 canvas 压缩；自定义图标方形，大图走卡片/轮播裁剪。若存储满或上传失败应保留可重试的编辑内容；不能用含脚本的图片字符串代替上传。文档翻译与文本翻译为独立内置图标，旧统用翻译图标会按功能修正。
- 两套分类独立：`home` 默认「知识与研究／工具与平台」，`tools` 默认「文档处理／写作创作／研究辅助」。支持新增/改名/删除，去重，最多 50 类，最后一类不可删除。有成员的分类必须迁入另一已有分类，迁移和删除同一次保存；空类可直接删除。`baige.feature-config.v1` 持久化，由订阅及 `storage` 事件刷新目录、推荐、热门工具、快捷设置，保留已开工具状态。

## 验收锚点

`tests/interface-admin.test.cjs`、`tests/feature-admin.test.cjs`、`tests/feature-config.test.cjs`、`tests/feature-directory.test.cjs`、`tests/feature-tools.test.cjs`、`tests/home-config.test.cjs`、`tests/home-carousel-model.test.cjs`、`tests/home-carousel-editor.test.cjs`、`tests/home-card-images.test.cjs`。覆核脏编辑取消、两种分类和使用中的迁移、限额与本地存储失败、前台缓存页刷新、文档/文本翻译图标区分。
