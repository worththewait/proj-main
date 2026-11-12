const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadStore() {
  const memory = new Map();
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const window = { dispatchEvent() {} };
  const localStorage = {
    getItem: key => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
  };
  const context = vm.createContext({ window, localStorage, console, JSON, Math, Number, String, Object, Array, Date, CustomEvent });
  vm.runInContext(read("src/portal-consult-store.js"), context, { filename: "portal-consult-store.js" });
  return window.BaigeConsultStore;
}

test("留言咨询横幅与弹窗仅在门户首页加载", () => {
  const home = read("portal.html");
  assert.match(home, /class="portal-cta"/);
  assert.match(home, /assets\/partner-banner\.jpg/);
  assert.match(home, /class="portal-cta-action"[^>]*data-contact[^>]*>[\s\S]{0,200}留言咨询/);
  assert.match(home, /portal-consult-store\.js/);
  assert.match(home, /portal-contact\.js/);
  assert.doesNotMatch(home, />合作咨询</);

  for (const file of ["portal-news.html", "portal-news-detail.html", "portal-favorites.html"]) {
    assert.doesNotMatch(read(file), /portal-cta|data-contact|portal-(?:contact|consult-store)\.js/, file);
  }
});

test("横幅图片已入库，图内旧按钮已被抹平", () => {
  const asset = path.join(__dirname, "..", "assets", "partner-banner.jpg");
  assert.ok(fs.existsSync(asset), "缺少 assets/partner-banner.jpg");
  const html = read("portal.html");
  assert.match(html, /width="1920" height="736"/);
  assert.match(html, /alt="百舸 · 你的行业数智化合作伙伴"/);
});

test("留言咨询弹窗含咨询类型与四个字段", () => {
  const js = read("src/portal-contact.js");
  assert.match(js, /id="pcTitle">留言咨询</);
  assert.match(js, /请填写以下信息，我们将尽快与您联系/);
  assert.match(js, /name="consultType"/);
  assert.match(js, /请选择咨询类型/);
  for (const field of ["contactName", "company", "phone", "content"]) {
    assert.ok(js.includes(`name: "${field}"`) || js.includes(`name="${field}"`), field);
  }
  assert.match(js, /maxlength="50"/);
  assert.match(js, /请选择咨询类型/);
  assert.match(js, /请填写正确的联系电话/);
  assert.match(js, /store\.add\(/);
});

test("咨询类型为固定四类，门户与后台共用", () => {
  const store = loadStore();
  assert.equal(store.TYPES.join(","), "合作咨询,问题咨询,使用反馈,功能建议");
  const portal = read("src/portal-contact.js");
  assert.match(portal, /store\.TYPES|TYPES/);
  const admin = read("src/consult-admin.js");
  assert.match(admin, /store\.TYPES\.map/);
});

test("门户提交的留言进入后台列表（同一数据层）", () => {
  const store = loadStore();
  assert.equal(store.all().length, 3);
  const created = store.add({
    type: "问题咨询",
    name: "赵敏",
    company: "中船集团第七一九研究所",
    phone: "13611112222",
    content: "想问下数据标注平台是否支持私有化部署",
  });
  assert.equal(created.type, "问题咨询");
  assert.ok(created.createdAt);
  const list = store.all();
  assert.equal(list.length, 4);
  assert.equal(list[0].name, "赵敏");
  assert.match(list[0].createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test("后台留言咨询页复刻线上结构", () => {
  const html = read("pages/consult-admin.html");
  for (const token of [
    "门户管理", "留言咨询记录", "留言咨询列表管理", "导出",
    "csFrom", "csTo", "csName", "csPhone", "csType", "csKeyword", "搜索", "重置",
    "咨询时间", "咨询类型", "姓名", "单位", "联系电话", "咨询内容",
    "csCount", "csPager",
  ]) assert.ok(html.includes(token), token);
  assert.match(html, /src\/portal-consult-store\.js/);
  assert.match(html, /src\/consult-admin\.js/);

  const css = read("consult-admin.css");
  assert.match(css, /\.cs-table/);
  assert.match(css, /\.cs-type\[data-type="问题咨询"\]/);

  assert.match(read("admin.html"), /data-admin-view="consult"[\s\S]{0,120}留言咨询/);
  assert.match(read("admin.js"), /consult: \{ src: "pages\/consult-admin\.html/);
});

test("后台支持按类型与条件筛选并导出", () => {
  const js = read("src/consult-admin.js");
  assert.match(js, /item\.type !== type/);
  assert.match(js, /item\.content\)\.includes\(keyword\)/);
  assert.match(js, /text\/csv;charset=utf-8/);
  assert.match(js, /baige:portal-consults/);
  assert.match(js, /暂无数据/);
});
