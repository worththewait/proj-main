(() => {
  "use strict";

  const store = window.BaigeIamStore;
  const management = window.BaigeIamManagement;
  if (!store || !management?.requireAdministrator()) return;
  const { goToRequest, requestLifecycle, askPermissionChange, requestLink, showRequestError, statusSwitch, pendingItemsBy, toast } = management;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const { render: renderMenuComparison } = window.BaigeIamMenuComparison;
  const $ = (id) => document.getElementById(id);
  const dialog = $("iamRoleDialog");
  const usersDialog = $("iamRoleUsersDialog");
  const addUsersDialog = $("iamAddUsersDialog");
  let editingId = "";
  let editingRole = null;
  let menuPicker = null;
  let rolePreview;
  let usersRoleId = "";
  let usersSelected = new Set();
  let addUsersSelected = new Set();
  let usersFilters = { name: "", phone: "" };
  let addFilters = { name: "", phone: "" };
  const rolePager = window.BaigeAdminPagination.create($("iamRolePager"), renderRoles);
  const membersPager = window.BaigeAdminPagination.create($("iamRoleUsersPager"), renderRoleUsers, 5);
  const addUsersPager = window.BaigeAdminPagination.create($("iamAddUsersPager"), renderAddUsers, 5);
  let filters = { name: "", code: "", status: "" };

  const pendingByRole = () => pendingItemsBy("roleId");
  const pendingRoleChange = item => !item.userId;
  function filteredRoles() {
    return store.roles().filter((role) => {
      if (filters.name && !role.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.code && !String(role.code || "").toLowerCase().includes(filters.code.toLowerCase())) return false;
      if (filters.status && role.status !== filters.status) return false;
      return true;
    });
  }
  function renderRoles() {
    const roles = filteredRoles();
    const pageRoles = rolePager.slice(roles);
    const pendingRoles = pendingByRole();
    $("iamRoleRows").innerHTML = pageRoles.length ? pageRoles.map((role) => {
      const pending = pendingRoles.get(role.id) || [];
      const protectedRole = store.isProtectedRole(role.id);
      const hasRoleChange = pending.some(pendingRoleChange);
      return `<tr><td>${escape(role.id)}</td>
        <td><span class="iam-role-name">${escape(role.name)}</span>${pending.length ? `<div class="iam-row-pending">${requestLink(pending[0].requestId, "待审核")}</div>` : ""}</td>
        <td><span class="iam-role-code">${escape(role.code || "—")}</span></td><td class="iam-order">${escape(role.order ?? 1)}</td>
        <td><span class="iam-time">${escape(role.createdAt || "—")}</span></td><td>${statusSwitch("role", role, protectedRole || hasRoleChange)}</td>
        <td><div class="iam-actions">
          ${protectedRole ? "" : `<button class="iam-icon-action is-edit" type="button" data-iam-role-edit="${escape(role.id)}" title="编辑角色" aria-label="编辑${escape(role.name)}">${icon("edit")}</button>
          ${hasRoleChange ? "" : `<button class="iam-icon-action is-delete" type="button" data-iam-role-delete="${escape(role.id)}" title="申请删除角色" aria-label="申请删除${escape(role.name)}">${icon("trash")}</button>`}`}
          <button class="iam-icon-action is-key" type="button" data-iam-role-menu="${escape(role.id)}" title="菜单权限" aria-label="${protectedRole ? "查看" : "设置"}${escape(role.name)}菜单权限">${icon("shield")}</button>
          <button class="iam-icon-action is-user" type="button" data-iam-role-users="${escape(role.id)}" title="${protectedRole ? "查看用户" : "分配用户"}" aria-label="${protectedRole ? "查看成员" : "分配用户"} · ${escape(role.name)}">${icon("users")}</button>
        </div></td></tr>`;
    }).join("") : '<tr><td colspan="7"><div class="iam-empty">没有符合条件的角色</div></td></tr>';
    $("iamRoleCount").textContent = `（${roles.length}）`;
    $("iamRoleSummary").textContent = `共 ${roles.length} 条角色数据`;
  }
  function roleForm() {
    return `<div class="iam-form-grid">
      <label class="iam-form-field"><span>角色名称 <em>*</em></span><input class="iam-input" id="iamEditRoleName" maxlength="64" placeholder="请输入角色名称"></label>
      <label class="iam-form-field"><span>权限字符 <em>*</em></span><input class="iam-input" id="iamEditRoleCode" maxlength="64" placeholder="请输入权限字符"></label>
      <label class="iam-form-field"><span>显示顺序</span><input class="iam-input" id="iamEditRoleOrder" type="number" min="1" max="999" value="1"></label>
      <label class="iam-form-field"><span>状态</span><select class="iam-input" id="iamEditRoleStatus"><option value="normal">正常</option><option value="disabled">停用</option></select></label>
      </div><p class="iam-form-feedback" id="iamRoleFeedback" role="status"></p>`;
  }

  function editForm(role, readOnly) {
    const disabled = readOnly ? " disabled" : "";
    const roleState = role.status === "disabled" ? "disabled" : "normal";
    const pending = (pendingByRole().get(role.id) || []).find(pendingRoleChange);
    return `<div class="iam-role-edit-grid">
      <section class="iam-role-fields" aria-label="角色资料">
        <label class="iam-role-field"><span>角色名称 <em>*</em></span><input class="iam-input" id="iamEditRoleName" maxlength="64" value="${escape(role.name || "")}"${disabled}></label>
        <label class="iam-role-field"><span>权限字符 <em>*</em></span><input class="iam-input" id="iamEditRoleCode" maxlength="64" value="${escape(role.code || "")}"${disabled}></label>
        <div class="iam-role-field"><span id="iamRoleOrderLabel">角色顺序 <em>*</em></span><span class="iam-role-order">
          <input class="iam-input" id="iamEditRoleOrder" type="number" aria-labelledby="iamRoleOrderLabel" min="1" max="999" step="1" value="${escape(role.order ?? 1)}"${disabled}>
          <button type="button" data-iam-order-step="-1" aria-label="减少角色顺序"${disabled}>−</button>
          <button type="button" data-iam-order-step="1" aria-label="增加角色顺序"${disabled}>+</button>
        </span></div>
        <div class="iam-role-field"><span id="iamRoleStatusLabel">状态 <em>*</em></span>
          <div class="iam-role-status" role="group" aria-labelledby="iamRoleStatusLabel">
            <button type="button" data-iam-role-status="normal" aria-pressed="${roleState === "normal"}"${disabled}>正常</button>
            <button type="button" data-iam-role-status="disabled" aria-pressed="${roleState === "disabled"}"${disabled}>停用</button>
            <input id="iamEditRoleStatus" type="hidden" value="${roleState}">
          </div>
        </div>
        <label class="iam-role-field iam-role-remark"><span>备注</span><textarea class="iam-input" id="iamEditRoleRemark" maxlength="500" rows="4" placeholder="填写角色用途"${disabled}>${escape(role.remark || "")}</textarea></label>
      </section>
      <section class="iam-role-authorization" id="iamRoleMenuPicker" aria-label="菜单权限"></section>
    </div>
    ${pending ? `<div class="iam-menu-pending">该角色已有待审核申请。可保存资料；如需变更权限或状态，请先处理原申请。${requestLink(pending.requestId, "查看原申请")}</div>` : ""}
    <div id="iamRoleReviewFields" class="iam-role-review-fields" hidden>
      <p class="iam-dialog-note">审核通过后，角色变更才会生效。</p>
      <details class="iam-role-impact" id="iamRoleReviewImpact">
        <summary id="iamRoleReviewImpactSummary">涉及用户</summary>
        <ul id="iamRoleReviewImpactList"></ul>
      </details>
      <details class="iam-role-impact">
        <summary>查看角色权限对比</summary>
        <div class="iam-role-impact-compare" id="iamRoleReviewMenus"></div>
      </details>
      <details class="iam-role-impact" id="iamRoleReviewConfig" hidden>
        <summary>查看同时修改的菜单配置</summary>
        <div class="iam-role-impact-compare" id="iamRoleReviewConfiguredMenus"></div>
      </details>
      <label class="iam-form-field"><span>申请原因 <em>*</em></span><textarea class="iam-input iam-reason-input" id="iamRoleReviewReason" maxlength="240" placeholder="请说明本次变更的原因"></textarea></label>
    </div>
    <p class="iam-form-feedback iam-role-feedback" id="iamRoleFeedback" role="status"></p>`;
  }

  function openRoleDialog(id = "", focusMenu = false) {
    const role = id ? store.roles().find((item) => item.id === id) : null;
    if (id && !role) return;
    editingId = id;
    editingRole = role;
    menuPicker = null;
    rolePreview = undefined;
    const readOnly = Boolean(role && store.isProtectedRole(role.id));
    dialog.classList.toggle("iam-dialog--role-editor", Boolean(role));
    $("iamRoleDialogTitle").textContent = role ? (readOnly ? "查看角色信息" : "编辑角色信息") : "新建角色";
    $("iamRoleCancel").textContent = readOnly ? "关闭" : "取消";
    $("iamRoleSave").hidden = readOnly;
    $("iamRoleSave").textContent = role ? "修改" : "保存";
    $("iamRoleSaveWarning").hidden = true;
    $("iamRoleSaveWarning").textContent = "";
    $("iamRoleDialogBody").innerHTML = role ? editForm(role, readOnly) : roleForm();
    if (role) {
      menuPicker = window.BaigeIamRoleMenuPicker.mount($("iamRoleMenuPicker"), {
        selected: role.menuPermissions || [], disabled: readOnly, onChange: syncRoleReview,
      });
      syncRoleReview();
    }
    if (!dialog.open) dialog.showModal();
    const focus = focusMenu ? $("iamRoleMenuPicker")?.querySelector('input[type="search"]') : $("iamEditRoleName");
    focus?.focus({ preventScroll: true });
  }

  function syncRoleReview() {
    if (!editingRole || !menuPicker || store.isProtectedRole(editingId)) return;
    const catalog = window.BaigeIamMenuCatalog;
    const current = catalog.expand(editingRole.menuPermissions || []).sort();
    const next = catalog.expand(menuPicker.keys()).sort();
    const status = $("iamEditRoleStatus").value;
    const changed = status !== editingRole.status || JSON.stringify(current) !== JSON.stringify(next);
    rolePreview = undefined;
    const warning = $("iamRoleSaveWarning");
    warning.hidden = true;
    warning.textContent = "";
    $("iamRoleReviewFields").hidden = true;
    $("iamRoleReviewReason").required = false;
    $("iamRoleSave").textContent = "保存资料";
    if (!changed) return;
    const impact = $("iamRoleReviewImpact");
    $("iamRoleReviewConfig").hidden = true;
    try {
      const preview = store.previewRoleChange(editingId, menuPicker.keys(), status);
      rolePreview = preview;
      if (!preview.requiresApproval) {
        const count = preview.invalidatedRequests.length;
        if (count) {
          warning.textContent = `本次保存将使 ${count} 张待审分配申请失效。`;
          warning.hidden = false;
        }
        $("iamRoleSave").textContent = "保存";
        return;
      }
      $("iamRoleReviewFields").hidden = false;
      $("iamRoleReviewReason").required = true;
      $("iamRoleSave").textContent = "提交审核";
      const users = preview.impact;
      $("iamRoleReviewMenus").innerHTML = renderMenuComparison(preview.currentMenus, preview.requestedMenus, "审核通过后");
      if (preview.currentConfiguredMenus && preview.requestedConfiguredMenus) {
        $("iamRoleReviewConfiguredMenus").innerHTML = renderMenuComparison(preview.currentConfiguredMenus, preview.requestedConfiguredMenus, "审核通过后");
        $("iamRoleReviewConfig").hidden = false;
      }
      const changed = users.filter(user => JSON.stringify(user.currentMenus) !== JSON.stringify(user.requestedMenus)).length;
      $("iamRoleReviewImpactSummary").textContent = `涉及 ${users.length} 位用户，${changed} 位的实际权限会变更`;
      $("iamRoleReviewImpactList").innerHTML = users.map(user => {
        const different = JSON.stringify(user.currentMenus) !== JSON.stringify(user.requestedMenus);
        return `<li><strong>${escape(user.name)}</strong><span>${[user.username, user.department, different ? "权限会变更" : "权限无变化"].filter(Boolean).map(escape).join(" · ")}</span></li>`;
      }).join("") || "<li>该角色暂无成员。</li>";
      if (users.length && !impact.dataset.loaded) impact.open = true;
      impact.dataset.loaded = "true";
    } catch (error) {
      rolePreview = null;
      showRequestError($("iamRoleFeedback"), error);
    }
  }

  async function saveRole() {
    if (rolePreview === null) return;
    const name = $("iamEditRoleName").value.trim();
    const code = $("iamEditRoleCode").value.trim();
    const order = Number($("iamEditRoleOrder").value);
    const feedback = $("iamRoleFeedback");
    if (!name) { feedback.textContent = "请填写角色名称。"; return; }
    if (!code) { feedback.textContent = "请填写权限字符。"; return; }
    if (!Number.isInteger(order) || order < 1 || order > 999) {
      feedback.textContent = "角色顺序须为 1 至 999 的整数。";
      return;
    }
    const role = editingRole;
    const status = $("iamEditRoleStatus").value;
    const payload = { name, code, order, status };
    const reason = $("iamRoleReviewReason")?.value.trim();
    const menus = menuPicker?.keys();
    const preview = rolePreview;
    if (role) {
      if (preview?.requiresApproval && !reason) {
        feedback.textContent = "请填写申请原因。";
        $("iamRoleReviewReason").focus();
        return;
      }
      payload.remark = $("iamEditRoleRemark").value.trim();
    }
    const save = $("iamRoleSave");
    save.disabled = true;
    try {
      const request = await store.withWriteLock(() => role
        ? store.saveRoleEdit(role.id, payload, menus, {
          source: "角色管理 · 编辑角色", reason, originalMenus: role.menuPermissions || [], originalStatus: role.status,
          expectedImpact: preview?.token,
        })
        : (store.addRole(payload), null));
      dialog.close();
      toast(request ? "申请已提交，审核通过后生效"
        : preview?.changed ? "角色菜单已保存" : role ? "角色资料已保存" : "角色已创建", request);
    } catch (error) {
      if (role) syncRoleReview();
      showRequestError(feedback, error);
    } finally {
      save.disabled = false;
    }
  }

  function openRoleUsers(roleId) {
    usersRoleId = roleId;
    const role = store.roles().find((item) => item.id === roleId);
    if (!role) return;
    $("iamRoleUsersTitle").textContent = `「${role.name}」成员`;
    membersPager.reset();
    usersSelected = new Set();
    usersFilters = { name: "", phone: "" };
    $("iamRoleUserName").value = "";
    $("iamRoleUserPhone").value = "";
    $("iamRoleUsersFeedback").textContent = "";
    $("iamRoleUsersFeedback").classList.remove("is-error");
    renderRoleUsers();
    if (!usersDialog.open) usersDialog.showModal();
  }
  function filteredAssignedUsers(role) {
    const assignedIds = new Set(role.userIds || []);
    const pendingForRole = new Map((pendingByRole().get(role.id) || []).filter((item) => item.userId).map((item) => [item.userId, item]));
    const pendingForUser = pendingItemsBy("userId");
    return store.users().filter((user) => assignedIds.has(user.id) || pendingForRole.has(user.id)).filter((user) => {
      if (usersFilters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(usersFilters.name.toLowerCase())) return false;
      if (usersFilters.phone && !String(user.phone || "").includes(usersFilters.phone)) return false;
      return true;
    }).map((user) => ({ ...user, assigned: assignedIds.has(user.id), pending: pendingForRole.get(user.id) || pendingForUser.get(user.id)?.[0] }));
  }
  function canRevoke(role, user) {
    return user.assigned && !user.pending && !store.isProtectedRole(role.id);
  }
  function showRoleChangeNotice(notice, request) {
    const requestId = request?.id || "";
    if (notice.dataset.requestId === requestId) return;
    notice.dataset.requestId = requestId;
    notice.hidden = !request;
    notice.textContent = request ? "角色变更待审核，处理完成后才能添加用户。" : "";
    if (request) notice.insertAdjacentHTML("beforeend", ` ${requestLink(requestId, "查看原申请")}`);
  }
  function renderRoleUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const all = filteredAssignedUsers(role);
    const pageUsers = membersPager.slice(all);
    $("iamRoleUsersRows").innerHTML = pageUsers.length ? pageUsers.map((user) => {
      const active = role.status === "normal" && user.status === "normal";
      const revoke = canRevoke(role, user);
      const status = user.assigned ? `<span class="iam-status-pill ${active ? "is-green" : "is-disabled"}">${active ? "已生效" : "已暂停"}</span>` : '<span class="iam-status-pill is-pending">待审核</span>';
      return `<tr><td class="iam-assign-check">${revoke ? `<input type="checkbox" data-iam-role-user="${escape(user.id)}" ${usersSelected.has(user.id) ? "checked" : ""} aria-label="选择${escape(user.username)}" />` : "—"}</td>
        <td>${escape(user.username)}</td><td>${escape(user.nickname)}</td><td>${escape(user.department)}</td><td>${escape(user.phone || "")}</td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td>
        <td>${status}</td><td><div class="iam-actions">
          ${revoke ? `<button class="iam-icon-action is-auth" type="button" data-iam-role-user-remove="${escape(user.id)}" title="申请撤销授权" aria-label="申请撤销${escape(user.username)}的授权">${icon("users")}</button>` : ""}
          ${user.pending ? requestLink(user.pending.requestId, user.assigned ? "查看待审变更" : "查看申请") : ""}
        </div></td>
      </tr>`;
    }).join("") : '<tr><td colspan="8"><div class="iam-empty">暂无成员或待审申请</div></td></tr>';
    const allBox = $("iamRoleUsersAll");
    const selectable = pageUsers.filter((user) => canRevoke(role, user));
    allBox.disabled = !selectable.length;
    allBox.checked = selectable.length > 0 && selectable.every((user) => usersSelected.has(user.id));
    allBox.indeterminate = !allBox.checked && selectable.some((user) => usersSelected.has(user.id));
    const roleChange = store.pendingRoleChange(role.id);
    $("iamAddRoleUsers").hidden = store.isProtectedRole(role.id);
    $("iamAddRoleUsers").disabled = role.status !== "normal" || Boolean(roleChange);
    showRoleChangeNotice($("iamRoleUsersChange"), roleChange);
    $("iamCancelRoleUsers").hidden = store.isProtectedRole(role.id);
    $("iamCancelRoleUsers").disabled = !usersSelected.size;
    const assignedCount = all.filter((user) => user.assigned).length;
    $("iamRoleUsersSummary").textContent = `已分配 ${assignedCount} 人 · 有待审核变更 ${all.filter(user => user.pending).length} 人`;
  }
  function openAddUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role || role.status !== "normal" || store.pendingRoleChange(role.id)) return;
    addUsersSelected = new Set();
    addUsersPager.reset();
    addFilters = { name: "", phone: "" };
    $("iamAddUserName").value = "";
    $("iamAddUserPhone").value = "";
    $("iamAddUsersReason").value = "";
    $("iamAddUsersFeedback").textContent = "";
    renderAddUsers();
    if (!addUsersDialog.open) addUsersDialog.showModal();
  }
  function addableUsers(role) {
    const assigned = new Set(role.userIds || []);
    const pending = new Set((pendingByRole().get(role.id) || []).filter((item) => item.operation === "add").map((item) => item.userId));
    return store.users().filter((user) => !assigned.has(user.id) && (!pending.has(user.id) || addUsersSelected.has(user.id))).filter((user) => {
      if (user.status !== "normal") return false;
      if (addFilters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(addFilters.name.toLowerCase())) return false;
      if (addFilters.phone && !String(user.phone || "").includes(addFilters.phone)) return false;
      return true;
    });
  }
  function renderAddUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const roleChange = store.pendingRoleChange(role.id);
    const blocked = Boolean(roleChange) || role.status !== "normal";
    const users = addableUsers(role);
    const pageUsers = addUsersPager.slice(users);
    const pendingForUser = pendingItemsBy("userId");
    const selectable = blocked ? [] : pageUsers.filter(user => !pendingForUser.has(user.id));
    const pendingSelection = [...addUsersSelected].map(id => pendingForUser.get(id)?.[0]).find(Boolean);
    $("iamAddUsersInfo").textContent = addUsersSelected.size
      ? `已选择 ${addUsersSelected.size} 人。审核通过后加入正式成员。`
      : "选择用户并提交申请。审核通过后加入正式成员。";
    $("iamAddUsersInfo").hidden = Boolean(roleChange);
    showRoleChangeNotice($("iamAddUsersChange"), roleChange);
    $("iamAddUsersRows").innerHTML = pageUsers.length ? pageUsers.map((user) => {
      const pending = pendingForUser.get(user.id)?.[0];
      const selected = addUsersSelected.has(user.id);
      return `<tr><td class="iam-assign-check"><input type="checkbox" data-iam-add-user="${escape(user.id)}" ${selected ? "checked" : ""} ${blocked || (pending && !selected) ? "disabled" : ""} aria-label="选择${escape(user.username)}" /></td><td>${escape(user.username)}</td><td>${escape(user.nickname)}</td><td>${escape(user.department)}</td><td>${escape(user.phone || "")}</td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td><td>${pending ? requestLink(pending.requestId, "查看原申请") : '<span class="iam-status-pill is-green">正常</span>'}</td></tr>`;
    }).join("") : '<tr><td colspan="7"><div class="iam-empty">没有可添加的用户</div></td></tr>';
    $("iamAddUsersSummary").textContent = `共 ${users.length} 位候选用户`;
    const all = $("iamAddUsersAll");
    all.disabled = !selectable.length;
    all.checked = selectable.length > 0 && selectable.every((user) => addUsersSelected.has(user.id));
    all.indeterminate = !all.checked && selectable.some((user) => addUsersSelected.has(user.id));
    $("iamAddUsersSave").disabled = blocked || !addUsersSelected.size || Boolean(pendingSelection);
    if (pendingSelection) {
      showRequestError($("iamAddUsersFeedback"), { message: "所选用户中已有待审核申请，请取消勾选或处理原申请。", requestId: pendingSelection.requestId });
    } else if ($("iamAddUsersFeedback").querySelector("[data-iam-request-id]")) {
      $("iamAddUsersFeedback").textContent = "";
    }
  }
  function revokeUsers(userIds) {
    const role = store.roles().find(item => item.id === usersRoleId);
    if (!role || !userIds.length) return;
    const pendingForUser = pendingItemsBy("userId");
    const pending = userIds.map(id => pendingForUser.get(id)?.[0]).find(Boolean);
    if (pending) {
      showRequestError($("iamRoleUsersFeedback"), { message: "所选用户中已有待审核申请，请先处理原申请。", requestId: pending.requestId });
      $("iamRoleUsersFeedback").classList.add("is-error");
      return;
    }
    const remove = userIds.map(userId => ({ userId, roleId: role.id }));
    askPermissionChange({
      title: "申请撤销角色授权",
      summary: `审核通过后，${remove.length} 位用户将移除「${role.name}」角色。`,
      submitRequest: reason => store.requestMembership({ remove, source: "角色管理 · 撤销授权", reason }),
      onSubmitted: request => {
        userIds.forEach(userId => usersSelected.delete(userId));
        renderRoleUsers();
        $("iamRoleUsersFeedback").classList.remove("is-error");
        $("iamRoleUsersFeedback").innerHTML = requestLink(request.id, "撤销申请已提交，查看申请");
      },
    });
  }
  document.addEventListener("click", (event) => {
    const requestLink = event.target.closest("[data-iam-request-id]");
    if (requestLink) {
      goToRequest(requestLink.dataset.iamRequestId);
      return;
    }
    const edit = event.target.closest("[data-iam-role-edit]");
    if (edit) { openRoleDialog(edit.dataset.iamRoleEdit); return; }
    const del = event.target.closest("[data-iam-role-delete]");
    if (del) {
      const role = store.roles().find((item) => item.id === del.dataset.iamRoleDelete);
      if (role) requestLifecycle("role", role, "delete");
      return;
    }
    const menu = event.target.closest("[data-iam-role-menu]");
    if (menu) { openRoleDialog(menu.dataset.iamRoleMenu, true); return; }
    const users = event.target.closest("[data-iam-role-users]");
    if (users) { openRoleUsers(users.dataset.iamRoleUsers); return; }
    const toggle = event.target.closest("[data-iam-role-toggle]:enabled");
    if (toggle) {
      const role = store.roles().find((item) => item.id === toggle.dataset.iamRoleToggle);
      if (role) requestLifecycle("role", role, role.status === "disabled" ? "enable" : "disable");
      return;
    }
    if (event.target.closest("[data-iam-close]")) {
      const open = event.target.closest("dialog");
      open?.close();
    }
  });

  $("iamRoleQuery").addEventListener("click", () => {
    filters = { name: $("iamRoleName").value.trim(), code: $("iamRoleCode").value.trim(), status: $("iamRoleStatus").value };
    rolePager.reset();
    renderRoles();
  });
  $("iamRoleReset").addEventListener("click", () => {
    $("iamRoleName").value = "";
    $("iamRoleCode").value = "";
    $("iamRoleStatus").value = "";
    filters = { name: "", code: "", status: "" };
    rolePager.reset();
    renderRoles();
  });
  $("iamNewRole").addEventListener("click", () => openRoleDialog());
  $("iamRoleRequests").addEventListener("click", () => goToRequest());
  $("iamRoleSave").addEventListener("click", saveRole);
  dialog.addEventListener("click", (event) => {
    const step = event.target.closest("[data-iam-order-step]");
    if (step) {
      const input = $("iamEditRoleOrder");
      const value = Number(input.value) || 1;
      input.value = String(Math.min(999, Math.max(1, value + Number(step.dataset.iamOrderStep))));
    }
    const status = event.target.closest("[data-iam-role-status]");
    if (status) {
      $("iamEditRoleStatus").value = status.dataset.iamRoleStatus;
      dialog.querySelectorAll("[data-iam-role-status]").forEach((button) => {
        button.setAttribute("aria-pressed", String(button === status));
      });
      syncRoleReview();
    }
  });
  usersDialog.addEventListener("change", (event) => {
    if (event.target.id === "iamRoleUsersAll") {
      const role = store.roles().find((item) => item.id === usersRoleId);
      if (!role) return;
      const pageUsers = membersPager.slice(filteredAssignedUsers(role));
      pageUsers.filter((user) => canRevoke(role, user)).forEach((user) => { if (event.target.checked) usersSelected.add(user.id); else usersSelected.delete(user.id); });
      renderRoleUsers();
      return;
    }
    const input = event.target.closest("[data-iam-role-user]");
    if (!input) return;
    const id = input.dataset.iamRoleUser;
    if (input.checked) usersSelected.add(id); else usersSelected.delete(id);
    renderRoleUsers();
    [...usersDialog.querySelectorAll("[data-iam-role-user]")].find((checkbox) => checkbox.dataset.iamRoleUser === id)?.focus();
  });
  usersDialog.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-iam-role-user-remove]");
    if (remove) {
      const role = store.roles().find((item) => item.id === usersRoleId);
      if (!role) return;
      const user = store.users().find((item) => item.id === remove.dataset.iamRoleUserRemove);
      if (user) revokeUsers([user.id]);
    }
  });
  addUsersDialog.addEventListener("change", (event) => {
    if (event.target.id === "iamAddUsersAll") {
      const role = store.roles().find((item) => item.id === usersRoleId);
      if (!role) return;
      const pendingForUser = pendingItemsBy("userId");
      if (role.status !== "normal" || store.pendingRoleChange(role.id)) return;
      addUsersPager.slice(addableUsers(role)).forEach((user) => {
        if (!event.target.checked) addUsersSelected.delete(user.id);
        else if (!pendingForUser.has(user.id)) addUsersSelected.add(user.id);
      });
      renderAddUsers();
      return;
    }
    const input = event.target.closest("[data-iam-add-user]");
    if (!input) return;
    const id = input.dataset.iamAddUser;
    if (input.checked) addUsersSelected.add(id); else addUsersSelected.delete(id);
    renderAddUsers();
    [...addUsersDialog.querySelectorAll("[data-iam-add-user]")].find((checkbox) => checkbox.dataset.iamAddUser === id)?.focus();
  });
  $("iamAddRoleUsers").addEventListener("click", openAddUsers);
  $("iamCancelRoleUsers").addEventListener("click", () => {
    if (!usersSelected.size) { toast("请先选择要取消授权的用户"); return; }
    revokeUsers([...usersSelected]);
  });
  $("iamRoleUserQuery").addEventListener("click", () => {
    usersFilters = { name: $("iamRoleUserName").value.trim(), phone: $("iamRoleUserPhone").value.trim() };
    membersPager.reset();
    renderRoleUsers();
  });
  $("iamRoleUserReset").addEventListener("click", () => {
    $("iamRoleUserName").value = "";
    $("iamRoleUserPhone").value = "";
    usersFilters = { name: "", phone: "" };
    membersPager.reset();
    renderRoleUsers();
  });
  $("iamAddUserQuery").addEventListener("click", () => {
    addFilters = { name: $("iamAddUserName").value.trim(), phone: $("iamAddUserPhone").value.trim() };
    addUsersPager.reset();
    renderAddUsers();
  });
  $("iamAddUserReset").addEventListener("click", () => {
    $("iamAddUserName").value = "";
    $("iamAddUserPhone").value = "";
    addFilters = { name: "", phone: "" };
    addUsersPager.reset();
    renderAddUsers();
  });
  $("iamAddUsersSave").addEventListener("click", async () => {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role || !addUsersSelected.size) return;
    const reason = $("iamAddUsersReason").value.trim();
    if (!reason) {
      $("iamAddUsersFeedback").textContent = "请填写申请原因。";
      $("iamAddUsersReason").focus();
      return;
    }
    const save = $("iamAddUsersSave");
    save.disabled = true;
    try {
      const add = [...addUsersSelected].map((userId) => ({ userId, roleId: role.id }));
      const request = await store.withWriteLock(() => store.requestMembership({ add, source: "角色管理 · 添加用户", reason }));
      addUsersDialog.close();
      const feedback = $("iamRoleUsersFeedback");
      feedback.classList.remove("is-error");
      feedback.innerHTML = requestLink(request.id, "授权申请已提交，查看申请");
    } catch (error) {
      renderAddUsers();
      showRequestError($("iamAddUsersFeedback"), error);
    }
  });
  store.subscribe(() => {
    renderRoles();
    if (usersDialog.open && !store.roles().some(role => role.id === usersRoleId)) {
      if (addUsersDialog.open) addUsersDialog.close();
      usersDialog.close();
      return;
    }
    if (usersDialog.open) renderRoleUsers();
    if (addUsersDialog.open) {
      const role = store.roles().find(item => item.id === usersRoleId);
      const eligible = new Set(store.users().filter(user => user.status === "normal" && !role?.userIds?.includes(user.id)).map(user => user.id));
      for (const id of addUsersSelected) {
        if (role?.status !== "normal" || !eligible.has(id)) addUsersSelected.delete(id);
      }
      renderAddUsers();
    }
  });
  renderRoles();
})();
