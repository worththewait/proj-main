(() => {
  "use strict";

  const { icon, escapeHtml } = window.BaigeUI;
  const root = document.querySelector("#kbSections");
  const empty = document.querySelector("#kbEmpty");
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

  const state = {
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

  const clockIcon = '<svg class="kb-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>';
  const plusIcon = '<svg class="kb-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16M4 12h16"/></svg>';
  const editIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4Z"/><path d="m14 6 4 4"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';
  const eyeIcon = '<svg class="kb-inline-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>';

  let toastTimer = null;
  function toast(message) {
    const node = document.querySelector("#kbToast");
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2200);
  }

  function matchesBase(base) {
    if (!state.query) return true;
    return `${base.name} ${base.owner}`.toLowerCase().includes(state.query);
  }

  function matchesDoc(doc) {
    if (state.type !== "all" && doc.type !== state.type) return false;
    if (!state.query) return true;
    return `${doc.name} ${doc.type}`.toLowerCase().includes(state.query);
  }

  function visibleGroups(groups) {
    return groups
      .filter((group) => state[group.id.startsWith("enterprise") ? "enterprise" : "department"] === "all" || state[group.id.startsWith("enterprise") ? "enterprise" : "department"] === group.id)
      .map((group) => ({ ...group, bases: group.bases.filter(matchesBase) }))
      .filter((group) => group.bases.length);
  }

  function baseCard(base) {
    const tone = base.tone ? ` is-${base.tone}` : "";
    return `<button class="kb-card" type="button" data-kb-open="${escapeHtml(base.id)}" data-kb-name="${escapeHtml(base.name)}" aria-label="打开知识库${escapeHtml(base.name)}">
      <span class="kb-folder${tone}">${icon("folder")}</span>
      <span class="kb-card-copy"><strong>${escapeHtml(base.name)}</strong><span class="kb-card-owner">${escapeHtml(base.owner)}</span><span class="kb-card-time">${clockIcon}${escapeHtml(base.time)}</span></span>
    </button>`;
  }

  function groupMarkup(group) {
    const collapsed = state.collapsed.has(group.id);
    return `<section class="kb-group">
      <div class="kb-group-head"><span class="kb-group-title"><span>${escapeHtml(group.name)}</span><em>（${group.bases.length}个知识库）</em></span><button class="kb-collapse" type="button" data-kb-collapse="${escapeHtml(group.id)}" aria-expanded="${!collapsed}">${collapsed ? "展开" : "收起"}</button></div>
      <div class="kb-grid${collapsed ? " is-collapsed" : ""}" aria-hidden="${collapsed}">${group.bases.map(baseCard).join("")}</div>
    </section>`;
  }

  function filterRow(kind, groups) {
    const label = kind === "enterprise" ? "企业" : "部门";
    const allLabel = kind === "enterprise" ? "全部企业" : "全部部门";
    const source = kind === "enterprise" ? enterpriseGroups : departmentGroups;
    const selected = state[kind];
    const allCollapsed = groups.length > 0 && groups.every((group) => state.collapsed.has(group.id));
    return `<div class="kb-filter-row"><label>${label}：<select data-kb-filter="${kind}" aria-label="筛选${label}"><option value="all">${allLabel}</option>${source.map((group) => `<option value="${escapeHtml(group.id)}"${selected === group.id ? " selected" : ""}>${escapeHtml(group.name)}</option>`).join("")}</select></label><button class="kb-collapse-all" type="button" data-kb-collapse-all="${kind}">${allCollapsed ? "全部展开" : "全部收起"}</button></div>`;
  }

  function personalPanel(rows) {
    const pages = Math.max(1, Math.ceil(rows.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.pageSize;
    const visible = rows.slice(start, start + state.pageSize);
    const body = visible.length ? visible.map((doc) => `<tr>
      <td><div class="kb-doc-title"><span class="kb-doc-icon is-${doc.tone}">${icon("file")}</span><span class="kb-doc-name" title="${escapeHtml(doc.name)}">${escapeHtml(doc.name)}</span></div></td>
      <td>${escapeHtml(doc.created)}</td>
      <td>${escapeHtml(doc.updated)}</td>
      <td>${doc.status ? `<span class="kb-status">${escapeHtml(doc.status)}${eyeIcon}</span>` : ""}</td>
      <td><div class="kb-actions"><button class="kb-icon-button" type="button" data-kb-edit="${escapeHtml(doc.id)}" aria-label="编辑${escapeHtml(doc.name)}">${editIcon}</button><button class="kb-icon-button is-danger" type="button" data-kb-delete="${escapeHtml(doc.id)}" aria-label="删除${escapeHtml(doc.name)}">${trashIcon}</button></div></td>
    </tr>`).join("") : '<tr><td class="kb-empty-cell" colspan="5">没有匹配的知识文档</td></tr>';
    let pageButtons = `<button class="kb-page-button" type="button" data-kb-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="上一页">‹</button>`;
    for (let page = 1; page <= pages; page += 1) pageButtons += `<button class="kb-page-button${page === state.page ? " is-current" : ""}" type="button" data-kb-page="${page}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`;
    pageButtons += `<button class="kb-page-button" type="button" data-kb-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""} aria-label="下一页">›</button>`;
    return `<section class="kb-personal">
      <div class="kb-personal-head"><h2>我的个人知识库</h2><button class="kb-space-button" type="button" data-kb-space>${plusIcon}我的知识库空间</button></div>
      <div class="kb-personal-panel"><div class="kb-table-wrap"><table class="kb-table">
        <thead><tr><th class="kb-col-name" scope="col">所有类型</th><th class="kb-col-date" scope="col">创建时间 <span class="kb-sort">↕</span></th><th class="kb-col-date" scope="col">最近更新 <span class="kb-sort">↕</span></th><th class="kb-col-status" scope="col">文档状态</th><th class="kb-col-actions" scope="col">操作</th></tr></thead>
        <tbody>${body}</tbody>
      </table></div><footer class="kb-pager"><span>${rows.length} 条</span><div class="kb-pages">${pageButtons}</div><select data-kb-page-size aria-label="每页条数"><option value="10"${state.pageSize === 10 ? " selected" : ""}>10 条/页</option><option value="20"${state.pageSize === 20 ? " selected" : ""}>20 条/页</option><option value="50"${state.pageSize === 50 ? " selected" : ""}>50 条/页</option></select></footer></div>
    </section>`;
  }

  function render() {
    const industry = industryBases.filter(matchesBase);
    const enterprises = visibleGroups(enterpriseGroups);
    const departments = visibleGroups(departmentGroups);
    const personal = personalDocs.filter(matchesDoc);
    const showIndustry = industry.length > 0;
    const showEnterprise = enterprises.length > 0 || state.enterprise !== "all";
    const showDepartment = departments.length > 0 || state.department !== "all";
    const showPersonal = personal.length > 0 || showIndustry || showEnterprise || showDepartment;
    const showEmpty = !showIndustry && !showEnterprise && !showDepartment && !personal.length;

    const chunks = [];
    if (showIndustry) chunks.push(`<section class="kb-section"><h2 class="kb-section-title">行业知识库</h2><div class="kb-grid">${industry.map(baseCard).join("")}</div></section>`);
    if (showEnterprise) {
      const groups = enterprises.length ? enterprises.map(groupMarkup).join("") : '<div class="kb-group-empty">该企业下没有匹配的知识库</div>';
      chunks.push(`<section class="kb-section"><h2 class="kb-section-title">企业知识库</h2>${filterRow("enterprise", enterprises)}${groups}</section>`);
    }
    if (showDepartment) {
      const groups = departments.length ? departments.map(groupMarkup).join("") : '<div class="kb-group-empty">该部门下没有匹配的知识库</div>';
      chunks.push(`<section class="kb-section"><h2 class="kb-section-title">部门知识库</h2>${filterRow("department", departments)}${groups}</section>`);
    }
    if (showPersonal) chunks.push(personalPanel(personal));
    root.innerHTML = chunks.join("");
    empty.hidden = !showEmpty;
  }

  function collapseAll(kind) {
    const groups = visibleGroups(kind === "enterprise" ? enterpriseGroups : departmentGroups);
    const allCollapsed = groups.length > 0 && groups.every((group) => state.collapsed.has(group.id));
    groups.forEach((group) => {
      if (allCollapsed) state.collapsed.delete(group.id);
      else state.collapsed.add(group.id);
    });
    render();
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

  document.querySelector("#kbSearchForm").addEventListener("submit", (event) => {
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

  root.addEventListener("click", (event) => {
    const open = event.target.closest("[data-kb-open]");
    if (open) { toast(`已打开知识库「${open.dataset.kbName}」`); return; }
    const collapse = event.target.closest("[data-kb-collapse]");
    if (collapse) {
      const id = collapse.dataset.kbCollapse;
      if (state.collapsed.has(id)) state.collapsed.delete(id); else state.collapsed.add(id);
      render();
      return;
    }
    const collapseAllButton = event.target.closest("[data-kb-collapse-all]");
    if (collapseAllButton) { collapseAll(collapseAllButton.dataset.kbCollapseAll); return; }
    const edit = event.target.closest("[data-kb-edit]");
    if (edit) { openEdit(edit.dataset.kbEdit); return; }
    const remove = event.target.closest("[data-kb-delete]");
    if (remove) { openDelete(remove.dataset.kbDelete); return; }
    if (event.target.closest("[data-kb-space]")) { toast("已进入我的知识库空间"); return; }
    const page = event.target.closest("[data-kb-page]");
    if (page && !page.disabled) { state.page = Number(page.dataset.kbPage); render(); }
  });

  root.addEventListener("change", (event) => {
    const filter = event.target.closest("[data-kb-filter]");
    if (filter) {
      state[filter.dataset.kbFilter] = filter.value;
      state.page = 1;
      render();
      return;
    }
    const size = event.target.closest("[data-kb-page-size]");
    if (size) { state.pageSize = Number(size.value); state.page = 1; render(); }
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

  render();
  if (window.BaigePage) window.BaigePage.onActivate(function(){});
})();
