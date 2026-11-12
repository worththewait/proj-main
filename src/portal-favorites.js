/* 门户收藏与分享：详情页按钮与「我的收藏」列表。
   收藏记录保存在浏览器本地，刷新与重开均可保留。 */
(() => {
  "use strict";

  const KEY = "baige.portal.favorites.v1";
  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  let toastTimer = 0;

  function read() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
      return Array.isArray(raw) ? raw.map(String) : [];
    } catch { return []; }
  }

  function write(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* file:// 或隐私模式 */ }
  }

  const has = id => read().includes(String(id));

  function toast(message) {
    let el = document.querySelector("[data-portal-toast]");
    if (!el) {
      el = document.createElement("div");
      el.className = "portal-toast";
      el.setAttribute("data-portal-toast", "");
      el.setAttribute("role", "status");
      el.hidden = true;
      document.body.append(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function syncButton(id) {
    const button = document.querySelector(`[data-fav-toggle][data-id="${id}"]`);
    if (!button) return;
    const on = has(id);
    button.classList.toggle("is-on", on);
    button.setAttribute("aria-pressed", String(on));
    const label = button.querySelector("[data-fav-label]");
    if (label) label.textContent = on ? "已收藏" : "收藏";
  }

  function toggle(id) {
    const list = read();
    const key = String(id);
    const index = list.indexOf(key);
    const added = index === -1;
    if (added) list.unshift(key); else list.splice(index, 1);
    write(list);
    syncButton(id);
    return added;
  }

  /* 分享只复制链接：去掉来源参数，得到一个干净的详情地址。 */
  async function share(id) {
    const url = `${location.href.split("?")[0]}?id=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      toast("链接已复制，可直接分享");
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = url;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.append(area);
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        toast(ok ? "链接已复制，可直接分享" : "复制失败，请手动复制地址栏链接");
      } catch {
        toast("复制失败，请手动复制地址栏链接");
      }
    }
  }

  document.addEventListener("click", event => {
    const fav = event.target.closest("[data-fav-toggle]");
    if (fav) {
      toast(toggle(fav.dataset.id) ? "已加入我的收藏" : "已取消收藏");
      return;
    }
    const shareBtn = event.target.closest("[data-share]");
    if (shareBtn) share(shareBtn.dataset.share);
  });

  const listRoot = document.querySelector("[data-favorites-list]");
  if (listRoot) {
    const news = window.BaigePortalNewsStore?.all() || [];
    const items = read().map(id => news.find(entry => String(entry.id) === id)).filter(Boolean);
    const countEl = document.querySelector("[data-favorites-count]");
    if (countEl) countEl.textContent = items.length ? `共 ${items.length} 条` : "";
    listRoot.innerHTML = items.length
      ? items.map(item => `<a class="portal-feed-item" href="./portal-news-detail.html?id=${encodeURIComponent(item.id)}&amp;from=news">
          <span class="portal-feed-thumb ${escapeHtml(item.thumb || "is-a")}" aria-hidden="true"></span>
          <span class="portal-feed-copy"><span class="portal-feed-title">${escapeHtml(item.title)}</span><span class="portal-feed-date">${escapeHtml(item.date || String(item.publishedAt || "").slice(0, 10))}</span></span>
        </a>`).join("")
      : `<div class="portal-empty-state"><strong>还没有收藏任何动态</strong><p>在动态详情页点击「收藏」，内容就会出现在这里。</p><a href="./portal-news.html">去看看最新动态 →</a></div>`;
  }

  window.addEventListener("storage", event => {
    if (event.key !== KEY) return;
    document.querySelectorAll("[data-fav-toggle]").forEach(button => syncButton(button.dataset.id));
  });
  document.querySelectorAll("[data-fav-toggle]").forEach(button => syncButton(button.dataset.id));

  window.BaigePortalFavorites = Object.freeze({ read, has, toggle, KEY });
})();
