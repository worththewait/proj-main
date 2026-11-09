(() => {
  "use strict";

  const { icon, escapeHtml } = window.BaigeUI;
  const secretFiles = window.BaigeSecretFileList;
  const root = document.querySelector("#kbSections");
  const empty = document.querySelector("#kbEmpty");
  const emptyTitle = document.querySelector("#kbEmptyTitle");
  const emptyCopy = document.querySelector("#kbEmptyCopy");
  const tabsRoot = document.querySelector("#kbTabs");
  const workbar = document.querySelector("#kbWorkbar");
  const searchForm = document.querySelector("#kbSearchForm");
  const searchInput = document.querySelector("#kbSearchInput");
  const searchScope = document.querySelector("#kbSearchScope");
  const typeFilterField = document.querySelector("#kbTypeFilterField");
  const typeFilter = document.querySelector("#kbTypeFilter");

  const {industryBases,enterpriseGroups,departmentGroups} = window.BaigeData.knowledgeDirectory;
  let personalDocs = [
    { id: "personal-writing", name: "专业写作专用", type: "文档", created: "2026-09-24 18:03:04", status: "passed" },
    { id: "personal-sensitive", name: "敏感词导入模板", type: "文档", created: "2026-10-15 10:05:30", status: "hit" },
  ];

  // One scope visible at a time; enterprise and department keep their org grouping.
  const SCOPES = [
    { key: "industry", label: "行业知识库" },
    { key: "enterprise", label: "企业知识库" },
    { key: "department", label: "部门知识库" },
    { key: "personal", label: "个人文档" },
  ];

  const state = {
    tab: "industry",
    query: "",
    searchScope: "current",
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
  const chevronIcon = '<svg class="kb-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

  let toastTimer = null;
  let actionDocumentId = null;
  function restoreActionFocus() {
    (root.querySelector(`[data-kb-edit="${actionDocumentId}"]`) || searchInput).focus({preventScroll:true});
  }
  function toast(message) {
    const node = document.querySelector("#kbToast");
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2200);
  }

  const text = (value) => escapeHtml(String(value ?? ""));
  const groupSize = (groups) => groups.reduce((total, group) => total + group.bases.length, 0);

  function matchesBase(base, organization = "") {
    if (!state.query) return true;
    return `${base.name} ${base.owner} ${base.description || descriptionFor(base)} ${organization}`.toLowerCase().includes(state.query);
  }

  function matchesDoc(doc) {
    if (state.type !== "all" && doc.type !== state.type) return false;
    if (!state.query) return true;
    return `${doc.name} ${doc.type}`.toLowerCase().includes(state.query);
  }

  function visibleGroups(groups, kind) {
    return groups
      .filter((group) => state[kind] === "all" || state[kind] === group.id)
      .map((group) => ({ ...group, bases: group.bases.filter(base => matchesBase(base, group.name)) }))
      .filter((group) => group.bases.length);
  }

  // ---- cards -------------------------------------------------------------

  function descriptionFor(base) {
    const descriptions={"知识问答参考文档":"常见研究问题与知识问答参考资料","船舶行业文献库":"船舶行业专业文献与研究资料","船舶行业研报库":"行业研究、市场观察与分析资料","船舶行业规范库":"船舶领域规范与标准相关资料","写作素材":"写作素材与日常材料参考","问答知识库":"业务知识与常见问题参考"};
    return descriptions[base.name] || "共享知识资料，可在独立问答页中使用";
  }
  function baseRow(base, scopeLabel, showScope=false) {
    return `<button class="kb-index-row kb-resource-card" type="button" data-kb-open="${text(base.id)}" data-kb-name="${text(base.name)}" data-kb-scope="${text(scopeLabel)}" aria-label="进入${text(base.name)}问答">
      <span class="kb-resource-top"><span class="kb-resource-icon"><img src="../assets/knowledge-folder.svg" alt="" width="40" height="40"></span>
      <span class="kb-resource-copy"><strong>${text(base.name)}</strong><span class="kb-resource-owner">${text(base.owner)}</span></span></span>
      ${showScope?`<span class="kb-resource-scope">${text(scopeLabel)}</span>`:""}
      <span class="kb-resource-footer"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 3"/></svg><time datetime="${text(base.time.replace(" ","T"))}">${text(base.time)}</time></span></button>`;
  }
  function industryGrid(rows) {return `<div class="kb-index-list">${rows.map(base=>baseRow(base,"行业")).join("")}</div>`;}
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
    if (state.searchScope === "all" || state.tab === "industry") industryBases.filter(base=>matchesBase(base)).forEach((base) => rows.push({ kind: "base", scope: "行业", base }));
    if (state.searchScope === "all" || state.tab === "enterprise") enterpriseGroups.filter(group=>state.searchScope === "all" || state.enterprise === "all" || state.enterprise===group.id).forEach((group) => group.bases.filter(base=>matchesBase(base,group.name)).forEach((base) => {
      rows.push({ kind: "base", scope: `企业 · ${group.name}`, base });
    }));
    if (state.searchScope === "all" || state.tab === "department") departmentGroups.filter(group=>state.searchScope === "all" || state.department === "all" || state.department===group.id).forEach((group) => group.bases.filter(base=>matchesBase(base,group.name)).forEach((base) => {
      rows.push({ kind: "base", scope: `部门 · ${group.name}`, base });
    }));
    if (state.searchScope === "all" || state.tab === "personal") personalDocs.filter(matchesDoc).forEach((doc) => rows.push({ kind: "doc", scope: "个人", doc }));
    return rows;
  }

  function resultList(rows) {
    const bases = rows.filter(row => row.kind === "base");
    const documents = rows.filter(row => row.kind === "doc").map(row => row.doc);
    return `<div class="kb-results">${bases.map(row => baseRow(row.base, row.scope, true)).join("")}</div>${documents.length ? personalPanel(documents) : ""}`;
  }

  // ---- personal table ----------------------------------------------------

  function docAction(doc, action, glyph, label, disabled = false) {
    return `<button type="button" class="secret-file-icon${action === "delete" ? " is-danger" : ""}" data-kb-${action}="${text(doc.id)}" aria-label="${label} ${text(doc.name)}" title="${label}"${disabled ? " disabled" : ""}>${icon(glyph)}</button>`;
  }

  function personalPanel(rows) {
    const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.pageSize;
    const visible = rows.slice(start, start + state.pageSize);
    const body = visible.length ? visible.map((doc) => {
      const allowed = secretFiles.canView(doc.status);
      return `<tr>
        <td><button type="button" class="kb-file-edit" data-kb-edit="${text(doc.id)}" title="编辑文件信息">${text(doc.name)}</button></td>
        <td>${secretFiles.time(doc.created)}</td>
        <td>${secretFiles.status(doc.status, docAction(doc, "audit", "eye", "查看涉密详情"))}</td>
        <td><div class="secret-file-actions">
          ${docAction(doc, "preview", "file", "查看文件", !allowed)}
          ${docAction(doc, "download", "download", allowed ? "原文件未接入，暂不可下载" : "通过涉密审查后可下载", true)}
          ${docAction(doc, "delete", "trash", "删除文件")}
        </div></td>
      </tr>`;
    }).join("") : '<tr><td colspan="4">没有匹配的知识文档</td></tr>';
    let pageButtons = `<button class="kb-page-button" type="button" data-kb-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="上一页">‹</button>`;
    for (let page = 1; page <= pages; page += 1) pageButtons += `<button class="kb-page-button${page === state.page ? " is-current" : ""}" type="button" data-kb-page="${page}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`;
    pageButtons += `<button class="kb-page-button" type="button" data-kb-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""} aria-label="下一页">›</button>`;
    return `<div class="kb-personal-panel">
      <div class="secret-file-table-wrap"><table class="secret-file-table">
        ${secretFiles.head}
        <tbody>${body}</tbody>
      </table></div>
      <footer class="kb-pager"><span>${rows.length} 条</span><div class="kb-pages">${pageButtons}</div><select data-kb-page-size aria-label="每页条数"><option value="10"${state.pageSize === 10 ? " selected" : ""}>10 条/页</option><option value="20"${state.pageSize === 20 ? " selected" : ""}>20 条/页</option><option value="50"${state.pageSize === 50 ? " selected" : ""}>50 条/页</option></select></footer>
    </div>`;
  }

  // ---- chrome ------------------------------------------------------------

  function tabCount(key) {
    return key === "industry" ? industryBases.length : key === "enterprise" ? groupSize(enterpriseGroups) : key === "department" ? groupSize(departmentGroups) : personalDocs.length;
  }

  function renderTabs() {
    tabsRoot.innerHTML = SCOPES.map((scope) => {
      const active = state.tab === scope.key;
      return `<button class="kb-tab${active ? " is-active" : ""}" type="button" role="tab" id="kb-tab-${scope.key}" aria-selected="${active}" aria-controls="kbSections" tabindex="${active ? 0 : -1}" data-kb-tab="${scope.key}">${scope.label}<span class="kb-tab-count">${tabCount(scope.key)}</span></button>`;
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
      workbar.innerHTML = `<p class="kb-workbar-text">${state.searchScope === "all" ? "全部分类" : SCOPES.find(scope=>scope.key===state.tab).label} · 搜索「${text(state.query)}」· ${searchResults().length} 个结果</p><button class="kb-text-button" type="button" data-kb-clear-search>清除搜索</button>`;
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
      workbar.innerHTML = `<p class="kb-workbar-text">显示 ${personalDocs.filter(matchesDoc).length} 个文档 · 共 ${personalDocs.length} 个</p>`;
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
    typeFilterField.hidden = state.tab !== "personal";
    searchInput.placeholder = state.tab === "personal" ? "搜索个人文档名称" : "搜索知识库名称、简介或所属组织";
    searchInput.setAttribute("aria-label",searchInput.placeholder);
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
      const rows = industryBases.filter(base=>matchesBase(base));
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
    state.searchScope = "current";
    searchScope.value = "current";
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
    state.editId = id;actionDocumentId=id;
    document.querySelector("#kbEditName").value = doc.name;
    document.querySelector("#kbEditType").value = doc.type;
    document.querySelector("#kbEditFeedback").textContent = "";
    document.querySelector("#kbEditDialog").showModal();
    document.querySelector("#kbEditName").focus({ preventScroll: true });
  }

  function openDelete(id) {
    const doc = personalDocs.find((item) => item.id === id);
    if (!doc) return;
    state.deleteId = id;actionDocumentId=id;
    document.querySelector("#kbDeleteName").textContent = `「${doc.name}」`;
    document.querySelector("#kbDeleteDialog").showModal();
    document.querySelector("#kbDeleteCancel").focus({ preventScroll: true });
  }

  function openDocumentDetail(id, audit) {
    const doc = personalDocs.find(item => item.id === id);
    if (!doc || (!audit && !secretFiles.canView(doc.status))) return;
    actionDocumentId = id;
    document.querySelector("#kbDocumentTitle").textContent = audit ? "涉密审查详情" : "查看文件";
    document.querySelector("#kbDocumentName").textContent = doc.name;
    document.querySelector("#kbDocumentStatus").textContent = secretFiles.label(doc.status);
    document.querySelector("#kbDocumentCopy").textContent = audit
      ? (secretFiles.canView(doc.status) ? "该文档已通过涉密审查。" : "此示例文档标记为涉密可疑，通过审查后才能查看正文。")
      : "文档正文待接入。";
    document.querySelector("#kbDocumentDialog").showModal();
  }

  // ---- events ------------------------------------------------------------

  searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.query = searchInput.value.trim().toLowerCase();
    state.page = 1;
    render();
  });
  searchScope.addEventListener("change",()=>{state.searchScope=searchScope.value === "all" ? "all" : "current";state.query=searchInput.value.trim().toLowerCase();state.page=1;render();});
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
      toast(`已选择「${open.dataset.kbName || "知识库"}」，独立知识问答页面待接入。`);
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
    const audit = event.target.closest("[data-kb-audit]");
    if (audit) { openDocumentDetail(audit.dataset.kbAudit, true); return; }
    const preview = event.target.closest("[data-kb-preview]");
    if (preview) { openDocumentDetail(preview.dataset.kbPreview, false); return; }
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
    restoreActionFocus();
    toast("知识文档已保存");
  });
  document.querySelector("#kbDeleteClose").addEventListener("click", () => document.querySelector("#kbDeleteDialog").close());
  document.querySelector("#kbDeleteCancel").addEventListener("click", () => document.querySelector("#kbDeleteDialog").close());
  document.querySelector("#kbDeleteConfirm").addEventListener("click", () => {
    personalDocs = personalDocs.filter((doc) => doc.id !== state.deleteId);
    document.querySelector("#kbDeleteDialog").close();
    render();
    restoreActionFocus();
    toast("知识文档已删除");
  });

  document.querySelector("#kbDocumentClose").addEventListener("click", () => document.querySelector("#kbDocumentDialog").close());
  for (const id of ["kbEditDialog", "kbDeleteDialog", "kbDocumentDialog"]) {
    document.querySelector(`#${id}`).addEventListener("close", restoreActionFocus);
  }

  const initialTab = decodeURIComponent(location.hash.slice(1));
  if (SCOPES.some((scope) => scope.key === initialTab)) state.tab = initialTab;

  render();
  if (window.BaigePage) window.BaigePage.onActivate(function () {});
})();
