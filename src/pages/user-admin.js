(() => {
  "use strict";

  const store = window.BaigeIamStore;
  if (!store) return;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const tree = store.DEPARTMENT_TREE;
  const $ = (id) => document.getElementById(id);
  const dialog = $("iamUserDialog");
  const assignDialog = $("iamAssignDialog");
  let selectedDept = "";
  let expanded = new Set(["root", "oa-root", "org-714"]);
  let editingId = "";
  let assignId = "";
  let assignPage = 1;
  let assignSelected = new Set();
  const ASSIGN_PAGE_SIZE = 5;
  let filters = { name: "", phone: "", status: "" };
  let toastTimer = null;

  function toast(text) {
    const el = $("iamToast");
    el.textContent = text;
    el.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-visible"), 2200);
  }
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
  function statusCell(user) {
    const normal = user.status === "normal";
    return `<div class="iam-status-cell"><span class="iam-status-pill${normal ? "" : " is-disabled"}">${normal ? "正常" : "停用"}</span><button class="iam-switch" type="button" data-iam-user-toggle="${escape(user.id)}" aria-pressed="${normal}" aria-label="${normal ? "停用" : "启用"}${escape(user.username)}"></button></div>`;
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
    $("iamUserRows").innerHTML = users.length ? users.map((user) => `<tr><td><span class="iam-user-name">${escape(user.username)}</span></td><td>${escape(user.nickname)}</td><td><span class="iam-dept-name">${escape(user.department || "—")}</span></td><td><span class="iam-phone">${escape(maskPhone(user.phone))}</span></td><td><span class="iam-time">${escape(user.createdAt || "—")}</span></td><td>${statusCell(user)}</td><td><div class="iam-actions"><button class="iam-icon-action is-edit" type="button" data-iam-user-edit="${escape(user.id)}" title="编辑用户" aria-label="编辑${escape(user.username)}">${icon("edit")}</button><button class="iam-icon-action is-delete" type="button" data-iam-user-delete="${escape(user.id)}" title="删除用户" aria-label="删除${escape(user.username)}">${icon("trash")}</button><button class="iam-icon-action is-key" type="button" data-iam-user-reset="${escape(user.id)}" title="重置密码" aria-label="重置${escape(user.username)}密码">${icon("key")}</button><button class="iam-icon-action is-user" type="button" data-iam-user-assign="${escape(user.id)}" title="分配角色" aria-label="为${escape(user.username)}分配角色">${icon("users")}</button></div></td></tr>`).join("") : '<tr><td colspan="7"><div class="iam-empty">没有符合条件的用户</div></td></tr>';
    $("iamUserCount").textContent = `（${users.length}）`;
    $("iamUserSummary").textContent = `共 ${users.length} 条用户数据`;
  }
  function userForm(user = {}) {
    const departments = flatDepartments();
    const roles = store.roles();
    const roleId = (user.roleIds || [])[0] || "";
    const status = user.status === "disabled" ? "disabled" : "normal";
    return `<div class="iam-inline-form">
      <label class="iam-inline-field"><span>用户昵称 <em>*</em></span><input class="iam-input" id="iamEditNickname" maxlength="64" value="${escape(user.nickname || "")}" placeholder="请输入用户昵称" /></label>
      <label class="iam-inline-field"><span>所属部门 <em>*</em></span><select class="iam-input" id="iamEditDept"><option value="">请选择所属部门</option>${departments.map((name) => `<option ${user.department === name ? "selected" : ""}>${escape(name)}</option>`).join("")}</select></label>
      <label class="iam-inline-field"><span>手机号码 <em>*</em></span><input class="iam-input" id="iamEditPhone" maxlength="20" value="${escape(user.phone || "")}" placeholder="请输入手机号码" inputmode="tel" /></label>
      <label class="iam-inline-field"><span>邮箱</span><input class="iam-input" id="iamEditEmail" type="email" maxlength="120" value="${escape(user.email || "")}" placeholder="请输入邮箱" /></label>
      <label class="iam-inline-field"><span>用户账号 <em>*</em></span><input class="iam-input" id="iamEditUsername" maxlength="64" value="${escape(user.username || "")}" placeholder="请输入用户账号" autocomplete="off" /></label>
      <label class="iam-inline-field"><span>用户密码 <em>*</em></span><span class="iam-password"><input class="iam-input" id="iamEditPassword" type="password" maxlength="64" placeholder="${user.id ? "不修改则留空" : "请输入用户密码"}" autocomplete="new-password" /><button class="iam-password-toggle" type="button" data-iam-password-toggle aria-label="显示密码">${icon("eye")}</button></span></label>
      <label class="iam-inline-field"><span>用户性别</span><select class="iam-input" id="iamEditGender"><option value="">请选择</option><option value="男" ${user.gender === "男" ? "selected" : ""}>男</option><option value="女" ${user.gender === "女" ? "selected" : ""}>女</option><option value="未知" ${user.gender === "未知" ? "selected" : ""}>未知</option></select></label>
      <div class="iam-inline-field"><span>状态 <em>*</em></span><div class="iam-segment" id="iamEditStatusGroup" role="group" aria-label="用户状态"><button type="button" data-iam-form-status="normal" class="${status === "normal" ? "is-active" : ""}">正常</button><button type="button" data-iam-form-status="disabled" class="${status === "disabled" ? "is-active" : ""}">停用</button></div><input id="iamEditStatus" type="hidden" value="${status}" /></div>
      <label class="iam-inline-field"><span>岗位</span><select class="iam-input" id="iamEditPosition"><option value="">请选择岗位</option>${["普通员工", "部门管理员", "审核员", "知识库管理员"].map((name) => `<option ${user.position === name ? "selected" : ""}>${name}</option>`).join("")}</select></label>
      <label class="iam-inline-field"><span>角色 <em>*</em></span><select class="iam-input" id="iamEditRole"><option value="">请选择角色</option>${roles.map((role) => `<option value="${escape(role.id)}" ${roleId === role.id ? "selected" : ""}>${escape(role.name)}</option>`).join("")}</select></label>
      <label class="iam-inline-field is-wide"><span>备注</span><textarea class="iam-input iam-textarea" id="iamEditRemark" maxlength="500" placeholder="请输入备注">${escape(user.remark || "")}</textarea></label>
    </div><p class="iam-form-feedback" id="iamUserFeedback" role="status"></p>`;
  }
  function openUserDialog(id = "") {
    editingId = id;
    const user = id ? store.users().find((item) => item.id === id) : null;
    $("iamUserDialogTitle").textContent = user ? "编辑用户" : "新建用户";
    $("iamUserSave").textContent = user ? "保存" : "新增";
    $("iamUserDialogBody").innerHTML = userForm(user || {});
    if (!dialog.open) dialog.showModal();
    $("iamEditUsername")?.focus();
  }
  function saveUser() {
    const username = $("iamEditUsername").value.trim();
    const nickname = $("iamEditNickname").value.trim();
    const department = $("iamEditDept").value;
    const phone = $("iamEditPhone").value.trim();
    const password = $("iamEditPassword").value;
    const roleId = $("iamEditRole").value;
    if (!nickname) { $("iamUserFeedback").textContent = "请填写用户昵称。"; return; }
    if (!department) { $("iamUserFeedback").textContent = "请选择所属部门。"; return; }
    if (!phone) { $("iamUserFeedback").textContent = "请填写手机号码。"; return; }
    if (!username) { $("iamUserFeedback").textContent = "请填写用户账号。"; return; }
    if (!editingId && !password) { $("iamUserFeedback").textContent = "请填写用户密码。"; return; }
    if (!roleId) { $("iamUserFeedback").textContent = "请选择角色。"; return; }
    const payload = {
      username,
      nickname,
      department,
      phone,
      email: $("iamEditEmail").value.trim(),
      gender: $("iamEditGender").value,
      position: $("iamEditPosition").value,
      remark: $("iamEditRemark").value.trim(),
      status: $("iamEditStatus").value,
    };
    let userId = editingId;
    if (editingId) store.updateUser(editingId, payload);
    else userId = store.addUser(payload).id;
    store.assignRoles(userId, [roleId]);
    dialog.close();
    renderUsers();
    toast(editingId ? "用户信息已更新" : "用户已创建");
  }
  function openAssign(id) {
    assignId = id;
    const user = store.users().find((item) => item.id === id);
    if (!user) return;
    assignSelected = new Set(user.roleIds || []);
    assignPage = 1;
    $("iamAssignTitle").textContent = `为用户"${user.username}"分配角色`;
    renderAssignDialog();
    if (!assignDialog.open) assignDialog.showModal();
  }
  function renderAssignDialog() {
    const user = store.users().find((item) => item.id === assignId);
    if (!user) return;
    const roles = store.roles();
    const pages = Math.max(1, Math.ceil(roles.length / ASSIGN_PAGE_SIZE));
    assignPage = Math.min(Math.max(1, assignPage), pages);
    const pageRoles = roles.slice((assignPage - 1) * ASSIGN_PAGE_SIZE, assignPage * ASSIGN_PAGE_SIZE);
    const selectedCount = roles.filter((role) => assignSelected.has(role.id)).length;
    $("iamAssignInfo").innerHTML = `<span class="iam-assign-info-icon">i</span><span>${selectedCount ? `已选中 ${selectedCount} 个角色` : "未选中任何角色"}</span>`;
    $("iamAssignRows").innerHTML = pageRoles.length ? pageRoles.map((role) => `<tr><td class="iam-assign-check"><input type="checkbox" data-iam-assign-role="${escape(role.id)}" ${assignSelected.has(role.id) ? "checked" : ""} aria-label="选择${escape(role.name)}" /></td><td>${escape(role.id)}</td><td>${escape(role.name)}</td><td>${escape(role.code || "—")}</td><td><span class="iam-time">${escape(role.createdAt || "—")}</span></td></tr>`).join("") : '<tr><td colspan="5"><div class="iam-empty">暂无可分配角色</div></td></tr>';
    const all = $("iamAssignAll");
    all.checked = pageRoles.length > 0 && pageRoles.every((role) => assignSelected.has(role.id));
    all.indeterminate = !all.checked && pageRoles.some((role) => assignSelected.has(role.id));
    const pager = $("iamAssignPager");
    pager.innerHTML = `<button class="iam-page-btn" type="button" data-iam-assign-page="${assignPage - 1}" ${assignPage <= 1 ? "disabled" : ""} aria-label="上一页">‹</button>${Array.from({ length: pages }, (_, index) => index + 1).map((page) => `<button class="iam-page-btn${assignPage === page ? " is-active" : ""}" type="button" data-iam-assign-page="${page}" aria-current="${assignPage === page ? "page" : "false"}">${page}</button>`).join("")}<button class="iam-page-btn" type="button" data-iam-assign-page="${assignPage + 1}" ${assignPage >= pages ? "disabled" : ""} aria-label="下一页">›</button>`;
  }
  document.addEventListener("click", (event) => {
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
      renderTree();
      renderUsers();
      return;
    }
    const edit = event.target.closest("[data-iam-user-edit]");
    if (edit) { openUserDialog(edit.dataset.iamUserEdit); return; }
    const del = event.target.closest("[data-iam-user-delete]");
    if (del) {
      const user = store.users().find((item) => item.id === del.dataset.iamUserDelete);
      if (!user || !window.confirm(`删除用户「${user.username}」？`)) return;
      store.removeUser(user.id);
      renderUsers();
      toast("用户已删除");
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
    const toggleUser = event.target.closest("[data-iam-user-toggle]");
    if (toggleUser) { store.toggleUser(toggleUser.dataset.iamUserToggle); renderUsers(); return; }
    const formStatus = event.target.closest("[data-iam-form-status]");
    if (formStatus) {
      const group = formStatus.closest("#iamEditStatusGroup");
      group?.querySelectorAll("[data-iam-form-status]").forEach((button) => button.classList.toggle("is-active", button === formStatus));
      const hidden = $("iamEditStatus");
      if (hidden) hidden.value = formStatus.dataset.iamFormStatus;
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
    renderUsers();
  });
  $("iamUserReset").addEventListener("click", () => {
    $("iamUserName").value = "";
    $("iamPhone").value = "";
    $("iamUserStatus").value = "";
    filters = { name: "", phone: "", status: "" };
    renderUsers();
  });
  $("iamNewUser").addEventListener("click", () => openUserDialog());
  $("iamUserSave").addEventListener("click", saveUser);
  $("iamAssignSave").addEventListener("click", () => {
    store.assignRoles(assignId, [...assignSelected]);
    assignDialog.close();
    toast("角色分配已保存");
  });
  assignDialog.addEventListener("change", (event) => {
    if (event.target.id === "iamAssignAll") {
      const roles = store.roles();
      const pageRoles = roles.slice((assignPage - 1) * ASSIGN_PAGE_SIZE, assignPage * ASSIGN_PAGE_SIZE);
      pageRoles.forEach((role) => { if (event.target.checked) assignSelected.add(role.id); else assignSelected.delete(role.id); });
      renderAssignDialog();
      return;
    }
    const input = event.target.closest("[data-iam-assign-role]");
    if (!input) return;
    if (input.checked) assignSelected.add(input.dataset.iamAssignRole); else assignSelected.delete(input.dataset.iamAssignRole);
    renderAssignDialog();
  });
  assignDialog.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-iam-assign-page]");
    if (!pageButton || pageButton.disabled) return;
    assignPage = Number(pageButton.dataset.iamAssignPage) || 1;
    renderAssignDialog();
  });
  store.subscribe(() => { renderUsers(); });
  renderTree();
  renderUsers();
})();
