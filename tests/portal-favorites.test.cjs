const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadFavorites() {
  const store = new Map();
  const window = {
    BaigePortalNews: { NEWS: [{ id: 33, title: "示例一", date: "2026-09-24", thumb: "is-a", body: ["x"], byline: "", tag: "t" }, { id: 28, title: "示例二", date: "2026-09-24", thumb: "is-b", body: ["x"], byline: "", tag: "t" }] },
    addEventListener() {},
  };
  const localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
  const document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({ style: {}, append() {}, select() {}, remove() {}, setAttribute() {} }),
    body: { append() {} },
  };
  const context = vm.createContext({ window, document, localStorage, console, setTimeout, clearTimeout, navigator: {} });
  vm.runInContext(read("src/portal-favorites.js"), context, { filename: "portal-favorites.js" });
  return { tool: window.BaigePortalFavorites, store };
}

test("详情页提供收藏与分享，并在顶部和底部各留返回", () => {
  const js = read("src/portal-news.js");
  assert.match(js, /data-fav-toggle/);
  assert.match(js, /data-share=/);
  assert.match(js, /data-fav-label>收藏</);
  assert.match(js, /class="portal-detail-head"/);
  assert.match(js, /class="portal-back-link"/);
  assert.match(js, /class="portal-article-back"/);
  assert.match(read("portal.css"), /\.portal-article-actions/);
  assert.match(read("portal.css"), /\.portal-act\.is-on/);
});

test("收藏入口下沉到最新动态页，不占顶栏也不显示数量", () => {
  const news = read("portal-news.html");
  assert.match(news, /class="portal-fav-link" href="\.\/portal-favorites\.html"/);
  assert.doesNotMatch(news, /data-fav-count/);
  for (const file of ["portal.html", "portal-news-detail.html", "portal-favorites.html"]) {
    assert.doesNotMatch(read(file), /class="portal-fav-entry"/, file);
  }
  for (const file of ["portal-news-detail.html", "portal-favorites.html"]) {
    assert.match(read(file), /portal-favorites\.js/, file);
  }
});

test("收藏写入本地存储并可再次取消", () => {
  const { tool, store } = loadFavorites();
  assert.equal(tool.read().length, 0);
  assert.equal(tool.toggle("33"), true);
  assert.equal(tool.has("33"), true);
  assert.deepEqual(JSON.parse(store.get(tool.KEY)), ["33"]);
  assert.equal(tool.toggle("33"), false);
  assert.equal(tool.has("33"), false);
  assert.deepEqual(JSON.parse(store.get(tool.KEY)), []);
});

test("收藏页渲染列表，无收藏时给出空状态", () => {
  const js = read("src/portal-favorites.js");
  assert.match(js, /data-favorites-list/);
  assert.match(js, /data-favorites-count/);
  assert.match(js, /portal-feed-item/);
  assert.match(js, /还没有收藏任何动态/);
  assert.match(js, /portal-news\.html/);
  const html = read("portal-favorites.html");
  assert.match(html, /我的收藏/);
  assert.match(html, /data-favorites-list/);
});

test("分享只复制干净链接，不带来源参数", () => {
  const js = read("src/portal-favorites.js");
  assert.match(js, /location\.href\.split\("\?"\)\[0\]/);
  assert.match(js, /navigator\.clipboard\.writeText/);
  assert.match(js, /链接已复制/);
  assert.doesNotMatch(js, /微博|微信分享/);
});
