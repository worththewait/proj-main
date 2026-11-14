(() => {
  "use strict";

  const store = window.BaigeIamStore;
  const management = window.BaigeIamManagement;
  if (!store || !management?.requireAdministrator()) return;
  const { goToRequest, requestLifecycle, requestLink, showRequestError, statusSwitch, pendingItemsBy, toast } = management;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const tree = store.DEPARTMENT_TREE;
  const $ = (id) => document.getElementById(id);
  const dialog = $("iamUserDialog");
  const assignDialog = $("iamAssignDialog");
  let selectedDept = "";
  let expanded = new Set(["root", "oa-root", "org-714"]);
  let editingId = "";
  let originalRoles = new Set();
  let selectedRoles = new Set();
  let assignId = "";
  let assignOriginal = new Set();
  let assignSelected = new Set();
  const userPager = window.BaigeAdminPagination.create($("iamUserPager"), renderUsers);
  const assignPager = window.BaigeAdminPagination.create($("iamAssignPager"), renderAssignDialog, 5);
  let filters = { name: "", phone: "", status: "" };
  const pendingByUser = () => pendingItemsBy("userId");
  function maskPhone(phone) {
    const value = String(phone || "");
    return value.length >= 7 ? `${value.slice(0, 3)}****${value.slice(-4)}` : value;
  }
  function findNode(nodes, id) {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findNode(node.children || [], id);
      if (found) return found;
    }
    return null;
  }
  function descendantNames(node) {
    if (!node) return [];
    return [node.name, ...(node.children || []).flatMap(descendantNames)];
  }
  function flatDepartments(nodes = tree, result = []) {
    nodes.forEach((node) => {
      if (node.id !== "root") result.push(node.name);
      flatDepartments(node.children || [], result);
    });
    return result;
  }
  function treeMatches(node, keyword) {
    if (!keyword) return true;
    return node.name.toLowerCase().includes(keyword) || (node.children || []).some((child) => treeMatches(child, keyword));
  }
  function renderTree() {
    const keyword = $("iamDeptSearch").value.trim().toLowerCase();
    const box = $("iamDeptTree");
    function renderNodes(nodes) {
      return nodes.filter((node) => treeMatches(node, keyword)).map((node) => {
        const children = node.children || [];
        const open = Boolean(keyword) || expanded.has(node.id);
        const selected = selectedDept === node.id;
        return `<div role="treeitem" aria-expanded="${children.length ? open : undefined}"><div class="iam-tree-row${selected ? " is-selected" : ""}"><button class="iam-tree-toggle${children.length ? "" : " is-empty"}${open ? " is-open" : ""}" type="button" data-iam-tree-toggle="${escape(node.id)}" aria-label="${open ? "收起" : "展开"}${escape(node.name)}">${icon("chevron")}</button><button class="iam-tree-label" type="button" data-iam-tree-select="${escape(node.id)}">${escape(node.name)}</button></div>${children.length && open ? `<div class="iam-tree-children">${renderNodes(children)}</div>` : ""}</div>`;
      }).join("");
    }
    box.innerHTML = renderNodes(tree) || '<div class="iam-tree-empty">没有匹配的部门</div>';
  }
  function filteredUsers() {
    const scope = selectedDept ? descendantNames(findNode(tree, selectedDept)) : null;
    return store.users().filter((user) => {
      if (scope && !scope.includes(user.department)) return false;
      if (filters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.phone && !String(user.phone || "").includes(filters.phone)) return false;
      if (filters.status && user.status !== filters.status) return false;
      return true;
    });
  }
  function renderUsers() {
    const users = filteredUsers();
    const pageUsers = userPager.slice(users);
    const pendingUsers = pendingByUser();
    $("iamUserRows").innerHTML = pageUsers.length ? pageUsers.map((user) => {
      const pending = pendingUsers.get(user.id) || [];
      const protectedUser = store.isProtectedUser(user.id);
      const statusLocked = protectedUser || pending.some(item => !item.roleId);
      return `<tr>
        <td><span class="iam-user-name">${escape(user.username)}</span>${pending.length ? `<div class="iam-row-pending">${requestLink(pending[0].requestId, "待审核")}</div>` : ""}</td>
        <td>${escape(user.nickname)}</td><td><span class="iam-dept-name">${escape(user.department || "—")}</span></td>
        <td><span class="iam-phone">${escape(maskPhone(user.phone))}</span></td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td><td>${statusSwitch("user", user, statusLocked)}</td>
        <td><div class="iam-actions">
          <button class="iam-icon-action is-edit" type="button" data-iam-user-edit="${escape(user.id)}" title="编辑用户" aria-label="编辑${escape(user.username)}">${icon("edit")}</button>
          ${statusLocked ? "" : `<button class="iam-icon-action is-delete" type="button" data-iam-user-delete="${escape(user.id)}" title="申请删除用户" aria-label="申请删除${escape(user.username)}">${icon("trash")}</button>`}
          <button class="iam-icon-action is-key" type="button" data-iam-user-reset="${escape(user.id)}" title="重置密码" aria-label="重置${escape(user.username)}密码">${icon("key")}</button>
          <button class="iam-icon-action is-user" type="button" data-iam-user-assign="${escape(user.id)}" title="分配角色" aria-label="为${escape(user.username)}分配角色">${icon("users")}</button>
        </div></td>
      </tr>`;
    }).join("") : '<tr><td colspan="7"><div class="iam-empty">没有符合条件的用户</div></td></tr>';
    $("iamUserCount").textContent = `（${users.length}）`;
    $("iamUserSummary").textContent = `共 ${users.length} 条用户数据`;
  }
  function userForm(user = {}) {
    const departments = flatDepartments();
    const roles = store.roles();
    const status = user.status === "disabled" ? "disabled" : "normal";
    const roleOptions = roles.filter(role => originalRoles.has(role.id) || !store.isProtectedRole(role.id));
    return `<div class="iam-inline-form">
      <label class="iam-inline-field"><span>用户昵称 <em>*</em></span><input class="iam-input" id="iamEditNickname" maxlength="64" value="${escape(user.nickname || "")}" placeholder="请输入用户昵称" /></label>
      <label class="iam-inline-field"><span>所属部门 <em>*</em></span><select class="iam-input" id="iamEditDept"><option value="">请选择所属部门</option>${departments.map((name) => `<option ${user.department === name ? "selected" : ""}>${escape(name)}</option>`).join("")}</select></label>
      <label class="iam-inline-field"><span>手机号码 <em>*</em></span><input class="iam-input" id="iamEditPhone" maxlength="20" value="${escape(user.phone || "")}" placeholder="请输入手机号码" inputmode="tel" /></label>
      <label class="iam-inline-field"><span>邮箱</span><input class="iam-input" id="iamEditEmail" type="email" maxlength="120" value="${escape(user.email || "")}" placeholder="请输入邮箱" /></label>
      <label class="iam-inline-field"><span>用户账号 <em>*</em></span><input class="iam-input" id="iamEditUsername" maxlength="64" value="${escape(user.username || "")}" placeholder="请输入用户账号" autocomplete="off" /></label>
      <label class="iam-inline-field"><span>用户密码 <em>*</em></span><span class="iam-password"><input class="iam-input" id="iamEditPassword" type="password" maxlength="64" placeholder="${user.id ? "不修改则留空" : "请输入用户密码"}" autocomplete="new-password" /><button class="iam-password-toggle" type="button" data-iam-password-toggle aria-label="显示密码">${icon("eye")}</button></span></label>
      <label class="iam-inline-field"><span>用户性别</span><select class="iam-input" id="iamEditGender"><option value="">请选择</option><option value="男" ${user.gender === "男" ? "selected" : ""}>男</option><option value="女" ${user.gender === "女" ? "selected" : ""}>女</option><option value="未知" ${user.gender === "未知" ? "selected" : ""}>未知</option></select></label>
      <div class="iam-inline-field"><span>状态</span>${user.id
        ? `<div><span class="iam-status-pill${status === "normal" ? "" : " is-disabled"}">${status === "normal" ? "正常" : "停用"}</span><span class="iam-inline-hint">在用户列表管理启停</span></div>`
        : `<div class="iam-segment" id="iamEditStatusGroup" role="group" aria-label="用户状态"><button type="button" data-iam-form-status="normal" class="${status === "normal" ? "is-active" : ""}">正常</button><button type="button" data-iam-form-status="disabled" class="${status === "disabled" ? "is-active" : ""}">停用</button></div><input id="iamEditStatus" type="hidden" value="${status}" />`}</div>
      <label class="iam-inline-field"><span>岗位</span><select class="iam-input" id="iamEditPosition"><option value="">请选择岗位</option>${["普通员工", "部门管理员", "审核员", "知识库管理员"].map((name) => `<option ${user.position === name ? "selected" : ""}>${name}</option>`).join("")}</select></label>
      <div class="iam-inline-field iam-user-role-field"><span id="iamUserRoleLabel">角色${user.id ? "" : " <em>*</em>"}</span>
        <div class="iam-user-role-control" id="iamEditRole" data-user-status="${status}" role="group" aria-labelledby="iamUserRoleLabel">
          <div class="iam-user-role-input">
            <div class="iam-user-role-tags" id="iamEditRoleTags"></div>
            <button class="iam-user-role-toggle" id="iamEditRoleToggle" type="button" aria-label="选择角色" aria-controls="iamEditRoleOptions" aria-expanded="false">${icon("chevron")}</button>
          </div>
          <div class="iam-user-role-options" id="iamEditRoleOptions" hidden>${roleOptions.length ? roleOptions.map(role => {
            const locked = store.isProtectedRole(role.id);
            return `<div class="iam-role-option"><label><input type="checkbox" value="${escape(role.id)}" data-iam-form-role data-name="${escape(role.name)}"${locked ? ' data-locked disabled' : ""}><span>${escape(role.name)}</span></label><span data-iam-role-change hidden></span></div>`;
          }).join("") : ""}<p id="iamEditRolesEmpty" hidden>暂无可选角色</p></div>
        </div>
      </div>
      <div class="iam-inline-field is-wide" id="iamEditPending" hidden><span>待审核</span><div class="iam-auth-pills"><span>请先处理该账号的待审核申请，再变更角色。</span><span id="iamEditPendingLink"></span></div></div>
      <label class="iam-inline-field is-wide" id="iamEditReasonField" hidden><span>申请原因 <em>*</em></span><textarea class="iam-input iam-textarea iam-user-role-reason" id="iamEditReason" maxlength="240" placeholder="请说明本次角色变更的原因"></textarea></label>
      <label class="iam-inline-field is-wide"><span>备注</span><textarea class="iam-input iam-textarea" id="iamEditRemark" maxlength="500" placeholder="请输入备注">${escape(user.remark || "")}</textarea></label>
    </div>
    <p class="iam-form-feedback" id="iamUserFeedback" role="status"></p>`;
  }
  function openUserDialog(id = "") {
    editingId = id;
    const user = id ? store.users().find((item) => item.id === id) : null;
    if (id && !user) return;
    originalRoles = new Set(user?.roleIds || []);
    selectedRoles = new Set(originalRoles);
    $("iamUserDialogTitle").textContent = user ? "编辑用户信息" : "新建用户";
    $("iamUserDialogBody").innerHTML = userForm(user || {});
    syncUserForm();
    if (!dialog.open) dialog.showModal();
    $("iamEditUsername")?.focus();
  }
  function roleChanges(userId, original, selected) {
    return {
      add: [...selected].filter(roleId => !original.has(roleId)).map(roleId => ({ userId, roleId })),
      remove: [...original].filter(roleId => !selected.has(roleId)).map(roleId => ({ userId, roleId })),
    };
  }
  function setRoleOptions(open) {
    const options = $("iamEditRoleOptions");
    if (!options) return;
    options.hidden = !open;
    $("iamEditRoleToggle").setAttribute("aria-expanded", String(open));
  }
  function syncUserForm() {
    const disabled = Boolean(editingId) && $("iamEditRole").dataset.userStatus === "disabled";
    const pending = editingId ? pendingByUser().get(editingId)?.[0] : null;
    const pendingField = $("iamEditPending");
    const requestId = pending?.requestId || "";
    if (pendingField.dataset.requestId !== requestId) {
      pendingField.dataset.requestId = requestId;
      pendingField.hidden = !pending;
      $("iamEditPendingLink").innerHTML = pending ? requestLink(requestId, "查看原申请") : "";
    }
    const toggle = $("iamEditRoleToggle");
    toggle.disabled = Boolean(pending);
    if (pending) setRoleOptions(false);
    const roles = new Map(store.roles().map(role => [role.id, role]));
    const options = [...dialog.querySelectorAll("[data-iam-form-role]")];
    let hasVisibleRole = false;
    for (const input of options) {
      const id = input.value;
      const existing = originalRoles.has(id);
      const blockingChange = store.pendingRoleChange(id);
      const available = roles.get(id)?.status === "normal";
      const row = input.closest(".iam-role-option");
      row.hidden = !existing && !available && !blockingChange;
      hasVisibleRole ||= !row.hidden;
      if (!existing && (disabled || !available || blockingChange) && selectedRoles.delete(id) && blockingChange) {
        showRequestError($("iamUserFeedback"), { message: `「${input.dataset.name}」的变更待审核，已取消选择。`, requestId: blockingChange.id });
      }
      input.disabled = Boolean(pending) || input.hasAttribute("data-locked") || (!existing && (disabled || !available || Boolean(blockingChange)));
      input.checked = selectedRoles.has(id);
      const state = row.querySelector("[data-iam-role-change]");
      const blockingId = blockingChange?.id || "";
      if (state.dataset.requestId !== blockingId) {
        state.dataset.requestId = blockingId;
        state.hidden = !blockingId;
        state.innerHTML = blockingId ? requestLink(blockingId, "变更待审核") : "";
      }
    }
    $("iamEditRolesEmpty").hidden = hasVisibleRole;
    $("iamEditRoleTags").innerHTML = options.filter(input => input.checked).map(input =>
      `<span class="iam-user-role-tag"><span>${escape(input.dataset.name)}</span>${input.disabled ? "" : `<button type="button" data-iam-remove-form-role="${escape(input.value)}" aria-label="移除${escape(input.dataset.name)}">${icon("close")}</button>`}</span>`).join("")
      || (pending ? "<span class=\"iam-inline-hint\">暂无已分配角色</span>"
        : `<button class="iam-user-role-placeholder" type="button" data-iam-role-placeholder>${disabled ? "账号停用后无法新增角色" : editingId ? "请选择角色" : "请至少选择一个角色"}</button>`);
    const { add, remove } = roleChanges(editingId, originalRoles, selectedRoles);
    const changed = Boolean(add.length || remove.length);
    $("iamEditReasonField").hidden = !changed;
    $("iamEditReason").required = changed;
    if (!changed) $("iamEditReason").value = "";
    $("iamUserSave").textContent = editingId
      ? (changed ? "保存并提交审核" : "保存资料")
      : "创建并提交审核";
    $("iamUserSave").disabled = Boolean(pending && changed);
  }
  async function saveUser() {
    const username = $("iamEditUsername").value.trim();
    const nickname = $("iamEditNickname").value.trim();
    const department = $("iamEditDept").value;
    const phone = $("iamEditPhone").value.trim();
    const password = $("iamEditPassword").value;
    const userId = editingId;
    const { add, remove } = roleChanges(userId, originalRoles, selectedRoles);
    const before = [...originalRoles];
    const reason = $("iamEditReason").value.trim();
    if (!nickname) { $("iamUserFeedback").textContent = "请填写用户昵称。"; return; }
    if (!department) { $("iamUserFeedback").textContent = "请选择所属部门。"; return; }
    if (!phone) { $("iamUserFeedback").textContent = "请填写手机号码。"; return; }
    if (!username) { $("iamUserFeedback").textContent = "请填写用户账号。"; return; }
    if (!editingId && !password) { $("iamUserFeedback").textContent = "请填写用户密码。"; return; }
    if (!userId && !add.length) {
      $("iamUserFeedback").textContent = "请至少选择一个角色。";
      setRoleOptions(true);
      $("iamEditRoleToggle").focus();
      return;
    }
    if ((add.length || remove.length) && !reason) {
      $("iamUserFeedback").textContent = "请填写申请原因。";
      $("iamEditReason").focus();
      return;
    }
    const payload = {
      username,
      nickname,
      department,
      phone,
      email: $("iamEditEmail").value.trim(),
      gender: $("iamEditGender").value,
      position: $("iamEditPosition").value,
      remark: $("iamEditRemark").value.trim(),
    };
    const status = $("iamEditStatus")?.value;
    const save = $("iamUserSave");
    save.disabled = true;
    try {
      const request = await store.withWriteLock(() => {
        if (!userId) return store.createUserWithRequest({ ...payload, status }, add.map(item => item.roleId), { source: "新建用户", reason }).request;
        return store.saveUserEdit(userId, payload, { add, remove, originalRoles: before, source: "编辑用户", reason });
      });
      dialog.close();
      toast(request ? "申请已提交，审核通过后生效" : userId ? "用户资料已保存" : "用户已创建", request);
    } catch (error) {
      showRequestError($("iamUserFeedback"), error);
    } finally {
      save.disabled = false;
    }
  }
  function openAssign(id) {
    assignId = id;
    const user = store.users().find((item) => item.id === id);
    if (!user) return;
    assignOriginal = new Set(user.roleIds || []);
    assignSelected = new Set(assignOriginal);
    assignPager.reset();
    $("iamAssignTitle").textContent = `为「${user.username}」分配角色`;
    $("iamAssignReason").value = "";
    $("iamAssignFeedback").textContent = "";
    renderAssignDialog();
    if (!assignDialog.open) assignDialog.showModal();
  }
  function assignmentChanges() {
    return roleChanges(assignId, assignOriginal, assignSelected);
  }
  function renderAssignDialog() {
    const user = store.users().find((item) => item.id === assignId);
    if (!user) return;
    const roles = store.roles();
    const roleChangesById = new Map(roles.map(role => [role.id, store.pendingRoleChange(role.id)]));
    const rolesById = new Map(roles.map(role => [role.id, role]));
    for (const id of assignSelected) {
      if (assignOriginal.has(id)) continue;
      const blocker = roleChangesById.get(id);
      if (!blocker && rolesById.get(id)?.status === "normal") continue;
      assignSelected.delete(id);
      if (blocker) showRequestError($("iamAssignFeedback"), { message: `「${rolesById.get(id).name}」的变更待审核，已取消选择。`, requestId: blocker.id });
    }
    const pageRoles = assignPager.slice(roles);
    const { add, remove } = assignmentChanges();
    const pending = pendingByUser().get(user.id) || [];
    const pendingRoles = new Map(pending.filter((item) => item.roleId).map((item) => [item.roleId, item]));
    const existingIds = new Set(user.roleIds || []);
    const selectable = (role) => !store.isProtectedRole(role.id) && !pending.length
      && (assignOriginal.has(role.id) || (user.status === "normal" && role.status === "normal" && !roleChangesById.get(role.id)));
    const bulkRoles = pageRoles.filter((role) => selectable(role) && !assignOriginal.has(role.id));
    $("iamAssignInfo").textContent = add.length || remove.length
      ? `新增 ${add.length} 个角色，撤销 ${remove.length} 个角色。审核通过后生效。`
      : "勾选要新增的角色，取消勾选要撤销的角色。";
    if (pending.length) {
      $("iamAssignInfo").textContent = "该账号已有待审核申请，请先处理原申请。";
      $("iamAssignInfo").insertAdjacentHTML("beforeend", requestLink(pending[0].requestId, "查看原申请"));
    }
    $("iamAssignRows").innerHTML = pageRoles.length ? pageRoles.map((role) => {
      const current = existingIds.has(role.id);
      const draft = pendingRoles.get(role.id);
      const roleChange = roleChangesById.get(role.id);
      const roleStatus = draft ? requestLink(draft.requestId, draft.operation === "remove" ? "撤销待审核" : "待审核")
        : current ? `<span class="iam-status-pill ${role.status === "normal" && user.status === "normal" ? "is-green" : "is-disabled"}">${role.status === "normal" && user.status === "normal" ? "已生效" : "已暂停"}</span>`
        : roleChange ? requestLink(roleChange.id, "变更待审核")
        : '<span class="iam-inline-hint">未分配</span>';
      return `<tr><td class="iam-assign-check"><input type="checkbox" data-iam-assign-role="${escape(role.id)}" ${assignSelected.has(role.id) ? "checked" : ""} ${selectable(role) ? "" : "disabled"} aria-label="选择${escape(role.name)}" /></td>
        <td>${escape(role.id)}</td><td>${escape(role.name)}</td><td>${escape(role.code || "—")}</td>
        <td><span class="iam-time">${escape(role.createdAt || "—")}</span></td><td>${roleStatus}</td></tr>`;
    }).join("") : '<tr><td colspan="6"><div class="iam-empty">暂无可分配角色</div></td></tr>';
    const all = $("iamAssignAll");
    all.disabled = !bulkRoles.length;
    all.checked = bulkRoles.length > 0 && bulkRoles.every((role) => assignSelected.has(role.id));
    all.indeterminate = !all.checked && bulkRoles.some((role) => assignSelected.has(role.id));
    $("iamAssignReasonField").hidden = Boolean(pending.length) || (!add.length && !remove.length);
    if (!add.length && !remove.length) $("iamAssignReason").value = "";
    $("iamAssignSave").disabled = Boolean(pending.length) || (!add.length && !remove.length);
    $("iamAssignSummary").textContent = `共 ${roles.length} 个角色`;
  }
  document.addEventListener("click", (event) => {
    const requestLink = event.target.closest("[data-iam-request-id]");
    if (requestLink) {
      goToRequest(requestLink.dataset.iamRequestId);
      return;
    }
    const toggle = event.target.closest("[data-iam-tree-toggle]");
    if (toggle) {
      const id = toggle.dataset.iamTreeToggle;
      if (expanded.has(id)) expanded.delete(id); else expanded.add(id);
      renderTree();
      return;
    }
    const select = event.target.closest("[data-iam-tree-select]");
    if (select) {
      selectedDept = selectedDept === select.dataset.iamTreeSelect ? "" : select.dataset.iamTreeSelect;
      userPager.reset();
      renderTree();
      renderUsers();
      return;
    }
    const edit = event.target.closest("[data-iam-user-edit]");
    if (edit) { openUserDialog(edit.dataset.iamUserEdit); return; }
    const del = event.target.closest("[data-iam-user-delete]");
    if (del) {
      const user = store.users().find((item) => item.id === del.dataset.iamUserDelete);
      if (user) requestLifecycle("user", user, "delete");
      return;
    }
    const reset = event.target.closest("[data-iam-user-reset]");
    if (reset) {
      const user = store.users().find((item) => item.id === reset.dataset.iamUserReset);
      if (!user || !window.confirm(`重置「${user.username}」的登录密码？`)) return;
      toast("已重置为演示密码");
      return;
    }
    const assign = event.target.closest("[data-iam-user-assign]");
    if (assign) { openAssign(assign.dataset.iamUserAssign); return; }
    const toggleUser = event.target.closest("[data-iam-user-toggle]:enabled");
    if (toggleUser) {
      const user = store.users().find((item) => item.id === toggleUser.dataset.iamUserToggle);
      if (user) requestLifecycle("user", user, user.status === "disabled" ? "enable" : "disable");
      return;
    }
    const formStatus = event.target.closest("[data-iam-form-status]");
    if (formStatus) {
      const group = formStatus.closest("#iamEditStatusGroup");
      group?.querySelectorAll("[data-iam-form-status]").forEach((button) => button.classList.toggle("is-active", button === formStatus));
      const hidden = $("iamEditStatus");
      if (hidden) {
        hidden.value = formStatus.dataset.iamFormStatus;
        syncUserForm();
      }
      return;
    }
    if (event.target.closest("[data-iam-password-toggle]")) {
      const input = $("iamEditPassword");
      if (!input) return;
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      event.target.closest("[data-iam-password-toggle]")?.setAttribute("aria-label", show ? "隐藏密码" : "显示密码");
      return;
    }
    if (event.target.closest("[data-iam-close]")) {
      const open = event.target.closest("dialog");
      open?.close();
    }
  });

  $("iamDeptSearch").addEventListener("input", renderTree);
  $("iamUserQuery").addEventListener("click", () => {
    filters = { name: $("iamUserName").value.trim(), phone: $("iamPhone").value.trim(), status: $("iamUserStatus").value };
    userPager.reset();
    renderUsers();
  });
  $("iamUserReset").addEventListener("click", () => {
    $("iamUserName").value = "";
    $("iamPhone").value = "";
    $("iamUserStatus").value = "";
    filters = { name: "", phone: "", status: "" };
    userPager.reset();
    renderUsers();
  });
  $("iamNewUser").addEventListener("click", () => openUserDialog());
  $("iamUserRequests").addEventListener("click", () => goToRequest());
  $("iamUserSave").addEventListener("click", saveUser);
  dialog.addEventListener("change", (event) => {
    const input = event.target.closest("[data-iam-form-role]");
    if (!input || input.disabled) return;
    if (input.checked) selectedRoles.add(input.value); else selectedRoles.delete(input.value);
    $("iamUserFeedback").textContent = "";
    syncUserForm();
  });
  dialog.addEventListener("click", event => {
    const remove = event.target.closest("[data-iam-remove-form-role]");
    if (remove) {
      selectedRoles.delete(remove.dataset.iamRemoveFormRole);
      $("iamUserFeedback").textContent = "";
      syncUserForm();
      $("iamEditRoleToggle").focus();
      return;
    }
    if (event.target.closest(".iam-user-role-input") && !$("iamEditRoleToggle").disabled) {
      const open = $("iamEditRoleOptions").hidden;
      setRoleOptions(open);
      if (open) $("iamEditRoleOptions").querySelector(".iam-role-option:not([hidden]) input:not(:disabled), .iam-role-option:not([hidden]) [data-iam-request-id]")?.focus();
    } else if (!event.target.closest("#iamEditRole, #iamUserSave")) setRoleOptions(false);
  });
  dialog.addEventListener("keydown", event => {
    if (event.key !== "Escape" || $("iamEditRoleOptions")?.hidden !== false) return;
    event.preventDefault();
    setRoleOptions(false);
    $("iamEditRoleToggle").focus();
  });
  $("iamAssignSave").addEventListener("click", async () => {
    const { add, remove } = assignmentChanges();
    if (!add.length && !remove.length) return;
    const reason = $("iamAssignReason").value.trim();
    if (!reason) {
      $("iamAssignFeedback").textContent = "请填写申请原因。";
      $("iamAssignReason").focus();
      return;
    }
    const save = $("iamAssignSave");
    const userId = assignId;
    const originalRoles = [...assignOriginal];
    save.disabled = true;
    try {
      const request = await store.withWriteLock(() => store.saveUserEdit(userId, {}, {
        add, remove, originalRoles, source: "用户管理 · 分配角色", reason,
      }));
      assignDialog.close();
      toast("申请已提交，审核通过后生效", request);
    } catch (error) {
      showRequestError($("iamAssignFeedback"), error);
      save.disabled = false;
    }
  });
  assignDialog.addEventListener("change", (event) => {
    if (event.target.id === "iamAssignAll") {
      assignDialog.querySelectorAll("[data-iam-assign-role]:not(:disabled)").forEach((input) => {
        const id = input.dataset.iamAssignRole;
        if (assignOriginal.has(id)) return;
        if (event.target.checked) assignSelected.add(id);
        else assignSelected.delete(id);
      });
      renderAssignDialog();
      return;
    }
    const input = event.target.closest("[data-iam-assign-role]");
    if (!input) return;
    const id = input.dataset.iamAssignRole;
    if (input.checked) assignSelected.add(id); else assignSelected.delete(id);
    renderAssignDialog();
    [...assignDialog.querySelectorAll("[data-iam-assign-role]")].find((checkbox) => checkbox.dataset.iamAssignRole === id)?.focus();
  });
  store.subscribe(() => {
    renderUsers();
    if (dialog.open && (!editingId || store.users().some(user => user.id === editingId))) {
      const requestId = editingId ? pendingByUser().get(editingId)?.[0]?.requestId : "";
      if (requestId && $("iamEditPending").dataset.requestId !== requestId) selectedRoles = new Set(originalRoles);
      syncUserForm();
    }
    if (assignDialog.open) renderAssignDialog();
  });
  renderTree();
  renderUsers();
})();
