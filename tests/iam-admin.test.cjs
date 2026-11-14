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

test("IAM store seeds records, edits profiles directly and routes account and role lifecycle changes through approval", () => {
  const store = setup();
  const users = store.users();
  const roles = store.roles();
  assert.ok(users.length >= 10);
  assert.ok(roles.length >= 10);
  assert.ok(users.some((user) => user.username === "claude_pa_test"));
  assert.ok(roles.some((role) => role.name === "超级管理员" && role.code === "superadmin"));

  const user = store.addUser({ username: "demo@cimtec.net.cn", nickname: "演示新增", department: "技术部", phone: "13800001111" }, [KNOWLEDGE], meta);
  assert.equal(store.users()[0].id, user.id);
  approve(store, store.requests().find(request => request.items.some(item => item.userId === user.id)));
  assert.throws(() => store.toggleUser(user.id), /理由/);
  const disable = store.requestLifecycle("user", user.id, "disable", meta);
  assert.equal(store.users().find((item) => item.id === user.id).status, "normal");
  approve(store, disable);
  assert.equal(store.users().find((item) => item.id === user.id).status, "disabled");
  store.updateUser(user.id, { nickname: "演示更新" });
  assert.equal(store.users().find((item) => item.id === user.id).nickname, "演示更新");
  assert.throws(() => store.removeUser(user.id), /理由/);
  const remove = store.requestLifecycle("user", user.id, "delete", meta);
  assert.ok(store.users().some((item) => item.id === user.id));
  approve(store, remove);
  assert.equal(store.users().some((item) => item.id === user.id), false);

  const role = store.addRole({ name: "演示角色", code: "demo", order: 2 });
  assert.ok(store.roles().some((item) => item.id === role.id));
  store.updateRole(role.id, { name: "演示角色2" });
  assert.equal(store.roles().find((item) => item.id === role.id).name, "演示角色2");
  assert.throws(() => store.removeRole(role.id), /理由/);
  const deleteRole = store.requestLifecycle("role", role.id, "delete", meta);
  assert.ok(store.roles().some((item) => item.id === role.id));
  approve(store, deleteRole);
  assert.equal(store.roles().some((item) => item.id === role.id), false);
});

const KNOWLEDGE = "27220647241376";
const TOOL = "27690798629728";
const reviewer = (store) => store.setActor("iam-reviewer");
const admin = (store) => store.setActor("iam-admin");
function approve(store, request) {
  reviewer(store);
  const decided = store.reviewRequest(request.id, "approved");
  admin(store);
  assert.equal(decided.status, "approved");
}
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

test("同一用户的角色和状态申请互斥，其他用户可同时申请同一角色", () => {
  const store = setup();
  const request = store.requestMembership({ add: [pair("u-lp", TOOL)], remove: [pair("u-lp")], ...meta });
  const conflict = error => /待审核/.test(error.message) && error.requestId === request.id;
  assert.throws(() => store.requestMembership({ add: [pair("u-lp", "27644551053344")], ...meta }), conflict);
  assert.throws(() => store.requestLifecycle("user", "u-lp", "disable", meta), conflict);
  assert.throws(() => store.requestLifecycle("user", "u-lp", "delete", meta), conflict);
  assert.doesNotThrow(() => store.updateUser("u-lp", { remark: "资料可编辑" }));
  const independent = store.requestMembership({ add: [pair("u-wu", TOOL)], ...meta });
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  approve(store, independent);
  assert.equal(store.requests().find(item => item.id === request.id).status, "pending");
  approve(store, request);
  assert.deepEqual([...store.users().find((user) => user.id === "u-lp").roleIds], [TOOL]);
});

test("待审角色变更阻止各入口新增该角色且链接原申请，单独移除仍可送审", () => {
  const store = setup();
  const roleChange = store.changeRoleMenus(KNOWLEDGE, ["knowledge", "analysis"], meta);
  const conflicting = error => /待审核的角色变更/.test(error.message) && error.requestId === roleChange.id;
  assert.equal(store.pendingRoleChange(KNOWLEDGE).id, roleChange.id);
  assert.throws(() => store.requestMembership({ add: [pair("u-wu", TOOL), pair("u-hou")], ...meta }), conflicting);
  assert.throws(() => store.createUserWithRequest({ username: "blocked@example.com" }, [KNOWLEDGE], meta), conflicting);
  assert.equal(store.users().some(user => user.username === "blocked@example.com"), false);
  const before = store.users().find(user => user.id === "u-wu");
  assert.throws(() => store.saveUserEdit("u-wu", { remark: "资料未保存" }, { add: [pair("u-wu")], ...meta }), conflicting);
  assert.equal(store.users().find(user => user.id === "u-wu").remark, before.remark);
  const remove = store.requestMembership({ remove: [pair("u-lp")], ...meta });
  assert.equal(store.blockingRoleChange(remove), null);
  assert.equal(store.approvalBlockReason(remove), "");
  approve(store, remove);
  assert.equal(store.requests().find(request => request.id === roleChange.id).status, "invalid");
});

test("角色待审启停或删除同样暂停新增，启用通过后可正常提交", () => {
  const store = setup();
  for (const operation of ["disable", "delete"]) {
    const request = store.requestLifecycle("role", KNOWLEDGE, operation, meta);
    assert.throws(() => store.requestMembership({ add: [pair("u-wu")], ...meta }), error => error.requestId === request.id);
    store.withdrawRequest(request.id);
  }
  approve(store, store.requestLifecycle("role", KNOWLEDGE, "disable", meta));
  const enable = store.requestLifecycle("role", KNOWLEDGE, "enable", meta);
  assert.throws(() => store.requestMembership({ add: [pair("u-wu")], ...meta }), error => error.requestId === enable.id);
  approve(store, enable);
  assert.equal(store.requestMembership({ add: [pair("u-wu")], ...meta }).status, "pending");
});

test("已有新增申请遇到角色待审变更可查看、撤回或驳回，角色单结束后解锁或失效", () => {
  const store = setup();
  const addition = store.requestMembership({ add: [pair("u-wu")], ...meta });
  const rejected = store.requestMembership({ add: [pair("u-hou")], ...meta });
  const withdrawn = store.requestMembership({ add: [pair("u-cph")], ...meta });
  const roleChange = store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta);
  assert.equal(store.blockingRoleChange(addition).id, roleChange.id);
  assert.match(store.approvalBlockReason(addition), /待审核/);
  assert.equal(store.withdrawRequest(withdrawn.id).status, "withdrawn");
  reviewer(store);
  const preview = store.reviewPreview(addition.id);
  assert.ok(preview);
  assert.throws(() => store.reviewRequest(addition.id, "approved", "", preview.token), error => error.requestId === roleChange.id);
  assert.equal(store.requests().find(request => request.id === addition.id).status, "pending");
  assert.equal(store.reviewRequest(rejected.id, "rejected", "暂不分配").status, "rejected");
  store.reviewRequest(roleChange.id, "rejected", "维持现状");
  assert.equal(store.blockingRoleChange(addition), null);
  assert.equal(store.approvalBlockReason(addition), "");
  assert.equal(store.reviewRequest(addition.id, "approved").status, "approved");
  assert.deepEqual([...store.effectiveMenus("u-wu")], ["knowledge"]);

  admin(store);
  const otherAddition = store.requestMembership({ add: [pair("u-hou")], ...meta });
  const disable = store.requestLifecycle("role", KNOWLEDGE, "disable", meta);
  assert.equal(store.blockingRoleChange(otherAddition).id, disable.id);
  store.withdrawRequest(disable.id);
  assert.equal(store.blockingRoleChange(otherAddition), null);
  assert.equal(store.approvalBlockReason(otherAddition), "");
  const replacement = store.requestLifecycle("role", KNOWLEDGE, "disable", meta);
  approve(store, replacement);
  assert.equal(store.requests().find(request => request.id === otherAddition.id).status, "invalid");
  assert.deepEqual([...store.effectiveMenus("u-hou")], []);
});

test("角色菜单扩权和启停必须送审，审核通过后撤权并更新待审范围", () => {
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
  const pause = store.requestLifecycle("role", KNOWLEDGE, "disable", meta);
  assert.deepEqual([...store.effectiveMenus("u-lp")].sort(), ["analysis", "knowledge"]);
  approve(store, pause);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  assert.throws(() => store.toggleRole(KNOWLEDGE), /理由/);
  const restore = store.requestEnable("role", KNOWLEDGE, meta);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  reviewer(store);
  store.reviewRequest(restore.id, "approved");
  assert.deepEqual([...store.effectiveMenus("u-lp")].sort(), ["analysis", "knowledge"]);
});

test("整单任一目标失效不发放权限，撤回与驳回不能生效", () => {
  const store = setup();
  const batch = store.requestMembership({ add: [pair("u-wu"), pair("u-hou")], ...meta });
  approve(store, store.changeRoleMenus(KNOWLEDGE, ["analysis"], meta));
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
  assert.throws(() => store.changeRoleMenus("3", ["knowledge"], meta), /预设|保留/);
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

test("撤销需要审核且禁止重复申请，重新启用用户不会跳过审核", () => {
  const store = setup();
  const replace = store.requestMembership({ add: [pair("u-lp", TOOL)], remove: [pair("u-lp")], ...meta });
  assert.throws(() => store.revokeMembership([pair("u-lp")], meta), /待审核/);
  store.withdrawRequest(replace.id);
  assert.throws(() => store.revokeMembership([pair("u-lp")]), /原因|理由/);
  const revoke = store.revokeMembership([pair("u-lp")], meta);
  assert.equal(revoke.status, "pending");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  approve(store, revoke);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  approve(store, store.requestLifecycle("user", "u-yym", "disable", meta));
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
  assert.throws(() => store.createUserWithRequest(profile, [], meta), /至少选择一个角色/);
  assert.throws(() => store.addUser(profile), /至少选择一个角色/);
  assert.throws(() => store.createUserWithRequest(profile, ["missing"], meta), /不存在/);
  assert.throws(() => store.createUserWithRequest(profile, [KNOWLEDGE]), /理由/);
  assert.equal(store.users().length, before);
  assert.equal(store.requests().length, 0);
  const { user, request } = store.createUserWithRequest(profile, [KNOWLEDGE, TOOL], meta);
  assert.equal(request.items.length, 2);
  assert.equal(request.items[0].userId, user.id);
  assert.equal(store.users().length, before + 1);
  assert.deepEqual([...store.effectiveMenus(user.id)], []);
});

test("初始停用的用户也必须申请角色，授权和启用均通过后才可使用菜单", () => {
  const store = setup();
  const profile = { username: "disabled@example.test", status: "disabled" };
  assert.throws(() => store.createUserWithRequest(profile, [], meta), /至少选择一个角色/);
  const { user, request } = store.createUserWithRequest(profile, [KNOWLEDGE], meta);
  assert.equal(user.status, "disabled");
  assert.equal(request.status, "pending");
  assert.deepEqual([...request.impact[0].requestedMenus], []);
  approve(store, request);
  assert.deepEqual([...store.users().find(item => item.id === user.id).roleIds], [KNOWLEDGE]);
  assert.deepEqual([...store.effectiveMenus(user.id)], []);
  assert.throws(() => store.requestMembership({ add: [pair(user.id, TOOL)], ...meta }), /启用/);
  approve(store, store.requestLifecycle("user", user.id, "enable", meta));
  assert.deepEqual([...store.effectiveMenus(user.id)], ["knowledge"]);
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

test("编辑用户单独撤销角色提交申请，只有通过后生效", () => {
  const store = setup();
  const remove = [pair("u-lp")];
  assert.throws(() => store.saveUserEdit("u-lp", {}, { remove }), /原因|理由/);
  const request = store.saveUserEdit("u-lp", {}, { remove, ...meta });
  assert.equal(request.status, "pending");
  assert.equal(request.reason, meta.reason);
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  approve(store, request);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
});

test("空角色可直接保存菜单，旧分配单失效且首次分配须按新配置审批", () => {
  const storage = new Map();
  const store = setup(storage);
  const role = store.addRole({ name: "空角色", code: "blank" });
  const pending = store.requestMembership({ add: [pair("u-wu", role.id)], ...meta });
  const legacy = store.requestMembership({ add: [pair("u-hou", role.id)], ...meta });
  downgradeRequest(store, storage, legacy.id);
  const draft = store.previewRoleChange(role.id, ["knowledge"]);
  assert.equal(draft.requiresApproval, false);
  assert.deepEqual([...draft.invalidatedRequests].sort(), [pending.id, legacy.id].sort());
  assert.equal(store.changeRoleMenus(role.id, ["knowledge"], { expectedImpact: draft.token }), null);
  const saved = store.roles().find((item) => item.id === role.id);
  assert.deepEqual([...saved.menuPermissions], ["knowledge"]);
  assert.equal(saved.scopeRevision, 1);
  assert.equal(store.requests().length, 2);
  assert.equal(store.requests().find((item) => item.id === pending.id).status, "invalid");
  assert.equal(store.requests().find((item) => item.id === legacy.id).status, "invalid");
  const event = JSON.parse(storage.get(store.KEY)).events[0];
  assert.equal(event.actor.id, "iam-admin");
  assert.equal(event.roleId, role.id);
  assert.deepEqual(event.previousMenus, []);
  assert.deepEqual(event.nextMenus, ["knowledge"]);
  assert.deepEqual([...store.effectiveMenus("u-wu")], []);
  const replacement = store.requestMembership({ add: [pair("u-wu", role.id)], ...meta });
  assert.deepEqual([...replacement.impact[0].requestedMenus], ["home", "knowledge"]);
  approve(store, replacement);
  assert.deepEqual([...store.effectiveMenus("u-wu")], ["knowledge"]);
});

test("零成员角色的直接保存须重新核对后来进入的分配申请", () => {
  const store = setup();
  const role = store.addRole({ name: "空角色", code: "blank" });
  const draft = store.previewRoleChange(role.id, ["knowledge"]);
  const pending = store.requestMembership({ add: [pair("u-wu", role.id)], ...meta });
  assert.throws(() => store.changeRoleMenus(role.id, ["knowledge"], { expectedImpact: draft.token }), /请核对最新信息/);
  const fresh = store.previewRoleChange(role.id, ["knowledge"]);
  assert.deepEqual([...fresh.invalidatedRequests], [pending.id]);
  const disable = store.requestLifecycle("role", role.id, "disable", meta);
  assert.throws(() => store.changeRoleMenus(role.id, ["knowledge"], { expectedImpact: fresh.token }), error => error.requestId === disable.id);
});

test("首次分配先通过时，旧的零成员菜单编辑不能直接保存", () => {
  const storage = new Map();
  const editor = setup(storage);
  const reviewerTab = setup(storage);
  const role = editor.addRole({ name: "空角色", code: "blank" });
  const membership = editor.requestMembership({ add: [pair("u-wu", role.id)], ...meta });
  const draft = editor.previewRoleChange(role.id, ["knowledge"]);
  reviewer(reviewerTab);
  reviewerTab.reviewRequest(membership.id, "approved");

  assert.throws(() => editor.saveRoleEdit(role.id, { remark: "本次保存" }, ["knowledge"], {
    expectedImpact: draft.token,
  }), /请核对最新信息/);
  assert.deepEqual([...editor.effectiveMenus("u-wu")], []);
  assert.equal(editor.roles().find(item => item.id === role.id).remark, undefined);

  const fresh = editor.previewRoleChange(role.id, ["knowledge"]);
  assert.equal(fresh.requiresApproval, true);
  const request = editor.changeRoleMenus(role.id, ["knowledge"], { ...meta, expectedImpact: fresh.token });
  assert.equal(request.status, "pending");
  assert.deepEqual([...editor.effectiveMenus("u-wu")], []);
});

test("有停用成员的角色以及零成员角色的状态变更仍须审核", () => {
  const store = setup();
  const role = store.addRole({ name: "空角色", code: "blank" });
  const draft = store.previewRoleChange(role.id, ["knowledge"], "disabled");
  assert.equal(draft.requiresApproval, true);
  const disable = store.saveRoleEdit(role.id, { status: "disabled" }, ["knowledge"], { ...meta, expectedImpact: draft.token });
  assert.equal(disable.type, "disable-role");
  assert.deepEqual([...store.roles().find(item => item.id === role.id).menuPermissions], []);

  approve(store, store.requestMembership({ add: [pair("u-wu", TOOL)], ...meta }));
  approve(store, store.requestLifecycle("user", "u-wu", "disable", meta));
  const occupied = store.previewRoleChange(TOOL, ["writing"]);
  assert.equal(occupied.requiresApproval, true);
  assert.equal(occupied.impact[0].id, "u-wu");
  assert.equal(store.changeRoleMenus(TOOL, ["writing"], meta).status, "pending");
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
  approve(store, store.requestLifecycle("role", KNOWLEDGE, "disable", meta));
  const request = store.saveRoleEdit(KNOWLEDGE, { status: "normal" }, ["writing"],
    { ...meta, originalMenus: ["knowledge"], originalStatus: "disabled" });
  assert.equal(request.type, "enable-role");
  assert.equal(store.requests().length, 2);
  assert.deepEqual([...store.effectiveMenus("u-lp")], []);
  reviewer(store);
  store.reviewRequest(request.id, "approved");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["writing"]);
});

test("移除旧版整组权限的其中一项和重新添加均须审批", () => {
  const storage = new Map([["baige.iam.v1", JSON.stringify({
    version: 1, users: [{ id: "u-demo", status: "normal", roleIds: ["r-demo"] }],
    roles: [{ id: "r-demo", status: "normal", userIds: ["u-demo"], menuPermissions: ["frontier"] }],
  })]]);
  const store = setup(storage);
  const shrink = store.saveRoleEdit("r-demo", {}, ["frontier:全球鹰"], meta);
  assert.equal(shrink.status, "pending");
  assert.deepEqual([...store.effectiveMenus("u-demo")], ["frontier"]);
  approve(store, shrink);
  assert.deepEqual([...store.effectiveMenus("u-demo")], ["frontier:全球鹰"]);
  assert.equal(store.saveRoleEdit("r-demo", {}, ["frontier:全球鹰", "frontier:智研通"], meta).status, "pending");
  assert.deepEqual([...store.effectiveMenus("u-demo")], ["frontier:全球鹰"]);
});

test("角色变更保留所有涉及用户，并展示各账号从其他角色继承的菜单", () => {
  const store = setup();
  approve(store, store.requestMembership({ add: [pair("u-lp", "27644551053344")], ...meta }));
  const before = JSON.stringify(store.roles());
  const draft = store.previewRoleChange(KNOWLEDGE, [], "normal");
  assert.equal(draft.changed, true);
  assert.equal(draft.impact.length, 5);
  assert.equal(JSON.stringify(store.roles()), before);
  const request = store.changeRoleMenus(KNOWLEDGE, [], meta);
  const retains = request.impact.find(user => user.id === "u-lp");
  assert.equal(retains.username, "lp@cimtec.net.cn");
  assert.equal(retains.department, "技术部");
  assert.deepEqual([...retains.currentMenus], ["home", "knowledge"]);
  assert.deepEqual([...retains.requestedMenus], ["home", "knowledge"]);
  assert.deepEqual([...request.impact.find(user => user.id === "u-yym").requestedMenus], ["home"]);
  assert.deepEqual([...request.items[0].currentMenus], ["knowledge"]);
  assert.deepEqual([...request.items[0].requestedMenus], []);
});

test("角色预览确认后，修改所选菜单或成员范围须重新预览", () => {
  const store = setup();
  const draft = store.previewRoleChange(KNOWLEDGE, [], "normal");
  assert.throws(() => store.saveRoleEdit(KNOWLEDGE, {}, ["analysis"], { ...meta, expectedImpact: draft.token }), /请核对最新信息/);
  approve(store, store.requestMembership({ add: [pair("u-wu")], ...meta }));
  assert.throws(() => store.saveRoleEdit(KNOWLEDGE, {}, [], { ...meta, expectedImpact: draft.token }), /请核对最新信息/);
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge"]);
  const fresh = store.previewRoleChange(KNOWLEDGE, [], "normal");
  const request = store.saveRoleEdit(KNOWLEDGE, {}, [], { ...meta, expectedImpact: fresh.token });
  assert.equal(request.impact.length, 6);
  assert.throws(() => store.requestLifecycle("role", KNOWLEDGE, "disable", meta), /待审核/);
  assert.doesNotThrow(() => store.updateRole(KNOWLEDGE, { remark: "资料仍可修改" }));
});

test("角色送审前展示的实际权限变化须重新核对，提交后同类变化只刷新比对", () => {
  const store = setup();
  const menus = ["knowledge", "analysis"];
  const draft = store.previewRoleChange(KNOWLEDGE, menus);
  approve(store, store.requestLifecycle("user", "u-lp", "disable", meta));
  assert.throws(() => store.changeRoleMenus(KNOWLEDGE, menus, { ...meta, expectedImpact: draft.token }), /请核对最新信息/);

  const fresh = store.previewRoleChange(KNOWLEDGE, menus);
  assert.equal(fresh.impact.find(person => person.id === "u-lp").status, "disabled");
  const submitted = store.changeRoleMenus(KNOWLEDGE, menus, { ...meta, expectedImpact: fresh.token });
  approve(store, store.requestLifecycle("user", "u-lp", "enable", meta));
  assert.equal(store.requests().find(request => request.id === submitted.id).status, "pending");
  assert.equal(store.reviewPreview(submitted.id).impact.find(person => person.id === "u-lp").status, "normal");
});

test("其他角色带来的权限变化只刷新审核比对，并记录批准时的实际变化", () => {
  const store = setup();
  const assignment = store.requestMembership({ add: [pair("u-lp", TOOL)], ...meta });
  const before = store.reviewPreview(assignment.id);
  approve(store, store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta));

  const fresh = store.reviewPreview(assignment.id);
  assert.equal(store.requests().find(request => request.id === assignment.id).status, "pending");
  assert.deepEqual([...fresh.impact[0].currentMenus], ["home", "knowledge", "writing"]);
  assert.notEqual(fresh.token, before.token);
  reviewer(store);
  assert.throws(() => store.reviewRequest(assignment.id, "approved", "", before.token), error => error.code === "IAM_REVIEW_CHANGED");
  assert.equal(store.requests().find(request => request.id === assignment.id).status, "pending");
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["knowledge", "writing"]);
  const approved = store.reviewRequest(assignment.id, "approved", "", fresh.token);
  assert.equal(approved.status, "approved");
  assert.deepEqual([...approved.impact[0].currentMenus], ["home", "knowledge"]);
  assert.deepEqual([...approved.approvedImpact[0].currentMenus], ["home", "knowledge", "writing"]);
  assert.deepEqual([...store.effectiveMenus("u-lp")], ["frontier", "knowledge", "writing"]);
});

test("角色变更只依赖成员关系，成员停用时刷新比对，移出成员时失效", () => {
  const store = setup();
  const change = store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta);
  approve(store, store.requestLifecycle("user", "u-lp", "disable", meta));
  const preview = store.reviewPreview(change.id);
  const user = preview.impact.find(person => person.id === "u-lp");
  assert.equal(user.status, "disabled");
  assert.deepEqual([...user.currentMenus], []);
  assert.deepEqual([...user.requestedMenus], []);
  approve(store, store.requestMembership({ remove: [pair("u-lp")], ...meta }));
  assert.equal(store.reviewPreview(change.id), null);
  assert.equal(store.requests().find(request => request.id === change.id).status, "invalid");
});

function writeV2Request(store, storage, request) {
  const data = JSON.parse(storage.get(store.KEY));
  const saved = data.requests.find(entry => entry.id === request.id);
  const userState = user => [user.status, user.stateRevision || 0];
  const roleState = role => [role.status, role.scopeRevision || 0, [...role.menuPermissions].sort()];
  const account = id => data.users.find(user => user.id === id);
  const role = id => data.roles.find(role => role.id === id);
  const accounts = saved.impact.map(({ id }) => {
    const user = account(id);
    return [id, userState(user), [...user.roleIds].sort().map(roleId => [roleId, roleState(role(roleId))])];
  });
  const targets = saved.items.map(item => {
    if (saved.type === "membership") {
      const user = account(item.userId);
      return [userState(user), roleState(role(item.roleId)), user.roleIds.includes(item.roleId)];
    }
    if (saved.type === "enable-user") return accounts.find(([id]) => id === item.userId).slice(1);
    if (item.userId) return [null, []];
    return [roleState(role(item.roleId)), accounts.map(([id, state]) => [id, state])];
  });
  saved.snapshotVersion = 2;
  saved.snapshot = JSON.stringify([JSON.stringify(targets), accounts]);
  storage.set(store.KEY, JSON.stringify(data));
}

test("完整 V2 申请可核对最新权限，但实际直接依赖变化仍使它失效", () => {
  const storage = new Map();
  const store = setup(storage);
  const assignment = store.requestMembership({ add: [pair("u-lp", TOOL)], ...meta });
  writeV2Request(store, storage, assignment);
  approve(store, store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta));
  assert.deepEqual([...store.reviewPreview(assignment.id).impact[0].currentMenus], ["home", "knowledge", "writing"]);
  approve(store, store.requestLifecycle("role", TOOL, "disable", meta));
  assert.equal(store.requests().find(request => request.id === assignment.id).status, "invalid");
});

test("完整 V2 停用申请保留旧版附加快照里的账号状态，其他角色变化不使其失效", () => {
  const storage = new Map();
  const store = setup(storage);
  const lifecycle = store.requestLifecycle("user", "u-lp", "disable", meta);
  writeV2Request(store, storage, lifecycle);
  approve(store, store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta));
  const latest = store.reviewPreview(lifecycle.id);
  assert.deepEqual([...latest.impact[0].currentMenus], ["home", "knowledge", "writing"]);
  assert.deepEqual([...latest.impact[0].requestedMenus], []);
  approve(store, lifecycle);
  assert.equal(store.users().find(user => user.id === "u-lp").status, "disabled");
});

test("完整 V2 启用申请按原账号状态和版本审查，兼容非零版本", () => {
  const storage = new Map();
  const store = setup(storage);
  approve(store, store.requestLifecycle("user", "u-lp", "disable", meta));
  const enable = store.requestLifecycle("user", "u-lp", "enable", meta);
  writeV2Request(store, storage, enable);
  approve(store, store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta));
  assert.deepEqual([...store.reviewPreview(enable.id).impact[0].requestedMenus], ["home", "knowledge", "writing"]);

  const data = JSON.parse(storage.get(store.KEY));
  data.users.find(user => user.id === "u-lp").stateRevision += 1;
  storage.set(store.KEY, JSON.stringify(data));
  assert.equal(store.reviewPreview(enable.id), null);
  reviewer(store);
  assert.equal(store.reviewRequest(enable.id, "approved").status, "invalid");
  assert.equal(store.users().find(user => user.id === "u-lp").status, "disabled");
});

function downgradeRequest(store, storage, requestId) {
  const data = JSON.parse(storage.get(store.KEY));
  const pending = data.requests.find(entry => entry.id === requestId);
  delete pending.snapshotVersion;
  delete pending.impact;
  storage.set(store.KEY, JSON.stringify(data));
}

test("旧版待审申请缺少完整账号快照时禁止批准，保留撤回和重新提交", () => {
  const storage = new Map();
  const store = setup(storage);
  const userId = "u-wu";
  const request = store.requestMembership({ add: [pair(userId)], ...meta });
  downgradeRequest(store, storage, request.id);
  assert.throws(() => store.requestMembership({ add: [pair(userId, TOOL)], ...meta }), error => error.requestId === request.id);
  reviewer(store);
  assert.equal(store.canReviewRequest(request.id), true);
  assert.throws(() => store.reviewRequest(request.id, "approved"), /缺少完整权限快照.*撤回后重新提交/);
  const pending = store.requests().find(entry => entry.id === request.id);
  assert.equal(pending.status, "pending");
  assert.match(store.approvalBlockReason(pending), /缺少完整权限快照/);
  assert.deepEqual([...store.effectiveMenus(userId)], []);
  admin(store);
  assert.equal(store.withdrawRequest(request.id).status, "withdrawn");
  const resubmitted = store.requestMembership({ add: [pair(userId)], ...meta });
  assert.equal(store.approvalBlockReason(resubmitted), "");
  approve(store, resubmitted);
  assert.deepEqual([...store.effectiveMenus(userId)], ["knowledge"]);
});

test("旧版待审申请仍可驳回，保留审批记录", () => {
  const storage = new Map();
  const store = setup(storage);
  const userId = "u-lp";
  const request = store.requestMembership({ remove: [pair(userId)], ...meta });
  downgradeRequest(store, storage, request.id);
  approve(store, store.changeRoleMenus(KNOWLEDGE, ["knowledge", "writing"], meta));
  reviewer(store);
  const rejected = store.reviewRequest(request.id, "rejected", "需要重新提交完整申请");
  assert.equal(rejected.status, "rejected");
  assert.equal(rejected.comment, "需要重新提交完整申请");
  assert.deepEqual([...store.effectiveMenus(userId)], ["knowledge", "writing"]);
});

test("新版申请缺失涉及账号的菜单快照时同样禁止批准", () => {
  const storage = new Map();
  const store = setup(storage);
  const request = store.requestMembership({ add: [pair("u-wu")], ...meta });
  const data = JSON.parse(storage.get(store.KEY));
  data.requests[0].impact = [];
  storage.set(store.KEY, JSON.stringify(data));
  reviewer(store);
  assert.throws(() => store.reviewRequest(request.id, "approved"), /缺少完整权限快照/);
  assert.deepEqual([...store.effectiveMenus("u-wu")], []);
});

test("账号资料变化供审批详情比较，申请时的账号信息和权限保持原样", () => {
  const store = setup();
  const userId = "u-wu";
  const request = store.requestMembership({ add: [pair(userId)], ...meta });
  store.updateUser(userId, { nickname: "吴昊", username: "renamed@example.com", department: "技术部" });
  const pending = store.requests()[0];
  assert.equal(pending.impact[0].username, "wuhao03@zkj.com");
  assert.equal(pending.impact[0].department, "HR部");
  assert.deepEqual([...pending.impact[0].currentMenus], ["home"]);
  assert.deepEqual(JSON.parse(JSON.stringify(store.changedUserIdentities(pending))), {
    [userId]: { id: userId, name: "吴昊", username: "renamed@example.com", department: "技术部" },
  });
  approve(store, request);
  assert.deepEqual([...store.effectiveMenus(userId)], ["knowledge"]);
});

test("审核详情的账号变更提示忽略其他用户和普通资料修改", () => {
  const store = setup();
  const request = store.requestMembership({ add: [pair("u-wu")], ...meta });
  store.updateUser("u-wu", { phone: "123", remark: "更新备注" });
  store.updateUser("u-hou", { nickname: "售后人员" });
  assert.deepEqual(Object.keys(store.changedUserIdentities(request)), []);
});

test("删除有成员的角色须审核并同步清理用户关系，受影响审核员不能处理", () => {
  const store = setup();
  approveAsSecondReviewer(store, store.requestMembership({ add: [pair("u-shen", TOOL)], ...meta }));
  const request = store.requestLifecycle("role", TOOL, "delete", meta);
  assert.ok(request.impact.some(user => user.id === "u-shen"));
  reviewer(store);
  assert.equal(store.canReviewRequest(request.id), false);
  assert.throws(() => store.reviewRequest(request.id, "approved"), /本人|受益/);
  admin(store);
  approveAsSecondReviewer(store, request);
  assert.equal(store.roles().some(role => role.id === TOOL), false);
  assert.equal(store.users().find(user => user.id === "u-shen").roleIds.includes(TOOL), false);
});

function approveAsSecondReviewer(store, request) {
  store.setActor("iam-reviewer-2");
  assert.equal(store.reviewRequest(request.id, "approved").status, "approved");
  admin(store);
}

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
  assert.match(userPage, /id="iamUserPager"/);
  assert.match(rolePage, /id="iamRolePager"/);
  assert.match(rolePage, /id="iamAddUsersPager"/);
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
