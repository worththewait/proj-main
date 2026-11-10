const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("门户首页具备顶栏、轮播、动态与平台入口", () => {
  const html = read("portal.html");
  for (const token of [
    "portal-topbar", "百舸", "船舶行业数智服务平台",
    "行业大模型", "数智系统", "高质量数据集", "解决方案", "关于我们",
    "portal-carousel", "活动时间：", "活动地点：", "参与方式：",
    "安全生产月", "会谈", "中船先锋", "节日活动", "今日芒种",
    "portal-news", "更多动态",
    "百舸船舶行业大模型", "船舶工业决策支持平台", "DEEPSTAND船舶标准智能", "海智汇船舶专业大数据",
    "更强的行业模型",
  ]) assert.ok(html.includes(token), token);
});

test("门户「控制台」指向控制台首页，轮播用内联示意而非图片", () => {
  const html = read("portal.html");
  assert.match(html, /class="portal-console" href="\.\/index\.html"/);
  assert.match(html, /<svg class="portal-carousel-art"/);
  assert.doesNotMatch(html, /<img[^>]+portal-carousel/);
  const css = read("portal.css");
  assert.match(css, /\.portal-carousel-art/);
  assert.match(css, /\.portal-news-thumb/);
  assert.match(css, /\.portal-entry/);
});

test("控制台顶栏在通知提醒之后提供返回首页按钮", () => {
  const html = read("index.html");
  const notice = html.indexOf('id="notificationTrigger"');
  const home = html.indexOf('id="portalHomeTrigger"');
  assert.ok(notice > -1, "缺少通知入口");
  assert.ok(home > notice, "返回首页应位于通知提醒之后");
  assert.match(html, /class="topbar-home-button"/);
  assert.ok(html.includes("<span>返回首页</span>"));
  assert.match(read("account.css"), /\.topbar-home-button\s*\{/);
  assert.match(read("src/app.js"), /#portalHomeTrigger[\s\S]{0,180}portal\.html/);
});

test("轮播分类共用同一张示意图，切换只更新活动信息", () => {
  const js = read("src/portal.js");
  for (const key of ["safety", "meeting", "pioneer", "festival", "season"]) {
    assert.ok(js.includes(`${key}:`), key);
  }
  assert.match(js, /data-portal-when/);
  assert.match(js, /data-portal-where/);
  assert.match(js, /data-portal-how/);
  assert.match(js, /is-active/);
});
