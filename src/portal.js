/* 门户首页：轮播分类切换与频道占位提示。渠道页与内容详情在原型中不展开。 */
(() => {
  "use strict";

  const { hydrate } = window.BaigeUI;
  hydrate();

  /* 五个分类共用同一张示意图，只切换活动信息。 */
  const TOPICS = {
    safety: ["6月1日-6月30日", "各所属单位", "线上答题与现场演练结合"],
    meeting: ["5月28日 14:00-16:30", "集团总部第三会议室", "受邀参加"],
    pioneer: ["6月15日 09:30-11:30", "集团总部报告厅", "内部报名"],
    festival: ["6月1日 09:00-17:00", "城市亲子活动中心", "现场免费参加，部分活动需提前签到"],
    season: ["6月5日 08:00-18:00", "线上平台", "开放参与"],
  };

  const toastEl = document.querySelector("[data-portal-toast]");
  const when = document.querySelector("[data-portal-when]");
  const where = document.querySelector("[data-portal-where]");
  const how = document.querySelector("[data-portal-how]");
  let toastTimer = 0;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toastEl.hidden = true; }, 2400);
  }

  function selectTopic(button) {
    const topic = TOPICS[button.dataset.portalTopic];
    if (!topic || !when || !where || !how) return;
    [when.textContent, where.textContent, how.textContent] = topic;
    document.querySelectorAll("[data-portal-topic]").forEach(item => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
  }

  document.addEventListener("click", event => {
    const topic = event.target.closest("[data-portal-topic]");
    if (topic) { selectTopic(topic); return; }
    const channel = event.target.closest("[data-portal-channel]");
    if (channel) { toast(`演示原型：「${channel.dataset.portalChannel}」频道页待接入`); return; }
    const entry = event.target.closest("[data-portal-entry]");
    if (entry) { toast(`演示原型：「${entry.dataset.portalEntry}」介绍页待接入`); return; }
    const news = event.target.closest("[data-portal-news]");
    if (news) { toast(`演示原型：「${news.dataset.portalNews}」详情待接入`); return; }
    if (event.target.closest("[data-portal-more]")) toast("演示原型：动态列表页待接入");
  });
})();
