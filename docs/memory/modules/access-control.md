# 控制台访问控制与演示账号

## 入口、身份和权限来源

- `src/data.js` 暴露 `BaigeData` 导航、工具、知识库目录，并由 `BaigePermissions` 集中判断 `canOpen(route, child)`。平台默认账号使用原型基础权限和 [功能与数据权限申请](function-access.md) 的批准结果。默认基础规则限制百舸问答的智能问数和前沿工具的智研通，批准项按当前平台账号邮件开通具体 route／child。父模块可进入表示至少一个子入口可开，不代表整组授权。
- 控制台个人中心「切换演示账号」从 [用户管理](user-administration.md) 的正常账号中选一个，列表显示当前账号和生效角色。用 `index.html?iam-account=<用户ID>#home` 进入，选中的账号存在当前标签页 `sessionStorage` 的 `baige.iam.client-account`，刷新或在同一标签页重新进入控制台可恢复，选择默认演示账号则清除。`?iam-user=<用户ID>` 为单独权限预览上下文，优先于常规账号选择，顶栏提供「退出预览」。账号 `normal` 才显示可用角色与菜单，停用／删除提示不可访问。普通演示账号的六项菜单中，「权限申请」「快捷入口设置」「后台系统」在 IAM 账号模式隐藏。
- 三种身份彼此独立：后台「演示身份」指定发起或审核申请的 `BaigeIamStore.actor()`，客户端 IAM 账号指定路由菜单使用哪个 `userId`，个人权限申请的「当前人员」指定旧权限工作流按哪个申请人邮件查看并提交。IAM 登录上下文不使用旧工作流批准的功能项，不因切换查看者而切换已打开控制台的身份。

## 生效授权与菜单键

- `BaigeIamStore.effectiveMenus(userId)` 读取同浏览器正式 `user.roleIds`，汇总所有正常角色的菜单，去重并过滤预设后台权限。须送审的角色变更与用户角色变更在批准后进入对应字段，零成员角色纯菜单和无角色账号启停可直改。正常账号默认可打开首页。账号停用、删除或角色停用立即减少可访问范围，停用账号连默认首页也关闭。
- 菜单键从导航生成，无子菜单用 route，有子菜单用 `<route>:<child>`。`subnav:false` 路由在菜单配置中按模块授权。兼容历史组级键，`tools` 对应智能工具组，旧 `qa` 只覆盖「对话」而不授予「智能问数」。后管系统入口及 `review`、`system` 等后台特权与可配置客户端菜单隔离。`src/iam-menu-catalog.js` 的 `groups` 复用首页功能分类，`expand` 兼容旧权限键，`tree` 和 `grantedGroups` 供编辑器、审批对比与实时菜单列表复用。

## 路由与同步

- `src/app.js` 外壳在处理首次哈希、后退／前进、侧栏、页面消息和深链前校验路由及权限。已打开页面保存在 iframe，切换页面复用其输入和标签。若首次目标无权且首页可用，落回首页并提示；历史路由无权时保留之前页并恢复地址。默认账号的侧栏特意保留部分未开通子项作为发现入口，IAM 账号只列有权组和子项。正常的子路由展开父组，拥有多个子项时可选首个允许项。
- `baige:activate` 和 `src/page-bridge.js` 在 iframe 与父外壳传递激活状态。IAM 模式附带账号查询参数，并将当前授予的工具名列表传到智能工具目录、菜单集合传到首页；主页推荐、功能入口搜索和快捷问答由共享权限检查约束。智能工具目录和已打开的工具签在接收权限变化时恢复至可用入口。
- 后台批准或直改触发 `BaigeIamStore` 同页订阅与存储事件。外壳重算许可，移除已撤权的活动和隐藏 iframe，活动页不可用时回到首页，全账号不可用时展示停用或删除提示。智能工具部分撤权会同步目录或清除有失效工具的隐藏页面。`pageshow` 恢复时也刷新权限。

## 代码锚点与边界

- 权限检查源 `src/data.js`、`src/iam-store.js`、`src/iam-menu-catalog.js`。外壳与账号 `index.html`、`src/app.js`、`src/account.js`、`src/page-bridge.js`。入口消费方 `src/home-access.js`、`src/pages/home-dashboard.js`、`src/pages/smart-tools.js`、`src/ai-ball.js`。
- `tests/sidebar-permissions.test.cjs` 覆盖深链拒绝、回退、角色审批授予、切换账号、撤权清理与工具名单同步。`tests/iam-role-menu-picker.test.cjs` 核对旧组键与新叶子键，`tests/feature-tools.test.cjs` 核对目录和已打开工具。角色和路由为浏览器本地演示，没有服务器会话及服务端授权判定。
