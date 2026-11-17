# 门户我的收藏与分享 `portal-favorites`

- 入口在 `portal-news.html` 的最新动态列表中，非顶栏、无收藏数量；列表页 `portal-favorites.html`，详情 `portal-news-detail.html` 提供「收藏」/「已收藏」开关和分享。不是 `intel` 的收藏，也不是控制台账号功能开通。
- `src/portal-favorites.js` 统一使用 `baige.portal.favorites.v1` 与门户动态同一 `id`。收藏后可在本浏览器同源打开「我的收藏」，取消马上更新；读不到记录时给空态，分享复制只带 `id` 的清洁详情链接，不把 `from` 或浏览筛选传给收件人。详情页收藏事件由详情渲染和收藏逻辑共享，变更加载顺序须验收链路，避免详情按钮更新而收藏列表没读到。
- 浏览器本地收藏不按服务器账户同步；浏览器、来源、端口或本地文件存储隔离时须核对测试入口。验收 `tests/portal-favorites.test.cjs`：详情收藏→列表见同条→取消→重开空状态，并验证分享 URL、详情首尾返回入口。
