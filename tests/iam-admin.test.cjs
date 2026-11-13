const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");

function setup(storage = new Map(), locks) {
  const session = new Map();
  const window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    sessionStorage: {
      getItem: (key) => session.get(key) ?? null,
      setItem: (key, value) => session.set(key, String(value)),
    },
    navigator: { locks },
  };
  const context = { window, console };
  vm.createContext(context);
  for (const file of ["src/data.js", "src/iam-menu-catalog.js", "src/iam-store.js"]) {
    vm.runInContext(read(file), context);
  }
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
  store.removeUser(user.id);
  assert.equal(store.users().some((item) => item.id === user.id), false);

  const role = store.addRole({ name: "演示角色", code: "demo", order: 2 });
  assert.ok(store.roles().some((item) => item.id === role.id));
  store.updateRole(role.id, { name: "演示角色2" });
  assert.equal(store.roles().find((item) => item.id === role.id).name, "演示角色2");
  store.removeRole(role.id);
  assert.equal(store.roles().some((item) => item.id === role.id), false);
});

const KNOWLEDGE = "27220647241376";
const TOOL = "27690798629728";
const reviewer = (store) => store.setActor("iam-reviewer");
const admin = (store) => store.setActor("iam-admin");
const meta = { source: "分配角色", reason: "工作需要" };
const pair = (userId, roleId = KNOWLEDGE) => ({ userId, roleId });

test("角色授权双向同步仅在审核通过后生效，同一用户角色关系禁止重复送审", () => {
  const storage = new Map();
  const store = setup(storage);
  const otherTab = setup(storage);
  const target = pair("u-wu");
  const request = store.requestMembership({ add: [target], ...meta });
  assert.equal(request.status, "pending");
  assert.equal(request.applicant.id, store.actor().id);
  assert.deepEqual([...store.effectiveMenus(target.userId)], []);
  assert.ok(!store.roles().find((role) => role.id === KNOWLEDGE).userIds.includes(target.userId));
  assert.throws(() => store.requestMembership({ add: [target], ...meta, source: "分配用户" }), /待审核/);
  assert.throws(() => store.reviewRequest(request.id, "approved", ""), /审核员/);
  reviewer(otherTab);
  assert.equal(otherTab.reviewRequest(request.id, "approved", "岗位需要").status, "approved");
  assert.deepEqual([...store.effectiveMenus(target.userId)], ["knowledge"]);
  assert.ok(store.roles().find((role) => role.id === KNOWLEDGE).userIds.includes(target.userId));
  assert.equal(store.requests().find((item) => item.id === request.id).reviewer.id, otherTab.actor().id);
  reviewer(store);
  assert.throws(() => store.reviewRequest(request.id, "approved", ""), /已处理/);
});

test("待审替换保留原角色，整单批准应用增量且不覆盖无关授权", () => {
  const store = setup();
  const request = store.requestMembership({ add: [pair("u-lp", TOOL)], remove: [pair("u-lp")], ...meta });
  const independent = store.requestMembership({ add: [pair("u-lp", "27644551053344")], ...meta });
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  reviewer(store);
  store.reviewRequest(independent.id, "approved");
  assert.equal(store.reviewRequest(request.id, "approved").status, "approved");
  assert.deepEqual([...store.users().find((user) => user.id === "u-lp").roleIds].sort(), ["27644551053344", TOOL].sort());
});

test("角色菜单扩权和启用必须送审，停用立即撤权并使待审范围失效", () => {
  const store = setup();
  assert.throws(() => store.updateRole(KNOWLEDGE, { menuPermissions: ["analysis"] }), /审批|审核/);
  const pending = store.requestMembership({ add: [pair("u-wu")], ...meta });
  const expansion = store.changeRoleMenus(KNOWLEDGE, ["knowledge", "analysis"], meta);
  assert.equal(expansion.status, "pending");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  reviewer(store);
  assert.equal(store.reviewRequest(expansion.id, "approved").status, "approved");
  assert.deepEqual([...store.effectiveMenus("u-lp")].sort(), ["analysis", "knowledge"]);
  assert.equal(store.requests().find((item) => item.id === pending.id).status, "invalid");
  admin(store);
  store.toggleRole(KNOWLEDGE);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  assert.throws(() => store.toggleRole(KNOWLEDGE), /审批|审核/);
  const restore = store.requestEnable("role", KNOWLEDGE, meta);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  reviewer(store);
  store.reviewRequest(restore.id, "approved");
  assert.deepEqual([...store.effectiveMenus("u-lp")].sort(), ["analysis", "knowledge"]);
});

test("整单任一目标失效不发放权限，撤回与驳回不能生效", () => {
  const store = setup();
  const batch = store.requestMembership({ add: [pair("u-wu"), pair("u-hou")], ...meta });
  store.toggleUser("u-hou");
  assert.equal(store.requests().find((item) => item.id === batch.id).status, "invalid");
  const withdrawn = store.requestMembership({ add: [pair("u-wu")], ...meta });
  assert.equal(store.withdrawRequest(withdrawn.id).status, "withdrawn");
  const rejected = store.requestMembership({ add: [pair("u-wu")], ...meta });
  reviewer(store);
  assert.throws(() => store.reviewRequest(batch.id, "approved"), /已处理/);
  assert.throws(() => store.reviewRequest(withdrawn.id, "approved"), /已处理/);
  assert.throws(() => store.reviewRequest(rejected.id, "rejected", " "), /驳回原因/);
  assert.equal(store.reviewRequest(rejected.id, "rejected", "资料不足").status, "rejected");
  assert.deepEqual([...store.effectiveMenus("u-wu")], []);
});

test("审批身份独立且审核员不能审批本人受益的申请", () => {
  const store = setup();
  assert.equal(store.isProtectedUser(), false);
  assert.throws(() => store.requestMembership({ add: [pair("u-wu", "1")], ...meta }), /预设|保留/);
  assert.throws(() => store.changeRoleMenus(KNOWLEDGE, ["knowledge", "system"], meta), /预设|保留/);
  const own = store.requestMembership({ add: [pair("u-shen", TOOL)], ...meta });
  reviewer(store);
  assert.equal(store.canReviewRequest(own.id), false);
  assert.throws(() => store.reviewRequest(own.id, "approved"), /本人|受益/);
  assert.throws(() => store.addUser({ username: "demo" }), /管理员/);
  assert.equal(store.assignRoles, undefined);
  assert.equal(store.assignUsers, undefined);
  store.setActor("iam-reviewer-2");
  assert.equal(store.reviewRequest(own.id, "approved").status, "approved");
});

test("撤销立即生效并废弃待审替换，重新启用用户不会跳过审核", () => {
  const storage = new Map();
  const store = setup(storage);
  const replace = store.requestMembership({ add: [pair("u-lp", TOOL)], remove: [pair("u-lp")], ...meta });
  store.revokeMembership([pair("u-lp")]);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  assert.equal(store.requests().find((item) => item.id === replace.id).status, "invalid");
  assert.ok(JSON.parse(storage.get(store.KEY)).events.some((event) => event.type === "revoke"));
  store.toggleUser("u-yym");
  assert.throws(() => store.updateUser("u-yym", { status: "normal" }), /审批|审核/);
  const enable = store.requestEnable("user", "u-yym", meta);
  assert.deepEqual([...store.effectiveMenus("u-yym")], []);
  reviewer(store);
  store.reviewRequest(enable.id, "approved");
  assert.deepEqual([...store.effectiveMenus("u-yym")], ["knowledge"]);
});

test("创建账号与初始角色申请一次保存，失败不留下额外账号", () => {
  const store = setup();
  const before = store.users().length;
  const profile = { username: "new@example.test", nickname: "新用户" };
  assert.throws(() => store.createUserWithRequest(profile, ["missing"], meta), /不存在/);
  assert.equal(store.users().length, before);
  const { user, request } = store.createUserWithRequest(profile, [KNOWLEDGE, TOOL], meta);
  assert.equal(request.items.length, 2);
  assert.equal(request.items[0].userId, user.id);
  assert.equal(store.users().length, before + 1);
  assert.deepEqual([...store.effectiveMenus(user.id)], []);
});

test("编辑用户可同时保存资料和提交角色替换，失败时保留原资料", () => {
  const store = setup();
  const original = store.users().find(user => user.id === "u-lp");
  const changes = { add: [pair(original.id, TOOL)], remove: [pair(original.id)], originalRoles: original.roleIds };
  assert.throws(() => store.saveUserEdit(original.id, { nickname: "修改昵称" }, changes), /原因/);
  assert.equal(store.users().find(user => user.id === original.id).nickname, original.nickname);
  const request = store.saveUserEdit(original.id, { nickname: "修改昵称" }, { ...changes, ...meta });
  assert.deepEqual(Array.from(request.items, item => item.operation), ["add", "remove"]);
  assert.deepEqual([...store.effectiveMenus(original.id)], ["knowledge"]);
  reviewer(store);
  store.reviewRequest(request.id, "approved");
  assert.equal(store.users().find(user => user.id === original.id).nickname, "修改昵称");
  assert.deepEqual([...store.users().find(user => user.id === original.id).roleIds], [TOOL]);
  store.setActor("iam-admin");
  assert.throws(() => store.saveUserEdit(original.id, {}, { ...changes, ...meta }), /角色已更新/);
});

test("编辑用户单独撤销角色时立即生效并记录原因", () => {
  const storage = new Map();
  const store = setup(storage);
  const remove = [pair("u-lp")];
  assert.throws(() => store.saveUserEdit("u-lp", {}, { remove }), /原因|理由/);
  assert.equal(store.saveUserEdit("u-lp", {}, { remove, ...meta }), null);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  assert.equal(store.requests().length, 0);
  assert.equal(JSON.parse(storage.get(store.KEY)).events.find(event => event.type === "revoke").reason, meta.reason);
});

test("空角色可直接配置菜单，权限变更使原先待审授权失效", () => {
  const store = setup();
  const role = store.addRole({ name: "空角色", code: "blank" });
  const pending = store.requestMembership({ add: [pair("u-wu", role.id)], ...meta });
  assert.equal(store.changeRoleMenus(role.id, ["knowledge"]), null);
  assert.deepEqual([...store.roles().find((item) => item.id === role.id).menuPermissions], ["knowledge"]);
  assert.equal(store.requests().find((item) => item.id === pending.id).status, "invalid");
  assert.deepEqual([...store.effectiveMenus("u-wu")], []);
});

test("合并编辑角色时先校验权限，失败不会留下资料变更", () => {
  const store = setup();
  const before = store.roles().find((item) => item.id === KNOWLEDGE);
  assert.throws(() => store.saveRoleEdit(KNOWLEDGE, { name: "新名称" }, ["writing"], { originalMenus: ["knowledge"] }), /理由/);
  assert.equal(store.roles().find((item) => item.id === KNOWLEDGE).name, before.name);
  const request = store.saveRoleEdit(KNOWLEDGE, { name: "新名称", remark: "测试备注" }, ["writing"],
    { ...meta, originalMenus: ["knowledge"], originalStatus: "normal" });
  assert.equal(request.status, "pending");
  assert.equal(store.roles().find((item) => item.id === KNOWLEDGE).remark, "测试备注");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  reviewer(store);
  store.reviewRequest(request.id, "approved");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["writing"]);
});

test("编辑中同时恢复启用与修改权限，统一审核后生效", () => {
  const store = setup();
  store.toggleRole(KNOWLEDGE);
  const request = store.saveRoleEdit(KNOWLEDGE, { status: "normal" }, ["writing"],
    { ...meta, originalMenus: ["knowledge"], originalStatus: "disabled" });
  assert.equal(request.type, "enable-role");
  assert.equal(store.requests().length, 1);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  reviewer(store);
  store.reviewRequest(request.id, "approved");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["writing"]);
});

test("移除旧版整组权限的其中一项会立即缩减，重新添加须审批", () => {
  const storage = new Map([["baige.iam.v1", JSON.stringify({
    version: 1, users: [{ id: "u-demo", status: "normal", roleIds: ["r-demo"] }],
    roles: [{ id: "r-demo", status: "normal", userIds: ["u-demo"], menuPermissions: ["frontier"] }],
  })]]);
  const store = setup(storage);
  assert.equal(store.saveRoleEdit("r-demo", {}, ["frontier:全球鹰"]), null);
  assert.deepEqual([...store.effectiveMenus("u-demo")], ["frontier:全球鹰"]);
  assert.equal(store.saveRoleEdit("r-demo", {}, ["frontier:全球鹰", "frontier:智研通"], meta).status, "pending");
  assert.deepEqual([...store.effectiveMenus("u-demo")], ["frontier:全球鹰"]);
});

test("旧版记录保留正式角色关系，写入队列不会以切换后的身份执行", async () => {
  const raw = { version: 1, users: [{ id: "u-old", status: "normal", roleIds: ["r-old"] }],
    roles: [{ id: "r-old", status: "normal", userIds: ["u-old"], menuPermissions: ["knowledge"] }] };
  const storage = new Map([["baige.iam.v1", JSON.stringify(raw)]]);
  let run;
  const locks = { request: (_key, callback) => new Promise((resolve) => {
    run = () => resolve(Promise.resolve().then(callback));
  }) };
  const store = setup(storage, locks);
  assert.deepEqual([...store.effectiveMenus("u-old")], ["knowledge"]);
  assert.equal(store.requests().length, 0);
  const pending = store.withWriteLock(() => store.actor().kind);
  reviewer(store);
  run();
  await assert.rejects(pending, /身份已切换/);
  assert.equal(storage.get(store.KEY), JSON.stringify(raw));
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
  assert.match(roleJs, /openRoleDialog\(menu\.dataset\.iamRoleMenu, true\)/);
  assert.match(roleJs, /BaigeIamRoleMenuPicker\.mount/);
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
