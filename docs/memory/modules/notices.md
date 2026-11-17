# 控制台通知公告 `notices`

- 入口为控制台顶栏铃铛，打开双栏通知中心；左边仅列「正常」记录，右边初始「无数据」，选条目后显示标题及正文，重新打开不默认选第一条。打开面板将当时正常的记录全部标为已读，未读红点由正常记录与已读 ID 集合计算，关闭后还焦点给铃铛。
- `admin.html#notices` → `pages/notice-admin.html`，`src/pages/notice-admin.js` 支持标题、创建人、类型筛选、清空、分页（默认 10）、新建/编辑/删除。公告类型为通知或公告，状态正常或关闭；正常才进前台，切到关闭或删除后应移除。正文明文显示。
- `BaigeNoticeStore`（`src/notice-store.js`）负责正常列表、创建时间、编辑与删除，`baige.notice-center.v1` 为公告数据，`baige.notice-center.read.v1` 为已读记录，均属当前浏览器。`src/account.js` 更新铃铛和通知 UI；未接真实推送或跨用户已读。不要从个人菜单再增加通知入口；不要混入门户动态发布。
- 验收 `tests/notice-store.test.cjs`、`tests/notice-ui.test.cjs`：启用/关闭与未读一致、后台入口、顶栏弹窗双栏及空态。
