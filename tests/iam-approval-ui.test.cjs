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

function approvalView({ blockReason = "", impact, approvedImpact, overrides, status = "pending", actor = "reviewer", review, blocker } = {}) {
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
      actor: () => ({ id: actor, kind: actor }), requests: () => blocker ? [request, blocker] : [request],
      canReviewRequest: () => true, subscribe(callback) { onStoreChange = callback; },
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

test("申请列表直接列出新增和撤销的每个角色", () => {
  const items = [
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-1", roleName: "行业知识库上传" },
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-2", roleName: "百舸库审核员" },
    { userId: "u-1", userName: "林明", operation: "remove", roleId: "r-3", roleName: "企业库审核员" },
  ];
  for (const actor of ["admin", "reviewer"]) {
    const get = approvalView({ actor, overrides: { items } });
    const rows = get("approvalRows").innerHTML;
    assert.match(rows, /新增角色 行业知识库上传/);
    assert.match(rows, /新增角色 百舸库审核员/);
    assert.match(rows, /撤销角色 企业库审核员/);
  }
});

test("批量申请对部分用户适用的角色变更标明对应用户", () => {
  const items = [
    { userId: "u-1", userName: "林明", operation: "add", roleId: "r-1", roleName: "知识库管理员" },
    { userId: "u-2", userName: "陈宁", operation: "add", roleId: "r-1", roleName: "知识库管理员" },
    { userId: "u-2", userName: "陈宁", operation: "remove", roleId: "r-2", roleName: "企业库审核员" },
  ];
  const get = approvalView({ actor: "admin", status: "approved", overrides: { items } });
  const cell = get("approvalRows").innerHTML.split("</td>", 1)[0];
  assert.equal((cell.match(/新增角色 知识库管理员/g) || []).length, 1);
  assert.match(cell, /撤销角色 企业库审核员[\s\S]*陈宁/);
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

test("role details lead with exact menu changes and affected users before the complete permission comparison", () => {
  const get = approvalView({ overrides: { type: "menus", items: [{ roleId: "r-1", roleName: "知识库角色", currentMenus: ["home", "knowledge"], requestedMenus: ["home", "writing"] }] } });
  assert.match(get("approvalSubject").innerHTML, /知识库角色[\s\S]*涉及[\s\S]*1 人[\s\S]*新增[\s\S]*百舸写作[\s\S]*移除[\s\S]*知识库/);
  assert.match(get("approvalPeople").innerHTML, /原昵称[\s\S]*新增 1 项/);
  assert.match(get("approvalChangesTitle").textContent, /查看完整角色权限对比/);
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
