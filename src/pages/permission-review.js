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
  let filterStatus = "";
  let toastTimer = null;

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
    const status = filterStatus || get("prStatus").value;
    return store.list().filter((request) => {
      if (status && request.status !== status) return false;
      if (applicant && !`${request.applicant?.name || ""} ${request.applicant?.email || ""}`.toLowerCase().includes(applicant)) return false;
      if (functionText && !(request.items || []).some((item) => item.name.toLowerCase().includes(functionText))) return false;
      return true;
    });
  }
  function counts() {
    const all = store.list();
    return {
      all: all.length,
      pending: all.filter((item) => item.status === "pending").length,
      approved: all.filter((item) => item.status === "approved").length,
      partial: all.filter((item) => item.status === "partial").length,
      rejected: all.filter((item) => item.status === "rejected").length,
    };
  }
  function renderStats() {
    const value = counts();
    const entries = [["", "全部申请"], ["pending", "待审核"], ["approved", "已通过"], ["partial", "部分通过"], ["rejected", "已驳回"]];
    get("prStats").innerHTML = entries.map(([key, label]) => `<button class="pr-stat${filterStatus === key ? " is-active" : ""}" type="button" data-status="${key}" aria-pressed="${filterStatus === key}"><span>${label}</span><strong>${key ? value[key] : value.all}</strong></button>`).join("");
  }
  function renderTable() {
    const rows = filtered();
    get("prTable").innerHTML = rows.length ? rows.map((request) => `<tr data-pr-id="${escape(request.id)}"><td class="pr-id">${escape(request.id)}</td><td class="pr-applicant"><strong>${escape(applicantName(request))}</strong><small>${escape(request.applicant?.email || "")}</small></td><td><div class="pr-items">${escape(itemSummary(request))}</div></td><td>${escape(request.createdAt || "")}</td><td>${statusHtml(request.status)}</td><td>${escape(request.comment || "—")}</td><td><button class="pr-action" type="button" data-pr-open="${escape(request.id)}">审核</button></td></tr>`).join("") : `<tr><td colspan="7" class="pr-empty">没有符合条件的申请</td></tr>`;
    get("prSummary").textContent = `共 ${rows.length} 条申请${filterStatus ? ` · 当前筛选：${STATUS[filterStatus] || filterStatus}` : ""}`;
  }
  function render() {
    renderStats();
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
    currentId = id;
    decisions = {};
    request.items.forEach((item) => { decisions[item.key] = item.status === "approved" || item.status === "rejected" ? item.status : ""; });
    get("prDialogTitle").textContent = `审核权限申请 · ${request.id}`;
    get("prInfo").innerHTML = `<div><dt>申请人</dt><dd>${escape(applicantName(request))}</dd></div><div><dt>申请账号</dt><dd>${escape(request.applicant?.email || "")}</dd></div><div><dt>申请时间</dt><dd>${escape(request.createdAt || "")}</dd></div><div><dt>当前状态</dt><dd>${statusHtml(request.status)}</dd></div><div class="pr-reason"><dt>申请事由</dt><dd>${escape(request.reason || "")}</dd></div>`;
    renderReviewItems(request);
    get("prComment").value = request.comment || "";
    get("prFeedback").textContent = "";
    if (!dialog.open) dialog.showModal();
    get("prComment").focus();
  }
  function itemHtml(item, index) {
    const approved = decisions[item.key] === "approved";
    const rejected = decisions[item.key] === "rejected";
    const name = item.type === "data" ? "数据权限" : "功能权限";
    return `<div class="pr-review-item"><span class="pr-item-name"><em>${name}</em>${escape(item.name)}${item.scope ? `<small>${escape(item.scope)}</small>` : ""}</span><div class="pr-choices"><label class="pr-choice"><input type="radio" name="prItem${index}" value="approved" data-pr-radio="${escape(item.key)}" ${approved ? "checked" : ""} /><span class="pr-radio"></span><span>通过</span></label><label class="pr-choice is-reject"><input type="radio" name="prItem${index}" value="rejected" data-pr-radio="${escape(item.key)}" ${rejected ? "checked" : ""} /><span class="pr-radio"></span><span>驳回</span></label></div></div>`;
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
  function renderReviewItems(request) {
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
    const functionSection = functions.length ? `<section class="pr-group"><div class="pr-group-head"><div class="pr-group-title"><h3>功能申请</h3><span>${approvedCount(functions)}/${functions.length} 项通过</span></div></div><div class="pr-group-items">${functions.map((item) => itemHtml(item, index++)).join("")}</div></section>` : "";
    const dataSection = dataItems.length ? `<section class="pr-group"><div class="pr-group-head"><div class="pr-group-title"><h3>数据申请</h3><span>${approvedCount(dataItems)}/${dataItems.length} 项通过</span></div></div>${[...dataGroups.entries()].map(([key, group]) => `<div class="pr-data-group"><div class="pr-data-head"><div class="pr-data-title"><span class="pr-caret" aria-hidden="true">▾</span><strong>${escape(groupLabel(key))}</strong><small>${approvedCount(group)}/${group.length} 项通过</small></div><div class="pr-group-actions"><button type="button" data-pr-group-all="approved" data-pr-group="${escape(key)}">本组全部通过</button><button type="button" data-pr-group-all="rejected" data-pr-group="${escape(key)}">本组全部驳回</button></div></div><div class="pr-group-items">${group.map((item) => itemHtml(item, index++)).join("")}</div></div>`).join("")}</section>` : "";
    get("prReviewItems").innerHTML = functionSection + dataSection || '<div class="pr-empty">没有需要审核的申请项</div>';
  }
  function setAll(value) {
    const request = store.get(currentId);
    if (!request) return;
    request.items.forEach((item) => { decisions[item.key] = value; });
    renderReviewItems(request);
  }
  function setGroup(key, value) {
    const request = store.get(currentId);
    if (!request) return;
    request.items.filter((item) => item.type === "data" && groupKey(item) === key).forEach((item) => { decisions[item.key] = value; });
    renderReviewItems(request);
  }
  function submit() {
    const request = store.get(currentId);
    if (!request) return;
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

  get("prStats").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status]");
    if (!button) return;
    filterStatus = button.dataset.status;
    get("prStatus").value = filterStatus;
    render();
  });
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
  for (const id of ["prApplicant", "prFunction"]) get(id).addEventListener("input", render);
  get("prStatus").addEventListener("change", () => {
    filterStatus = "";
    render();
  });
  get("prReset").addEventListener("click", () => {
    get("prApplicant").value = "";
    get("prFunction").value = "";
    get("prStatus").value = "";
    filterStatus = "";
    render();
  });
  dialog.addEventListener("click", (event) => {
    if (event.target.closest("[data-pr-close]")) { dialog.close(); return; }
    if (event.target.closest("[data-pr-all]")) { setAll(event.target.closest("[data-pr-all]").dataset.prAll); return; }
  });
  get("prSubmit").addEventListener("click", submit);
  store.subscribe(() => { if (dialog.open) return; render(); });
  render();
})();
