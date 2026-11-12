const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadFavorites(file, store = new Map(), url = file) {
  const window = {
    addEventListener() {},
  };
  const localStorage = {
    getItem: key => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
  };
  const html = read(file);
  const list = { innerHTML: "" };
  const count = { textContent: "" };
  const detail = { innerHTML: "", querySelector: () => null };
  const nodes = {
    "[data-favorites-list]": list,
    "[data-favorites-count]": count,
    "[data-news-detail]": detail,
  };
  const document = {
    querySelector: selector => html.includes(selector.slice(1, -1)) ? nodes[selector] ?? null : null,
    querySelectorAll: () => [],
    addEventListener() {},
    createElement: () => ({ style: {}, append() {}, select() {}, remove() {}, setAttribute() {} }),
    body: { append() {} },
  };
  const location = new URL(url, "http://localhost/");
  const context = vm.createContext({ window, document, localStorage, location, URLSearchParams, setTimeout, clearTimeout });
  for (const [, script] of html.matchAll(/<script src="\.\/(src\/portal-(?:news-store|news|favorites)\.js)\?[^"]*"/g)) {
    vm.runInContext(read(script), context, { filename: script });
  }
  return { tool: window.BaigePortalFavorites, store, list, count };
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
  const { tool, store } = loadFavorites("portal-news-detail.html");
  assert.equal(tool.read().length, 0);
  assert.equal(tool.toggle("33"), true);
  assert.equal(tool.has("33"), true);
  assert.deepEqual(JSON.parse(store.get(tool.KEY)), ["33"]);
  assert.equal(tool.toggle("33"), false);
  assert.equal(tool.has("33"), false);
  assert.deepEqual(JSON.parse(store.get(tool.KEY)), []);
});

test("详情页保存的收藏在我的收藏中显示，取消后重新打开为空", () => {
  const detail = loadFavorites("portal-news-detail.html", new Map(), "portal-news-detail.html?id=33");
  detail.tool.toggle("33");

  const favorites = loadFavorites("portal-favorites.html", detail.store);
  assert.match(favorites.list.innerHTML, /中国气象局签订战略合作框架协议/);
  assert.match(favorites.list.innerHTML, /portal-news-detail\.html\?id=33/);
  assert.match(favorites.list.innerHTML, /class="portal-feed-date">2026-09-24</);
  assert.equal(favorites.count.textContent, "共 1 条");

  detail.tool.toggle("33");
  const reopened = loadFavorites("portal-favorites.html", detail.store);
  assert.match(reopened.list.innerHTML, /还没有收藏任何动态/);
  assert.equal(reopened.count.textContent, "");
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
