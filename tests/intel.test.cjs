const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "pages", "intel.html"), "utf8");
const controllerPath = path.join(__dirname, "..", "src", "pages", "intel.js");

test("intel page reproduces the intel board inside the platform shell", () => {
  assert.match(html, /<body data-page="intel">/);
  assert.match(html, /<div class="intel-tabbar" id="tabbar"><\/div>/);
  assert.match(html, /id="scroller"/);
  assert.match(html, /id="view"/);
  assert.match(html, /id="favDrawer"/);
  assert.match(html, /<script src="\.\.\/src\/pages\/intel\.js(?:\?[^\"]*)?"><\/script>/);
  const controller = fs.readFileSync(controllerPath, "utf8");
  assert.match(controller, /今日情报/);
  assert.match(controller, /情报跟踪/);
  assert.match(controller, /7×24 实时/);
  assert.match(controller, /今日早报/);
  assert.match(html, /<script src="\.\.\/src\/page-bridge\.js(?:\?[^"]+)?"><\/script>/);

  // The standalone prototype had its own topbar and sidebar; the embedded page uses the platform shell.
  assert.doesNotMatch(html, /<header class="app-topbar"/);
  assert.doesNotMatch(html, /id="sidebarNav"/);
  assert.doesNotMatch(html, /正在集成/);
});

test("favorite drawer covers the page header and both tab underlines use the brand accent", () => {
  const css = fs.readFileSync(path.join(__dirname, "..", "intel-visual.css"), "utf8");
  // 页头 z-index 200、栏目栏 300：抽屉必须高于两者，否则「收藏 / 刷新」会浮在抽屉上。
  assert.match(css, /\.dr-mask \{ z-index: 900; \}/);
  assert.match(css, /\.thread-drawer \{ z-index: 910; \}/);
  // 今日情报与情报跟踪共用同一条激活下划线，颜色统一为品牌蓝。
  assert.match(css, /\.intel-title-tabs \.intel-tab\.active::after \{[^}]*background:var\(--accent\)/);
  assert.doesNotMatch(css, /\.intel-tab\.active::after \{[^}]*background:#1d2433/);
});
