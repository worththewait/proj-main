/* 门户「最新动态」：首页三条、列表页（搜索 + 分类）与详情页都从 portal-news-store 取数，
   后台「动态发布」保存后立即生效。活动报名公告在详情页提供「立即报名」。 */
(() => {
  "use strict";

  const store = window.BaigePortalNewsStore;
  if (!store) return;

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const STAR_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.3.9-4.5 4.3 1.1 6.2L12 17.1 6.4 20l1.1-6.2L3 9.5l6.3-.9Z"/></svg>';
  const SHARE_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4 m-4 4 4-4 4 4 M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/></svg>';
  const SIGNUP_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 5 5 5 M4 20l5-1L21 7l-5-5L4 14Z"/></svg>';

  const homeRoot = document.querySelector("[data-portal-news-list]");
  const listRoot = document.querySelector("[data-news-list]");
  const detailRoot = document.querySelector("[data-news-detail]");
  const tagRoot = document.querySelector("[data-news-tags]");
  const searchForm = document.querySelector("[data-news-search]");
  const searchInput = document.querySelector("#newsSearch");
  const resultStatus = document.querySelector("[data-news-status]");

  const filterParams = new URLSearchParams(location.hash.slice(1));
  const tag = filterParams.get("tag");
  const filters = {
    tag: store.TAGS.includes(tag) ? tag : "全部",
    keyword: (filterParams.get("q") || "").trim(),
  };

  // Fragment parameters let both the browser Back button and the detail links restore the list.
  function filterHash() {
    const params = new URLSearchParams();
    if (filters.tag !== "全部") params.set("tag", filters.tag);
    if (filters.keyword) params.set("q", filters.keyword);
    return params.size ? `#${params}` : "";
  }

  function applyFilters() {
    const url = new URL(location.href);
    url.hash = filterHash();
    history.replaceState(history.state, "", url);
    renderList();
  }

  /* 缩略图：后台配了图片就用图片，否则沿用渐变示意块。 */
  const thumbOf = item => (item.image
    ? `<span class="portal-news-thumb has-image" aria-hidden="true"><img src="${escapeHtml(item.image)}" alt="" /></span>`
    : `<span class="portal-news-thumb ${escapeHtml(item.thumb || "is-a")}" aria-hidden="true"></span>`);

  const cardOf = (item, from) => `<a class="portal-news-item" href="./portal-news-detail.html?id=${encodeURIComponent(item.id)}&amp;from=${from}">
            <span class="portal-news-copy"><span class="portal-news-title">${escapeHtml(item.title)}</span><span class="portal-news-date">${escapeHtml(item.date || String(item.publishedAt || "").slice(0, 10))}</span></span>
            ${thumbOf(item)}
          </a>`;

  function renderHome() {
    if (!homeRoot) return;
    homeRoot.innerHTML = store.latest(3).map(item => cardOf(item, "home")).join("");
  }

  function renderTags() {
    if (!tagRoot) return;
    const tags = ["全部", ...store.TAGS];
    tagRoot.innerHTML = tags.map(tag => `<button class="portal-news-category" type="button" data-tag="${escapeHtml(tag)}" aria-controls="newsResults" aria-pressed="${tag === filters.tag}">${escapeHtml(tag)}</button>`).join("");
    if (filters.tag !== "全部") {
      tagRoot.querySelector('[aria-pressed="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function visibleNews() {
    const keyword = filters.keyword.trim();
    return store.feed().filter(item => {
      if (filters.tag !== "全部" && item.tag !== filters.tag) return false;
      if (keyword && !item.title.includes(keyword)) return false;
      return true;
    });
  }

  function renderList() {
    if (!listRoot) return;
    const list = visibleNews();
    const hash = escapeHtml(filterHash());
    listRoot.innerHTML = list.length
      ? list.map(item => `<a class="portal-feed-item" href="./portal-news-detail.html?id=${encodeURIComponent(item.id)}&amp;from=news${hash}">
      <span class="portal-feed-thumb ${escapeHtml(item.thumb || "is-a")}" aria-hidden="true"></span>
      <span class="portal-feed-copy"><span class="portal-feed-title">${escapeHtml(item.title)}</span><span class="portal-feed-date"><em class="portal-feed-tag">${escapeHtml(item.tag)}</em>${escapeHtml(item.date || String(item.publishedAt || "").slice(0, 10))}</span></span>
    </a>`).join("")
      : `<div class="portal-empty-result"><strong>没有找到相关动态</strong>
        ${filters.keyword ? '<button type="button" data-news-clear>清除关键词</button>' : '<p>试试其他分类。</p>'}
      </div>`;
    if (resultStatus) resultStatus.textContent = list.length ? `共 ${list.length} 条动态` : "没有找到相关动态";
  }

  /* 正文：后台富文本直接输出，纯文本按空行拆段。 */
  function bodyOf(item) {
    if (item.content && /<[a-z][\s\S]*>/i.test(item.content)) return item.content;
    const paragraphs = Array.isArray(item.body) && item.body.length ? item.body : String(item.content || "").split(/\n{2,}/).filter(Boolean);
    return paragraphs.map(para => `<p>${escapeHtml(para)}</p>`).join("");
  }

  /* 活动报名弹窗：只有「活动报名公告」才出现入口。 */
  /* 表单顺序与线上报名表一致：姓名 → 性别 → 单位 → 部门 → 手机号 → 邮箱 → 职务 → 备注。 */
  const SIGNUP_FIELDS = [
    { kind: "text", name: "realname", label: "姓名", required: true, placeholder: "请输入姓名" },
    { kind: "sex", label: "性别" },
    { kind: "text", name: "unit", label: "单位", placeholder: "请输入单位名称" },
    { kind: "text", name: "dept", label: "部门", placeholder: "请输入部门名称" },
    { kind: "text", name: "phone", label: "手机号", required: true, placeholder: "请输入手机号", type: "tel" },
    { kind: "text", name: "email", label: "邮箱", required: true, placeholder: "请输入邮箱地址", type: "email" },
    { kind: "text", name: "title", label: "职务/职称", placeholder: "请输入职务或职称" },
  ];

  const fieldOf = field => (field.kind === "sex"
    ? `<div class="ps-field"><span>性别</span>
        <div class="ps-choices">
          <label><input type="radio" name="sex" value="男"><span>男</span></label>
          <label><input type="radio" name="sex" value="女"><span>女</span></label>
        </div>
      </div>`
    : `<label class="ps-field"><span>${field.label}${field.required ? "<b>*</b>" : ""}</span>
        <input class="ps-input" type="${field.type || "text"}" name="${field.name}" placeholder="${field.placeholder}" autocomplete="off">
      </label>`);

  function signupMarkup(title) {
    return `<div class="ps-mask" data-signup-mask hidden></div>
    <form class="ps-modal" data-signup-modal role="dialog" aria-modal="true" aria-labelledby="psTitle" hidden novalidate>
      <header class="ps-head">
        <span class="ps-badge" aria-hidden="true">${SIGNUP_ICON}</span>
        <div class="ps-head-copy"><strong id="psTitle">立即报名</strong><p>请填写以下信息完成活动报名</p></div>
        <button class="ps-close" type="button" data-signup-close aria-label="关闭">×</button>
      </header>
      <div class="ps-body">
        <label class="ps-field"><span>活动名称</span><input class="ps-input is-readonly" type="text" value="${escapeHtml(title)}" readonly></label>
        ${SIGNUP_FIELDS.map(fieldOf).join("")}
        <label class="ps-field"><span>备注</span>
          <textarea class="ps-input ps-textarea" name="remark" maxlength="200" placeholder="请输入备注信息（选填）"></textarea>
          <span class="ps-counter" data-signup-counter>0/200</span>
        </label>
        <p class="ps-tip">* 为必填项，请确保信息准确无误</p>
        <p class="ps-error" data-signup-error role="alert"></p>
      </div>
      <footer class="ps-foot"><button class="ps-submit" type="submit">提交报名</button></footer>
    </form>`;
  }

  function mountSignup(item) {
    const holder = document.createElement("div");
    holder.innerHTML = signupMarkup(item.title);
    document.body.append(holder.firstElementChild, holder.lastElementChild);
    const mask = document.querySelector("[data-signup-mask]");
    const modal = document.querySelector("[data-signup-modal]");
    const errorEl = modal.querySelector("[data-signup-error]");
    const remark = modal.querySelector('textarea[name="remark"]');
    const counter = modal.querySelector("[data-signup-counter]");

    const close = () => { modal.hidden = true; mask.hidden = true; document.body.style.overflow = ""; };
    mask.addEventListener("click", close);
    modal.querySelector("[data-signup-close]").addEventListener("click", close);
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) close(); });
    remark.addEventListener("input", () => { counter.textContent = `${remark.value.length}/200`; });

    modal.addEventListener("submit", event => {
      event.preventDefault();
      const value = name => (modal.querySelector(`[name="${name}"]`)?.value || "").trim();
      if (!value("realname")) { errorEl.textContent = "请填写姓名"; return; }
      if (!/^1[3-9]\d{9}$/.test(value("phone"))) { errorEl.textContent = "请填写正确的 11 位手机号"; return; }
      if (!/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(value("email"))) { errorEl.textContent = "请填写正确的邮箱地址"; return; }
      errorEl.textContent = "";
      close();
      toast("报名成功，活动开始前会通过短信通知您");
    });

    modal.hidden = false;
    mask.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector('input[name="realname"]').focus();
  }

  let toastTimer = 0;
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
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function renderDetail() {
    if (!detailRoot) return;
    const params = new URLSearchParams(location.search);
    const item = store.find(params.get("id")) || store.feed()[0];
    if (!item) { detailRoot.innerHTML = `<div class="portal-empty-state"><strong>找不到这篇动态</strong><p>它可能已被删除或尚未发布。</p><a href="./portal-news.html">去看看最新动态 →</a></div>`; return; }
    // 返回目标跟随来源：门户首页进入则回首页，列表进入或直接打开则回「最新动态」。
    const fromHome = params.get("from") === "home";
    const listHref = `./portal-news.html${params.get("from") === "news" ? escapeHtml(filterHash()) : ""}`;
    const back = fromHome
      ? { href: "./portal.html", label: "返回首页" }
      : { href: listHref, label: "返回最新动态" };
    const dateText = item.date || String(item.publishedAt || "").slice(0, 10);
    const signup = item.type === "活动报名公告"
      ? `<button class="portal-signup" type="button" data-signup="${encodeURIComponent(item.id)}">立即报名</button>`
      : "";
    document.title = `${item.title.slice(0, 20)} - 百舸门户`;
    detailRoot.innerHTML = `<article class="portal-article">
      <div class="portal-article-inner">
        <div class="portal-detail-head">
          <nav class="portal-crumbs" aria-label="当前位置">
            <a href="./portal.html">首页</a><span aria-hidden="true">›</span><a href="${listHref}">最新动态</a><span aria-hidden="true">›</span><span aria-current="page">正文</span>
          </nav>
          <a class="portal-back-link" href="${back.href}">← ${back.label}</a>
        </div>
        <h1>${escapeHtml(item.title)}</h1>
        <div class="portal-article-meta">
          <span class="portal-article-tag">${escapeHtml(item.tag)}</span><time>${escapeHtml(dateText)}</time>
          <div class="portal-article-actions">
            <button class="portal-act" type="button" data-fav-toggle data-id="${escapeHtml(item.id)}" aria-pressed="false">${STAR_ICON}<span data-fav-label>收藏</span></button>
            <button class="portal-act" type="button" data-share="${escapeHtml(item.id)}">${SHARE_ICON}<span>分享</span></button>
            ${signup}
          </div>
        </div>
        <div class="portal-article-body">${bodyOf(item)}</div>
        <p class="portal-article-byline">${escapeHtml(item.byline || "")}</p>
        <div class="portal-article-foot">
          <a class="portal-article-back" href="${back.href}">← ${back.label}</a>
          <a class="portal-article-back" href="./portal-favorites.html">我的收藏 →</a>
        </div>
      </div>
    </article>`;

    detailRoot.querySelector("[data-signup]")?.addEventListener("click", () => mountSignup(item));
  }

  /* 列表页的搜索与分类 */
  renderTags();
  tagRoot?.addEventListener("click", event => {
    const category = event.target.closest("[data-tag]");
    if (!category || filters.tag === category.dataset.tag) return;
    filters.tag = category.dataset.tag;
    tagRoot.querySelector('[aria-pressed="true"]')?.setAttribute("aria-pressed", "false");
    category.setAttribute("aria-pressed", "true");
    applyFilters();
  });
  if (searchInput) searchInput.value = filters.keyword;
  searchForm?.addEventListener("submit", event => {
    event.preventDefault();
    filters.keyword = searchInput.value.trim();
    searchInput.value = filters.keyword;
    applyFilters();
  });
  listRoot?.addEventListener("click", event => {
    if (!event.target.closest("[data-news-clear]")) return;
    searchInput.value = "";
    filters.keyword = "";
    applyFilters();
    searchInput.focus();
  });

  renderHome();
  renderList();
  renderDetail();

  /* 后台发布、编辑、删除后，门户页面即时刷新。 */
  window.addEventListener("baige:portal-news", () => { renderHome(); renderList(); });
  window.addEventListener("storage", event => {
    if (event.key !== store.KEY) return;
    renderHome();
    renderList();
  });

  window.BaigePortalNews = Object.freeze({
    NEWS: store.all(),
    latest: store.latest,
    feed: store.feed,
    find: store.find,
    filters,
  });
})();
