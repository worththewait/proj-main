const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadNews() {
  const window = {};
  const document = { querySelector: () => null, title: "" };
  const context = vm.createContext({ window, document, console, URLSearchParams, location: { search: "" } });
  vm.runInContext(read("src/portal-news.js"), context, { filename: "portal-news.js" });
  return window.BaigePortalNews;
}

test("全部动态页具备标题、列表容器与门户框架", () => {
  const html = read("portal-news.html");
  for (const token of [
    "portal-topbar", "portal-brand", "控制台", "portal-nav",
    "最新动态", "获取最新行业资讯与平台更新", "data-news-list",
    "portal-footer", "微信公众号", "备案号",
  ]) assert.ok(html.includes(token), token);
});

test("动态详情页具备容器与返回入口", () => {
  const html = read("portal-news-detail.html");
  assert.match(html, /data-news-detail/);
  assert.match(html, /portal-article|portal-detail-main/);
  const js = read("src/portal-news.js");
  assert.match(js, /返回最新动态/);
  assert.match(js, /portal-article-tag/);
  assert.match(js, /portal-article-byline/);
});

test("门户首页三条动态链到详情、更多动态链到列表", () => {
  const html = read("portal.html");
  assert.equal((html.match(/portal-news-detail\.html\?id=/g) || []).length, 3);
  assert.match(html, /class="portal-news-more" href="\.\/portal-news\.html"/);
  assert.doesNotMatch(html, /data-portal-more/);
  const js = read("src/portal.js");
  assert.doesNotMatch(js, /data-portal-news/);
});

test("演示动态共 8 条，含 id 33 的战略合作稿", () => {
  const news = loadNews();
  assert.equal(news.NEWS.length, 8);
  const main = news.NEWS.find(item => item.id === 33);
  assert.ok(main, "缺少 id 33");
  assert.match(main.title, /中国气象局签订战略合作框架协议/);
  assert.equal(main.tag, "战略合作");
  assert.ok(main.body.length >= 4);
  for (const item of news.NEWS) {
    assert.ok(item.title && item.date && item.tag && Array.isArray(item.body) && item.body.length, item.id);
  }
});

test("列表按数据顺序渲染并带详情链接", () => {
  const js = read("src/portal-news.js");
  assert.match(js, /data-news-list/);
  assert.match(js, /portal-feed-item/);
  assert.match(js, /portal-news-detail\.html\?id=\$\{item\.id\}/);
  assert.match(js, /portal-feed-thumb/);
});
