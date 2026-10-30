(() => {
  "use strict";

  const { categories, content } = window.BaigeLibraryData;
  const store = window.BaigeLibraryStore;
  const docs = store.loadDocs().map((doc) => ({
    t: doc.title, cat: doc.category, org: doc.org, date: doc.date, hot: doc.hot,
    author: doc.author, type: doc.docType, abstract: doc.abstract,
    permissions: doc.permissions, permissionExpiry: doc.permissionExpiry,
    personPermissions: doc.personPermissions, personPermissionExpiry: doc.personPermissionExpiry,
    ownerDept: doc.ownerDept, accessMode: doc.accessMode, id: doc.id,
  }));
  const { escapeHtml } = window.BaigeUI;
  const page = window.BaigePage;

  const catByName = new Map(categories.map((cat) => [cat.name, cat]));
  const TAG_CLS = {
    "智库成果": "t-blue", "船舶标准": "t-orange", "行业专利": "t-red",
    "三方研报": "t-green", "规则规范": "t-purple", "专业书籍": "t-brown",
    "期刊论文": "t-teal", "其他": "t-gray",
  };

  const $ = (id) => document.getElementById(id);
  const ui = {
    searchType: $("searchType"),
    typeButton: $("typeButton"),
    typeLabel: $("typeLabel"),
    typeMenu: $("typeMenu"),
    keyword: $("kw"),
    dept: $("libraryDept"),
    user: $("libraryUser"),
    categoryRow: $("catRow"),
    home: $("homeContent"),
    list: $("listSection"),
    results: $("srSection"),
    hotTabs: $("hotTabs"),
    hotCat: $("hotCatInd"),
    hotGrid: $("hotGrid"),
    listTitle: $("listTitle"),
    listTotal: $("listTotal"),
    listGrid: $("listGrid"),
    listPager: $("listPager"),
    srTitle: $("srTitle"),
    srMeta: $("srMeta"),
    srGrid: $("srGrid"),
    srPager: $("srPager"),
    viewer: $("viewerView"),
    vToggle: $("vToggle"),
    vSide: $("vSide"),
    vKw: $("vKw"),
    vClear: $("vClear"),
    vResult: $("vResult"),
    ideaTabs: $("ideaTabs"),
    ideaTabbar: $("ideaTabbar"),
    ideaCollapse: $("ideaCollapse"),
    ideaBadge: $("ideaBadge"),
    ideaPanel: $("ideaPanel"),
    ideaList: $("ideaList"),
    docTitle: $("dTitle"),
    docMeta: $("vMeta"),
    preview: $("pvBox"),
    qaPanel: $("qaPanel"),
    qaTitle: $("qaTitle"),
    qaResizer: $("qaResizer"),
    qaHistory: $("qaHistoryBtn"),
    sessionPanel: $("sessionPanel"),
    sessionDoc: $("sessionDocName"),
    sessionList: $("sessionList"),
    qaStream: $("qaStream"),
    qaInput: $("qaInput"),
    toast: $("toast"),
  };

  const state = {
    department: store.getCurrentDept(),
    user: store.getCurrentUser(),
    type: "全部",
    tab: "hot",
    category: "智库成果",
    section: "home",
    srData: [], srPage: 1, srSize: 12, srTitle: "检索结果",
    listData: [], listPage: 1, listSize: 12,
    opened: [], active: null, current: null,
    vData: [], vPage: 1, vSize: 8,
    history: {},
    toastTimer: 0,
  };
  let lastFocus = null;
  const permLevel = (doc) => store.effectiveAccessLevel(doc, state.department, state.user);
  const isOwner = (doc) => doc.ownerDept === state.department;
  const isPublicGrant = (doc) => store.isDeptPublicGrant(doc, state.department) || store.isPersonPublicGrant(doc, state.user);
  const isTrial = (doc) => store.isTrialAccess(doc, state.department, state.user);
  const canFull = (doc) => isOwner(doc) || isPublicGrant(doc) ||
    (doc.accessMode === "public" && permLevel(doc) >= 3);
  const canDownload = (doc) => isOwner(doc) || permLevel(doc) >= 4;
  const accessNote = (doc) => {
    if (isOwner(doc)) return doc.accessMode === "limited" ? "有限公开 · 本部门全文" : "全部公开 · 本部门全文";
    if (isPublicGrant(doc)) return "有限公开 · 已授权全文+下载";
    if (doc.accessMode === "public") {
      if (permLevel(doc) <= 0) return "没有权限";
      if (permLevel(doc) >= 3) return "全部公开 · 全文";
      return permLevel(doc) === 2 ? "全部公开 · 仅可见" : "全部公开 · 仅可搜索";
    }
    if (isTrial(doc)) return "有限公开 · 试读 2 页";
    return "没有权限";
  };
  const backgroundNodes = [document.querySelector(".banner"), ui.home, ui.list, ui.results].filter(Boolean);

  function setBackgroundInert(value) {
    backgroundNodes.forEach((node) => {
      node.inert = value;
      if (value) node.setAttribute("aria-hidden", "true");
      else node.removeAttribute("aria-hidden");
    });
  }

  const docIndexOf = (doc) => docs.indexOf(doc);
  const categoryColor = (name) => catByName.get(name)?.color || "#245bff";
  const categoryIcon = (name) => catByName.get(name)?.icon || "M4 5h16v14H4z";
  const text = (value) => escapeHtml(String(value ?? ""));

  function showToast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add("show");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => ui.toast.classList.remove("show"), 2200);
  }

  function cardHTML(doc) {
    const id = docIndexOf(doc);
    const color = categoryColor(doc.cat);
    const note = accessNote(doc);
    const limited = doc.accessMode === "limited";
    return `<button class="doc-card" type="button" data-action="open-doc" data-doc-id="${id}" data-access="${limited ? "limited" : "public"}" aria-label="${text(doc.t)}${note ? `，${note}` : ""}，打开阅读">
      <span class="cover" style="background:linear-gradient(150deg,${color},${color}cc)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="${categoryIcon(doc.cat)}"/></svg><span>${text(doc.cat)}</span></span>
      <span class="doc-info">
        <span class="doc-title">${text(doc.t)}</span>
        <span class="tag ${TAG_CLS[doc.cat] || "t-blue"}">${text(doc.type)}</span>
        <span class="doc-meta">${text(doc.date)}</span>
        ${note ? `<span class="perm-note${canFull(doc) ? "" : " limited"}">${note}</span>` : ""}
      </span>
    </button>`;
  }

  function renderCategories() {
    const names = ["全部", ...categories.map((cat) => cat.name)];
    ui.categoryRow.innerHTML = names.map((name) => {
      const active = name === state.category;
      const color = name === "全部" ? "linear-gradient(135deg,#3b82f6,#1a56db)" : categoryColor(name);
      const icon = name === "全部"
        ? '<path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h10v2H4z"/>'
        : `<path d="${categoryIcon(name)}"/>`;
      return `<button class="cat-item${active ? " active" : ""}" type="button" data-action="category" data-category="${text(name)}" aria-pressed="${active}">
        <span class="ic" style="background:${color}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg></span><span>${text(name)}</span>
      </button>`;
    }).join("");
  }

  function updateCategoryIndicator() {
    ui.hotCat.textContent = state.category === "全部" ? "全部文档" : state.category;
  }

  function renderHot() {
    let list = state.category === "全部" ? [...docs] : docs.filter((doc) => doc.cat === state.category);
    list.sort((a, b) => state.tab === "hot" ? b.hot - a.hot : (b.date > a.date ? 1 : -1));
    if (!list.length) {
      ui.hotGrid.innerHTML = `<div class="sr-empty">「${text(state.category === "全部" ? "全部" : state.category)}」分类下暂无${state.tab === "hot" ? "热门" : "最新"}文档<br><button class="more" type="button" data-action="category" data-category="全部">查看全部文档</button></div>`;
      return;
    }
    ui.hotGrid.innerHTML = list.slice(0, 6).map(cardHTML).join("");
  }

  function switchCategory(name) {
    state.category = name;
    renderCategories();
    updateCategoryIndicator();
    ui.hotGrid.innerHTML = `<div class="v-empty">正在加载「${text(name === "全部" ? "全部文档" : name)}」数据…</div>`;
    const expected = name;
    window.setTimeout(() => {
      if (state.category === expected) renderHot();
    }, 120);
  }

  function renderTypes() {
    const names = ["全部", ...categories.map((cat) => cat.name)];
    ui.typeMenu.innerHTML = names.map((name) => `<button type="button" role="option" aria-selected="${name === state.type}" class="${name === state.type ? "sel" : ""}" data-action="pick-type" data-type="${text(name)}">${text(name)}${name === state.type ? " ✓" : ""}</button>`).join("");
  }

  function toggleType() {
    const open = ui.searchType.classList.toggle("open");
    ui.typeButton.setAttribute("aria-expanded", String(open));
  }

  function closeType() {
    ui.searchType.classList.remove("open");
    ui.typeButton.setAttribute("aria-expanded", "false");
  }

  function pickType(type) {
    state.type = type;
    ui.typeLabel.textContent = type;
    closeType();
    renderTypes();
    switchCategory(type === "全部" ? "全部" : type);
    showSection("home");
  }

  function showSection(section) {
    state.section = section;
    ui.home.hidden = section !== "home";
    ui.list.hidden = section !== "list";
    ui.results.hidden = section !== "sr";
    const target = section === "home" ? ui.home : section === "list" ? ui.list : ui.results;
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function closeSearch() {
    showSection("home");
    ui.keyword.value = "";
  }

  function doSearch() {
    const keyword = ui.keyword.value.trim();
    if (!keyword) {
      closeSearch();
      showToast("请输入关键词");
      return;
    }
    const query = keyword.toLowerCase();
    state.srData = docs.filter((doc) => {
      if (state.type !== "全部" && doc.cat !== state.type) return false;
      return [doc.t, doc.cat, doc.org, doc.author, doc.type].join(" ").toLowerCase().includes(query);
    });
    state.srTitle = "检索结果";
    state.srPage = 1;
    ui.srTitle.textContent = state.srTitle;
    renderSearchResults();
    showSection("sr");
  }

  function aiSearch() {
    const question = ui.keyword.value.trim();
    if (!question) {
      closeSearch();
      showToast("请输入您的问题");
      return;
    }
    const tokens = question.toLowerCase().split(/[\s,，、;；:：]+/).filter((token) => token.length > 1);
    const fields = (doc) => [doc.t, doc.cat, doc.abstract, doc.date].join(" ").toLowerCase();
    const pool = docs.filter((doc) => state.type === "全部" || doc.cat === state.type);
    state.srData = pool.map((doc) => {
      let score = doc.t.toLowerCase().includes(question.toLowerCase()) ? 6 : 0;
      tokens.forEach((token) => { if (fields(doc).includes(token)) score += 3; });
      return { doc, score };
    }).filter((entry) => entry.score > 0).sort((a, b) => b.score - a.score).map((entry) => entry.doc);
    state.srTitle = "AI 语义检索结果";
    state.srPage = 1;
    ui.srTitle.textContent = state.srTitle;
    renderSearchResults();
    showSection("sr");
  }

  function pagerHTML(scope, current, pages, size, sizes, label) {
    let html = `<button class="pg${current === 1 ? " dis" : ""}" type="button" data-action="page" data-scope="${scope}" data-page="${current - 1}" ${current === 1 ? "disabled" : ""} aria-label="上一页">‹</button>`;
    for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
      html += `<button class="pg${pageNumber === current ? " cur" : ""}" type="button" data-action="page" data-scope="${scope}" data-page="${pageNumber}" aria-label="第 ${pageNumber} 页">${pageNumber}</button>`;
    }
    html += `<button class="pg${current === pages ? " dis" : ""}" type="button" data-action="page" data-scope="${scope}" data-page="${current + 1}" ${current === pages ? "disabled" : ""} aria-label="下一页">›</button>`;
    html += `<select data-page-size="${scope}" aria-label="${label}">${sizes.map((value) => `<option value="${value}"${value === size ? " selected" : ""}>${value} 篇/页</option>`).join("")}</select><span class="pinfo">第 ${current}/${pages} 页</span>`;
    return html;
  }

  function renderSearchResults() {
    const total = state.srData.length;
    const pages = Math.max(1, Math.ceil(total / state.srSize));
    if (state.srPage > pages) state.srPage = pages;
    const keyword = ui.keyword.value.trim();
    const list = state.srData.slice((state.srPage - 1) * state.srSize, state.srPage * state.srSize);
    ui.srGrid.innerHTML = total
      ? list.map(cardHTML).join("")
      : `<div class="sr-empty">${state.srTitle === "AI 语义检索结果"
        ? `未检索到与「${text(keyword)}」语义相关的文档，请换一种表述试试`
        : `未找到与「${text(keyword)}」相关的文档，请更换关键词试试`}</div>`;
    const base = state.srTitle === "AI 语义检索结果"
      ? `问题 <span class="chip">${text(keyword)}</span> 分类 <span class="chip">${text(state.type)}</span>`
      : `关键词 <span class="chip">${text(keyword)}</span> 分类 <span class="chip">${text(state.type)}</span>`;
    ui.srMeta.innerHTML = `${base} <span class="cnt">共命中 ${total} 篇</span>`;
    ui.srPager.innerHTML = total > state.srSize
      ? pagerHTML("sr", state.srPage, pages, state.srSize, [12, 24, 48], "检索结果每页数量")
      : "";
  }

  function openList(kind, name) {
    let list;
    if (kind === "hot") list = [...docs].sort((a, b) => b.hot - a.hot);
    else if (kind === "new") list = [...docs].sort((a, b) => b.date > a.date ? 1 : -1);
    else list = name === "全部" ? [...docs] : docs.filter((doc) => doc.cat === name);
    let title = name;
    if (kind === "hot" || kind === "new") {
      if (state.category !== "全部") {
        list = list.filter((doc) => doc.cat === state.category);
        title = `${name} · ${state.category}`;
      }
    }
    state.listData = list;
    state.listPage = 1;
    ui.listTitle.textContent = title;
    showSection("list");
    renderList();
    ui.list.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function renderList() {
    const total = state.listData.length;
    const pages = Math.max(1, Math.ceil(total / state.listSize));
    if (state.listPage > pages) state.listPage = pages;
    ui.listGrid.innerHTML = state.listData.slice((state.listPage - 1) * state.listSize, state.listPage * state.listSize).map(cardHTML).join("");
    ui.listTotal.textContent = `共 ${total} 篇 · 第 ${state.listPage}/${pages} 页`;
    ui.listPager.innerHTML = pagerHTML("list", state.listPage, pages, state.listSize, [12, 24, 48], "列表每页数量");
  }

  function goToPage(scope, pageNumber) {
    const pages = Math.max(1, Math.ceil((scope === "sr" ? state.srData.length : scope === "list" ? state.listData.length : state.vData.length) / (scope === "sr" ? state.srSize : scope === "list" ? state.listSize : state.vSize)));
    const target = Math.max(1, Math.min(pages, Number(pageNumber) || 1));
    if (scope === "sr") { state.srPage = target; renderSearchResults(); ui.results.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else if (scope === "list") { state.listPage = target; renderList(); ui.list.scrollIntoView({ behavior: "smooth", block: "start" }); }
    else { state.vPage = target; renderViewerResults(); }
  }

  function changePageSize(scope, value) {
    const size = Number(value) || 12;
    if (scope === "sr") { state.srSize = size; state.srPage = 1; renderSearchResults(); }
    else if (scope === "list") { state.listSize = size; state.listPage = 1; renderList(); }
    else { state.vSize = size; state.vPage = 1; renderViewerResults(); }
  }

  function openDetail(index, opener = null) {
    const doc = docs[index];
    if (!doc) return;
    const first = !ui.viewer.classList.contains("show");
    if (!state.opened.includes(index)) state.opened.push(index);
    state.active = index;
    if (first) lastFocus = opener instanceof HTMLElement ? opener : document.activeElement;
    setBackgroundInert(true);
    ui.viewer.classList.add("show");
    renderViewer();
    if (first) renderViewerDefault();
    ui.viewer.querySelector("[data-action='close-viewer']")?.focus({ preventScroll: true });
  }

  function renderViewer() {
    const doc = docs[state.active];
    if (!doc) return;
    state.current = doc;
    renderTabs();
    ui.docTitle.textContent = doc.t;
    ui.qaTitle.textContent = doc.t;
    const access = accessNote(doc);
    ui.docMeta.innerHTML = `<span class="chip">${text(doc.cat)}</span> · <span>收录：${text(doc.date)} 10:24</span>${access ? ` · <span class="chip access">${text(access)}</span>` : ""}`;
    renderPreview(doc);
    resetQA();
    ui.sessionDoc.textContent = baseTitle();
    renderHistoryPanel();
    closeSessionPanel();
    adjustTabs();
  }

  function renderTabs() {
    ui.ideaTabbar.innerHTML = state.opened.map((id) => {
      const doc = docs[id];
      const active = id === state.active;
      return `<div class="idea-tab${active ? " active" : ""}" role="tab" aria-selected="${active}" tabindex="${active ? "0" : "-1"}" data-action="switch-doc" data-doc-id="${id}">
        <span class="t">${text(doc.t)}</span><button class="x" type="button" data-action="close-tab" data-doc-id="${id}" aria-label="关闭${text(doc.t)}">×</button>
      </div>`;
    }).join("");
  }

  function adjustTabs() {
    const tabs = [...ui.ideaTabbar.querySelectorAll(".idea-tab")];
    if (!tabs.length) {
      ui.ideaCollapse.style.display = "none";
      ui.ideaBadge.textContent = "0";
      return;
    }
    tabs.forEach((tab) => { tab.style.display = ""; });
    const limit = ui.ideaTabs.clientWidth - 52;
    let total = tabs.reduce((sum, tab) => sum + tab.offsetWidth + 1, 0);
    let hidden = 0;
    if (total > limit) {
      for (let i = tabs.length - 1; i >= 0; i -= 1) {
        if (total <= limit) break;
        const tab = tabs[i];
        if (tab.classList.contains("active")) continue;
        total -= tab.offsetWidth + 1;
        tab.style.display = "none";
        hidden += 1;
      }
    }
    ui.ideaBadge.textContent = String(hidden);
    ui.ideaCollapse.style.display = hidden > 0 ? "flex" : "none";
    if (!hidden) closeIdeaPanel();
  }

  function renderIdeaPanel() {
    ui.ideaList.innerHTML = state.opened.length
      ? state.opened.map((id) => `<div class="idea-item${id === state.active ? " active" : ""}" data-action="pick-idea" data-doc-id="${id}"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zm8 1.5V8h4.5z"/></svg><span class="t">${text(docs[id].t)}</span><button class="x" type="button" data-action="close-tab" data-doc-id="${id}" aria-label="关闭${text(docs[id].t)}">×</button></div>`).join("")
      : '<div class="idea-empty">暂无已打开文档</div>';
  }

  function toggleIdeaPanel() {
    const open = !ui.ideaPanel.classList.contains("show");
    if (open) renderIdeaPanel();
    ui.ideaPanel.classList.toggle("show", open);
    ui.ideaCollapse.classList.toggle("open", open);
    ui.ideaCollapse.setAttribute("aria-expanded", String(open));
  }

  function closeIdeaPanel() {
    ui.ideaPanel.classList.remove("show");
    ui.ideaCollapse.classList.remove("open");
    ui.ideaCollapse.setAttribute("aria-expanded", "false");
  }

  function switchDoc(id) {
    state.active = id;
    renderViewer();
    closeIdeaPanel();
  }

  function closeTab(id) {
    state.opened = state.opened.filter((docId) => docId !== id);
    if (!state.opened.length) {
      closeViewer();
      return;
    }
    if (state.active === id) state.active = state.opened[state.opened.length - 1];
    renderViewer();
  }

  function closeViewer() {
    ui.viewer.classList.remove("show");
    closeIdeaPanel();
    closeSessionPanel();
    setBackgroundInert(false);
    showSection("home");
    if (lastFocus instanceof HTMLElement && lastFocus.isConnected && lastFocus.offsetParent !== null) lastFocus.focus({ preventScroll: true });
  }

  function downloadCurrent() {
    if (!state.current) return;
    if (!canDownload(state.current)) {
      showToast(canFull(state.current)
        ? "当前对象无下载权限"
        : (state.current.accessMode === "limited" ? "有限公开文档仅可试读前 2 页，获得全部公开授权后才可下载" : "当前对象无下载权限"));
      return;
    }
    showToast(`开始下载《${state.current.t}》，已记录下载日志`);
  }

  function toggleQAPanel() {
    ui.qaPanel.classList.toggle("collapsed");
  }

  function toggleSide() {
    const hidden = ui.vSide.classList.toggle("hidden");
    ui.vSide.inert = hidden;
    ui.vSide.setAttribute("aria-hidden", String(hidden));
    ui.vToggle.textContent = hidden ? "展开搜索" : "收起搜索";
  }

  function renderViewerDefault() {
    ui.vResult.classList.remove("scrollable");
    ui.vResult.innerHTML = '<div class="v-empty-big"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 2a8 8 0 1 0 4.9 14.3l5 5 1.4-1.4-5-5A8 8 0 0 0 10 2zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12z"/></svg><span>搜索文档或输入关键词开始探索</span></div>';
  }

  function updateViewerClear() {
    ui.vClear.style.display = ui.vKw.value ? "flex" : "none";
    if (!ui.vKw.value.trim()) renderViewerDefault();
  }

  function clearViewerKeyword() {
    ui.vKw.value = "";
    updateViewerClear();
    renderViewerDefault();
  }

  function renderViewerResults() {
    ui.vResult.classList.add("scrollable");
    const total = state.vData.length;
    const pages = Math.max(1, Math.ceil(total / state.vSize));
    if (state.vPage > pages) state.vPage = pages;
    if (!total) {
      ui.vResult.innerHTML = '<div class="v-empty">未找到相关文档</div>';
      return;
    }
    const list = state.vData.slice((state.vPage - 1) * state.vSize, state.vPage * state.vSize);
    let html = list.map((doc) => {
      const note = accessNote(doc) ? `<span class="perm-note${canFull(doc) ? "" : " limited"}">${accessNote(doc)}</span>` : "";
      return `<button class="v-item${docIndexOf(doc) === state.active ? " active" : ""}" type="button" data-action="open-doc" data-doc-id="${docIndexOf(doc)}"><span class="t">${text(doc.t)}</span><span class="m">${text(doc.date)}</span>${note}</button>`;
    }).join("");
    if (total > state.vSize) html += `<div class="pager" style="margin-top:10px">${pagerHTML("v", state.vPage, pages, state.vSize, [8, 16, 24], "文档搜索结果每页数量")}</div>`;
    ui.vResult.innerHTML = html;
  }

  function viewerSearch() {
    const keyword = ui.vKw.value.trim();
    if (!keyword) {
      showToast("请输入关键词");
      return;
    }
    state.vData = docs.filter((doc) => [doc.t, doc.org, doc.author, doc.cat].join(" ").toLowerCase().includes(keyword.toLowerCase()));
    state.vPage = 1;
    renderViewerResults();
  }

  function viewerAiSearch() {
    if (!ui.vKw.value.trim()) {
      showToast("请输入您的问题");
      return;
    }
    showToast("AI 增强检索：对标题/分类/摘要/时间做语义匹配");
    viewerSearch();
  }

  function baseTitle() {
    return state.current ? state.current.t.replace(/[（(].*$/, "") : "本文档";
  }

  function makeDefaultHistory(base) {
    const category = state.current?.cat || "行业";
    return [
      { q: "总结本文档的核心观点", a: `本文核心观点：${base}围绕${category}主题展开系统研究，绿色化与智能化是未来十年的确定性主线，企业应加大投入把握转型窗口。` },
      { q: "有哪些关键数据", a: "文档第二章给出核心数据：2026 年全球新接订单约 8,500 万载重吨，同比增长约 12%；新船价格指数较 2020 年低点上涨超 50%；替代燃料动力订单占比突破 40%。" },
      { q: "这份文档讲了哪几部分", a: "本文共分五章：第一章行业现状、第二章关键数据、第三章趋势研判、第四章对策建议、第五章结论，开篇为摘要。" },
      { q: "有哪些风险提示", a: "报告提示供应链韧性不足、核心设备与关键材料交付风险是需重点防范的供应链风险；建议加大绿色动力与智能系统研发投入，锁定长周期订单。" },
    ];
  }

  function historyFor(docId) {
    if (docId === null) return [];
    if (!state.history[docId]) state.history[docId] = makeDefaultHistory(baseTitle());
    return state.history[docId];
  }

  function renderHistoryPanel() {
    const messages = historyFor(state.active);
    ui.sessionList.innerHTML = messages.length
      ? messages.map((message) => `<div class="qa-q">${text(message.q)}</div><div class="qa-a">${text(message.a)}</div>`).join("")
      : '<div class="session-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v4l3 3 1.4-1.4-2.4-2.4V8zM12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8z"/></svg><span>暂无历史对话</span></div>';
  }

  function toggleSessionPanel() {
    const open = !ui.sessionPanel.classList.contains("show");
    if (open) {
      ui.sessionDoc.textContent = baseTitle();
      renderHistoryPanel();
    }
    ui.sessionPanel.classList.toggle("show", open);
    ui.qaHistory.setAttribute("aria-expanded", String(open));
  }

  function closeSessionPanel() {
    ui.sessionPanel.classList.remove("show");
    ui.qaHistory.setAttribute("aria-expanded", "false");
  }

  function renderPreview(doc) {
    const full = canFull(doc);
    const chapters = full ? content : content.slice(0, 2);
    let html = `<div class="pv-page" id="pvpage-1"><h4>${text(doc.t)}</h4><div style="color:#98a4b5;font-size:11px;margin-bottom:10px">${text(doc.author)} · ${text(doc.date)}</div>${content[0].paras.map((paragraph) => `<p>${text(paragraph)}</p>`).join("")}<div class="pn">- 1 -</div></div>`;
    for (let i = 1; i < chapters.length; i += 1) {
      const chapter = chapters[i];
      html += `<div class="pv-page" id="pvpage-${i + 1}"><h4>${text(chapter.h)}</h4>${chapter.paras.map((paragraph) => `<p>${text(paragraph)}</p>`).join("")}<div class="pn">- ${i + 1} -</div></div>`;
    }
    if (!full) {
      html += `<div class="pv-page pv-paywall" id="pvpaywall"><div class="paywall-mark">${doc.accessMode === "limited" ? "有限公开 · 付费文档" : "全部公开 · 权限受限"}</div><h4>试读结束</h4><p>${doc.accessMode === "limited" ? "非本部门用户仅可试读前 2 页。文档权限由所属部门管理员管理。" : "当前对象已被单独限制为部分权限，请联系文档所属部门管理员。"}</p></div>`;
    }
    ui.preview.innerHTML = html;
    ui.preview.scrollTop = 0;
  }

  function resetQA() {
    const full = Boolean(state.current && canFull(state.current));
    ui.qaInput.disabled = !full;
    const qaSend = document.querySelector('.qa-input [data-action=\'send-qa\']');
    if (qaSend) qaSend.disabled = !full;
    ui.qaInput.placeholder = full ? "针对本文档提问…" : "获得授权后可针对全文提问";
    ui.qaStream.innerHTML = full
      ? `<div class="qa-welcome">已加载《${text(state.current ? state.current.t : "本文档")}》全文<br>可就本文档内容提问，AI 将基于原文回答并标注出处</div>`
      : `<div class="qa-welcome limited">《${text(state.current ? state.current.t : "本文档")}》为有限公开文档<br>当前仅可试读前 2 页，问答暂不可用</div>`;
    ui.qaInput.value = "";
  }

  function answerFor(question) {
    if (question.includes("关键数据") || question.includes("数据")) return { answer: "本文档的核心数据集中在第二章：2026 年全球新接订单约 8,500 万载重吨，同比增长约 12%；新船价格指数较 2020 年低点上涨超 50%；替代燃料动力订单占比突破 40%，其中甲醇双燃料约 25%、LNG 约 18%。", refs: [3] };
    if (question.includes("结论") || question.includes("观点") || question.includes("总结")) return { answer: "本文的核心结论是：全球造船业仍处景气上行通道，绿色化与智能化是未来十年的确定性主线；企业应加大绿色动力与智能系统投入，把握技术转型窗口。", refs: [5, 6] };
    if (question.includes("几部分") || question.includes("结构") || question.includes("讲了")) return { answer: "本文共分五章：第一章行业现状、第二章关键数据、第三章趋势研判、第四章对策建议、第五章结论，开篇为摘要。", refs: [1, 2, 3, 4, 5, 6] };
    return { answer: `根据本文内容，围绕「${state.current ? state.current.t.replace(/[（(].*$/, "") : "本文档"}」这一主题展开系统研究，覆盖行业现状、关键数据与趋势研判。具体内容可点击下方出处定位到原文相应章节。`, refs: [2, 3, 4] };
  }

  function askQuestion(question) {
    if (!state.current || !canFull(state.current)) {
      showToast("有限公开文档获得全文授权后才可提问");
      return;
    }
    const docId = state.active;
    const stream = ui.qaStream;
    stream.insertAdjacentHTML("beforeend", `<div class="qa-q">${text(question)}</div>`);
    const typing = document.createElement("div");
    typing.className = "qa-typing";
    typing.textContent = "正在分析文档内容…";
    stream.append(typing);
    stream.scrollTop = stream.scrollHeight;
    window.setTimeout(() => {
      typing.remove();
      if (state.active !== docId) return;
      const reply = answerFor(question);
      const refs = reply.refs.map((pageNumber) => {
        const chapter = content[pageNumber - 1];
        return `<button class="qa-ref" type="button" data-action="scroll-page" data-page="${pageNumber}"><span class="n">第 ${pageNumber} 章</span> ·「${text(chapter.paras[0].slice(0, 26))}……」</button>`;
      }).join("");
      stream.insertAdjacentHTML("beforeend", `<div class="qa-a">${text(reply.answer)}<div class="qa-refs"><div class="qa-refs-t">引文出处（点击定位原文）</div>${refs}</div></div>`);
      stream.scrollTop = stream.scrollHeight;
      historyFor(docId).push({ q: question, a: reply.answer });
      renderHistoryPanel();
    }, 700);
  }

  function sendQuestion() {
    const question = ui.qaInput.value.trim();
    if (!question) {
      showToast("请输入问题");
      return;
    }
    askQuestion(question);
    ui.qaInput.value = "";
  }

  function scrollToPage(pageNumber) {
    const target = document.getElementById(`pvpage-${pageNumber}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    target.style.boxShadow = "0 0 0 2px #245bff";
    window.setTimeout(() => { target.style.boxShadow = ""; }, 1200);
  }

  function initResizer() {
    const panel = ui.qaPanel;
    const resizer = ui.qaResizer;
    resizer.addEventListener("mousedown", (event) => {
      event.preventDefault();
      panel.classList.remove("collapsed");
      const startX = event.clientX;
      const startWidth = panel.offsetWidth;
      resizer.classList.add("dragging");
      const move = (moveEvent) => {
        let width = startWidth - (moveEvent.clientX - startX);
        width = Math.max(260, Math.min(560, width));
        panel.style.flex = `0 0 ${width}px`;
      };
      const up = () => {
        resizer.classList.remove("dragging");
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
      };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    });
    resizer.addEventListener("dblclick", () => { panel.style.flex = "1 1 0%"; });
  }

  function handleAction(element, event) {
    const action = element.dataset.action;
    switch (action) {
      case "toggle-type": toggleType(); break;
      case "pick-type": pickType(element.dataset.type); break;
      case "search": doSearch(); break;
      case "ai-search": aiSearch(); break;
      case "category": switchCategory(element.dataset.category); break;
      case "tab": {
        state.tab = element.dataset.tab;
        ui.hotTabs.querySelectorAll(".tab").forEach((tab) => {
          const active = tab.dataset.tab === state.tab;
          tab.classList.toggle("active", active);
          tab.setAttribute("aria-selected", String(active));
        });
        renderHot();
        break;
      }
      case "more": openList(state.tab, state.tab === "hot" ? "热门" : "最新"); break;
      case "close-list": showSection("home"); break;
      case "close-search": closeSearch(); break;
      case "open-doc": openDetail(Number(element.dataset.docId), element); break;
      case "page": goToPage(element.dataset.scope, element.dataset.page); break;
      case "close-viewer": closeViewer(); break;
      case "toggle-side": toggleSide(); break;
      case "switch-doc": switchDoc(Number(element.dataset.docId)); break;
      case "close-tab": event.stopPropagation(); closeTab(Number(element.dataset.docId)); break;
      case "toggle-ideas": toggleIdeaPanel(); break;
      case "pick-idea": switchDoc(Number(element.dataset.docId)); break;
      case "download": downloadCurrent(); break;
      case "toggle-qa": toggleQAPanel(); break;
      case "toggle-history": toggleSessionPanel(); break;
      case "v-search": viewerSearch(); break;
      case "v-ai-search": viewerAiSearch(); break;
      case "v-clear": clearViewerKeyword(); break;
      case "send-qa": sendQuestion(); break;
      case "scroll-page": scrollToPage(Number(element.dataset.page)); break;
      default: break;
    }
  }

  document.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]");
    if (action) handleAction(action, event);
    if (!event.target.closest("#searchType")) closeType();
    if (!event.target.closest("#ideaPanel") && !event.target.closest("#ideaCollapse")) closeIdeaPanel();
    if (!event.target.closest("#sessionPanel") && !event.target.closest("#qaHistoryBtn")) closeSessionPanel();
  });

  document.addEventListener("change", (event) => {
    const select = event.target.closest("[data-page-size]");
    if (select) changePageSize(select.dataset.pageSize, select.value);
  });

  document.addEventListener("input", (event) => {
    if (event.target === ui.vKw) updateViewerClear();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target === ui.keyword) {
      event.preventDefault();
      doSearch();
    } else if (event.key === "Enter" && event.target === ui.qaInput) {
      event.preventDefault();
      sendQuestion();
    } else if (event.key === "Enter" && event.target === ui.vKw) {
      event.preventDefault();
      viewerSearch();
    } else if (event.key === "Escape") {
      if (ui.searchType.classList.contains("open")) closeType();
      else if (ui.ideaPanel.classList.contains("show")) closeIdeaPanel();
      else if (ui.sessionPanel.classList.contains("show")) closeSessionPanel();
      else if (ui.viewer.classList.contains("show")) closeViewer();
    } else if ((event.key === "Enter" || event.key === " ") && event.target.closest(".idea-tab") && !event.target.closest("[data-action='close-tab']")) {
      event.preventDefault();
      switchDoc(Number(event.target.closest(".idea-tab").dataset.docId));
    }
  });

  window.addEventListener("resize", () => {
    if (ui.viewer.classList.contains("show")) adjustTabs();
  });

  page.onDeactivate(() => {
    closeType();
    closeIdeaPanel();
    closeSessionPanel();
  });
  page.onActivate(() => {});

  function renderUserSelector() {
    if (!ui.user) return;
    const people = store.peopleForDept(state.department);
    ui.user.innerHTML = people.map((person) => `<option value="${text(person.id)}">${text(person.name)}</option>`).join("");
    state.user = store.getCurrentUser();
    if (!people.some((person) => person.id === state.user)) state.user = people[0]?.id || "";
    ui.user.value = state.user;
  }

  function initDeptSelector() {
    if (!ui.dept) return;
    ui.dept.innerHTML = store.departments.map((dept) => `<option value="${text(dept)}">${text(dept)}</option>`).join("");
    ui.dept.value = state.department;
    renderUserSelector();
    ui.dept.addEventListener("change", () => {
      state.department = ui.dept.value;
      store.setCurrentDept(state.department);
      renderUserSelector();
      closeViewer();
      showSection("home");
      renderHot();
    });
    ui.user?.addEventListener("change", () => {
      state.user = ui.user.value;
      store.setCurrentUser(state.user);
      closeViewer();
      showSection("home");
      renderHot();
    });
  }

  initResizer();
  initDeptSelector();
  renderCategories();
  renderTypes();
  renderHot();
  updateCategoryIndicator();

  setInterval(() => {
    if (!store.purgeExpired()) return;
    if (state.section === "sr") renderSearchResults();
    else if (state.section === "list") renderList();
    else renderHot();
    if (ui.viewer.classList.contains("show")) renderViewer();
  }, 30000);
})();
