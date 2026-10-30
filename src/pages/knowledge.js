(() => {
  "use strict";

  const { icon, escapeHtml } = window.BaigeUI;
  const root = document.querySelector("#kbSections");
  const empty = document.querySelector("#kbEmpty");
  const emptyTitle = document.querySelector("#kbEmptyTitle");
  const emptyCopy = document.querySelector("#kbEmptyCopy");
  const tabsRoot = document.querySelector("#kbTabs");
  const workbar = document.querySelector("#kbWorkbar");
  const searchForm = document.querySelector("#kbSearchForm");
  const searchInput = document.querySelector("#kbSearchInput");
  const typeFilter = document.querySelector("#kbTypeFilter");

  const industryBases = [
    { id: "industry-qa", name: "知识问答参考文档", owner: "系统管理员", time: "2026-10-28 13:32:05" },
    { id: "industry-doc", name: "船舶行业文献库", owner: "yym", time: "2026-10-21 16:03:03" },
    { id: "industry-report", name: "船舶行业研报库", owner: "系统管理员", time: "2026-10-21 16:02:36" },
    { id: "industry-standard", name: "船舶行业规范库", owner: "企行上传", time: "2026-10-21 16:02:06" },
  ];
  const enterpriseGroups = [
    {
      id: "enterprise-714",
      name: "714所",
      bases: [
        { id: "enterprise-714-0928", name: "714所0928", owner: "系统管理员", time: "2026-10-09 10:36:28" },
        { id: "enterprise-714-main", name: "714企业知识库", owner: "系统管理员", time: "2026-09-23 18:24:15" },
      ],
    },
    {
      id: "enterprise-cimtec",
      name: "中国船舶综合经济技术研究院",
      bases: [
        { id: "enterprise-cimtec-qa", name: "问答知识库", owner: "系统管理员", time: "2026-09-29 16:41:47", tone: "violet" },
        { id: "enterprise-cimtec-writing", name: "写作素材", owner: "系统管理员", time: "2026-09-24 17:34:56", tone: "violet" },
        { id: "enterprise-cimtec-main", name: "企业知识库", owner: "吴昊", time: "2026-09-23 17:23:23" },
      ],
    },
  ];
  const departmentGroups = [
    {
      id: "department-after",
      name: "售后部",
      bases: [
        { id: "department-after-main", name: "售后", owner: "售后2", time: "2026-10-23 10:24:29", tone: "gradient" },
      ],
    },
    {
      id: "department-hr",
      name: "HR部",
      bases: [
        { id: "department-hr-ces", name: "ces", owner: "系统管理员", time: "2026-10-22 18:47:11" },
        { id: "department-hr-test", name: "测试权限", owner: "系统管理员", time: "2026-09-30 09:48:52" },
        { id: "department-hr-0930", name: "测试0930", owner: "文库上传", time: "2026-09-30 09:48:04" },
        { id: "department-hr-0929", name: "测试0929", owner: "文库上传", time: "2026-09-29 14:14:23" },
      ],
    },
    {
      id: "department-714",
      name: "714部门2",
      bases: [
        { id: "department-714-main", name: "测试1020", owner: "系统管理员", time: "2026-10-20 13:52:25" },
      ],
    },
    {
      id: "department-news",
      name: "新闻部",
      bases: [
        { id: "department-news-create", name: "新闻部知识库创建", owner: "yym", time: "2026-09-24 10:11:22" },
        { id: "department-news-test", name: "新闻部test", owner: "系统管理员", time: "2026-09-23 11:38:25" },
      ],
    },
  ];
  let personalDocs = [
    { id: "personal-writing", name: "专业写作专用", type: "文档", tone: "yellow", created: "2026-09-24 18:03:04", updated: "2026-09-24 18:03:04", status: "" },
    { id: "personal-sensitive", name: "敏感词导入模板", type: "文档", tone: "gray", created: "2026-10-15 10:05:30", updated: "2026-10-15 10:05:44", status: "涉密可疑" },
  ];

  // One scope visible at a time; enterprise and department keep their org grouping.
  const SCOPES = [
    { key: "industry", label: "行业知识库" },
    { key: "enterprise", label: "企业知识库" },
    { key: "department", label: "部门知识库" },
    { key: "personal", label: "个人知识库" },
  ];

  const state = {
    tab: "industry",
    query: "",
    type: "all",
    enterprise: "all",
    department: "all",
    page: 1,
    pageSize: 10,
    collapsed: new Set(),
    editId: null,
    deleteId: null,
  };

  const plusIcon = '<svg class="kb-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>';
  const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4Z"/><path d="m14 6 4 4"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
  const eyeIcon = '<svg class="kb-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';
  const chevronIcon = '<svg class="kb-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

  let toastTimer = null;
  function toast(message) {
    const node = document.querySelector("#kbToast");
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2200);
  }

  const text = (value) => escapeHtml(String(value ?? ""));
  const dateOnly = (value) => String(value ?? "").slice(0, 10);
  const groupSize = (groups) => groups.reduce((total, group) => total + group.bases.length, 0);

  function matchesBase(base) {
    if (!state.query) return true;
    return `${base.name} ${base.owner}`.toLowerCase().includes(state.query);
  }

  function matchesDoc(doc) {
    if (state.type !== "all" && doc.type !== state.type) return false;
    if (!state.query) return true;
    return `${doc.name} ${doc.type}`.toLowerCase().includes(state.query);
  }

  function visibleGroups(groups, kind) {
    return groups
      .filter((group) => state[kind] === "all" || state[kind] === group.id)
      .map((group) => ({ ...group, bases: group.bases.filter(matchesBase) }))
      .filter((group) => group.bases.length);
  }

  // ---- cards -------------------------------------------------------------

  function baseCard(base, scopeLabel) {
    const tone = base.tone ? ` is-${base.tone}` : "";
    return `<button class="kb-card" type="button" data-kb-open="${text(base.id)}" data-kb-name="${text(base.name)}" data-kb-scope="${text(scopeLabel)}" aria-label="打开知识库${text(base.name)}">
      <span class="kb-folder${tone}">${icon("folder")}</span>
      <span class="kb-card-copy">
        <strong title="${text(base.name)}">${text(base.name)}</strong>
        <span class="kb-card-meta">${text(base.owner)}<i>·</i>${text(dateOnly(base.time))}</span>
      </span>
      <span class="kb-card-go" aria-hidden="true">${chevronIcon}</span>
    </button>`;
  }

  // Enterprise and department knowledge bases read as an index: aligned columns,
  // the whole row is the hit area, metadata lines up across every group.
  function baseRow(base, scopeLabel) {
    const tone = base.tone ? ` is-${base.tone}` : "";
    return `<button class="kb-row" type="button" data-kb-open="${text(base.id)}" data-kb-name="${text(base.name)}" data-kb-scope="${text(scopeLabel)}" aria-label="打开知识库${text(base.name)}">
      <span class="kb-folder${tone}">${icon("folder")}</span>
      <span class="kb-row-name" title="${text(base.name)}">${text(base.name)}</span>
      <span class="kb-row-owner">${text(base.owner)}</span>
      <span class="kb-row-time">${text(dateOnly(base.time))}</span>
      <span class="kb-row-go" aria-hidden="true">${chevronIcon}</span>
    </button>`;
  }

  function industryGrid(rows) {
    return `<div class="kb-grid kb-grid-lg">${rows.map((base) => baseCard(base, "行业")).join("")}</div>`;
  }

  function groupRows(groups, kind) {
    const scopeLabel = kind === "enterprise" ? "企业" : "部门";
    return groups.map((group) => {
      const collapsed = state.collapsed.has(group.id);
      return `<section class="kb-group${collapsed ? " is-collapsed" : ""}">
        <button class="kb-group-head" type="button" data-kb-collapse="${text(group.id)}" aria-expanded="${!collapsed}">
          <span class="kb-group-name">${text(group.name)}</span>
          <span class="kb-group-count">${group.bases.length} 个知识库</span>
          <span class="kb-group-toggle" aria-hidden="true">${chevronIcon}</span>
        </button>
        <div class="kb-group-body">
          <div class="kb-rows">${group.bases.map((base) => baseRow(base, `${scopeLabel} · ${group.name}`)).join("")}</div>
        </div>
      </section>`;
    }).join("");
  }

  // ---- search ------------------------------------------------------------

  function searchResults() {
    const rows = [];
    industryBases.filter(matchesBase).forEach((base) => rows.push({ kind: "base", scope: "行业", base }));
    enterpriseGroups.forEach((group) => group.bases.filter(matchesBase).forEach((base) => {
      rows.push({ kind: "base", scope: `企业 · ${group.name}`, base });
    }));
    departmentGroups.forEach((group) => group.bases.filter(matchesBase).forEach((base) => {
      rows.push({ kind: "base", scope: `部门 · ${group.name}`, base });
    }));
    personalDocs.filter(matchesDoc).forEach((doc) => rows.push({ kind: "doc", scope: "个人", doc }));
    return rows;
  }

  function resultList(rows) {
    return `<div class="kb-results">${rows.map((row) => {
      if (row.kind === "doc") {
        const doc = row.doc;
        return `<div class="kb-result">
          <span class="kb-doc-icon is-${text(doc.tone)}">${icon("file")}</span>
          <span class="kb-result-main">
            <strong>${text(doc.name)}</strong>
            <small>${text(doc.type)} · 更新于 ${text(doc.updated)}</small>
          </span>
          <span class="kb-result-scope">${text(row.scope)}</span>
          <span class="kb-result-actions"><button class="kb-icon-button" type="button" data-kb-edit="${text(doc.id)}" aria-label="编辑${text(doc.name)}">${editIcon}</button></span>
        </div>`;
      }
      const base = row.base;
      const tone = base.tone ? ` is-${base.tone}` : "";
      return `<div class="kb-result">
        <span class="kb-folder${tone}">${icon("folder")}</span>
        <span class="kb-result-main">
          <strong>${text(base.name)}</strong>
          <small>${text(base.owner)} · 创建于 ${text(base.time)}</small>
        </span>
        <span class="kb-result-scope">${text(row.scope)}</span>
        <span class="kb-result-actions"><button class="kb-result-open" type="button" data-kb-open="${text(base.id)}" data-kb-name="${text(base.name)}" data-kb-scope="${text(row.scope)}">打开${chevronIcon}</button></span>
      </div>`;
    }).join("")}</div>`;
  }

  // ---- personal table ----------------------------------------------------

  function personalPanel(rows) {
    const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.pageSize;
    const visible = rows.slice(start, start + state.pageSize);
    const body = visible.length ? visible.map((doc) => `<tr>
      <td><div class="kb-doc-title"><span class="kb-doc-icon is-${text(doc.tone)}">${icon("file")}</span><span class="kb-doc-name" title="${text(doc.name)}">${text(doc.name)}</span></div></td>
      <td>${text(doc.created)}</td>
      <td>${text(doc.updated)}</td>
      <td>${doc.status ? `<span class="kb-status">${text(doc.status)}${eyeIcon}</span>` : ""}</td>
      <td><div class="kb-actions"><button class="kb-icon-button" type="button" data-kb-edit="${text(doc.id)}" aria-label="编辑${text(doc.name)}">${editIcon}</button><button class="kb-icon-button is-danger" type="button" data-kb-delete="${text(doc.id)}" aria-label="删除${text(doc.name)}">${trashIcon}</button></div></td>
    </tr>`).join("") : '<tr><td class="kb-empty-cell" colspan="5">没有匹配的知识文档</td></tr>';
    let pageButtons = `<button class="kb-page-button" type="button" data-kb-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="上一页">‹</button>`;
    for (let page = 1; page <= pages; page += 1) pageButtons += `<button class="kb-page-button${page === state.page ? " is-current" : ""}" type="button" data-kb-page="${page}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`;
    pageButtons += `<button class="kb-page-button" type="button" data-kb-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""} aria-label="下一页">›</button>`;
    return `<div class="kb-personal-panel">
      <div class="kb-table-wrap"><table class="kb-table">
        <thead><tr><th class="kb-col-name" scope="col">文档名称</th><th class="kb-col-date" scope="col">创建时间</th><th class="kb-col-date" scope="col">最近更新</th><th class="kb-col-status" scope="col">文档状态</th><th class="kb-col-actions" scope="col">操作</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div>
      <footer class="kb-pager"><span>${rows.length} 条</span><div class="kb-pages">${pageButtons}</div><select data-kb-page-size aria-label="每页条数"><option value="10"${state.pageSize === 10 ? " selected" : ""}>10 条/页</option><option value="20"${state.pageSize === 20 ? " selected" : ""}>20 条/页</option><option value="50"${state.pageSize === 50 ? " selected" : ""}>50 条/页</option></select></footer>
    </div>`;
  }

  // ---- chrome ------------------------------------------------------------

  function tabCount(key) {
    if (!state.query) {
      if (key === "industry") return industryBases.length;
      if (key === "enterprise") return groupSize(enterpriseGroups);
      if (key === "department") return groupSize(departmentGroups);
      return personalDocs.length;
    }
    return searchResults().filter((row) => {
      if (key === "personal") return row.kind === "doc";
      if (key === "industry") return row.kind === "base" && row.scope === "行业";
      return row.kind === "base" && row.scope.startsWith(key === "enterprise" ? "企业" : "部门");
    }).length;
  }

  function renderTabs() {
    tabsRoot.innerHTML = SCOPES.map((scope) => {
      const active = !state.query && state.tab === scope.key;
      return `<button class="kb-tab${active ? " is-active" : ""}" type="button" role="tab" id="kb-tab-${scope.key}" aria-selected="${active}" aria-controls="kbSections" tabindex="${active || (state.query && scope.key === SCOPES[0].key) ? 0 : -1}" data-kb-tab="${scope.key}">${scope.label}<span class="kb-tab-count">${tabCount(scope.key)}</span></button>`;
    }).join("");
    if (state.query) {
      root.setAttribute("aria-label", "搜索结果");
      root.removeAttribute("aria-labelledby");
    } else {
      root.setAttribute("aria-labelledby", `kb-tab-${state.tab}`);
      root.removeAttribute("aria-label");
    }
  }

  function renderWorkbar() {
    workbar.hidden = false;
    if (state.query) {
      workbar.innerHTML = `<p class="kb-workbar-text">搜索「${text(state.query)}」· ${searchResults().length} 个结果</p><button class="kb-text-button" type="button" data-kb-clear-search>清除搜索</button>`;
      return;
    }
    if (state.tab === "enterprise" || state.tab === "department") {
      const kind = state.tab;
      const groups = kind === "enterprise" ? enterpriseGroups : departmentGroups;
      const label = kind === "enterprise" ? "企业" : "部门";
      const allLabel = kind === "enterprise" ? "全部企业" : "全部部门";
      const visible = visibleGroups(groups, kind);
      workbar.innerHTML = `<label class="kb-filter"><span class="sr-only">筛选${label}</span><select data-kb-filter="${kind}" aria-label="筛选${label}"><option value="all">${allLabel}</option>${groups.map((group) => `<option value="${text(group.id)}"${state[kind] === group.id ? " selected" : ""}>${text(group.name)}</option>`).join("")}</select></label>
        <p class="kb-workbar-text">${groupSize(visible)} 个知识库</p>`;
      return;
    }
    if (state.tab === "personal") {
      workbar.innerHTML = `<p class="kb-workbar-text">${personalDocs.length} 个文档</p><button class="kb-primary-button" type="button" data-kb-space>${plusIcon}我的知识库空间</button>`;
      return;
    }
    // The tab already shows the count, so the industry view needs no toolbar.
    workbar.innerHTML = "";
    workbar.hidden = true;
  }

  function setEmpty(title, copy) {
    emptyTitle.textContent = title;
    emptyCopy.textContent = copy;
  }

  function render() {
    renderTabs();
    renderWorkbar();
    let html = "";
    let hasItems = true;

    if (state.query) {
      const rows = searchResults();
      hasItems = rows.length > 0;
      html = hasItems ? resultList(rows) : "";
      setEmpty("没有找到匹配的知识库", "试试其他关键词，或换用行业、企业名称搜索。");
    } else if (state.tab === "personal") {
      const rows = personalDocs.filter(matchesDoc);
      hasItems = rows.length > 0;
      html = hasItems ? personalPanel(rows) : "";
      setEmpty("没有匹配的知识文档", "试试其他关键词，或调整文件类型筛选。");
    } else if (state.tab === "industry") {
      const rows = industryBases.filter(matchesBase);
      hasItems = rows.length > 0;
      html = hasItems ? industryGrid(rows) : "";
      setEmpty("没有匹配的行业知识库", "试试其他关键词。");
    } else {
      const kind = state.tab;
      const groups = visibleGroups(kind === "enterprise" ? enterpriseGroups : departmentGroups, kind);
      hasItems = groups.length > 0;
      html = hasItems ? `<div class="kb-sheet">${groupRows(groups, kind)}</div>` : "";
      setEmpty(kind === "enterprise" ? "没有匹配的企业知识库" : "没有匹配的部门知识库", "换个企业或部门筛选，或清空关键词。");
    }

    root.innerHTML = html;
    empty.hidden = hasItems;
    // In search mode the workbar already offers "清除搜索"; avoid a second identical action.
    document.querySelector("#kbReset").hidden = Boolean(state.query);
    root.classList.remove("is-enter");
    void root.offsetWidth;
    root.classList.add("is-enter");
  }

  function resetFilters() {
    state.query = "";
    state.type = "all";
    state.enterprise = "all";
    state.department = "all";
    state.page = 1;
    state.collapsed.clear();
    searchInput.value = "";
    typeFilter.value = "all";
    render();
  }

  function focusTab(key) {
    tabsRoot.querySelector(`[data-kb-tab="${key}"]`)?.focus({ preventScroll: true });
  }

  function switchTab(key, moveFocus = false) {
    if (!SCOPES.some((scope) => scope.key === key)) return;
    state.tab = key;
    state.query = "";
    state.page = 1;
    searchInput.value = "";
    render();
    if (moveFocus) focusTab(key);
    if (location.hash.slice(1) !== key) {
      try { history.replaceState(null, "", `#${key}`); } catch { location.hash = key; }
    }
  }

  // ---- dialogs -----------------------------------------------------------

  function openEdit(id) {
    const doc = personalDocs.find((item) => item.id === id);
    if (!doc) return;
    state.editId = id;
    document.querySelector("#kbEditName").value = doc.name;
    document.querySelector("#kbEditType").value = doc.type;
    document.querySelector("#kbEditFeedback").textContent = "";
    document.querySelector("#kbEditDialog").showModal();
    document.querySelector("#kbEditName").focus({ preventScroll: true });
  }

  function openDelete(id) {
    const doc = personalDocs.find((item) => item.id === id);
    if (!doc) return;
    state.deleteId = id;
    document.querySelector("#kbDeleteName").textContent = `「${doc.name}」`;
    document.querySelector("#kbDeleteDialog").showModal();
    document.querySelector("#kbDeleteCancel").focus({ preventScroll: true });
  }

  // ---- events ------------------------------------------------------------

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = searchInput.value.trim().toLowerCase();
    state.page = 1;
    render();
  });
  typeFilter.addEventListener("change", () => {
    state.type = typeFilter.value;
    state.page = 1;
    render();
  });

  tabsRoot.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-kb-tab]");
    if (tab) switchTab(tab.dataset.kbTab, event.detail === 0);
  });
  tabsRoot.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const index = SCOPES.findIndex((scope) => scope.key === state.tab);
    const next = event.key === "Home" ? 0 : event.key === "End" ? SCOPES.length - 1
      : event.key === "ArrowRight" ? (index + 1) % SCOPES.length : (index - 1 + SCOPES.length) % SCOPES.length;
    switchTab(SCOPES[next].key, true);
  });

  workbar.addEventListener("click", (event) => {
    if (event.target.closest("[data-kb-clear-search]")) {
      state.query = "";
      searchInput.value = "";
      render();
      searchInput.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-kb-space]")) toast("已进入我的知识库空间");
  });
  workbar.addEventListener("change", (event) => {
    const filter = event.target.closest("[data-kb-filter]");
    if (!filter) return;
    state[filter.dataset.kbFilter] = filter.value;
    state.page = 1;
    render();
  });

  root.addEventListener("click", (event) => {
    const open = event.target.closest("[data-kb-open]");
    if (open) {
      const scope = open.dataset.kbScope || "";
      toast(scope ? `已打开${scope}知识库「${open.dataset.kbName}」` : `已打开知识库「${open.dataset.kbName}」`);
      return;
    }
    const collapse = event.target.closest("[data-kb-collapse]");
    if (collapse) {
      const id = collapse.dataset.kbCollapse;
      if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
      render();
      // Keyboard users keep their place; pointer users do not get a stray focus ring.
      if (event.detail === 0) root.querySelector(`[data-kb-collapse="${id}"]`)?.focus({ preventScroll: true });
      return;
    }
    const edit = event.target.closest("[data-kb-edit]");
    if (edit) { openEdit(edit.dataset.kbEdit); return; }
    const remove = event.target.closest("[data-kb-delete]");
    if (remove) { openDelete(remove.dataset.kbDelete); return; }
    const page = event.target.closest("[data-kb-page]");
    if (page && !page.disabled) { state.page = Number(page.dataset.kbPage); render(); }
  });

  root.addEventListener("change", (event) => {
    const size = event.target.closest("[data-kb-page-size]");
    if (!size) return;
    state.pageSize = Number(size.value);
    state.page = 1;
    render();
  });

  document.querySelector("#kbReset").addEventListener("click", resetFilters);
  document.querySelector("#kbEditClose").addEventListener("click", () => document.querySelector("#kbEditDialog").close());
  document.querySelector("#kbEditCancel").addEventListener("click", () => document.querySelector("#kbEditDialog").close());
  document.querySelector("#kbEditForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = document.querySelector("#kbEditName").value.trim();
    const feedback = document.querySelector("#kbEditFeedback");
    if (!name) {
      feedback.textContent = "请填写知识文档名称。";
      document.querySelector("#kbEditName").focus();
      return;
    }
    const doc = personalDocs.find((item) => item.id === state.editId);
    if (doc) {
      doc.name = name;
      doc.type = document.querySelector("#kbEditType").value;
    }
    document.querySelector("#kbEditDialog").close();
    render();
    toast("知识文档已保存");
  });
  document.querySelector("#kbDeleteClose").addEventListener("click", () => document.querySelector("#kbDeleteDialog").close());
  document.querySelector("#kbDeleteCancel").addEventListener("click", () => document.querySelector("#kbDeleteDialog").close());
  document.querySelector("#kbDeleteConfirm").addEventListener("click", () => {
    personalDocs = personalDocs.filter((doc) => doc.id !== state.deleteId);
    document.querySelector("#kbDeleteDialog").close();
    render();
    toast("知识文档已删除");
  });

  const initialTab = decodeURIComponent(location.hash.slice(1));
  if (SCOPES.some((scope) => scope.key === initialTab)) state.tab = initialTab;

  render();
  if (window.BaigePage) window.BaigePage.onActivate(function () {});
})();
