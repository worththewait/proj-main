const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");

function storage() {
  const map = new Map();
  return {
    map,
    localStorage: {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: (key) => map.delete(key),
    },
  };
}

function loadStore(box) {
  const window = {
    localStorage: box.localStorage,
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = { window, console, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } };
  vm.createContext(context);
  vm.runInContext(read("src/permission-store.js"), context);
  return window.BaigePermissionStore;
}

test("permission applications seed, persist and create pending requests", () => {
  const box = storage();
  const store = loadStore(box);
  const current = store.currentApplicant();
  assert.equal(current.email, "admin@cimtec.net.cn");
  assert.equal(store.list(current.email).length, 2);
  assert.equal(store.hasPending(current.email, "qa", "智能问数"), true);
  const before = store.list().length;
  const record = store.create(current, "需要在前沿工具中检索研究资料", [
    { key: "f:frontier:智研通", type: "function", name: "智研通", route: "frontier", child: "智研通", status: "pending" },
    { key: "d:industry-standard", type: "data", name: "船舶标准知识库", kbId: "industry-standard", scope: "行业", status: "pending" },
  ]);
  assert.equal(store.list().length, before + 1);
  assert.equal(record.status, "pending");
  assert.equal(store.hasPending(current.email, "frontier", "智研通"), true);
  assert.ok(box.map.has("baige.permission.requests.v1"));
});

test("approving one item grants only that function and keeps partial status", () => {
  const box = storage();
  const store = loadStore(box);
  const current = store.currentApplicant();
  const pending = store.list(current.email).find((item) => item.id === "AP20261102001");
  assert.ok(pending);
  const decisions = {};
  pending.items.forEach((item) => { decisions[item.key] = item.type === "function" ? "approved" : "rejected"; });
  const updated = store.review(pending.id, decisions, "功能通过，知识库暂不开放", "系统管理员");
  assert.equal(updated.status, "partial");
  assert.equal(store.hasPending(current.email, "qa", "智能问数"), false);
  const grants = JSON.parse(box.map.get("baige.permission.grants.v1"));
  assert.equal(grants[current.email]["qa:智能问数"], true);
  assert.equal(grants[current.email]["enterprise-qa"], undefined);
});

test("approved function grants are visible to the shared permission check", () => {
  const box = storage();
  const store = loadStore(box);
  const current = store.currentApplicant();
  const pending = store.list(current.email).find((item) => item.id === "AP20261102001");
  store.review(pending.id, { "f:qa:智能问数": "approved", "d:enterprise-qa": "approved" }, "同意", "系统管理员");
  box.localStorage.setItem("baige.account.email", current.email);
  const window = { localStorage: box.localStorage, BaigeAccountProfile: current };
  const context = { window, console };
  vm.createContext(context);
  vm.runInContext(read("src/data.js"), context);
  assert.equal(window.BaigePermissions.canOpen("qa", "智能问数"), true);
  assert.equal(window.BaigePermissions.canOpen("frontier", "智研通"), false);
});

test("permission center can switch between simulated people and their grants", () => {
  const box = storage();
  const store = loadStore(box);
  const people = store.people();
  assert.equal(people.length, 5);
  assert.equal(store.applicantFor("limingyuan@cimtec.net.cn").name, "李明远");
  assert.equal(store.isGranted("wangzhenguo@cimtec.net.cn", "qa", "智能问数"), false);
  assert.equal(store.isGranted("admin@cimtec.net.cn", "qa", "智能问数"), false);
  assert.equal(store.isGranted("limingyuan@cimtec.net.cn", "qa", "智能问数"), false);
  const html = read("src/permission-center.js");
  assert.match(html, /id="pcPerson"/);
  assert.match(html, /function switchViewer/);
  assert.match(html, /store\.isGranted\(viewer\.email/);
  assert.match(html, /let activeTab = "mine"/);
  assert.match(html, /data-pc-apply/);
  assert.match(html, /data-pc-back/);
  assert.match(html, /showTab\(requested \? "apply" : "mine"\)/);
  assert.match(html, /function resultGroupsHtml/);
  assert.match(html, /pc-result-group/);
  assert.match(html, /pc-result-data-group/);
  assert.doesNotMatch(html, /pc-result-type/);
  assert.match(html, /data-pc-select-all/);
  assert.match(html, /pcSelectAllFunctions/);
  assert.match(read("permission-center.css"), /\.pc-function-actions/);
  assert.doesNotMatch(read("src/pages/permission-review.js"), /pr-item-name"><em/);
});

test("permission center and admin review are wired into the platform", () => {
  const index = read("index.html");
  const account = read("src/account.js");
  const admin = read("admin.html");
  const adminJs = read("admin.js");
  assert.match(index, /permission-store\.js/);
  assert.match(index, /permission-center\.js/);
  assert.match(index, /permission-center\.css/);
  assert.match(account, /\["permission", "shield", "权限申请"\]/);
  assert.match(account, /BaigePermissionCenter\?\.open/);
  assert.match(admin, /data-admin-view="access"/);
  assert.match(admin, />权限审核</);
  assert.match(adminJs, /permission-review\.html/);
  assert.ok(fs.existsSync(path.join(project, "pages/permission-review.html")));
});
