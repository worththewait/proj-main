const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");

function setup() {
  const storage = new Map();
  const window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  const context = { window, console };
  vm.createContext(context);
  vm.runInContext(read("src/iam-store.js"), context);
  return window.BaigeIamStore;
}

test("IAM store seeds users, roles and supports local CRUD", () => {
  const store = setup();
  const users = store.users();
  const roles = store.roles();
  assert.ok(users.length >= 10);
  assert.ok(roles.length >= 10);
  assert.ok(users.some((user) => user.username === "claude_pa_test"));
  assert.ok(roles.some((role) => role.name === "超级管理员" && role.code === "superadmin"));

  const user = store.addUser({ username: "demo@cimtec.net.cn", nickname: "演示新增", department: "技术部", phone: "13800001111" });
  assert.equal(store.users()[0].id, user.id);
  store.toggleUser(user.id);
  assert.equal(store.users().find((item) => item.id === user.id).status, "disabled");
  store.updateUser(user.id, { nickname: "演示更新" });
  assert.equal(store.users().find((item) => item.id === user.id).nickname, "演示更新");
  store.assignRoles(user.id, ["1"]);
  assert.ok(store.roles().find((role) => role.id === "1").userIds.includes(user.id));
  store.removeUser(user.id);
  assert.equal(store.users().some((item) => item.id === user.id), false);

  const role = store.addRole({ name: "演示角色", code: "demo", order: 2 });
  assert.ok(store.roles().some((item) => item.id === role.id));
  store.updateRole(role.id, { name: "演示角色2" });
  assert.equal(store.roles().find((item) => item.id === role.id).name, "演示角色2");
  store.assignUsers(role.id, ["u-lp"]);
  assert.ok(store.users().find((item) => item.id === "u-lp").roleIds.includes(role.id));
  store.removeRole(role.id);
  assert.equal(store.roles().some((item) => item.id === role.id), false);
});

test("user and role admin pages are wired into back office navigation", () => {
  const admin = read("admin.html");
  const adminJs = read("admin.js");
  const userPage = read("pages/user-admin.html");
  const rolePage = read("pages/role-admin.html");
  const userJs = read("src/pages/user-admin.js");
  const roleJs = read("src/pages/role-admin.js");
  assert.match(admin, /data-admin-view="users"/);
  assert.match(admin, /data-admin-view="roles"/);
  assert.match(admin, />用户管理</);
  assert.match(admin, />角色管理</);
  assert.match(adminJs, /pages\/user-admin\.html\?embed=admin/);
  assert.match(adminJs, /pages\/role-admin\.html\?embed=admin/);
  assert.match(userPage, /iamDeptTree/);
  assert.match(userPage, /iamUserRows/);
  assert.match(userPage, /新建用户/);
  assert.match(userPage, /iam-dialog--form/);
  assert.match(userJs, /iamEditPassword/);
  assert.match(userJs, /iamEditEmail/);
  assert.match(userJs, /iamEditPosition/);
  assert.match(userJs, /iamEditRole/);
  assert.match(userJs, /iam-form-status/);
  assert.match(userJs, /iamAssignRows/);
  assert.match(userJs, /iamAssignInfo/);
  assert.match(userJs, /iamAssignPager/);
  assert.match(read("user-role-admin.css"), /\.iam-assign-table/);
  assert.match(read("user-role-admin.css"), /\.iam-page-btn/);
  assert.match(read("user-role-admin.css"), /\.iam-inline-form/);
  assert.match(rolePage, /iamRoleRows/);
  assert.match(rolePage, /新建角色/);
  assert.match(userJs, /function openUserDialog/);
  assert.match(userJs, /function openAssign/);
  assert.match(roleJs, /function openRoleDialog/);
  assert.match(roleJs, /function openMenu/);
  assert.match(roleJs, /function openRoleUsers/);
  assert.match(rolePage, /iamRoleUsersRows/);
  assert.match(rolePage, /iamRoleUsersPager/);
  assert.match(rolePage, /iamAddUsersDialog/);
  assert.match(rolePage, /选择授权用户/);
  assert.match(rolePage, /iamAddUsersRows/);
  assert.match(roleJs, /function renderAddUsers/);
  assert.match(roleJs, /iamAddUsersAll/);
  assert.match(read("user-role-admin.css"), /\.iam-select-users-table/);
  assert.match(roleJs, /function renderRoleUsers/);
  assert.match(roleJs, /data-iam-role-user-remove/);
  assert.match(read("user-role-admin.css"), /\.iam-role-users-table/);
});
