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
  const approvalBlock = $("approvalBlockReason");
  const blockingRoleButton = $("approvalBlockingRole");
  const backButton = $("approvalDrawerBack");
  const feedback = $("approvalFeedback");
  const actions = $("approvalActions");
  const rows = $("approvalRows");
  const categoryButtons = [...document.querySelectorAll("[data-approval-category]")];
  const scopeButtons = [...document.querySelectorAll("[data-approval-scope]")];
  const statusFilter = $("approvalStatus");
  const typeFilter = $("approvalType");
  const params = new URLSearchParams(location.search);
  const panelMode = params.get("panel") === "1";
  const categoryParam = params.get("category");
  const panelCategory = categoryParam === "user" || categoryParam === "role" ? categoryParam : "all";
  const detailClose = $("approvalDetailClose");
  const STATUS = {
    pending: "待审核", approved: "已通过", rejected: "已驳回", withdrawn: "已撤回", invalid: "已失效",
  };
  const TYPES = {
    menus: "角色菜单变更",
    "enable-user": "启用用户", "enable-role": "启用角色",
    "disable-user": "停用用户", "disable-role": "停用角色",
    "delete-user": "删除用户", "delete-role": "删除角色",
  };
  const { grantedGroups, groups: menuGroups, label: menuLabel } = window.BaigeIamMenuCatalog;
  const { difference, render: renderMenuComparison } = window.BaigeIamMenuComparison;
  const MESSAGES = {
    approved: "申请已通过，变更已生效。",
    rejected: "申请已驳回。",
    withdrawn: "申请已撤回。",
    invalid: "申请已失效，请查看处理记录。",
  };
  const UPDATED_PREVIEW_MESSAGE = "申请影响已更新，请核对最新权限后重新审核。";
  let reviewer = store.actor().kind === "reviewer";
  let scope = reviewer ? "pending" : "all";
  let category = reviewer ? "all" : panelCategory;
  let allStatus = "";
  let activeId = "";
  let busy = false;
  let confirmingWithdrawal = false;
  let previewUserId = "";
  let previewOpener = null;
  let displayedReviewToken = null;
  let returnToAssignment = null;
  const pager = window.BaigeAdminPagination.create($("approvalPager"), render);

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

  function requestCategory(request) {
    return request.items.some(item => item.roleId && !item.userId) ? "role" : "user";
  }

  function targetLabel(request) {
    const roleRequest = requestCategory(request) === "role";
    const names = [...new Map(request.items.map(item => roleRequest
      ? [item.roleId, item.roleName || item.roleId]
      : [item.userId, item.userName || item.userId])).values()].filter(Boolean);
    return names.length > 1 ? `${names[0]} 等 ${names.length} ${roleRequest ? "个角色" : "人"}` : names[0] || "—";
  }

  function canReview(request) {
    return request.status === "pending" && store.actor().kind === "reviewer" && store.canReviewRequest(request.id);
  }

  function matches(value, query) {
    return String(value ?? "").toLocaleLowerCase().includes(query);
  }

  function membershipHas(request, operation) {
    return request.type === "membership" && request.items.some(item => item.operation === operation);
  }

  function requestLabel(request) {
    if (request.type !== "membership") return TYPES[request.type] || "权限变更";
    if (!membershipHas(request, "add")) return "撤销角色授权";
    return membershipHas(request, "remove") ? "更换角色授权" : "新增角色授权";
  }

  function renderListChange(request) {
    const changes = new Map();
    const targets = new Set();
    if (request.type === "membership") {
      for (const item of request.items) {
        if (item.operation !== "add" && item.operation !== "remove") continue;
        const roleName = item.roleName || item.roleId || "角色名称未记录";
        const key = JSON.stringify([item.operation, item.roleId || roleName]);
        if (!changes.has(key)) changes.set(key, { operation: item.operation, roleName, users: new Map() });
        if (item.userId) {
          targets.add(item.userId);
          changes.get(key).users.set(item.userId, item.userName || item.userId);
        }
      }
    }
    if (!changes.size) return `<span class="approval-type">${escape(requestLabel(request))}</span>`;

    return `<ul class="approval-list-changes">${[...changes.values()].map(({ operation, roleName, users }) => {
      const adding = operation === "add";
      const affectedUsers = users.size && users.size < targets.size
        ? `<span class="approval-change-people">适用用户 · ${[...users.values()].map(escape).join("、")}</span>`
        : "";
      return `<li><span data-change="${adding ? "added" : "removed"}">${adding ? "新增角色" : "撤销角色"} ${escape(roleName)}</span>${affectedUsers}</li>`;
    }).join("")}</ul>`;
  }

  function matchesType(request, type) {
    if (!type) return true;
    if (type === "membership") return membershipHas(request, "add");
    if (type === "revoke") return membershipHas(request, "remove");
    if (type === "menus") return request.type === "menus" || request.items.some(item => Array.isArray(item.requestedConfiguredMenus));
    return type === "account-status" ? /^(enable|disable|delete)-/.test(request.type) : request.type === type;
  }

  function renderList(requests, revealId) {
    const pageTitle = reviewer ? "角色授权审核" : "我的申请";
    $("approvalPageTitle").textContent = pageTitle;
    document.title = `${pageTitle} · 百舸后台`;
    $("approvalAllScope").textContent = reviewer ? "处理记录" : "全部申请";
    $("approvalApplicantHead").hidden = !reviewer;
    const categoryRequests = category === "all" ? requests : requests.filter(request => requestCategory(request) === category);
    const targetHead = { all: "变更对象", user: "目标用户", role: "变更角色" };
    const lifecycleLabel = { all: "启用、停用或删除", user: "账号启用、停用或删除", role: "角色启用、停用或删除" };
    $("approvalTargetHead").textContent = targetHead[category];
    $("approvalLifecycleType").textContent = lifecycleLabel[category];
    $("approvalPendingCount").textContent = categoryRequests.filter((request) => request.status === "pending").length;
    for (const button of categoryButtons) button.setAttribute("aria-pressed", String(button.dataset.approvalCategory === category));
    for (const button of scopeButtons) button.setAttribute("aria-pressed", String(button.dataset.approvalScope === scope));
    $("approvalStatusField").hidden = scope === "pending";
    statusFilter.querySelector('[value="pending"]').hidden = reviewer;
    statusFilter.value = allStatus;
    const target = $("approvalTarget").value.trim().toLocaleLowerCase();
    const status = scope === "pending" ? "pending" : allStatus;
    for (const option of typeFilter.querySelectorAll("[data-category]")) {
      option.hidden = category !== "all" && option.dataset.category !== category;
      option.disabled = option.hidden;
    }
    if (typeFilter.selectedOptions[0]?.disabled) typeFilter.value = "";
    const type = typeFilter.value;
    const filtered = categoryRequests.filter((request) => {
      if (reviewer && scope === "all" && request.status === "pending") return false;
      if (status && request.status !== status) return false;
      if (!matchesType(request, type)) return false;
      return !target || [request.id, request.applicant.name, request.applicant.id].some(value => matches(value, target))
        || (request.approvedImpact || request.impact || []).some(person => [person.name, person.username, person.department].some(value => matches(value, target)))
        || request.items.some((item) =>
          [item.userName, item.roleName, item.userId, item.roleId, ...(item.affectedUsers || []).flatMap(user => [user.name, user.username, user.department])]
            .some((value) => matches(value, target)));
    });

    const empty = target || type || (scope === "all" && allStatus) ? "没有符合筛选条件的申请"
      : scope === "pending" ? "暂无待审核申请" : reviewer ? "暂无处理记录" : "暂无权限变更申请";
    const pageRequests = pager.slice(filtered, revealId ? request => request.id === revealId : undefined);
    rows.innerHTML = pageRequests.map((request) => `<tr>
      <td>${renderListChange(request)}${request.source ? `<span class="approval-source">${escape(request.source)}</span>` : ""}</td>
      <td>${escape(targetLabel(request))}</td>
      ${reviewer ? `<td>${escape(request.applicant.name)}</td>` : ""}
      <td>${timeLabel(request.createdAt)}</td>
      <td>${statusBadge(request.status)}</td>
      <td><button type="button" class="approval-row-action" data-approval-request="${escape(request.id)}">${canReview(request) ? "审核" : "查看"}</button></td>
    </tr>`).join("") || `<tr><td colspan="${reviewer ? 6 : 5}" class="approval-empty">${empty}</td></tr>`;
    $("approvalSummary").textContent = `共 ${filtered.length} 条申请`;
  }

  function previewButton(userId, name) {
    return userId
      ? `<button type="button" class="approval-preview" data-approval-preview="${escape(userId)}" aria-haspopup="dialog" aria-label="查看${escape(name)}的实时菜单权限">查看实时权限</button>`
      : "";
  }

  function renderPreview() {
    const user = store.users().find(({ id }) => id === previewUserId);
    $("approvalMenuAccount").textContent = user ? [...new Set([user.nickname, user.username, user.department].filter(Boolean))].join(" · ") : "";
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

  function compareMenus(currentMenus, requestedMenus, status) {
    const resultLabel = status === "pending" ? "审核通过后" : status === "approved" ? "变更后" : "申请方案";
    const beforeLabel = status === "pending" ? "当前权限" : status === "approved" ? "变更前" : "提交时权限";
    return renderMenuComparison(currentMenus, requestedMenus, resultLabel, beforeLabel);
  }

  function peopleFor(request, preview) {
    if (preview) return preview.impact;
    if (Array.isArray(request.approvedImpact)) {
      const submitted = new Map((request.impact || []).map(person => [person.id, person]));
      return request.approvedImpact.map(person => {
        const identity = submitted.get(person.id);
        return identity ? { ...person, name: identity.name, username: identity.username, department: identity.department } : person;
      });
    }
    if (Array.isArray(request.impact)) return request.impact;
    const people = new Map();
    const users = new Map(store.users().map(user => [user.id, user]));
    for (const item of request.items) {
      const listed = [...(item.affectedUsers || [])];
      if (item.userId) listed.push({ id: item.userId, name: item.userName });
      for (const person of listed) {
        const current = users.get(person.id);
        people.set(person.id, { username: current?.username, department: current?.department, ...person });
      }
    }
    return [...people.values()];
  }

  function hasMenuSnapshot({ currentMenus, requestedMenus }) {
    return Array.isArray(currentMenus) && Array.isArray(requestedMenus);
  }

  function menuSetsDiffer(before, after) {
    const { added, removed } = difference(before, after);
    return added.size > 0 || removed.size > 0;
  }

  function impactUpdated(submitted, people) {
    if (!Array.isArray(submitted)) return false;
    if (submitted.length !== people.length) return true;
    const submittedById = new Map(submitted.map(person => [person.id, person]));
    return people.some(person => {
      const before = submittedById.get(person.id);
      return !before || before.status !== person.status || before.requestedStatus !== person.requestedStatus
        || menuSetsDiffer(before.currentMenus, person.currentMenus)
        || menuSetsDiffer(before.requestedMenus, person.requestedMenus);
    });
  }

  function describeImpact(person) {
    if (!hasMenuSnapshot(person)) return { text: "缺少历史快照", tone: "unknown" };
    const { added, removed } = difference(person.currentMenus, person.requestedMenus);
    if (!added.size && !removed.size) return { text: "实际权限无变化", tone: "unchanged" };
    const counts = [added.size ? `新增 ${added.size} 项` : "", removed.size ? `移除 ${removed.size} 项` : ""];
    return { text: counts.filter(Boolean).join(" · "), tone: "changed" };
  }

  function personName(person) {
    return person.name || person.username || person.id;
  }

  function personIdentity(person, submitted, prominent = false) {
    const name = personName(person);
    const meta = `<span class="approval-person-meta"><span>${escape(person.username || "—")}</span><span>${escape(person.department || "—")}</span></span>`;
    const earlier = submitted && ["name", "username", "department"].some(key => person[key] !== submitted[key])
      ? `<span class="approval-person-submitted">${escape(`提交时 ${personName(submitted)} · ${submitted.username || "—"} · ${submitted.department || "—"}`)}</span>` : "";
    return prominent
      ? `<div class="approval-person-identity"><h3>${escape(name)}</h3>${meta}${earlier}</div>`
      : `<span class="approval-person-identity"><strong>${escape(name)}</strong>${meta}${earlier}</span>`;
  }

  const statusTransitions = { enable: "停用 → 正常", disable: "正常 → 停用", delete: "删除" };

  function personChanges(person, items) {
    const roles = items.filter(item => item.operation === "add" || item.operation === "remove");
    if (roles.length) {
      return `<span class="approval-role-changes">${roles.map(item => {
        const adding = item.operation === "add";
        return `<span data-change="${adding ? "added" : "removed"}">${adding ? "新增" : "撤销"} ${escape(item.roleName || item.roleId)}</span>`;
      }).join("")}</span>`;
    }
    const status = { normal: "正常", disabled: "停用", deleted: "已删除" };
    const from = status[person.status];
    const to = status[person.requestedStatus];
    const operation = items.find(item => item.userId === person.id)?.operation;
    const transition = from && to && from !== to ? `${from} → ${to}` : statusTransitions[operation];
    return transition ? `<span class="approval-account-change">${transition}</span>` : "";
  }

  function compareUser(person, items, status) {
    const fromAccount = hasMenuSnapshot(person);
    if (fromAccount) return { html: compareMenus(person.currentMenus, person.requestedMenus, status), note: "" };

    const snapshots = items.filter(hasMenuSnapshot);
    const roleSnapshots = snapshots.some(item => item.roleId);
    const html = snapshots.map(item => `<div class="approval-item">
      ${item.roleId ? `<h4>${escape(item.roleName || item.roleId)}</h4>` : ""}
      ${compareMenus(item.currentMenus, item.requestedMenus, status)}
    </div>`).join("");
    const note = roleSnapshots ? "历史申请未记录账号实际权限，仅保留变更角色的菜单。"
      : html ? "" : "历史申请未记录账号实际权限。";
    return { html, note };
  }

  function renderPersonRow(person, submitted, items, requestStatus, expanded, showImpact) {
    const { html, note } = compareUser(person, items, requestStatus);
    const impact = describeImpact(person);
    const identity = personIdentity(person, submitted);
    const impactLabel = `<span class="approval-impact-label" data-tone="${impact.tone}">${impact.text}</span>`;
    const change = showImpact ? impactLabel : `<span class="approval-person-summary">${personChanges(person, items)}${impactLabel}</span>`;
    const preview = previewButton(person.id, personName(person));
    return `<li class="approval-person">
      ${html ? `<details class="approval-person-comparison" data-user-id="${escape(person.id)}"${expanded ? " open" : ""}>
        <summary class="approval-person-row">${identity}${change}<span class="approval-person-caret" aria-hidden="true"></span></summary>
        <div class="approval-person-diff">
          <div class="approval-person-diff-head"><h4>完整账号权限对比</h4>${preview}</div>
          ${note ? `<p class="approval-details-note">${note}</p>` : ""}${html}
        </div>
      </details>` : `<div class="approval-person-row">${identity}${change}${preview}</div>
        ${!showImpact && note ? `<p class="approval-person-legacy approval-details-note">${note}</p>` : ""}`}
    </li>`;
  }

  function renderRoleMenuChanges(role) {
    const current = role.currentConfiguredMenus || role.currentMenus;
    const requested = role.requestedConfiguredMenus || role.requestedMenus;
    const { added, removed } = difference(current, requested);
    if (!added.size && !removed.size) return "";
    const names = new Map(menuGroups().flatMap(group => group.items.map(item =>
      [item.key, [item.parentLabel, item.label].filter(Boolean).join(" / ")])));
    const list = (keys, tone, heading) => keys.size ? `<div data-change="${tone}">
      <dt>${heading} ${keys.size} 项</dt>
      <dd><ul>${[...keys].map(key => `<li>${escape(names.get(key) || menuLabel(key))}</li>`).join("")}</ul></dd>
    </div>` : "";
    return `<dl class="approval-menu-changes">${list(added, "added", "新增菜单")}${list(removed, "removed", "移除菜单")}</dl>`;
  }

  function renderRoleSubject(request, people) {
    const role = request.items.find(item => item.roleId && !item.userId);
    const impact = people.map(person => describeImpact(person));
    const changed = impact.filter(person => person.tone === "changed").length;
    const unknown = impact.filter(person => person.tone === "unknown").length;
    const summary = unknown === people.length && unknown > 0
      ? ["历史申请未记录实际权限"]
      : [`${changed} 人实际权限变化`, unknown ? `${unknown} 人缺少历史快照` : ""].filter(Boolean);
    const transition = statusTransitions[role.operation];
    return `<h3>${escape(role.roleName || role.roleId)}</h3>
      ${transition ? `<span class="approval-account-change">${transition}</span>` : ""}
      <p class="approval-role-impact" id="approvalRoleImpact"><strong>涉及 <span id="approvalPeopleCount">${people.length} 人</span></strong><span>${summary.join(" · ")}</span></p>
      ${renderRoleMenuChanges(role)}`;
  }

  function renderRoleComparisons(request, status, preserveExpanded) {
    const open = preserveExpanded ? [...$("approvalItems").querySelectorAll(".approval-config-comparison")].map(details => details.open) : [];
    return request.items.map((item, index) => `<li class="approval-item">
      ${compareMenus(item.currentMenus, item.requestedMenus, status)}
      ${Array.isArray(item.currentConfiguredMenus) && Array.isArray(item.requestedConfiguredMenus) ? `<details class="approval-config-comparison"${open[index] ? " open" : ""}>
        <summary>角色菜单配置对比</summary>
        ${compareMenus(item.currentConfiguredMenus, item.requestedConfiguredMenus, status)}
      </details>` : ""}
    </li>`).join("");
  }

  function renderChanges(request, people, status, preserveExpanded) {
    const roleRequest = requestCategory(request) === "role";
    const singleUser = !roleRequest && people.length === 1 ? people[0] : null;
    const itemsFor = person => request.items.filter(item => item.userId === person.id);
    const submitted = new Map((request.impact || []).map(person => [person.id, person]));
    $("approvalPeopleSection").hidden = Boolean(singleUser);
    $("approvalPeopleTitle").textContent = roleRequest ? "涉及用户" : "变更用户";
    $("approvalPeopleNote").textContent = roleRequest ? "实际权限合并该用户的全部角色计算。" : "";
    $("approvalPeopleNote").hidden = !roleRequest || people.length === 0 || !people.some(hasMenuSnapshot);
    $("approvalPeopleEmpty").hidden = people.length > 0;
    $("approvalPeopleEmpty").textContent = roleRequest ? "此角色暂无成员。" : "历史申请未记录变更用户。";
    const changes = $("approvalChanges");
    if (!preserveExpanded) changes.open = false;
    changes.hidden = !roleRequest && !singleUser;
    $("approvalChangesTitle").textContent = roleRequest ? "查看完整角色权限对比" : "查看完整账号权限对比";
    const changesNote = $("approvalChangesNote");
    changesNote.hidden = true;

    if (roleRequest) {
      $("approvalSubject").innerHTML = renderRoleSubject(request, people);
      $("approvalItems").innerHTML = renderRoleComparisons(request, status, preserveExpanded);
    } else if (singleUser) {
      const items = itemsFor(singleUser);
      const impact = describeImpact(singleUser);
      $("approvalSubject").innerHTML = `${personIdentity(singleUser, submitted.get(singleUser.id), true)}
        ${personChanges(singleUser, items)}<p class="approval-role-impact">${impact.tone === "changed" ? "实际菜单权限 · " : ""}${impact.text}</p>`;
      const { html, note } = compareUser(singleUser, items, status);
      changesNote.textContent = note;
      changesNote.hidden = !note;
      $("approvalItems").innerHTML = `<li class="approval-item"><div class="approval-comparison-actions">${previewButton(singleUser.id, personName(singleUser))}</div>${html}</li>`;
    } else if (people.length) {
      $("approvalSubject").innerHTML = `<h3>批量用户变更</h3><p class="approval-role-impact">共 <strong id="approvalPeopleCount">${people.length} 人</strong></p>`;
      $("approvalItems").innerHTML = "";
    } else {
      $("approvalSubject").innerHTML = "";
      $("approvalItems").innerHTML = "";
    }
    $("approvalSubject").hidden = !roleRequest && !people.length;

    const peopleList = $("approvalPeople");
    const opened = preserveExpanded ? [...peopleList.querySelectorAll("details[data-user-id][open]")] : [];
    const expanded = new Set(opened.map(details => details.dataset.userId));
    const moreOpen = preserveExpanded && $("approvalMorePeople")?.open;
    const rows = singleUser ? [] : people.map(person => renderPersonRow(person, submitted.get(person.id), itemsFor(person), status, expanded.has(person.id), roleRequest));
    const previewLimit = 6;
    const rest = rows.slice(previewLimit);
    peopleList.innerHTML = rows.slice(0, previewLimit).join("") + (rest.length ? `<li class="approval-people-more">
      <details id="approvalMorePeople"${moreOpen ? " open" : ""}>
        <summary>其余 ${rest.length} 人</summary><ul class="approval-people">${rest.join("")}</ul>
      </details>
    </li>` : "");
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
    const blockReason = store.approvalBlockReason(request)
      || (request.status === "pending" && !displayedReviewToken ? "申请依据已变化，请撤回后重新提交。" : "");
    approvalBlock.textContent = blockReason;
    approvalBlock.hidden = !blockReason;
    const blockingRole = blockReason && displayedReviewToken ? store.blockingRoleChange(request) : null;
    const canOpenBlocker = blockingRole && (reviewer || blockingRole.applicant.id === store.actor().id);
    blockingRoleButton.hidden = !canOpenBlocker;
    blockingRoleButton.disabled = busy;
    blockingRoleButton.dataset.approvalBlockingRole = canOpenBlocker ? blockingRole.id : "";
    approvalBlock.dataset.tone = blockingRole ? "waiting" : "error";
    fields.hidden = !mayReview;
    comment.placeholder = blockReason ? "请填写驳回原因" : "通过可留空，驳回请填写原因";
    comment.disabled = busy;
    actions.setAttribute("aria-busy", String(busy));
    const disabled = busy ? " disabled" : "";
    const returnLabel = panelMode ? "返回申请列表" : "关闭";
    if (mayReview) {
      actions.innerHTML = `<button type="button" class="secondary-button" data-approval-close${disabled}>关闭</button>
        <button type="button" class="secondary-button" data-approval-decision="rejected"${disabled}>驳回申请</button>
        <button type="button" class="primary-button" data-approval-decision="approved"${blockReason ? ' disabled aria-describedby="approvalBlockReason"' : disabled}>通过申请</button>`;
    } else if (mayWithdraw) {
      actions.innerHTML = confirmingWithdrawal
        ? `<button type="button" class="secondary-button" data-approval-cancel-withdraw${disabled}>返回</button><button type="button" class="primary-button" data-approval-decision="withdrawn"${disabled}>确认撤回</button>`
        : `<button type="button" class="secondary-button" data-approval-close${disabled}>${returnLabel}</button><button type="button" class="secondary-button" data-approval-ask-withdraw${disabled}>撤回申请</button>`;
    } else {
      actions.innerHTML = `<button type="button" class="secondary-button" data-approval-close>${returnLabel}</button>`;
    }
  }

  function renderDetail(request, preserveExpanded = false) {
    const preview = request.status === "pending" ? store.reviewPreview(request.id) : null;
    const people = peopleFor(request, preview);
    const comparisonStatus = request.status === "pending" && !preview ? "submitted" : request.status;
    displayedReviewToken = preview?.token ?? null;
    title.textContent = `${requestLabel(request)}申请`;
    $("approvalDrawerStatus").innerHTML = statusBadge(request.status);
    $("approvalReason").textContent = request.reason || "—";
    const update = $("approvalImpactUpdate");
    const refreshed = Boolean(preview && impactUpdated(request.impact, people));
    update.textContent = refreshed ? "与提交时相比，涉及账号的权限影响已更新。请核对当前预览。" : "";
    update.hidden = !refreshed;
    $("approvalMeta").innerHTML = `<div><dt>申请编号</dt><dd>${escape(request.id)}</dd></div>
      <div><dt>申请来源</dt><dd>${escape(request.source || "—")}</dd></div>`;
    renderChanges(request, people, comparisonStatus, preserveExpanded);
    $("approvalTimeline").innerHTML = renderTimeline(request);
    renderActions(request);
  }

  function render(revealId = "") {
    const currentReviewer = store.actor().kind === "reviewer";
    if (reviewer !== currentReviewer) {
      reviewer = currentReviewer;
      scope = reviewer ? "pending" : "all";
      category = reviewer ? "all" : panelCategory;
      allStatus = "";
      pager.reset();
    }
    const requests = visibleRequests();
    renderList(requests, revealId);
    if (!drawer.open) return;
    const request = requests.find(({ id }) => id === activeId);
    if (request) {
      const previousToken = displayedReviewToken;
      renderDetail(request, true);
      if (!busy && previousToken && displayedReviewToken && previousToken !== displayedReviewToken && canReview(request)) {
        setFeedback(UPDATED_PREVIEW_MESSAGE, "updated");
      }
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
      return false;
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
    backButton.hidden = !panelMode && !returnToAssignment;
    backButton.textContent = returnToAssignment ? "返回授权申请" : "返回申请列表";
    if (!drawer.open) drawer.showModal();
    $("approvalDrawerScroll").scrollTop = 0;
    title.focus({ preventScroll: true });
    return true;
  }

  function openBlockingRole(id) {
    if (!id || busy) return;
    returnToAssignment = {
      id: activeId,
      actorId: store.actor().id,
      comment: comment.value,
      comparisonOpen: $("approvalChanges").open,
      scrollTop: $("approvalDrawerScroll").scrollTop,
    };
    if (!openRequest(id)) returnToAssignment = null;
  }

  function returnToOriginalRequest() {
    if (busy) return;
    const original = returnToAssignment;
    returnToAssignment = null;
    if (!openRequest(original.id)) {
      drawer.close();
      return;
    }
    if (store.actor().id === original.actorId) comment.value = original.comment;
    $("approvalChanges").open = original.comparisonOpen;
    $("approvalDrawerScroll").scrollTop = original.scrollTop;
  }

  function closePanel() {
    window.parent.postMessage({ type: "baige:iam-requests-close" }, "*");
  }

  async function decide(decision) {
    if (busy || !activeId) return;
    const id = activeId;
    const actorId = store.actor().id;
    const note = comment.value.trim();
    const token = displayedReviewToken;
    if (decision === "approved" && (!token || !approvalBlock.hidden)) return;
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
        return decision === "withdrawn" ? store.withdrawRequest(id) : store.reviewRequest(id, decision, note, decision === "approved" ? token : undefined);
      });
      const message = MESSAGES[request.status];
      if (drawer.open && activeId === id) setFeedback(message, request.status === "invalid" ? "error" : "success");
      else notify(message);
    } catch (error) {
      const message = error.message || "操作未完成，请重试。";
      if (drawer.open && activeId === id) {
        setFeedback(message, "error");
        if (error.code === "IAM_REVIEW_CHANGED") $("approvalDrawerScroll").scrollTop = 0;
      } else notify(message);
    } finally {
      busy = false;
      confirmingWithdrawal = false;
      render();
      if (drawer.open && activeId === id) title.focus({ preventScroll: true });
    }
  }

  function deepLinkedRequest() {
    const query = params.get("request");
    if (query) return query;
    try { return decodeURIComponent(location.hash.slice(1)); }
    catch { return ""; }
  }

  for (const button of categoryButtons) button.addEventListener("click", () => {
    category = button.dataset.approvalCategory;
    pager.reset();
    render();
  });
  for (const button of scopeButtons) button.addEventListener("click", () => {
    scope = button.dataset.approvalScope;
    pager.reset();
    render();
  });
  const filters = $("approvalFilters");
  filters.addEventListener("submit", (event) => event.preventDefault());
  filters.addEventListener("input", (event) => {
    if (event.target === statusFilter) allStatus = statusFilter.value;
    pager.reset();
    render();
  });
  filters.addEventListener("reset", () => {
    allStatus = "";
    pager.reset();
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
    const blockingRole = event.target.closest("[data-approval-blocking-role]");
    if (blockingRole) {
      openBlockingRole(blockingRole.dataset.approvalBlockingRole);
      return;
    }
    if (returnToAssignment && event.target.closest("#approvalDrawerBack")) {
      returnToOriginalRequest();
      return;
    }
    if (event.target.closest("#approvalDetailClose")) {
      if (panelMode) closePanel();
      else drawer.close();
    }
    else if (event.target.closest("[data-approval-close]")) drawer.close();
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
    const openerId = returnToAssignment?.id || activeId;
    const opener = [...rows.querySelectorAll("[data-approval-request]")].find((button) => button.dataset.approvalRequest === openerId);
    activeId = "";
    returnToAssignment = null;
    displayedReviewToken = null;
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
  store.subscribe(() => render());
  if (panelMode) {
    document.body.classList.add("approval-panel-mode");
    const close = document.querySelector(".approval-head [data-approval-close-panel]");
    close.hidden = false;
    close.addEventListener("click", closePanel);
    detailClose.setAttribute("data-approval-close-panel", "");
    detailClose.setAttribute("aria-label", "关闭我的申请");
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape" || event.defaultPrevented || menuDialog.open) return;
      event.preventDefault();
      if (!drawer.open) closePanel();
      else drawer.close();
    });
    $("approvalPageTitle").focus({ preventScroll: true });
  }
  hydrate();
  const requestId = deepLinkedRequest();
  const linkedRequest = requestId ? visibleRequests().find(request => request.id === requestId) : null;
  if (linkedRequest) {
    category = requestCategory(linkedRequest);
    if (reviewer) scope = linkedRequest.status === "pending" ? "pending" : "all";
  }
  render(linkedRequest?.id);
  if (requestId) openRequest(requestId);
})();
