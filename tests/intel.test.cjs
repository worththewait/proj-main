const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const html = fs.readFileSync(path.join(__dirname, "..", "pages", "intel.html"), "utf8");

test("intel page reproduces the intel board inside the platform shell", () => {
  assert.match(html, /<body data-page="intel">/);
  assert.match(html, /<div class="intel-tabbar" id="tabbar"><\/div>/);
  assert.match(html, /id="scroller"/);
  assert.match(html, /id="view"/);
  assert.match(html, /今日情报/);
  assert.match(html, /情报跟踪/);
  assert.match(html, /7×24 实时/);
  assert.match(html, /今日早报/);
  assert.match(html, /id="threadDrawer"/);
  assert.match(html, /id="favDrawer"/);
  assert.match(html, /const EARLY = \[/);
  assert.match(html, /const TRACKS = \[/);
  assert.match(html, /function viewEarly\(\)/);
  assert.match(html, /function viewTrack\(\)/);
  assert.match(html, /function viewDetail\(\)/);
  assert.match(html, /function render\(\)/);
  assert.match(html, /<script src="\.\.\/src\/page-bridge\.js"><\/script>/);

  // The standalone prototype had its own topbar and sidebar; the embedded page uses the platform shell.
  assert.doesNotMatch(html, /<header class="app-topbar"/);
  assert.doesNotMatch(html, /id="sidebarNav"/);
  assert.doesNotMatch(html, /正在集成/);
});
