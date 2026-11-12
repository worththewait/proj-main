const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadStore() {
  const memory = new Map();
  const window = { dispatchEvent() {} };
  const localStorage = {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
  };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const context = vm.createContext({ window, localStorage, console, JSON, Math, Number, String, Object, Array, CustomEvent });
  vm.runInContext(read("src/portal-news-store.js"), context, { filename: "portal-news-store.js" });
  return window.BaigePortalNewsStore;
}

test("后台挂载「门户 / 动态发布」入口", () => {
  assert.match(read("admin.html"), /data-admin-view="portal-news"[\s\S]*动态发布/);
  const admin = read("admin.js");
  assert.match(admin, /"portal-news": \{ src: "pages\/portal-news-admin\.html/);
});

test("动态发布页具备查询区、八列表格与抽屉表单", () => {
  const html = read("pages/portal-news-admin.html");
  for (const token of [
    "门户管理", "动态发布", "公告列表", "pnNew",
    "pnFilterTitle", "pnFilterType", "pnFilterStatus", "pnFilterFrom", "pnFilterTo", "pnSearch", "pnReset",
    "公告标题", "标签", "公告类型", "公告图片", "公告状态", "置顶状态", "发布时间", "操作",
    "pnTitle", "pnTag", "pnImage", "pnContent", "pnSort", "pnSave", "pnCancel",
    "草稿", "立即发布", "未置顶", "置顶", "普通公告", "活动报名公告",
  ]) assert.ok(html.includes(token), token);
  assert.match(html, /src\/portal-news-store\.js/);
  assert.match(html, /src\/portal-news-admin\.js/);
});

test("字数上限与表格操作与线上一致", () => {
  const html = read("pages/portal-news-admin.html");
  assert.match(html, /id="pnTitle" type="text" maxlength="50"/);
  assert.match(html, /<select class="pn-input pn-select-full" id="pnTag"/);
  const css = read("portal-news-admin.css");
  assert.match(css, /\.pn-drawer \{/);
  assert.match(css, /\.pn-btn-edit/);
  assert.match(css, /\.pn-btn-del/);
});

test("公告标签下拉由数据层的七类枚举生成", () => {
  const js = read("src/portal-news-admin.js");
  assert.match(js, /store\.TAGS\.map/);
  assert.match(js, /fillTags\(\)/);
  const store = loadStore();
  assert.equal(store.TAGS.length, 7);
  assert.ok(store.TAGS.includes("活动报名"));
});

test("发布后进入门户列表与首页，草稿不进入", () => {
  const store = loadStore();
  const draft = store.fromForm({ title: "草稿动态", tag: "测试", content: "草稿正文", status: "草稿", publishedAt: "2026-11-11 09:00:00" });
  store.upsert(draft);
  assert.equal(store.feed().some(item => item.title === "草稿动态"), false);
  assert.equal(store.latest(5).some(item => item.title === "草稿动态"), false);

  const published = store.fromForm({ title: "已发布动态", tag: "测试", content: "第一段\n\n第二段", status: "已发布", pinned: true, publishedAt: "2026-11-11 10:00:00" });
  store.upsert(published);
  assert.equal(store.feed()[0].title, "已发布动态");
  assert.equal(store.latest(1)[0].title, "已发布动态");
  assert.equal(JSON.stringify(store.latest(1)[0].body), JSON.stringify(["第一段", "第二段"]));
});

test("编辑保留原发布时间，删除后门户同步移除", () => {
  const store = loadStore();
  const created = store.fromForm({ title: "待编辑", tag: "测试", content: "正文", status: "已发布", publishedAt: "2026-11-11 10:00:00" });
  store.upsert(created);
  const before = store.find(created.id).publishedAt;
  store.upsert({ ...created, title: "已编辑", publishedAt: before });
  assert.equal(store.find(created.id).title, "已编辑");
  assert.equal(store.find(created.id).publishedAt, before);
  store.remove(created.id);
  assert.equal(store.find(created.id), null);
  assert.equal(store.feed().some(item => item.id === created.id), false);
});

test("新记录 id 自增且不与种子冲突", () => {
  const store = loadStore();
  const first = store.fromForm({ title: "A", tag: "T", content: "x", status: "已发布" });
  assert.equal(first.id, "36");
  store.upsert(first);
  const second = store.fromForm({ title: "B", tag: "T", content: "x", status: "已发布" });
  assert.equal(second.id, "37");
});
