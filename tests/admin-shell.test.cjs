const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("back-office shell exposes file, permission, notice and interface navigation", () => {
  const html = read("admin.html");
  assert.match(html, /id="adminNav"/);
  assert.match(html, /id="adminFrame"/);
  assert.equal((html.match(/data-admin-view=/g) || []).length, 7);
  assert.match(html, />文件管理</);
  assert.match(html, />权限管理</);
  assert.match(html, />通知公告</);
  assert.match(html, />界面管理</);
  assert.match(html, />权限审核</);
  assert.match(html, />动态发布</);
  assert.match(html, />留言咨询</);
  assert.doesNotMatch(html, />功能管理</);
  assert.doesNotMatch(html, />自定义界面</);
  assert.doesNotMatch(html, />首页</);
  const js = read("admin.js");
  assert.match(js, /pages\/library-admin\.html\?embed=admin&view=perm/);
  assert.match(js, /pages\/notice-admin\.html\?embed=admin/);
  assert.match(js, /pages\/interface-admin\.html\?embed=admin/);
  assert.match(js, /pages\/permission-review\.html\?embed=admin/);
  assert.match(js, /"portal-news": \{ src: "pages\/portal-news-admin\.html\?embed=admin/);
  assert.match(js, /features: \{ src: `\$\{INTERFACE_SRC\}&view=features`/);
  assert.match(js, /settings: \{ src: `\$\{INTERFACE_SRC\}&view=settings`/);
});

test("client shell keeps the back-office entry in the personal center and hides admin-only routes", () => {
  const context = { window: {} };
  vm.runInNewContext(read("src/data.js"), context);
  const item = context.window.BaigeData.findNavItem("home-settings");
  assert.ok(item);
  assert.equal(item.adminOnly, true);
  assert.match(read("src/app.js"), /!item\.adminOnly/);
  assert.match(read("src/app.js"), /location\.href = "\.\/admin\.html#settings"/);
  assert.match(read("src/account.js"), /action === "admin"/);
  assert.match(read("src/account.js"), /window\.location\.href = "\.\/admin\.html"/);
  assert.match(read("pages/library-admin.html"), /embed.*admin/);
  assert.match(read("pages/home-settings.html"), /embed.*admin/);
});
