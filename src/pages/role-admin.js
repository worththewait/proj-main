(() => {
  "use strict";

  const store = window.BaigeIamStore;
  if (!store) return;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const $ = (id) => document.getElementById(id);
  const dialog = $("iamRoleDialog");
  const menuDialog = $("iamMenuDialog");
  const usersDialog = $("iamRoleUsersDialog");
  const addUsersDialog = $("iamAddUsersDialog");
  let editingId = "";
  let menuRoleId = "";
  let usersRoleId = "";
  let usersPage = 1;
  let usersSelected = new Set();
  let addUsersSelected = new Set();
  let usersFilters = { name: "", phone: "" };
  let addFilters = { name: "", phone: "" };
  const USERS_PAGE_SIZE = 5;
  let filters = { name: "", code: "", status: "" };
  let toastTimer = null;

  const MENU_GROUPS = [
    { label: "客户端", items: [["home", "首页"], ["qa", "对话"], ["knowledge", "知识库"], ["writing", "写作"], ["library", "文库"], ["intel", "情报"], ["analysis", "分析"], ["tools", "智能工具"]] },
    { label: "后台", items: [["review", "权限审核"], ["system", "系统管理"]] },
  ];

  function toast(text) {
    const el = $("iamToast");
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }
  function filteredRoles() {
    return store.roles().filter((role) => {
      if (filters.name && !role.name.toLowerCase().includes(filters.name.toLowerCase())) return false;
      if (filters.code && !String(role.code || "").toLowerCase().includes(filters.code.toLowerCase())) return false;
      if (filters.status && role.status !== filters.status) return false;
      return true;
    });
  }
  function statusCell(role) {
    const normal = role.status === "normal";
    return `<div class="iam-status-cell"><span class="iam-status-pill${normal ? "" : " is-disabled"}">${normal ? "正常" : "停用"}</span><button class="iam-switch" type="button" data-iam-role-toggle="${escape(role.id)}" aria-pressed="${normal}" aria-label="${normal ? "停用" : "启用"}${escape(role.name)}"></button></div>`;
  }
  function renderRoles() {
    const roles = filteredRoles();
    $("iamRoleRows").innerHTML = roles.length ? roles.map((role) => `<tr><td>${escape(role.id)}</td><td><span class="iam-role-name">${escape(role.name)}</span></td><td><span class="iam-role-code">${escape(role.code || "—")}</span></td><td class="iam-order">${escape(role.order ?? 1)}</td><td><span class="iam-time">${escape(role.createdAt || "—")}</span></td><td>${statusCell(role)}</td><td><div class="iam-actions"><button class="iam-icon-action is-edit" type="button" data-iam-role-edit="${escape(role.id)}" title="编辑角色" aria-label="编辑${escape(role.name)}">${icon("edit")}</button><button class="iam-icon-action is-delete" type="button" data-iam-role-delete="${escape(role.id)}" title="删除角色" aria-label="删除${escape(role.name)}">${icon("trash")}</button><button class="iam-icon-action is-key" type="button" data-iam-role-menu="${escape(role.id)}" title="菜单权限" aria-label="设置${escape(role.name)}菜单权限">${icon("shield")}</button><button class="iam-icon-action is-user" type="button" data-iam-role-users="${escape(role.id)}" title="分配用户" aria-label="为${escape(role.name)}分配用户">${icon("users")}</button></div></td></tr>`).join("") : '<tr><td colspan="7"><div class="iam-empty">没有符合条件的角色</div></td></tr>';
    $("iamRoleCount").textContent = `（${roles.length}）`;
    $("iamRoleSummary").textContent = `共 ${roles.length} 条角色数据`;
  }
  function roleForm(role = {}) {
    return `<div class="iam-form-grid"><label class="iam-form-field"><span>角色名称 <em>*</em></span><input class="iam-input" id="iamEditRoleName" maxlength="64" value="${escape(role.name || "")}" placeholder="请输入角色名称" /></label><label class="iam-form-field"><span>权限字符 <em>*</em></span><input class="iam-input" id="iamEditRoleCode" maxlength="64" value="${escape(role.code || "")}" placeholder="请输入权限字符" /></label><label class="iam-form-field"><span>显示顺序</span><input class="iam-input" id="iamEditRoleOrder" type="number" min="1" max="999" value="${escape(role.order ?? 1)}" /></label><label class="iam-form-field"><span>状态</span><select class="iam-input" id="iamEditRoleStatus"><option value="normal" ${role.status !== "disabled" ? "selected" : ""}>正常</option><option value="disabled" ${role.status === "disabled" ? "selected" : ""}>停用</option></select></label></div><p class="iam-form-feedback" id="iamRoleFeedback" role="status"></p>`;
  }
  function openRoleDialog(id = "") {
    editingId = id;
    const role = id ? store.roles().find((item) => item.id === id) : null;
    $("iamRoleDialogTitle").textContent = role ? "编辑角色" : "新建角色";
    $("iamRoleDialogBody").innerHTML = roleForm(role || {});
    if (!dialog.open) dialog.showModal();
    $("iamEditRoleName")?.focus();
  }
  function saveRole() {
    const name = $("iamEditRoleName").value.trim();
    const code = $("iamEditRoleCode").value.trim();
    if (!name) { $("iamRoleFeedback").textContent = "请填写角色名称。"; return; }
    if (!code) { $("iamRoleFeedback").textContent = "请填写权限字符。"; return; }
    const payload = { name, code, order: Number($("iamEditRoleOrder").value) || 1, status: $("iamEditRoleStatus").value };
    if (editingId) store.updateRole(editingId, payload);
    else store.addRole(payload);
    dialog.close();
    renderRoles();
    toast(editingId ? "角色信息已更新" : "角色已创建");
  }
  function openMenu(roleId) {
    menuRoleId = roleId;
    const role = store.roles().find((item) => item.id === roleId);
    if (!role) return;
    $("iamMenuName").textContent = `配置「${role.name}」可访问的菜单`;
    $("iamMenuList").innerHTML = MENU_GROUPS.map((group) => `<div class="iam-menu-group"><b>${escape(group.label)}</b>${group.items.map(([key, label]) => `<label class="iam-check-row"><input type="checkbox" data-iam-menu="${escape(key)}" ${(role.menuPermissions || []).includes(key) ? "checked" : ""} /><span>${escape(label)}</span></label>`).join("")}</div>`).join("");
    if (!menuDialog.open) menuDialog.showModal();
  }
  function openRoleUsers(roleId) {
    usersRoleId = roleId;
    usersPage = 1;
    usersSelected = new Set();
    usersFilters = { name: "", phone: "" };
    $("iamRoleUserName").value = "";
    $("iamRoleUserPhone").value = "";
    renderRoleUsers();
    if (!usersDialog.open) usersDialog.showModal();
  }
  function assignedUsers(role) {
    const ids = role.userIds || [];
    return store.users().filter((user) => ids.includes(user.id));
  }
  function filteredAssignedUsers(role) {
    return assignedUsers(role).filter((user) => {
      if (usersFilters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(usersFilters.name.toLowerCase())) return false;
      if (usersFilters.phone && !String(user.phone || "").includes(usersFilters.phone)) return false;
      return true;
    });
  }
  function renderRoleUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const all = filteredAssignedUsers(role);
    const totalPages = Math.max(1, Math.ceil(all.length / USERS_PAGE_SIZE));
    usersPage = Math.min(Math.max(1, usersPage), totalPages);
    const pageUsers = all.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);
    $("iamRoleUsersRows").innerHTML = pageUsers.length ? pageUsers.map((user) => `<tr><td class="iam-assign-check"><input type="checkbox" data-iam-role-user="${escape(user.id)}" ${usersSelected.has(user.id) ? "checked" : ""} aria-label="选择${escape(user.username)}" /></td><td>${escape(user.username)}</td><td>${escape(user.nickname)}</td><td>${escape(user.department)}</td><td>${escape(user.phone || "")}</td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td><td><span class="iam-status-pill is-green">${user.status === "disabled" ? "停用" : "正常"}</span></td><td><button class="iam-icon-action is-auth" type="button" data-iam-role-user-remove="${escape(user.id)}" title="取消授权" aria-label="取消${escape(user.username)}的授权">${icon("users")}</button></td></tr>`).join("") : '<tr><td colspan="8"><div class="iam-empty">暂无已分配用户</div></td></tr>';
    const allBox = $("iamRoleUsersAll");
    allBox.checked = pageUsers.length > 0 && pageUsers.every((user) => usersSelected.has(user.id));
    allBox.indeterminate = !allBox.checked && pageUsers.some((user) => usersSelected.has(user.id));
    $("iamRoleUsersSummary").textContent = `共 ${all.length} 条数据`;
    $("iamRoleUsersPager").innerHTML = `<button class="iam-page-btn" type="button" data-iam-users-page="${usersPage - 1}" ${usersPage <= 1 ? "disabled" : ""} aria-label="上一页">‹</button>${Array.from({ length: totalPages }, (_, index) => index + 1).map((page) => `<button class="iam-page-btn${usersPage === page ? " is-active" : ""}" type="button" data-iam-users-page="${page}" aria-current="${usersPage === page ? "page" : "false"}">${page}</button>`).join("")}<button class="iam-page-btn" type="button" data-iam-users-page="${usersPage + 1}" ${usersPage >= totalPages ? "disabled" : ""} aria-label="下一页">›</button>`;
  }
  function openAddUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    addUsersSelected = new Set();
    addFilters = { name: "", phone: "" };
    $("iamAddUserName").value = "";
    $("iamAddUserPhone").value = "";
    renderAddUsers();
    if (!addUsersDialog.open) addUsersDialog.showModal();
  }
  function addableUsers(role) {
    const assigned = new Set(role.userIds || []);
    return store.users().filter((user) => !assigned.has(user.id)).filter((user) => {
      if (addFilters.name && !`${user.username} ${user.nickname}`.toLowerCase().includes(addFilters.name.toLowerCase())) return false;
      if (addFilters.phone && !String(user.phone || "").includes(addFilters.phone)) return false;
      return true;
    });
  }
  function renderAddUsers() {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const users = addableUsers(role);
    $("iamAddUsersInfo").innerHTML = `<span class="iam-assign-info-icon">i</span><span>${addUsersSelected.size ? `已选中 ${addUsersSelected.size} 个用户` : "未选中任何用户"}</span>`;
    $("iamAddUsersRows").innerHTML = users.length ? users.map((user) => `<tr><td class="iam-assign-check"><input type="checkbox" data-iam-add-user="${escape(user.id)}" ${addUsersSelected.has(user.id) ? "checked" : ""} aria-label="选择${escape(user.username)}" /></td><td>${escape(user.username)}</td><td>${escape(user.nickname)}</td><td>${escape(user.department)}</td><td>${escape(user.phone || "")}</td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td><td><span class="iam-status-pill is-green">${user.status === "disabled" ? "停用" : "正常"}</span></td></tr>`).join("") : '<tr><td colspan="7"><div class="iam-empty">没有可添加的用户</div></td></tr>';
    const all = $("iamAddUsersAll");
    all.checked = users.length > 0 && users.every((user) => addUsersSelected.has(user.id));
    all.indeterminate = !all.checked && users.some((user) => addUsersSelected.has(user.id));
  }
  function updateRoleUsers(ids) {
    store.assignUsers(usersRoleId, ids);
    renderRoleUsers();
  }
  document.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-iam-role-edit]");
    if (edit) { openRoleDialog(edit.dataset.iamRoleEdit); return; }
    const del = event.target.closest("[data-iam-role-delete]");
    if (del) {
      const role = store.roles().find((item) => item.id === del.dataset.iamRoleDelete);
      if (!role || !window.confirm(`删除角色「${role.name}」？`)) return;
      store.removeRole(role.id);
      renderRoles();
      toast("角色已删除");
      return;
    }
    const menu = event.target.closest("[data-iam-role-menu]");
    if (menu) { openMenu(menu.dataset.iamRoleMenu); return; }
    const users = event.target.closest("[data-iam-role-users]");
    if (users) { openRoleUsers(users.dataset.iamRoleUsers); return; }
    const toggle = event.target.closest("[data-iam-role-toggle]");
    if (toggle) { store.toggleRole(toggle.dataset.iamRoleToggle); renderRoles(); return; }
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
  $("iamMenuSave").addEventListener("click", () => {
    const ids = [...menuDialog.querySelectorAll("[data-iam-menu]:checked")].map((input) => input.dataset.iamMenu);
    store.updateRole(menuRoleId, { menuPermissions: ids });
    menuDialog.close();
    toast("菜单权限已保存");
  });
  usersDialog.addEventListener("change", (event) => {
    if (event.target.id === "iamRoleUsersAll") {
      const role = store.roles().find((item) => item.id === usersRoleId);
      if (!role) return;
      const all = filteredAssignedUsers(role);
      const pageUsers = all.slice((usersPage - 1) * USERS_PAGE_SIZE, usersPage * USERS_PAGE_SIZE);
      pageUsers.forEach((user) => { if (event.target.checked) usersSelected.add(user.id); else usersSelected.delete(user.id); });
      renderRoleUsers();
      return;
    }
    const input = event.target.closest("[data-iam-role-user]");
    if (!input) return;
    if (input.checked) usersSelected.add(input.dataset.iamRoleUser); else usersSelected.delete(input.dataset.iamRoleUser);
    renderRoleUsers();
  });
  usersDialog.addEventListener("click", (event) => {
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
      updateRoleUsers((role.userIds || []).filter((id) => id !== user.id));
      usersSelected.delete(user.id);
      toast("已取消授权");
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
    if (input.checked) addUsersSelected.add(input.dataset.iamAddUser); else addUsersSelected.delete(input.dataset.iamAddUser);
    renderAddUsers();
  });
  $("iamAddRoleUsers").addEventListener("click", openAddUsers);
  $("iamCancelRoleUsers").addEventListener("click", () => {
    if (!usersSelected.size) { toast("请先选择要取消授权的用户"); return; }
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role || !window.confirm(`取消选中的 ${usersSelected.size} 个用户授权？`)) return;
    updateRoleUsers((role.userIds || []).filter((id) => !usersSelected.has(id)));
    usersSelected.clear();
    renderRoleUsers();
    toast("已取消授权");
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
  $("iamAddUsersSave").addEventListener("click", () => {
    const role = store.roles().find((item) => item.id === usersRoleId);
    if (!role) return;
    const next = new Set(role.userIds || []);
    addUsersSelected.forEach((id) => next.add(id));
    store.assignUsers(usersRoleId, [...next]);
    addUsersDialog.close();
    renderRoleUsers();
    toast("授权用户已添加");
  });
  store.subscribe(() => { renderRoles(); });
  renderRoles();
})();
