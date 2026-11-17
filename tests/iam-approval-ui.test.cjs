const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load(file, context) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
}

function runComparison(context) {
  for (const file of ["src/data.js", "src/feature-config.js", "src/iam-menu-catalog.js", "src/pages/iam-menu-comparison.js"]) {
    load(file, context);
  }
  return context.window.BaigeIamMenuComparison;
}

function viewElement() {
  const handlers = new Map();
  return {
    handlers, value: "", selectedOptions: [], textContent: "", innerHTML: "",
    open: false,
    dataset: {},
    addEventListener: (event, fn) => handlers.set(event, fn),
    querySelector: () => viewElement(),
    querySelectorAll: () => [],
    focus() {}, setAttribute() {}, removeAttribute() {},
    showModal() { this.open = true; },
  };
}

function approvalView({
  blockReason = "", impact, approvedImpact, overrides, status = "pending",
  actor = "reviewer", activeActorId = actor, canReview = () => true, review, blocker,
} = {}) {
  const request = {
    id: "iam-1", type: "membership", status, createdAt: "2026-11-13", applicant: { id: "admin", name: "管理员" },
    items: [{ userId: "u-1", userName: "原昵称", operation: "add", roleId: "r-1", roleName: "知识库角色" }],
    impact: [{ id: "u-1", name: "原昵称", username: "old-account", department: "原部门", currentMenus: ["home"], requestedMenus: ["home", "knowledge"] }],
    approvedImpact, ...overrides,
  };
  let preview = { impact: impact || request.impact, token: "displayed-preview" };
  let currentBlocker = blocker;
  let onStoreChange;
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, viewElement());
      return elements.get(id);
    },
    querySelectorAll: () => [],
  };
  const window = {
    BaigeUI: { escapeHtml: String, hydrate() {} },
    BaigeIamStore: {
      actor: () => ({ id: activeActorId, kind: actor }), requests: () => blocker ? [request, blocker] : [request],
      canReviewRequest: () => canReview(activeActorId), subscribe(callback) { onStoreChange = callback; },
      approvalBlockReason: selected => selected.id === request.id && (!blocker || currentBlocker) ? blockReason : "",
      blockingRoleChange: selected => selected.id === request.id ? currentBlocker : null,
      reviewPreview: id => id === request.id ? ((blockReason && !blocker) || status !== "pending" ? null : preview) : { impact: [], token: "role-preview" },
      reviewRequest: review,
      withWriteLock: callback => callback(),
    },
  };
  const context = vm.createContext({ window, document, URLSearchParams, location: { search: "?request=iam-1", hash: "" } });
  runComparison(context);
  load("src/pages/admin-pagination.js", context);
  load("src/pages/role-approval.js", context);
  const get = id => document.getElementById(id);
  get.click = (targetSelector, target = {}) => get("approvalDrawer").handlers.get("click")({ target: {
    closest: selector => selector === targetSelector ? target : null,
  } });
  get.clickApprove = () => get.click("[data-approval-decision]", { dataset: { approvalDecision: "approved" } });
  get.switchReviewer = id => {
    activeActorId = id;
    onStoreChange();
  };
  get.replacePreview = (latest, notify = false) => {
    preview = latest;
    if (notify) onStoreChange();
  };
  get.resolveBlocker = () => {
    currentBlocker.status = "rejected";
    currentBlocker = null;
    onStoreChange();
  };
  return get;
}

test("a route with an ungranted child appears partially authorized", () => {
  const window = { BaigeUI: { escapeHtml: String } };
  const { render } = runComparison(vm.createContext({ window }));
  const html = render(["home", "qa:对话"], ["home", "qa:对话", "knowledge"], "审核通过后");
  const [before, after] = html.split('class="approval-compare-side"').slice(1);
  for (const side of [before, after]) {
    assert.match(side, /data-state="partial"[^>]*><\/span><span class="iam-compare-name">百舸问答/);
    assert.match(side, /data-state="absent"[^>]*><\/span><span class="iam-compare-name">智能问数/);
  }
  assert.match(before, /2 项/);
  assert.match(after, /3 项/);
});

test("申请列表按动作分组，显示角色预览并可展开完整名单", () => {
  const items = [
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-1", roleName: "行业知识库上传" },
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-2", roleName: "百舸库审核员" },
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-3", roleName: "企业库审核员" },
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-4", roleName: "行业知识库审核" },
    { userId: "u-1", userName: "林明", operation: "remove", roleId: "r-5", roleName: "旧授权角色" },
  ];
  for (const actor of ["admin", "reviewer"]) {
    const get = approvalView({ actor, overrides: { items, source: "用户管理 · 分配角色" } });
    const cell = get("approvalRows").innerHTML.split("</td>", 1)[0];
    assert.equal((cell.match(/>新增<\/span>/g) || []).length, 1);
    assert.equal((cell.match(/>撤销<\/span>/g) || []).length, 1);
    assert.match(cell, /<summary[^>]*>[\s\S]*行业知识库上传[\s\S]*百舸库审核员[\s\S]*\+3[\s\S]*\+2[\s\S]*<\/summary>/);
    assert.match(cell, /<li>企业库审核员<\/li>[\s\S]*<li>行业知识库审核<\/li>/);
    assert.match(cell, /旧授权角色[\s\S]*用户管理 · 分配角色/);
  }
});

test("批量申请列表汇总角色和人数，详情为每个用户显示对应变更", () => {
  const items = [
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-1", roleName: "知识库管理员" },
    { userId: "u-2", userName: "陈宁", operation: "add", roleId: "r-1", roleName: "知识库管理员" },
    { userId: "u-2", userName: "陈宁", operation: "remove", roleId: "r-2", roleName: "企业库审核员" },
  ];
  const people = items.slice(0, 2).map(item => ({
    id: item.userId, name: item.userName, currentMenus: ["home"], requestedMenus: ["home", "knowledge"],
  }));
  const get = approvalView({ actor: "admin", status: "approved", overrides: { items, impact: people } });
  const rows = get("approvalRows").innerHTML;
  const cell = rows.split("</td>", 1)[0];
  assert.equal((cell.match(/>知识库管理员</g) || []).length, 1);
  assert.match(cell, /撤销[\s\S]*企业库审核员/);
  assert.doesNotMatch(cell, /适用用户|陈宁/);
  assert.match(rows, /林明 等 2 人/);
  assert.match(get("approvalPeople").innerHTML, /data-user-id="u-2"[\s\S]*陈宁[\s\S]*撤销 企业库审核员/);
});

test("splitting a route across home categories does not turn a partial route into a full grant", () => {
  const entries = new Map();
  const window = { BaigeUI: { escapeHtml: String }, localStorage: {
    getItem: key => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
  } };
  const { render } = runComparison(vm.createContext({ window }));
  window.BaigeFeatureConfig.saveFeature("route:qa:智能问数", { homeCategory: "tools-platforms" });
  const html = render(["qa:对话"], ["qa:对话", "qa:智能问数"], "审核通过后");
  const [before, after] = html.split('class="approval-compare-side"').slice(1);
  assert.equal((before.match(/data-state="partial"[^>]*><\/span><span class="iam-compare-name">百舸问答/g) || []).length, 2);
  assert.equal((after.match(/data-state="granted"[^>]*><\/span><span class="iam-compare-name">百舸问答/g) || []).length, 2);
});

test("pending identity changes show both current and submitted account details", () => {
  const get = approvalView({ impact: [{ id: "u-1", name: "现昵称", username: "new-account", department: "现部门", currentMenus: ["home"], requestedMenus: ["home", "knowledge"] }] });
  const subject = get("approvalSubject").innerHTML;
  assert.match(subject, /现昵称[\s\S]*new-account[\s\S]*现部门/);
  assert.match(subject, /提交时[\s\S]*原昵称[\s\S]*old-account[\s\S]*原部门/);
  assert.match(subject, /新增 知识库角色/);
  assert.match(get("approvalItems").innerHTML, /当前权限/);
  assert.match(get("approvalItems").innerHTML, /查看实时权限/);
  assert.match(get("approvalChangesTitle").textContent, /查看完整账号权限对比/);
});

test("closed requests continue to show the frozen account identity", () => {
  const get = approvalView({ status: "approved", approvedImpact: [{ id: "u-1", name: "现昵称", username: "new-account", department: "现部门", currentMenus: ["home"], requestedMenus: ["home", "knowledge"] }] });
  assert.match(get("approvalSubject").innerHTML, /原昵称[\s\S]*old-account[\s\S]*原部门/);
  assert.doesNotMatch(get("approvalSubject").innerHTML, /现昵称|new-account|现部门/);
});

test("pending details disclose changed impact and approved history uses the approval snapshot", () => {
  const impact = [{ id: "u-1", name: "原昵称", currentMenus: ["home", "knowledge"], requestedMenus: ["home", "knowledge"] }];
  const pending = approvalView({ impact });
  assert.match(pending("approvalImpactUpdate").textContent, /已更新/);
  assert.match(pending("approvalSubject").innerHTML, /实际权限无变化/);
  const approved = approvalView({ status: "approved", approvedImpact: impact });
  assert.match(approved("approvalItems").innerHTML, /变更前[\s\S]*2 项[\s\S]*变更后[\s\S]*2 项/);
});

test("role details show one role comparison and a paged member list without individual permission trees", () => {
  const people = Array.from({ length: 12 }, (_, index) => ({
    id: `u-${index}`, name: `成员${index}`, username: `account${index}`, department: "技术部", status: index ? "normal" : "disabled",
  }));
  const get = approvalView({ impact: people, overrides: {
    type: "menus", impact: people,
    items: [{ roleId: "r-1", roleName: "知识库角色", currentMenus: ["home", "knowledge"], requestedMenus: ["home", "writing"] }],
  } });
  assert.match(get("approvalSubject").innerHTML, /知识库角色/);
  assert.doesNotMatch(get("approvalSubject").innerHTML, /实际权限/);
  assert.equal(get("approvalChanges").open, true);
  assert.equal(get("approvalChangesTitle").textContent, "角色权限对比");
  assert.match(get("approvalItems").innerHTML, /变更前[\s\S]*审核通过后/);
  assert.match(get("approvalItems").innerHTML, /新增/);
  assert.equal(get("approvalPeopleTitle").textContent, "涉及用户（12 人）");
  assert.equal(get("approvalPeople").innerHTML, "");
  assert.match(get("approvalRoleMemberRows").innerHTML, /成员0[\s\S]*account0[\s\S]*技术部[\s\S]*停用/);
  assert.doesNotMatch(get("approvalRoleMemberRows").innerHTML, /成员10|完整账号权限对比|实际权限|data-approval-preview/);
  get("approvalRoleMemberPager").handlers.get("click")({ target: { closest: () => ({ dataset: { adminPage: "2" } }) } });
  assert.match(get("approvalRoleMemberRows").innerHTML, /成员10[\s\S]*成员11/);
  assert.doesNotMatch(get("approvalRoleMemberRows").innerHTML, />成员0</);
});

test("closed role history uses submitted member identity without an account permission comparison", () => {
  const get = approvalView({ status: "approved", approvedImpact: [{ id: "u-1", name: "现名字", username: "new-account", department: "新部门", status: "normal" }], overrides: {
    type: "menus", items: [{ roleId: "r-1", roleName: "知识库角色", currentMenus: ["knowledge"], requestedMenus: ["writing"] }],
  } });
  assert.match(get("approvalRoleMemberRows").innerHTML, /原昵称[\s\S]*old-account[\s\S]*原部门/);
  assert.doesNotMatch(get("approvalRoleMemberRows").innerHTML, /现名字|new-account|完整账号权限对比/);
  assert.match(get("approvalItems").innerHTML, /变更后/);
});

test("the compact role tree expands changed branches while unchanged branches stay collapsed", () => {
  const window = { BaigeUI: { escapeHtml: String } };
  const { render } = runComparison(vm.createContext({ window }));
  const html = render(["knowledge", "smart-tools:文本翻译"], ["knowledge", "smart-tools:文档翻译"], "审核通过后", "变更前", { collapseUnchanged: true });
  assert.match(html, /<details open>/);
  assert.match(html, /<details>/);
});

test("approval sends the displayed preview token and a race requires another click", async () => {
  const tokens = [];
  const get = approvalView({ review(id, decision, comment, token) {
    tokens.push(token);
    if (token === "displayed-preview") throw Object.assign(new Error("申请影响已更新，请核对最新权限后重新审核。"), { code: "IAM_REVIEW_CHANGED" });
    return { status: "approved" };
  } });
  get.replacePreview({ impact: [{ id: "u-1", name: "原昵称", currentMenus: ["home"], requestedMenus: ["home", "writing"] }], token: "fresh-preview" });
  get.clickApprove();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(tokens, ["displayed-preview"]);
  assert.match(get("approvalFeedback").textContent, /请核对最新权限后重新审核/);
  get.clickApprove();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(tokens, ["displayed-preview", "fresh-preview"]);
});

test("changes in a visible pending preview prompt the reviewer to recheck while keeping the comparison open", () => {
  const get = approvalView();
  get("approvalChanges").open = true;
  get.replacePreview({ impact: [{ id: "u-1", name: "现昵称", currentMenus: ["home"], requestedMenus: ["home", "knowledge"] }], token: "changed-identity" }, true);
  assert.equal(get("approvalChanges").open, true);
  assert.match(get("approvalSubject").innerHTML, /现昵称/);
  assert.match(get("approvalFeedback").textContent, /请核对/);
});

test("incomplete pending legacy snapshots block approval and still allow rejection or withdrawal", () => {
  const reason = "旧版申请缺少完整权限快照，请撤回后重新提交。";
  const reviewer = approvalView({ blockReason: reason });
  assert.equal(reviewer("approvalBlockReason").textContent, reason);
  assert.equal(reviewer("approvalBlockReason").hidden, false);
  assert.match(reviewer("approvalActions").innerHTML, /data-approval-decision="approved"[^>]* disabled/);
  assert.match(reviewer("approvalActions").innerHTML, /data-approval-decision="rejected">/);
  const admin = approvalView({ blockReason: reason, actor: "admin" });
  assert.equal(admin("approvalBlockReason").textContent, reason);
  assert.match(admin("approvalActions").innerHTML, /data-approval-ask-withdraw/);
});

test("an open approval reflects reviewer eligibility in both directions when the active reviewer changes", () => {
  const get = approvalView({ activeActorId: "iam-reviewer", canReview: id => id === "iam-reviewer-2" });
  const blockedReason = "当前审核员是申请发起人或涉及用户，请切换其他审核员。";
  const block = get("approvalBlockReason");
  const actions = get("approvalActions");
  const drawer = get("approvalDrawer");

  assert.equal(drawer.open, true);
  assert.equal(block.textContent, blockedReason);
  assert.equal(block.hidden, false);
  assert.doesNotMatch(actions.innerHTML, /data-approval-decision=/);

  get.switchReviewer("iam-reviewer-2");
  assert.equal(drawer.open, true);
  assert.equal(block.hidden, true);
  assert.equal(get("approvalFeedback").textContent, "");
  assert.match(actions.innerHTML, /data-approval-decision="approved">/);
  assert.match(actions.innerHTML, /data-approval-decision="rejected">/);

  get.switchReviewer("iam-reviewer");
  assert.equal(drawer.open, true);
  assert.equal(block.textContent, blockedReason);
  assert.equal(block.hidden, false);
  assert.doesNotMatch(actions.innerHTML, /data-approval-decision=/);
});

test("blocked reviewer can open the role application in the same drawer and return to the original assignment", () => {
  const reason = "请先处理该角色的权限变更申请。";
  const blocker = {
    id: "iam-role", type: "menus", status: "pending", applicant: { id: "admin", name: "管理员" }, impact: [],
    items: [{ roleId: "r-1", roleName: "知识库角色", currentMenus: ["home"], requestedMenus: ["home", "knowledge"] }],
  };
  const get = approvalView({ blockReason: reason, blocker });
  assert.equal(get("approvalBlockReason").textContent, reason);
  assert.match(get("approvalActions").innerHTML, /data-approval-decision="approved"[^>]* disabled/);
  assert.match(get("approvalActions").innerHTML, /data-approval-decision="rejected">/);
  assert.equal(get("approvalBlockingRole").dataset.approvalBlockingRole, "iam-role");
  get("approvalComment").value = "草拟的审核意见";
  get.click("[data-approval-blocking-role]", get("approvalBlockingRole"));
  assert.equal(get("approvalDrawerTitle").textContent, "角色菜单变更申请");
  assert.equal(get("approvalDrawerBack").textContent, "返回授权申请");
  get.resolveBlocker();
  get.click("#approvalDrawerBack", get("approvalDrawerBack"));
  assert.equal(get("approvalDrawerTitle").textContent, "新增角色授权申请");
  assert.equal(get("approvalComment").value, "草拟的审核意见");
  assert.match(get("approvalActions").innerHTML, /data-approval-decision="approved">/);
  assert.equal(get("approvalBlockingRole").hidden, true);
});

test("simultaneous role status and menu changes show one configured permission comparison", () => {
  const get = approvalView({ overrides: { type: "disable-role", items: [{
    roleId: "r-1", roleName: "知识库角色", operation: "disable", currentMenus: ["knowledge"], requestedMenus: [],
    currentConfiguredMenus: ["knowledge"], requestedConfiguredMenus: ["knowledge", "writing"],
  }] } });
  assert.match(get("approvalSubject").innerHTML, /正常 → 停用/);
  const html = get("approvalItems").innerHTML;
  assert.equal((html.match(/class="approval-compare"/g) || []).length, 1);
  assert.match(html, /百舸写作/);
});
