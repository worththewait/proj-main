(() => {
  "use strict";

  const store = window.BaigePermissionStore;
  if (!store) return;
  const { escapeHtml: escape } = window.BaigeUI;
  const STATUS = store.STATUS_LABEL;
  const get = (id) => document.getElementById(id);
  const dialog = get("prDialog");
  let currentId = "";
  let decisions = {};
  let toastTimer = null;
  const pager = window.BaigeAdminPagination.create(get("prPager"), render);

  function statusHtml(status) {
    return `<span class="pr-status ${escape(status)}">${escape(STATUS[status] || status)}</span>`;
  }
  function applicantName(request) {
    return request.applicant?.name || request.applicant?.email || "—";
  }
  function itemSummary(request) {
    const items = request.items || [];
    return items.slice(0, 4).map((item) => item.name).join("、") + (items.length > 4 ? ` 等 ${items.length} 项` : "");
  }
  function filtered() {
    const applicant = get("prApplicant").value.trim().toLowerCase();
    const functionText = get("prFunction").value.trim().toLowerCase();
    const status = get("prStatus").value;
    return store.list().filter((request) => {
      if (status && request.status !== status) return false;
      if (applicant && !`${request.applicant?.name || ""} ${request.applicant?.email || ""}`.toLowerCase().includes(applicant)) return false;
      if (functionText && !(request.items || []).some((item) => item.name.toLowerCase().includes(functionText))) return false;
      return true;
    });
  }
  const actionIcons = {
    audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    view: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 12S5 5 12 5s10.5 7 10.5 7S19 19 12 19 1.5 12 1.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>',
  };
  function renderTable() {
    const rows = filtered();
    const pageRows = pager.slice(rows);
    get("prTable").innerHTML = pageRows.length ? pageRows.map((request) => { const reviewed = request.status !== "pending"; return `<tr data-pr-id="${escape(request.id)}"><td class="pr-id">${escape(request.id)}</td><td class="pr-applicant"><strong>${escape(applicantName(request))}</strong><small>${escape(request.applicant?.email || "")}</small></td><td><div class="pr-items">${escape(itemSummary(request))}</div></td><td>${escape(request.createdAt || "")}</td><td>${statusHtml(request.status)}</td><td>${escape(request.comment || "—")}</td><td><button class="pr-action ${reviewed ? "is-view" : "is-audit"}" type="button" data-pr-open="${escape(request.id)}"><span class="pr-action-icon">${reviewed ? actionIcons.view : actionIcons.audit}</span><span>${reviewed ? "查看" : "审核"}</span></button></td></tr>`; }).join("") : `<tr><td colspan="7" class="pr-empty">没有符合条件的申请</td></tr>`;
    const statusValue = get("prStatus").value;
    get("prSummary").textContent = `共 ${rows.length} 条申请${statusValue ? ` · 当前筛选：${STATUS[statusValue] || statusValue}` : ""}`;
  }
  function render() {
    renderTable();
  }
  function toast(text) {
    const el = get("prToast");
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }
  function openAudit(id) {
    const request = store.get(id);
    if (!request) return;
    const readonly = request.status !== "pending";
    currentId = id;
    decisions = {};
    request.items.forEach((item) => { decisions[item.key] = item.status === "approved" || item.status === "rejected" ? item.status : ""; });
    dialog.classList.toggle("is-readonly", readonly);
    get("prDialogTitle").textContent = `${readonly ? "查看" : "审核"}权限申请 · ${request.id}`;
    get("prInfo").innerHTML = `<div><dt>申请人</dt><dd>${escape(applicantName(request))}</dd></div><div><dt>申请账号</dt><dd>${escape(request.applicant?.email || "")}</dd></div><div><dt>申请时间</dt><dd>${escape(request.createdAt || "")}</dd></div><div><dt>当前状态</dt><dd>${statusHtml(request.status)}</dd></div><div class="pr-reason"><dt>申请事由</dt><dd>${escape(request.reason || "")}</dd></div>`;
    renderReviewItems(request, readonly);
    const comment = get("prComment");
    comment.value = request.comment || "";
    comment.readOnly = readonly;
    get("prFeedback").textContent = "";
    get("prSubmit").hidden = readonly;
    const allActions = dialog.querySelector(".pr-all-actions");
    if (allActions) allActions.hidden = readonly;
    const cancel = dialog.querySelector(".pr-dialog-foot [data-pr-close]");
    if (cancel) cancel.textContent = readonly ? "关闭" : "取消";
    if (!dialog.open) dialog.showModal();
    if (readonly) dialog.querySelector(".pr-dialog-close")?.focus();
    else comment.focus();
  }
  function itemHtml(item, index, readonly = false) {
    const approved = decisions[item.key] === "approved";
    const rejected = decisions[item.key] === "rejected";
    return `<div class="pr-review-item"><span class="pr-item-name">${escape(item.name)}${item.scope ? `<small>${escape(item.scope)}</small>` : ""}</span><div class="pr-choices"><label class="pr-choice"><input type="radio" name="prItem${index}" value="approved" data-pr-radio="${escape(item.key)}" ${approved ? "checked" : ""} ${readonly ? "disabled" : ""} /><span class="pr-radio"></span><span>通过</span></label><label class="pr-choice is-reject"><input type="radio" name="prItem${index}" value="rejected" data-pr-radio="${escape(item.key)}" ${rejected ? "checked" : ""} ${readonly ? "disabled" : ""} /><span class="pr-radio"></span><span>驳回</span></label></div></div>`;
  }
  function approvedCount(items) {
    return items.filter((item) => decisions[item.key] === "approved").length;
  }
  function groupKey(item) {
    return item.scope || "其他知识库";
  }
  function groupLabel(key) {
    return key === "其他知识库" ? key : `${key}知识库`;
  }
  function renderReviewItems(request, readonly = false) {
    const items = request.items || [];
    const functions = items.filter((item) => item.type !== "data");
    const dataItems = items.filter((item) => item.type === "data");
    const dataGroups = new Map();
    dataItems.forEach((item) => {
      const key = groupKey(item);
      if (!dataGroups.has(key)) dataGroups.set(key, []);
      dataGroups.get(key).push(item);
    });
    let index = 0;
    const functionSection = functions.length ? `<section class="pr-group"><div class="pr-group-head"><div class="pr-group-title"><h3>功能申请</h3><span>${approvedCount(functions)}/${functions.length} 项通过</span></div></div><div class="pr-group-items">${functions.map((item) => itemHtml(item, index++, readonly)).join("")}</div></section>` : "";
    const dataSection = dataItems.length ? `<section class="pr-group"><div class="pr-group-head"><div class="pr-group-title"><h3>数据申请</h3><span>${approvedCount(dataItems)}/${dataItems.length} 项通过</span></div></div>${[...dataGroups.entries()].map(([key, group]) => `<div class="pr-data-group"><div class="pr-data-head"><div class="pr-data-title"><span class="pr-caret" aria-hidden="true">▾</span><strong>${escape(groupLabel(key))}</strong><small>${approvedCount(group)}/${group.length} 项通过</small></div>${readonly ? "" : `<div class="pr-group-actions"><button type="button" data-pr-group-all="approved" data-pr-group="${escape(key)}">本组全部通过</button><button type="button" data-pr-group-all="rejected" data-pr-group="${escape(key)}">本组全部驳回</button></div>`}</div><div class="pr-group-items">${group.map((item) => itemHtml(item, index++, readonly)).join("")}</div></div>`).join("")}</section>` : "";
    get("prReviewItems").innerHTML = functionSection + dataSection || '<div class="pr-empty">没有需要审核的申请项</div>';
  }
  function setAll(value) {
    const request = store.get(currentId);
    if (!request || request.status !== "pending") return;
    request.items.forEach((item) => { decisions[item.key] = value; });
    renderReviewItems(request);
  }
  function setGroup(key, value) {
    const request = store.get(currentId);
    if (!request || request.status !== "pending") return;
    request.items.filter((item) => item.type === "data" && groupKey(item) === key).forEach((item) => { decisions[item.key] = value; });
    renderReviewItems(request);
  }
  function submit() {
    const request = store.get(currentId);
    if (!request || request.status !== "pending") return;
    if ((request.items || []).some((item) => !decisions[item.key])) {
      get("prFeedback").textContent = "请对每一项申请分别选择通过或驳回。";
      return;
    }
    try {
      store.review(currentId, decisions, get("prComment").value, "系统管理员");
      dialog.close();
      render();
      toast("审核结果已提交，申请人可在「我的申请」查看。");
    } catch (error) {
      get("prFeedback").textContent = error.message;
    }
  }

  get("prTable").addEventListener("click", (event) => {
    const button = event.target.closest("[data-pr-open]");
    if (button) openAudit(button.dataset.prOpen);
  });
  get("prReviewItems").addEventListener("change", (event) => {
    const radio = event.target.closest("[data-pr-radio]");
    if (!radio) return;
    decisions[radio.dataset.prRadio] = radio.value;
    renderReviewItems(store.get(currentId));
  });
  get("prReviewItems").addEventListener("click", (event) => {
    const button = event.target.closest("[data-pr-group-all]");
    if (!button) return;
    setGroup(button.dataset.prGroup, button.dataset.prGroupAll);
  });
  function applyFilters() {
    pager.reset();
    render();
  }
  for (const id of ["prApplicant", "prFunction"]) get(id).addEventListener("input", applyFilters);
  get("prStatus").addEventListener("change", applyFilters);
  get("prReset").addEventListener("click", () => {
    get("prApplicant").value = "";
    get("prFunction").value = "";
    get("prStatus").value = "";
    applyFilters();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-pr-close]")) { dialog.close(); return; }
    if (event.target.closest("[data-pr-all]")) { setAll(event.target.closest("[data-pr-all]").dataset.prAll); return; }
  });
  get("prSubmit").addEventListener("click", submit);
  store.subscribe(() => { if (dialog.open) return; render(); });
  render();
})();
