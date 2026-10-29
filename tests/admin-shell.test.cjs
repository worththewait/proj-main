const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("back-office shell exposes file, permission, notice and custom UI navigation", () => {
  const html = read("admin.html");
  assert.match(html, /id="adminNav"/);
  assert.match(html, /id="adminFrame"/);
  assert.equal((html.match(/data-admin-view=/g) || []).length, 4);
  assert.match(html, />文件管理</);
  assert.match(html, />权限管理</);
  assert.match(html, />通知公告</);
  assert.match(html, />自定义界面</);
  assert.doesNotMatch(html, />首页</);
  assert.match(read("admin.js"), /pages\/library-admin\.html\?embed=admin&view=perm/);
  assert.match(read("admin.js"), /pages\/notice-admin\.html\?embed=admin/);
  assert.match(read("admin.js"), /pages\/home-settings\.html\?embed=admin/);
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
