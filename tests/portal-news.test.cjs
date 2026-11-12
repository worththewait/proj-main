const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadStore() {
  const window = { dispatchEvent() {} };
  const localStorage = { getItem: () => null, setItem() {} };
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const context = vm.createContext({ window, localStorage, console, JSON, Math, Number, String, Object, Array, CustomEvent });
  vm.runInContext(read("src/portal-news-store.js"), context, { filename: "portal-news-store.js" });
  return window.BaigePortalNewsStore;
}

test("全部动态页具备标题、列表容器与门户框架", () => {
  const html = read("portal-news.html");
  for (const token of [
    "portal-topbar", "portal-brand", "控制台", "portal-nav",
    "最新动态", "获取最新行业资讯与平台更新", "data-news-list",
    "portal-footer", "微信公众号", "备案号",
  ]) assert.ok(html.includes(token), token);
  assert.match(html, /class="portal-back-home" href="\.\/portal\.html"/);
  assert.match(html, /data-icon="back"/);
  assert.match(html, /portal-news-store\.js/);
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

test("门户首页动态区由数据层渲染，三条卡片链到详情", () => {
  const html = read("portal.html");
  assert.match(html, /class="portal-news-list" data-portal-news-list/);
  assert.doesNotMatch(html, /portal-news-item" href/);
  assert.match(html, /class="portal-news-more" href="\.\/portal-news\.html"/);
  const js = read("src/portal-news.js");
  assert.match(js, /store\.latest\(3\)/);
  assert.match(js, /from=\$\{from\}/);
});

test("详情返回目标跟随来源，并带面包屑", () => {
  const js = read("src/portal-news.js");
  assert.match(js, /params\.get\("from"\) === "home"/);
  assert.match(js, /label: "返回首页"/);
  assert.match(js, /label: "返回最新动态"/);
  assert.match(js, /class="portal-crumbs"/);
  assert.match(js, /aria-current="page">正文/);
  assert.match(js, /cardOf\(item, "home"\)/);
});

test("演示动态共 8 条，含 id 33 的战略合作稿", () => {
  const store = loadStore();
  const all = store.all();
  assert.equal(all.length, 8);
  const main = all.find(item => item.id === "33");
  assert.ok(main, "缺少 id 33");
  assert.match(main.title, /中国气象局签订战略合作框架协议/);
  assert.equal(main.tag, "行业动态");
  assert.ok(main.body.length >= 4);
  for (const item of all) {
    assert.ok(item.title && item.publishedAt && item.tag && item.type, item.id);
    assert.equal(item.status, "已发布");
  }
});

test("列表按置顶优先、首页按最新三条取数", () => {
  const store = loadStore();
  const feed = store.feed();
  assert.equal(feed.slice(0, 3).map(item => item.id).join(","), "28,29,30");
  assert.equal(store.latest(3).map(item => item.id).join(","), "33,34,35");
  for (let i = 1; i < feed.length; i += 1) {
    assert.ok(Number(feed[i - 1].pinned) >= Number(feed[i].pinned));
  }
});

test("草稿不进入门户，发布后才可见", () => {
  const store = loadStore();
  const item = store.fromForm({
    title: "草稿测试", tag: "测试", content: "正文", status: "草稿",
    publishedAt: "2026-11-11 10:00:00",
  });
  assert.equal(item.status, "草稿");
  assert.equal(item.date, "2026-11-11");
  assert.equal(JSON.stringify(item.body), JSON.stringify(["正文"]));
});

test("公告标签为固定七类，旧标签自动迁移", () => {
  const store = loadStore();
  assert.equal(store.TAGS.join(","), "通知公告,行业动态,政策法规,智库成果,研究报告,其他,活动报名");
  for (const item of store.all()) {
    assert.ok(store.TAGS.includes(item.tag), `${item.id} 的标签 ${item.tag} 不在枚举内`);
  }
});

test("最新动态支持关键词与标签筛选", () => {
  const html = read("portal-news.html");
  assert.match(html, /data-news-tags/);
  assert.match(html, /id="newsSearch"/);
  assert.match(html, /placeholder="搜索动态标题"/);
  const js = read("src/portal-news.js");
  assert.match(js, /filters\.tag !== "全部"/);
  assert.match(js, /item\.title\.includes\(keyword\)/);
  assert.match(js, /portal-empty-result/);
  assert.match(js, /store\.TAGS/);
});

test("搜索只提交已确认的关键词，分类切换即时生效并保留该关键词", () => {
  const { list, tags, input, search, location } = mountNews();
  const clickTag = tag => tags.emit("click", {
    target: { closest: () => ({ dataset: { tag }, setAttribute() {} }) },
  });
  const submit = () => search.emit("submit", { preventDefault() {} });

  assert.match(list.innerHTML, /儿童节活动/);
  input.value = "气象局";
  input.emit("input");
  clickTag("行业动态");
  assert.doesNotMatch(list.innerHTML, /儿童节活动/);
  assert.match(list.innerHTML, /安全生产月/);

  submit();
  assert.match(list.innerHTML, /中国气象局/);
  assert.doesNotMatch(list.innerHTML, /安全生产月/);
  assert.equal(new URLSearchParams(location.hash.slice(1)).get("q"), "气象局");

  input.value = "未提交的修改";
  clickTag("活动报名");
  assert.match(list.innerHTML, /清除关键词/);
  clickTag("全部");
  assert.match(list.innerHTML, /中国气象局/);
  assert.doesNotMatch(list.innerHTML, /儿童节活动/);

  clickTag("活动报名");
  list.emit("click", { target: { closest: () => ({}) } });
  assert.match(list.innerHTML, /儿童节活动/);
  assert.equal(input.value, "");
  assert.equal(new URLSearchParams(location.hash.slice(1)).get("tag"), "活动报名");
});

test("详情返回链接恢复已提交的分类和关键词", () => {
  const listUrl = new URL("http://localhost/portal-news.html");
  listUrl.hash = new URLSearchParams({ tag: "行业动态", q: "气象局" });
  const { list, input } = mountNews(listUrl);
  assert.equal(input.value, "气象局");
  assert.match(list.innerHTML, /中国气象局/);
  assert.doesNotMatch(list.innerHTML, /安全生产月/);

  const articleUrl = new URL(list.innerHTML.match(/href="([^"]+)"/)[1].replaceAll("&amp;", "&"), listUrl);
  const { detail } = mountNews(articleUrl);
  const returnLinks = [...detail.innerHTML.matchAll(/href="(\.\/portal-news\.html[^"]*)"/g)];
  assert.equal(returnLinks.length, 3);
  for (const [, href] of returnLinks) assert.equal(new URL(href.replaceAll("&amp;", "&"), articleUrl).hash, listUrl.hash);
});

function mountNews(url = "http://localhost/portal-news.html") {
  function element() {
    const events = {};
    return {
      innerHTML: "",
      value: "",
      addEventListener(type, callback) { events[type] = callback; },
      emit(type, event) { events[type]?.(event); },
      querySelector() { return null; },
      focus() {},
    };
  }
  const location = new URL(url);
  const window = { BaigePortalNewsStore: loadStore(), addEventListener() {} };
  const list = element();
  const tags = element();
  const input = element();
  const search = element();
  const detail = element();
  const isDetail = location.pathname.endsWith("detail.html");
  const nodes = isDetail ? { "[data-news-detail]": detail } : {
    "[data-news-list]": list, "[data-news-tags]": tags, "#newsSearch": input, "[data-news-search]": search,
  };
  const document = { querySelector: selector => nodes[selector] ?? null };
  const history = { replaceState(_state, _title, url) { location.href = String(url); } };
  vm.runInNewContext(read("src/portal-news.js"), { window, document, location, history, URL, URLSearchParams });
  return { list, tags, input, search, detail, location };
}

test("活动报名公告在详情页给出立即报名与报名表", () => {
  const js = read("src/portal-news.js");
  assert.match(js, /item\.type === "活动报名公告"/);
  assert.match(js, /class="portal-signup"[^>]*data-signup=/);
  assert.match(js, />立即报名</);
  assert.match(js, /请填写以下信息完成活动报名/);
  for (const field of ["realname", "unit", "dept", "phone", "email", "title", "remark"]) {
    assert.ok(js.includes(`name: "${field}"`) || js.includes(`name="${field}"`), field);
  }
  assert.match(js, /请填写正确的 11 位手机号/);
  assert.match(js, /报名成功/);
  const css = read("portal.css");
  assert.match(css, /\.ps-modal/);
  assert.match(css, /\.portal-signup/);
});

test("列表按数据顺序渲染并带详情链接", () => {
  const js = read("src/portal-news.js");
  assert.match(js, /data-news-list/);
  assert.match(js, /portal-feed-item/);
  assert.match(js, /portal-news-detail\.html\?id=\$\{encodeURIComponent\(item\.id\)\}&amp;from=news/);
  assert.match(js, /portal-feed-thumb/);
});
