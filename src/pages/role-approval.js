(() => {
  "use strict";

  const store = window.BaigeIamStore;
  const { escapeHtml: escape, hydrate } = window.BaigeUI;
  const $ = (id) => document.getElementById(id);
  const drawer = $("approvalDrawer");
  const menuDialog = $("approvalMenuDialog");
  const title = $("approvalDrawerTitle");
  const fields = $("approvalReviewFields");
  const comment = $("approvalComment");
  const feedback = $("approvalFeedback");
  const actions = $("approvalActions");
  const rows = $("approvalRows");
  const scopeButtons = [...document.querySelectorAll("[data-approval-scope]")];
  const statusFilter = $("approvalStatus");
  const STATUS = {
    pending: "待审核", approved: "已通过", rejected: "已驳回", withdrawn: "已撤回", invalid: "已失效",
  };
  const TYPES = {
    membership: "角色授权", menus: "角色菜单变更", "enable-user": "恢复用户", "enable-role": "恢复角色",
  };
  const OPERATIONS = { add: "授予角色", remove: "撤销角色授权", menus: "变更菜单权限", enable: "恢复启用" };
  const { label: menuLabel, grantedGroups } = window.BaigeIamMenuCatalog;
  const MESSAGES = {
    approved: "申请已通过，变更已生效。",
    rejected: "申请已驳回。",
    withdrawn: "申请已撤回。",
    invalid: "申请已失效，请查看处理记录。",
  };
  let scope = store.actor().kind === "reviewer" ? "pending" : "all";
  let allStatus = "";
  let activeId = "";
  let busy = false;
  let confirmingWithdrawal = false;
  let previewUserId = "";
  let previewOpener = null;

  function visibleRequests() {
    const actor = store.actor();
    return store.requests().filter((request) => actor.kind === "reviewer" || request.applicant.id === actor.id)
      .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)));
  }

  function statusBadge(status) {
    return `<span class="approval-status" data-tone="${escape(status)}">${escape(STATUS[status] || status)}</span>`;
  }

  function timeLabel(value) {
    return value ? `<time datetime="${escape(value)}">${escape(value)}</time>` : "—";
  }

  function targetLabel(items) {
    const users = [...new Set(items.map((item) => item.userName).filter(Boolean))];
    const roles = [...new Set(items.map((item) => item.roleName).filter(Boolean))];
    const user = users.length > 1 ? `${users[0]} 等 ${users.length} 人` : users[0];
    const role = roles.length > 1 ? `${roles[0]} 等 ${roles.length} 个角色` : roles[0];
    return [user, role].filter(Boolean).join(" · ") || "—";
  }

  function canReview(request) {
    return request.status === "pending" && store.actor().kind === "reviewer" && store.canReviewRequest(request.id);
  }

  function matches(value, query) {
    return String(value ?? "").toLocaleLowerCase().includes(query);
  }

  function renderList(requests) {
    $("approvalActor").textContent = store.actor().name;
    $("approvalPendingCount").textContent = requests.filter((request) => request.status === "pending").length;
    for (const button of scopeButtons) button.setAttribute("aria-pressed", String(button.dataset.approvalScope === scope));
    statusFilter.disabled = scope === "pending";
    statusFilter.value = scope === "pending" ? "pending" : allStatus;
    const applicant = $("approvalApplicant").value.trim().toLocaleLowerCase();
    const target = $("approvalTarget").value.trim().toLocaleLowerCase();
    const status = statusFilter.value;
    const filtered = requests.filter((request) => {
      if (status && request.status !== status) return false;
      if (applicant && ![request.applicant.name, request.applicant.id].some((value) => matches(value, applicant))) return false;
      return !target || matches(request.id, target) || request.items.some((item) =>
        [item.userName, item.roleName, item.userId, item.roleId, ...(item.affectedUsers || []).map((user) => user.name)]
          .some((value) => matches(value, target)));
    });

    rows.innerHTML = filtered.map((request) => `<tr>
      <td><span class="approval-type">${escape(TYPES[request.type] || request.type)}</span>${request.source ? `<span class="approval-source">${escape(request.source)}</span>` : ""}</td>
      <td>${escape(request.applicant.name)}</td>
      <td>${escape(targetLabel(request.items))}</td>
      <td>${timeLabel(request.createdAt)}</td>
      <td>${statusBadge(request.status)}</td>
      <td><button type="button" class="approval-row-action" data-approval-request="${escape(request.id)}">${canReview(request) ? "审核" : "查看"}</button></td>
    </tr>`).join("") || `<tr><td colspan="6" class="approval-empty">${applicant || target || statusFilter.value && scope === "all" ? "没有符合筛选条件的申请" : scope === "pending" ? "暂无待审核申请" : "暂无角色授权申请"}</td></tr>`;
    $("approvalSummary").textContent = `共 ${filtered.length} 条申请`;
  }

  function previewButton(userId, name) {
    return userId
      ? `<button type="button" class="approval-preview" data-approval-preview="${escape(userId)}" aria-haspopup="dialog" aria-label="预览${escape(name)}的菜单权限">预览权限</button>`
      : "";
  }

  function renderPreview() {
    const user = store.users().find(({ id }) => id === previewUserId);
    $("approvalMenuAccount").textContent = user ? (user.nickname || user.username) : "";
    const content = $("approvalMenuContent");
    if (!user || user.status !== "normal") {
      content.textContent = user ? "账号已停用，暂无可访问菜单。" : "账号已删除，暂无可访问菜单。";
      return;
    }
    content.innerHTML = grantedGroups(store.effectiveMenus(user.id)).map(({ label, items }) => `
      <section class="approval-menu-group">
        <h3>${escape(label)}</h3>
        <ul>${items.map(item => `<li>${item.parentLabel ? `<span class="approval-menu-parent">${escape(item.parentLabel)}<span aria-hidden="true"> / </span></span>` : ""}${escape(item.label)}</li>`).join("")}</ul>
      </section>`).join("");
  }

  function renderMenuList(keys) {
    return keys?.length
      ? keys.map((key) => `<span class="approval-menu">${escape(menuLabel(key))}</span>`).join("")
      : "—";
  }

  function renderItem(item) {
    const operation = OPERATIONS[item.operation] || item.operation;
    const userName = item.userName || item.userId;
    const affected = (item.affectedUsers || []).map((user) =>
      `<span>${escape(user.name)} ${previewButton(user.id, user.name)}</span>`).join("");
    const currentRoles = item.currentRoles?.map((role) => role.name).join("、");
    return `<li class="approval-item">
      <p class="approval-item-title"><span class="approval-operation" data-operation="${escape(item.operation)}">${escape(operation)}</span>${item.roleName ? `<span>${escape(item.roleName)}</span>` : ""}</p>
      ${userName ? `<p class="approval-item-actor"><span>用户 ${escape(userName)}</span>${previewButton(item.userId, userName)}</p>` : ""}
      ${item.currentRoles ? `<p class="approval-item-actor">申请时角色 ${escape(currentRoles || "无")}</p>` : ""}
      ${affected ? `<p class="approval-affected"><span>涉及用户</span>${affected}</p>` : ""}
      <dl class="approval-menus"><div><dt>变更前菜单</dt><dd>${renderMenuList(item.currentMenus)}</dd></div><div><dt>申请后菜单</dt><dd>${renderMenuList(item.requestedMenus)}</dd></div></dl>
    </li>`;
  }

  function timelineEntry(label, name, time, note = "") {
    return `<li><div><div class="approval-timeline-line"><strong>${escape(label)}</strong>${name ? `<span>${escape(name)}</span>` : ""}${timeLabel(time)}</div>${note ? `<p>${escape(note)}</p>` : ""}</div></li>`;
  }

  function renderTimeline(request) {
    const entries = [timelineEntry("提交申请", request.applicant.name, request.createdAt)];
    if (request.status !== "pending") {
      const processedBy = request.reviewer?.name || (request.status === "withdrawn" ? request.applicant.name : "");
      entries.push(timelineEntry(STATUS[request.status] || request.status, processedBy, request.reviewedAt, request.comment));
    }
    return entries.join("");
  }

  function setFeedback(message = "", tone = "") {
    feedback.textContent = message;
    feedback.dataset.tone = tone;
    feedback.hidden = !message;
  }

  function renderActions(request) {
    const mayReview = canReview(request);
    const mayWithdraw = request.status === "pending" && store.actor().kind === "admin" && store.actor().id === request.applicant.id;
    fields.hidden = !mayReview;
    comment.disabled = busy;
    actions.setAttribute("aria-busy", String(busy));
    const disabled = busy ? " disabled" : "";
    if (mayReview) {
      actions.innerHTML = `<button type="button" class="secondary-button" data-approval-close${disabled}>取消</button>
        <button type="button" class="secondary-button" data-approval-decision="rejected"${disabled}>驳回申请</button>
        <button type="button" class="primary-button" data-approval-decision="approved"${disabled}>通过申请</button>`;
    } else if (mayWithdraw) {
      actions.innerHTML = confirmingWithdrawal
        ? `<button type="button" class="secondary-button" data-approval-cancel-withdraw${disabled}>返回</button><button type="button" class="primary-button" data-approval-decision="withdrawn"${disabled}>确认撤回</button>`
        : `<button type="button" class="secondary-button" data-approval-close${disabled}>关闭</button><button type="button" class="secondary-button" data-approval-ask-withdraw${disabled}>撤回申请</button>`;
    } else {
      actions.innerHTML = '<button type="button" class="secondary-button" data-approval-close>关闭</button>';
    }
  }

  function renderDetail(request) {
    title.textContent = `${TYPES[request.type] || "角色授权"}申请`;
    $("approvalDrawerStatus").innerHTML = statusBadge(request.status);
    $("approvalMeta").innerHTML = `<div><dt>申请编号</dt><dd>${escape(request.id)}</dd></div>
      <div><dt>发起人</dt><dd>${escape(request.applicant.name)}</dd></div>
      <div><dt>申请来源</dt><dd>${escape(request.source || "—")}</dd></div>
      <div><dt>提交时间</dt><dd>${timeLabel(request.createdAt)}</dd></div>
      <div class="approval-reason"><dt>申请理由</dt><dd>${escape(request.reason || "—")}</dd></div>`;
    $("approvalItems").innerHTML = request.items.map(renderItem).join("");
    $("approvalTimeline").innerHTML = renderTimeline(request);
    renderActions(request);
  }

  function render() {
    const requests = visibleRequests();
    renderList(requests);
    if (!drawer.open) return;
    const request = requests.find(({ id }) => id === activeId);
    if (request) {
      renderDetail(request);
      if (menuDialog.open) renderPreview();
    } else {
      if (menuDialog.open) menuDialog.close();
      drawer.close();
    }
  }

  function notify(message = "") {
    const notice = $("approvalNotice");
    notice.textContent = message;
    notice.hidden = !message;
  }

  function openRequest(id) {
    const request = visibleRequests().find((item) => item.id === id);
    if (!request) {
      notify("未找到可查看的授权申请。");
      return;
    }
    activeId = id;
    confirmingWithdrawal = false;
    comment.value = "";
    comment.removeAttribute("aria-invalid");
    notify();
    setFeedback();
    renderDetail(request);
    if (request.status === "pending" && store.actor().kind === "reviewer" && !canReview(request)) {
      setFeedback("此申请需由其他审核员处理。");
    }
    drawer.showModal();
    $("approvalDrawerScroll").scrollTop = 0;
    title.focus({ preventScroll: true });
  }

  async function decide(decision) {
    if (busy || !activeId) return;
    const id = activeId;
    const actorId = store.actor().id;
    const note = comment.value.trim();
    if (decision === "rejected" && !note) {
      comment.setAttribute("aria-invalid", "true");
      setFeedback("请填写驳回原因。", "error");
      comment.focus();
      return;
    }
    busy = true;
    setFeedback();
    render();
    try {
      const request = await store.withWriteLock(() => {
        if (store.actor().id !== actorId) throw new Error("处理身份已切换，请重新操作。");
        return decision === "withdrawn" ? store.withdrawRequest(id) : store.reviewRequest(id, decision, note);
      });
      const message = MESSAGES[request.status];
      if (drawer.open && activeId === id) setFeedback(message, request.status === "invalid" ? "error" : "success");
      else notify(message);
    } catch (error) {
      const message = error.message || "操作未完成，请重试。";
      if (drawer.open && activeId === id) setFeedback(message, "error");
      else notify(message);
    } finally {
      busy = false;
      confirmingWithdrawal = false;
      render();
      if (drawer.open && activeId === id) title.focus({ preventScroll: true });
    }
  }

  function deepLinkedRequest() {
    const query = new URLSearchParams(location.search).get("request");
    if (query) return query;
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch { return ""; }
  }

  for (const button of scopeButtons) button.addEventListener("click", () => {
    scope = button.dataset.approvalScope;
    render();
  });
  const filters = $("approvalFilters");
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("input", (event) => {
    if (event.target === statusFilter) allStatus = statusFilter.value;
    render();
  });
  filters.addEventListener("reset", () => {
    allStatus = "";
    queueMicrotask(render);
  });
  rows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-approval-request]");
    if (button) openRequest(button.dataset.approvalRequest);
  });
  drawer.addEventListener("click", (event) => {
    const preview = event.target.closest("[data-approval-preview]");
    if (preview) {
      previewOpener = preview;
      previewUserId = preview.dataset.approvalPreview;
      renderPreview();
      menuDialog.showModal();
      $("approvalMenuContent").scrollTop = 0;
      return;
    }
    if (event.target.closest("[data-approval-close]")) drawer.close();
    else if (event.target.closest("[data-approval-ask-withdraw], [data-approval-cancel-withdraw]")) {
      confirmingWithdrawal = !confirmingWithdrawal;
      setFeedback(confirmingWithdrawal ? "撤回后，审核员将无法处理这张申请。" : "");
      render();
      actions.querySelector(confirmingWithdrawal ? '[data-approval-decision="withdrawn"]' : "[data-approval-ask-withdraw]")?.focus();
    } else {
      const button = event.target.closest("[data-approval-decision]");
      if (button) decide(button.dataset.approvalDecision);
    }
  });
  drawer.addEventListener("close", () => {
    if (drawer.open) return;
    const opener = [...rows.querySelectorAll("[data-approval-request]")].find((button) => button.dataset.approvalRequest === activeId);
    activeId = "";
    (opener || scopeButtons.find((button) => button.dataset.approvalScope === scope))?.focus();
  });
  $("approvalMenuClose").addEventListener("click", () => menuDialog.close());
  menuDialog.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    menuDialog.close();
  });
  menuDialog.addEventListener("close", () => {
    if (menuDialog.open) return;
    if (drawer.open) {
      const opener = previewOpener?.isConnected ? previewOpener : [...drawer.querySelectorAll("[data-approval-preview]")]
        .find(button => button.dataset.approvalPreview === previewUserId);
      (opener || title).focus({ preventScroll: true });
    }
    previewUserId = "";
    previewOpener = null;
  });
  comment.addEventListener("input", () => {
    if (!comment.hasAttribute("aria-invalid")) return;
    comment.removeAttribute("aria-invalid");
    setFeedback();
  });
  store.subscribe(render);
  hydrate();
  render();
  const requestId = deepLinkedRequest();
  if (requestId) openRequest(requestId);
})();
