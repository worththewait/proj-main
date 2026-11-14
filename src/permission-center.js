(() => {
  "use strict";

  const store = window.BaigePermissionStore;
  if (!store || window.BaigePermissions?.roleQuery) return;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const data = window.BaigeData;
  const accountProfile = window.BaigeAccountProfile || store.currentApplicant();
  let viewer = accountProfile;
  try {
    const saved = window.localStorage.getItem("baige.permission.viewer");
    if (saved && store.applicantFor(saved)) viewer = store.applicantFor(saved);
  } catch { /* file:// */ }
  const statusLabel = store.STATUS_LABEL;
  let dialog = null;
  let activeTab = "mine";
  let selectedFunctions = new Set();
  let selectedKbs = new Set();
  let historyFilter = "all";
  let detailId = "";

  const userIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z"/></svg>';

  function catalog() {
    try { return window.BaigeFeatureConfig?.catalog?.() || []; }
    catch { return []; }
  }
  function functionKey(entry) { return entry.id || `f:${entry.route}:${entry.child || ""}`; }
  function isGranted(entry) {
    try {
      // 模拟人员只认该人员审批通过的授权，不继承平台当前账号的基础权限。
      return Boolean(store.isGranted(viewer.email, entry.route, entry.child || ""));
    } catch { return false; }
  }
  function isPending(entry) {
    try { return store.hasPending(viewer.email, entry.route, entry.child || ""); }
    catch { return false; }
  }
  function functionStatus(entry) {
    if (isGranted(entry)) return "open";
    if (isPending(entry)) return "pending";
    return "available";
  }
  function iconMarkup(entry) {
    try { return window.BaigeFeatureConfig?.iconMarkup(entry) || icon(entry.icon || "file"); }
    catch { return icon("file"); }
  }
  function functionGroups() {
    const groups = new Map();
    catalog().forEach((entry) => {
      const label = entry.homeCategoryLabel || "平台功能";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    });
    return [...groups.entries()];
  }
  function departmentKnowledgeBases() {
    const groups = data.knowledgeDirectory?.departmentGroups || [];
    return groups.flatMap((group) => (group.bases || []).map((item) => ({ ...item, scope: "部门", department: group.name, groupId: group.id })));
  }
  function kbGroups() {
    const groups = data.knowledgeDirectory?.departmentGroups || [];
    return groups.filter((group) => (group.bases || []).length).map((group) => [group.name, (group.bases || []).map((item) => ({ ...item, scope: "部门", department: group.name, groupId: group.id }))]);
  }
  function statusName(status) { return statusLabel[status] || status; }
  function statusHtml(status) { return `<span class="pc-status ${escape(status)}">${escape(statusName(status))}</span>`; }
  function itemStatus(item) {
    const text = statusName(item.status || "pending");
    return `<span class="pc-status ${escape(item.status || "pending")}">${escape(text)}</span>`;
  }

  function template() {
    return `<header class="pc-head"><div><h2>权限申请</h2><p>申请功能与知识库权限，查看审核进度</p></div><div class="pc-head-side"><label class="pc-person">当前人员<select id="pcPerson"></select></label><button class="pc-close" type="button" data-pc-close aria-label="关闭权限申请">×</button></div></header>
      <div class="pc-body">
        <section data-pc-panel="apply" hidden>
          <div class="pc-apply-head"><div><h3>申请权限</h3><p>选择需要申请的功能与知识库权限，提交后进入审核。</p></div><button class="pc-link" type="button" data-pc-back>返回我的申请</button></div>
          <div class="pc-applicant" id="pcApplicant"></div>
          <section class="pc-section"><div class="pc-section-head"><div><h3>功能权限</h3><p>勾选需要申请的功能；已开通或审核中的功能不可重复申请。</p></div><div class="pc-function-actions"><button class="pc-link" type="button" id="pcSelectAllFunctions" data-pc-select-all>全选</button><span class="pc-count" id="pcFunctionCount"></span></div></div><div id="pcFunctionList"></div></section>
          <section class="pc-section"><div class="pc-section-head"><div><h3>数据权限</h3><p>只能申请部门知识库，可多选。</p></div><span class="pc-count" id="pcKbCount"></span></div><div id="pcKbList" class="pc-kb-groups"></div></section>
          <div class="pc-reason"><label for="pcReason">申请事由 <em>*</em></label><textarea id="pcReason" maxlength="500" placeholder="请说明申请用途、使用场景和预期使用期限"></textarea><small><span id="pcReasonCount">0</span> / 500 字</small><p class="pc-feedback" id="pcFeedback" role="status"></p></div>
        </section>
        <section data-pc-panel="mine">
          <div class="pc-history-head"><div class="pc-history-title"><h3>我的申请</h3><span id="pcHistoryCount"></span></div><div class="pc-history-actions"><div id="pcHistoryFilters"></div><button class="pc-btn is-primary" type="button" data-pc-apply>申请权限</button></div></div>
          <div id="pcHistory"></div>
          <div id="pcDetail" class="pc-detail" hidden></div>
        </section>
      </div>
      <footer class="pc-foot"><button class="pc-btn" type="button" data-pc-close>关闭</button><button class="pc-btn is-primary" type="button" data-pc-submit>提交申请</button></footer>`;
  }

  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "pc-dialog";
    dialog.id = "permissionCenterDialog";
    dialog.setAttribute("aria-labelledby", "pcTitle");
    dialog.innerHTML = template();
    dialog.querySelector(".pc-head h2").id = "pcTitle";
    document.body.append(dialog);
    renderPersonSelect();
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-pc-close]")) { close(); return; }
      if (event.target.closest("[data-pc-tab]")) { showTab(event.target.closest("[data-pc-tab]").dataset.pcTab); return; }
      if (event.target.closest("[data-pc-apply]")) { showTab("apply"); return; }
      if (event.target.closest("[data-pc-select-all]")) {
        const available = catalog().filter((entry) => functionStatus(entry) === "available");
        const allSelected = available.length > 0 && available.every((entry) => selectedFunctions.has(functionKey(entry)));
        selectedFunctions.clear();
        if (!allSelected) available.forEach((entry) => selectedFunctions.add(functionKey(entry)));
        renderFunctions();
        return;
      }
      if (event.target.closest("[data-pc-back]")) { showTab("mine"); return; }
      if (event.target.closest("[data-pc-submit]")) { submit(); return; }
      if (event.target.closest("[data-pc-history-view]")) { showDetail(event.target.closest("[data-pc-history-view]").dataset.pcHistoryView); return; }
      if (event.target.closest("[data-pc-detail-back]")) { showHistory(); return; }
      if (event.target.closest("[data-pc-filter]")) { historyFilter = event.target.closest("[data-pc-filter]").dataset.pcFilter; renderHistory(); return; }
    });
    dialog.addEventListener("change", (event) => {
      if (event.target.id === "pcPerson") {
        switchViewer(event.target.value);
        return;
      }
      const fn = event.target.closest("[data-pc-function]");
      if (fn) {
        if (fn.checked) selectedFunctions.add(fn.value); else selectedFunctions.delete(fn.value);
        renderFunctions();
        return;
      }
      const kb = event.target.closest("[data-pc-kb]");
      if (kb) {
        if (kb.checked) selectedKbs.add(kb.value); else selectedKbs.delete(kb.value);
        renderKbCount();
      }
    });
    dialog.addEventListener("input", (event) => {
      if (event.target.id === "pcReason") {
        const count = dialog.querySelector("#pcReasonCount");
        if (count) count.textContent = String(event.target.value.length);
      }
    });
    dialog.addEventListener("close", () => { detailId = ""; });
    store.subscribe(() => { if (dialog.open) renderAll(); });
    return dialog;
  }

  function renderPersonSelect() {
    const select = dialog?.querySelector("#pcPerson");
    if (!select) return;
    select.innerHTML = store.people().map((person) => `<option value="${escape(person.email)}" ${person.email === viewer.email ? "selected" : ""}>${escape(person.name)}</option>`).join("");
    select.value = viewer.email;
  }
  function renderApplicant() {
    const box = dialog?.querySelector("#pcApplicant");
    if (!box) return;
    box.innerHTML = `<span class="pc-applicant-icon">${userIcon}</span><div class="pc-applicant-copy"><strong>${escape(viewer.name)}</strong><span>${escape(viewer.email)} · ${escape(viewer.organization || viewer.dept || "")} · ${escape(viewer.role || "")}</span></div><span class="pc-applicant-tag">已认证</span>`;
  }
  function switchViewer(email) {
    const person = store.applicantFor(email);
    if (!person) return;
    viewer = person;
    try { window.localStorage.setItem("baige.permission.viewer", email); } catch { /* file:// */ }
    selectedFunctions.clear();
    selectedKbs.clear();
    historyFilter = "all";
    detailId = "";
    const reason = dialog?.querySelector("#pcReason");
    if (reason) reason.value = "";
    feedback("");
    renderPersonSelect();
    showTab("mine");
    renderAll();
  }
  function renderFunctions() {
    const list = dialog.querySelector("#pcFunctionList");
    if (!list) return;
    const groups = functionGroups();
    list.innerHTML = groups.length ? groups.map(([label, entries]) => `<section class="pc-category"><h4>${escape(label)}</h4><div class="pc-functions">${entries.map((entry) => {
      const status = functionStatus(entry);
      const key = functionKey(entry);
      const disabled = status !== "available";
      const checked = selectedFunctions.has(key) && !disabled;
      if (disabled && checked) selectedFunctions.delete(key);
      const stateText = status === "open" ? "已开通" : status === "pending" ? "审核中" : "";
      return `<label class="pc-function${checked ? " is-selected" : ""}${disabled ? " is-disabled" : ""}" title="${escape(entry.description)}"><input type="checkbox" data-pc-function value="${escape(key)}" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""} /><span class="pc-function-icon" data-tone="${escape(entry.tone || "blue")}">${iconMarkup(entry)}</span><span class="pc-function-copy"><strong>${escape(entry.name)}</strong><small>${escape(entry.description || "")}</small></span>${stateText ? `<span class="pc-function-status ${status === "open" ? "is-open" : "is-pending"}">${stateText}</span>` : ""}</label>`;
    }).join("")}</div></section>`).join("") : '<div class="pc-empty">当前没有可申请的功能。</div>';
    const count = dialog.querySelector("#pcFunctionCount");
    if (count) count.textContent = `已选 ${selectedFunctions.size} 项`;
    const selectAll = dialog.querySelector("#pcSelectAllFunctions");
    if (selectAll) {
      const available = groups.flatMap(([, entries]) => entries).filter((entry) => functionStatus(entry) === "available");
      const allSelected = available.length > 0 && available.every((entry) => selectedFunctions.has(functionKey(entry)));
      selectAll.textContent = allSelected ? "取消全选" : "全选";
      selectAll.disabled = available.length === 0;
      selectAll.setAttribute("aria-pressed", String(allSelected));
    }
  }

  function renderKbs() {
    const list = dialog.querySelector("#pcKbList");
    if (!list) return;
    const allowed = new Set(departmentKnowledgeBases().map((item) => item.id));
    [...selectedKbs].forEach((id) => { if (!allowed.has(id)) selectedKbs.delete(id); });
    const groups = kbGroups();
    list.innerHTML = groups.length ? groups.map(([label, items]) => `<section class="pc-kb-group"><b>${escape(label)}</b><div class="pc-kb-list">${items.map((item) => `<label class="pc-kb"><input type="checkbox" data-pc-kb value="${escape(item.id)}" ${selectedKbs.has(item.id) ? "checked" : ""} /><span>${escape(item.name)}</span></label>`).join("")}</div></section>`).join("") : '<div class="pc-empty">当前没有可申请的部门知识库。</div>';
    renderKbCount();
  }
  function renderKbCount() {
    const count = dialog.querySelector("#pcKbCount");
    if (count) count.textContent = `已选 ${selectedKbs.size} 项`;
  }

  function renderApply() {
    renderApplicant();
    renderPersonSelect();
    renderFunctions();
    renderKbs();
    const reason = dialog.querySelector("#pcReason");
    const count = dialog.querySelector("#pcReasonCount");
    if (reason && count) count.textContent = String(reason.value.length);
  }

  function filteredRequests() {
    const requests = store.list(viewer.email);
    return historyFilter === "all" ? requests : requests.filter((item) => item.status === historyFilter);
  }
  function renderHistory() {
    const view = dialog.querySelector("#pcHistory");
    const detail = dialog.querySelector("#pcDetail");
    const filters = dialog.querySelector("#pcHistoryFilters");
    const count = dialog.querySelector("#pcHistoryCount");
    if (!view || !detail || !filters || !count) return;
    detail.hidden = true;
    view.hidden = false;
    const all = store.list(viewer.email);
    const filtersList = [["all", "全部"], ["pending", "待审核"], ["approved", "已通过"], ["partial", "部分通过"], ["rejected", "已驳回"]];
    filters.innerHTML = filtersList.map(([key, label]) => `<button class="pc-link" type="button" data-pc-filter="${key}" style="${historyFilter === key ? "font-weight:600;color:#1f2d4d" : ""}">${label} ${key === "all" ? all.length : all.filter((item) => item.status === key).length}</button>`).join(" · ");
    const requests = filteredRequests();
    count.textContent = `共 ${requests.length} 条`;
    view.innerHTML = requests.length ? `<div class="pc-history">${requests.map((request) => {
      const items = request.items || [];
      const summary = items.slice(0, 3).map((item) => item.name).join("、") + (items.length > 3 ? ` 等 ${items.length} 项` : "");
      return `<article class="pc-request"><div class="pc-request-main"><div class="pc-request-title"><strong>${escape(request.id)}</strong>${statusHtml(request.status)}</div><div class="pc-request-meta"><span>${escape(request.createdAt || "")}</span><span>${escape(summary)}</span></div></div><div class="pc-request-actions"><button class="pc-link" type="button" data-pc-history-view="${escape(request.id)}">查看详情</button></div></article>`;
    }).join("")}</div>` : `<div class="pc-empty">${historyFilter === "all" ? "暂无申请记录" : "当前状态下暂无申请"}</div>`;
  }
  function resultApprovedCount(items) {
    return items.filter((item) => item.status === "approved").length;
  }
  function resultRowHtml(item) {
    return `<div class="pc-result-item"><div class="pc-result-name"><strong>${escape(item.name)}</strong>${item.scope ? `<small>${escape(item.scope)}</small>` : ""}</div><div class="pc-result-state">${itemStatus(item)}</div></div>`;
  }
  function resultGroupsHtml(items) {
    const functions = items.filter((item) => item.type !== "data");
    const dataItems = items.filter((item) => item.type === "data");
    const dataGroups = new Map();
    dataItems.forEach((item) => {
      const key = item.scope || "其他";
      if (!dataGroups.has(key)) dataGroups.set(key, []);
      dataGroups.get(key).push(item);
    });
    const functionHtml = functions.length ? `<section class="pc-result-group"><div class="pc-result-head"><div><h4>功能申请</h4><span>${resultApprovedCount(functions)}/${functions.length} 项通过</span></div></div><div class="pc-result-list">${functions.map(resultRowHtml).join("")}</div></section>` : "";
    const dataHtml = dataItems.length ? `<section class="pc-result-group"><div class="pc-result-head"><div><h4>数据申请</h4><span>${resultApprovedCount(dataItems)}/${dataItems.length} 项通过</span></div></div>${[...dataGroups.entries()].map(([scope, group]) => `<div class="pc-result-data-group"><div class="pc-result-subhead"><strong>${escape(scope)}知识库</strong><span>${resultApprovedCount(group)}/${group.length} 项通过</span></div><div class="pc-result-list">${group.map(resultRowHtml).join("")}</div></div>`).join("")}</section>` : "";
    return functionHtml + dataHtml || '<div class="pc-empty">暂无申请项</div>';
  }
  function showDetail(id) {
    const request = store.get(id);
    if (!request) return;
    detailId = id;
    const view = dialog.querySelector("#pcHistory");
    const detail = dialog.querySelector("#pcDetail");
    const filters = dialog.querySelector("#pcHistoryFilters");
    const actions = dialog.querySelector(".pc-history-actions");
    const count = dialog.querySelector("#pcHistoryCount");
    if (view) view.hidden = true;
    if (filters) filters.style.display = "none";
    if (actions) actions.style.display = "none";
    if (count) count.textContent = "";
    if (!detail) return;
    detail.hidden = false;
    detail.innerHTML = `<div class="pc-detail-head"><h3>${escape(request.id)} ${statusHtml(request.status)}</h3><button class="pc-link" type="button" data-pc-detail-back>返回列表</button></div>
      <dl class="pc-detail-grid"><div><dt>申请人</dt><dd>${escape(request.applicant?.name || "")} · ${escape(request.applicant?.email || "")}</dd></div><div><dt>申请时间</dt><dd>${escape(request.createdAt || "")}</dd></div><div><dt>审核时间</dt><dd>${escape(request.reviewedAt || "—")}</dd></div><div><dt>审核人</dt><dd>${escape(request.reviewer || "—")}</dd></div><div style="grid-column:1/-1"><dt>申请事由</dt><dd>${escape(request.reason || "")}</dd></div></dl>
      <section class="pc-section pc-result-section"><div class="pc-section-head"><div><h3>申请项与审核结果</h3><p>共 ${request.items.length} 项，按功能申请和数据申请分组展示</p></div></div><div class="pc-result-groups">${resultGroupsHtml(request.items || [])}</div></section>
      <section class="pc-section"><div class="pc-section-head"><div><h3>审核意见</h3></div></div><div class="pc-comment">${escape(request.comment || "暂无审核意见")}</div></section>`;
  }
  function showHistory() {
    detailId = "";
    const filters = dialog.querySelector("#pcHistoryFilters");
    const actions = dialog.querySelector(".pc-history-actions");
    if (filters) filters.style.display = "";
    if (actions) actions.style.display = "";
    renderHistory();
  }
  function showTab(tab) {
    activeTab = tab === "apply" ? "apply" : "mine";
    dialog.querySelectorAll("[data-pc-panel]").forEach((panel) => { panel.hidden = panel.dataset.pcPanel !== activeTab; });
    const submit = dialog.querySelector("[data-pc-submit]");
    if (submit) submit.hidden = activeTab !== "apply";
    if (activeTab === "mine") showHistory();
  }
  function renderAll() {
    if (!dialog) return;
    renderApply();
    renderHistory();
    if (activeTab === "mine" && detailId) showDetail(detailId);
  }
  function feedback(text, ok = false) {
    const el = dialog?.querySelector("#pcFeedback");
    if (!el) return;
    el.textContent = text || "";
    el.style.color = ok ? "#1f7a4c" : "#b23a3a";
  }
  function submit() {
    const reason = dialog.querySelector("#pcReason")?.value || "";
    const entries = catalog();
    const items = [];
    selectedFunctions.forEach((key) => {
      const entry = entries.find((item) => functionKey(item) === key);
      if (entry && functionStatus(entry) === "available") items.push({ key: `f:${entry.route}:${entry.child || ""}`, type: "function", name: entry.name, route: entry.route, child: entry.child || "", status: "pending" });
    });
    selectedKbs.forEach((id) => {
      const item = departmentKnowledgeBases().find((kb) => kb.id === id);
      if (item) items.push({ key: `d:${item.id}`, type: "data", name: item.name, kbId: item.id, scope: item.scope || "", status: "pending" });
    });
    if (!items.length) { feedback("请至少选择一项功能或数据权限。"); return; }
    if (!String(reason).trim()) { feedback("请填写申请事由。"); return; }
    try {
      store.create(viewer, reason, items);
      selectedFunctions.clear();
      selectedKbs.clear();
      const reasonEl = dialog.querySelector("#pcReason");
      if (reasonEl) reasonEl.value = "";
      feedback("");
      showTab("mine");
      renderHistory();
    } catch (error) {
      feedback(error.message);
    }
  }
  function open(application = null) {
    ensureDialog();
    const requested = application && application.route;
    if (requested) {
      const entry = catalog().find((item) => item.route === application.route && (item.child || "") === (application.child || ""));
      if (entry && functionStatus(entry) === "available") selectedFunctions.add(functionKey(entry));
    }
    showTab(requested ? "apply" : "mine");
    renderAll();
    if (!dialog.open) dialog.showModal();
    const first = requested ? dialog.querySelector("#pcFunctionList input:not([disabled])") : dialog.querySelector("[data-pc-apply]");
    (first || dialog.querySelector("[data-pc-close]"))?.focus({ preventScroll: true });
  }
  function close() {
    if (dialog?.open) dialog.close();
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object" || message.type !== "baige:permission-apply") return;
    open(message.application || {});
  });

  window.BaigePermissionCenter = Object.freeze({ open, close });
})();
