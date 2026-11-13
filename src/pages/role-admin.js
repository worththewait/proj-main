(() => {
  "use strict";

  const store = window.BaigeIamStore;
  const management = window.BaigeIamManagement;
  if (!store || !management?.requireAdministrator()) return;
  const { goToRequest, requestEnable, requestLink, pendingItemsBy, toast } = management;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const $ = (id) => document.getElementById(id);
  const dialog = $("iamRoleDialog");
  const usersDialog = $("iamRoleUsersDialog");
  const addUsersDialog = $("iamAddUsersDialog");
  let editingId = "";
  let editingRole = null;
  let menuPicker = null;
  let usersRoleId = "";
  let usersPage = 1;
  let usersSelected = new Set();
  let addUsersSelected = new Set();
  let usersFilters = { name: "", phone: "" };
  let addFilters = { name: "", phone: "" };
  const USERS_PAGE_SIZE = 5;
  let filters = { name: "", code: "", status: "" };

  const pendingByRole = () => pendingItemsBy("roleId");
  function filteredRoles() {
    return store.roles().filter((role) => {
      if (filters.name && !role.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.code && !String(role.code || "").toLowerCase().includes(filters.code.toLowerCase())) return false;
      if (filters.status && role.status !== filters.status) return false;
      return true;
    });
  }
  function statusCell(role, pending) {
    const normal = role.status === "normal";
    const canToggle = !store.isProtectedRole(role.id) && !pending.some((item) => item.operation === "enable");
    return `<div class="iam-status-cell"><span class="iam-status-pill${normal ? "" : " is-disabled"}">${normal ? "正常" : "停用"}</span>${canToggle ? `<button class="iam-switch" type="button" data-iam-role-toggle="${escape(role.id)}" aria-pressed="${normal}" aria-label="${normal ? "停用" : "申请恢复启用"}${escape(role.name)}"></button>` : ""}</div>`;
  }
  function renderRoles() {
    const roles = filteredRoles();
    const pendingRoles = pendingByRole();
    $("iamRoleRows").innerHTML = roles.length ? roles.map((role) => {
      const pending = pendingRoles.get(role.id) || [];
      const protectedRole = store.isProtectedRole(role.id);
      return `<tr><td>${escape(role.id)}</td>
        <td><span class="iam-role-name">${escape(role.name)}</span>${pending.length ? `<div class="iam-row-pending">${requestLink(pending[0].requestId, "待审核")}</div>` : ""}</td>
        <td><span class="iam-role-code">${escape(role.code || "—")}</span></td><td class="iam-order">${escape(role.order ?? 1)}</td>
        <td><span class="iam-time">${escape(role.createdAt || "—")}</span></td><td>${statusCell(role, pending)}</td>
        <td><div class="iam-actions">
          ${protectedRole ? "" : `<button class="iam-icon-action is-edit" type="button" data-iam-role-edit="${escape(role.id)}" title="编辑角色" aria-label="编辑${escape(role.name)}">${icon("edit")}</button>
          <button class="iam-icon-action is-delete" type="button" data-iam-role-delete="${escape(role.id)}" title="删除角色" aria-label="删除${escape(role.name)}">${icon("trash")}</button>`}
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
    const pending = (pendingByRole().get(role.id) || []).find((item) => item.operation === "menus" || item.operation === "enable");
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
    ${pending ? `<div class="iam-menu-pending">${requestLink(pending.requestId, "查看待审核申请")}</div>` : ""}
    <div id="iamRoleReviewFields" class="iam-role-review-fields" hidden>
      <p class="iam-dialog-note" id="iamRoleReviewNote"></p>
      <label class="iam-form-field"><span>申请理由 <em>*</em></span><textarea class="iam-input iam-reason-input" id="iamRoleReviewReason" maxlength="240" placeholder="说明本次变更的用途"></textarea></label>
    </div>
    <p class="iam-form-feedback iam-role-feedback" id="iamRoleFeedback" role="status"></p>`;
  }

  function openRoleDialog(id = "", focusMenu = false) {
    const role = id ? store.roles().find((item) => item.id === id) : null;
    if (id && !role) return;
    editingId = id;
    editingRole = role;
    menuPicker = null;
    const readOnly = Boolean(role && store.isProtectedRole(role.id));
    dialog.classList.toggle("iam-dialog--role-editor", Boolean(role));
    $("iamRoleDialogTitle").textContent = role ? (readOnly ? "查看角色信息" : "编辑角色信息") : "新建角色";
    $("iamRoleCancel").textContent = readOnly ? "关闭" : "取消";
    $("iamRoleSave").hidden = readOnly;
    $("iamRoleSave").textContent = role ? "修改" : "保存";
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
    const current = new Set(catalog.expand(editingRole.menuPermissions || []));
    const expansion = catalog.expand(menuPicker.keys()).some((key) => !current.has(key));
    const role = store.roles().find((item) => item.id === editingId);
    const restore = editingRole.status === "disabled" && $("iamEditRoleStatus").value === "normal";
    const requiresApproval = restore || (expansion && Boolean(role?.userIds?.length));
    $("iamRoleReviewFields").hidden = !requiresApproval;
    $("iamRoleReviewNote").textContent = restore ? "审核通过后，角色将恢复启用并应用所选权限。"
      : "该角色已有成员，菜单变更审核通过后生效。";
    $("iamRoleSave").textContent = requiresApproval ? "修改并提交审核" : "修改";
  }

  async function saveRole() {
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
    if (role) {
      syncRoleReview();
      if (!$("iamRoleReviewFields").hidden && !reason) {
        feedback.textContent = "请填写申请理由。";
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
        })
        : (store.addRole(payload), null));
      dialog.close();
      toast(request ? "角色资料已保存，变更申请已提交" : role ? "角色信息已更新" : "角色已创建", request);
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  }

  function openRoleUsers(roleId) {
    usersRoleId = roleId;
    const role = store.roles().find((item) => item.id === roleId);
    if (!role) return;
    $("iamRoleUsersTitle").textContent = `「${role.name}」成员`;
    usersPage = 1;
    usersSelected = new Set();
    usersFilters = { name: "", phone: "" };
    $("iamRoleUserName").value = "";
    $("iamRoleUserPhone").value = "";
    $("iamRoleUsersFeedback").textContent = "";
    renderRoleUsers();
    if (!usersDialog.open) usersDialog.showModal();
  }
  function filteredAssignedUsers(role) {
    const assignedIds = new Set(role.userIds || []);
    const pending = new Map((pendingByRole().get(role.id) || []).filter((item) => item.userId).map((item) => [item.userId, item]));
    return store.users().filter((user) => assignedIds.has(user.id) || pending.has(user.id)).filter((user) => {
      if (usersFilters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(usersFilters.name.toLowerCase())) return false;
      if (usersFilters.phone && !String(user.phone || "").includes(usersFilters.phone)) return false;
      return true;
    }).map((user) => ({ ...user, assigned: assignedIds.has(user.id), pending: pending.get(user.id) }));
  }
  function canRevoke(role, user) {
    return user.assigned && !store.isProtectedRole(role.id);
  }
  function renderRoleUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const all = filteredAssignedUsers(role);
    const totalPages = Math.max(1, Math.ceil(all.length / USERS_PAGE_SIZE));
    usersPage = Math.min(Math.max(1, usersPage), totalPages);
    const pageUsers = all.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);
    $("iamRoleUsersRows").innerHTML = pageUsers.length ? pageUsers.map((user) => {
      const active = role.status === "normal" && user.status === "normal";
      const revoke = canRevoke(role, user);
      const status = user.assigned ? `<span class="iam-status-pill ${active ? "is-green" : "is-disabled"}">${active ? "已生效" : "已暂停"}</span>` : '<span class="iam-status-pill is-pending">待审核</span>';
      return `<tr><td class="iam-assign-check">${revoke ? `<input type="checkbox" data-iam-role-user="${escape(user.id)}" ${usersSelected.has(user.id) ? "checked" : ""} aria-label="选择${escape(user.username)}" />` : "—"}</td>
        <td>${escape(user.username)}</td><td>${escape(user.nickname)}</td><td>${escape(user.department)}</td><td>${escape(user.phone || "")}</td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td>
        <td>${status}</td><td><div class="iam-actions">
          ${revoke ? `<button class="iam-icon-action is-auth" type="button" data-iam-role-user-remove="${escape(user.id)}" title="取消授权" aria-label="取消${escape(user.username)}的授权">${icon("users")}</button>` : ""}
          ${user.pending ? requestLink(user.pending.requestId, user.assigned ? "查看待审变更" : "查看申请") : ""}
        </div></td>
      </tr>`;
    }).join("") : '<tr><td colspan="8"><div class="iam-empty">暂无成员或待审申请</div></td></tr>';
    const allBox = $("iamRoleUsersAll");
    const selectable = pageUsers.filter((user) => canRevoke(role, user));
    allBox.disabled = !selectable.length;
    allBox.checked = selectable.length > 0 && selectable.every((user) => usersSelected.has(user.id));
    allBox.indeterminate = !allBox.checked && selectable.some((user) => usersSelected.has(user.id));
    $("iamAddRoleUsers").hidden = store.isProtectedRole(role.id);
    $("iamAddRoleUsers").disabled = role.status !== "normal";
    $("iamCancelRoleUsers").hidden = store.isProtectedRole(role.id);
    $("iamCancelRoleUsers").disabled = !usersSelected.size;
    const assignedCount = all.filter((user) => user.assigned).length;
    $("iamRoleUsersSummary").textContent = `已分配 ${assignedCount} 人 · 待审核 ${all.length - assignedCount} 人`;
    $("iamRoleUsersPager").innerHTML = `<button class="iam-page-btn" type="button" data-iam-users-page="${usersPage - 1}" ${usersPage <= 1 ? "disabled" : ""} aria-label="上一页">‹</button>${Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => `<button class="iam-page-btn${usersPage === page ? " is-active" : ""}" type="button" data-iam-users-page="${page}" aria-current="${usersPage === page ? "page" : "false"}">${page}</button>`).join("")}<button class="iam-page-btn" type="button" data-iam-users-page="${usersPage + 1}" ${usersPage >= totalPages ? "disabled" : ""} aria-label="下一页">›</button>`;
  }
  function openAddUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    addUsersSelected = new Set();
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
    return store.users().filter((user) => !assigned.has(user.id) && !pending.has(user.id)).filter((user) => {
      if (user.status !== "normal") return false;
      if (addFilters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(addFilters.name.toLowerCase())) return false;
      if (addFilters.phone && !String(user.phone || "").includes(addFilters.phone)) return false;
      return true;
    });
  }
  function renderAddUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const users = addableUsers(role);
    $("iamAddUsersInfo").textContent = addUsersSelected.size
      ? `已选择 ${addUsersSelected.size} 人。审核通过后加入正式成员。`
      : "选择用户并提交申请。审核通过后加入正式成员。";
    $("iamAddUsersRows").innerHTML = users.length ? users.map((user) => `<tr><td class="iam-assign-check"><input type="checkbox" data-iam-add-user="${escape(user.id)}" ${addUsersSelected.has(user.id) ? "checked" : ""} aria-label="选择${escape(user.username)}" /></td><td>${escape(user.username)}</td><td>${escape(user.nickname)}</td><td>${escape(user.department)}</td><td>${escape(user.phone || "")}</td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td><td><span class="iam-status-pill is-green">${user.status === "disabled" ? "停用" : "正常"}</span></td></tr>`).join("") : '<tr><td colspan="7"><div class="iam-empty">没有可添加的用户</div></td></tr>';
    const all = $("iamAddUsersAll");
    all.disabled = !users.length;
    all.checked = users.length > 0 && users.every((user) => addUsersSelected.has(user.id));
    all.indeterminate = !all.checked && users.some((user) => addUsersSelected.has(user.id));
    $("iamAddUsersSave").disabled = !addUsersSelected.size;
  }
  async function revokeUsers(userIds) {
    const roleId = usersRoleId;
    const feedback = $("iamRoleUsersFeedback");
    try {
      await store.withWriteLock(() => store.revokeMembership(userIds.map((userId) => ({ userId, roleId }))));
      userIds.forEach((userId) => usersSelected.delete(userId));
      renderRoleUsers();
      feedback.classList.remove("is-error");
      feedback.textContent = "授权已撤销。";
    } catch (error) {
      feedback.classList.add("is-error");
      feedback.textContent = error.message;
    }
  }
  document.addEventListener("click", async (event) => {
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
      if (!role || !window.confirm(`删除角色「${role.name}」？`)) return;
      try {
        await store.withWriteLock(() => store.removeRole(role.id));
        toast("角色已删除");
      } catch (error) { toast(error.message); }
      return;
    }
    const menu = event.target.closest("[data-iam-role-menu]");
    if (menu) { openRoleDialog(menu.dataset.iamRoleMenu, true); return; }
    const users = event.target.closest("[data-iam-role-users]");
    if (users) { openRoleUsers(users.dataset.iamRoleUsers); return; }
    const toggle = event.target.closest("[data-iam-role-toggle]");
    if (toggle) {
      const role = store.roles().find((item) => item.id === toggle.dataset.iamRoleToggle);
      if (!role) return;
      if (role.status === "disabled") requestEnable("role", role);
      else if (window.confirm(`停用「${role.name}」后将立即收回该角色的访问权限。确认停用？`)) {
        try {
          await store.withWriteLock(() => store.toggleRole(role.id));
          toast("角色已停用");
        } catch (error) { toast(error.message); }
      }
      return;
    }
    if (event.target.closest("[data-iam-close]")) {
      const open = event.target.closest("dialog");
      open?.close();
    }
  });

  $("iamRoleQuery").addEventListener("click", () => {
    filters = { name: $("iamRoleName").value.trim(), code: $("iamRoleCode").value.trim(), status: $("iamRoleStatus").value };
    renderRoles();
  });
  $("iamRoleReset").addEventListener("click", () => {
    $("iamRoleName").value = "";
    $("iamRoleCode").value = "";
    $("iamRoleStatus").value = "";
    filters = { name: "", code: "", status: "" };
    renderRoles();
  });
  $("iamNewRole").addEventListener("click", () => openRoleDialog());
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
      const all = filteredAssignedUsers(role);
      const pageUsers = all.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);
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
  usersDialog.addEventListener("click", async (event) => {
    const pageButton = event.target.closest("[data-iam-users-page]");
    if (pageButton && !pageButton.disabled) {
      usersPage = Number(pageButton.dataset.iamUsersPage) || 1;
      renderRoleUsers();
      return;
    }
    const remove = event.target.closest("[data-iam-role-user-remove]");
    if (remove) {
      const role = store.roles().find((item) => item.id === usersRoleId);
      if (!role) return;
      const user = store.users().find((item) => item.id === remove.dataset.iamRoleUserRemove);
      if (!user || !window.confirm(`取消「${user.username}」的授权？`)) return;
      await revokeUsers([user.id]);
    }
  });
  addUsersDialog.addEventListener("change", (event) => {
    if (event.target.id === "iamAddUsersAll") {
      const role = store.roles().find((item) => item.id === usersRoleId);
      if (!role) return;
      addableUsers(role).forEach((user) => { if (event.target.checked) addUsersSelected.add(user.id); else addUsersSelected.delete(user.id); });
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
  $("iamCancelRoleUsers").addEventListener("click", async () => {
    if (!usersSelected.size) { toast("请先选择要取消授权的用户"); return; }
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role || !window.confirm(`取消选中的 ${usersSelected.size} 个用户授权？`)) return;
    await revokeUsers([...usersSelected]);
  });
  $("iamRoleUserQuery").addEventListener("click", () => {
    usersFilters = { name: $("iamRoleUserName").value.trim(), phone: $("iamRoleUserPhone").value.trim() };
    usersPage = 1;
    renderRoleUsers();
  });
  $("iamRoleUserReset").addEventListener("click", () => {
    $("iamRoleUserName").value = "";
    $("iamRoleUserPhone").value = "";
    usersFilters = { name: "", phone: "" };
    usersPage = 1;
    renderRoleUsers();
  });
  $("iamAddUserQuery").addEventListener("click", () => {
    addFilters = { name: $("iamAddUserName").value.trim(), phone: $("iamAddUserPhone").value.trim() };
    renderAddUsers();
  });
  $("iamAddUserReset").addEventListener("click", () => {
    $("iamAddUserName").value = "";
    $("iamAddUserPhone").value = "";
    addFilters = { name: "", phone: "" };
    renderAddUsers();
  });
  $("iamAddUsersSave").addEventListener("click", async () => {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role || !addUsersSelected.size) return;
    const reason = $("iamAddUsersReason").value.trim();
    if (!reason) {
      $("iamAddUsersFeedback").textContent = "请填写申请理由。";
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
      feedback.innerHTML = `角色授权申请已提交。${requestLink(request.id, "查看授权申请")}`;
    } catch (error) {
      $("iamAddUsersFeedback").textContent = error.message;
      save.disabled = false;
    }
  });
  store.subscribe(() => {
    renderRoles();
    if (usersDialog.open) renderRoleUsers();
    if (addUsersDialog.open) renderAddUsers();
  });
  renderRoles();
})();
