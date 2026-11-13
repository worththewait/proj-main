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
  assert.equal((html.match(/data-admin-view=/g) || []).length, 10);
  assert.match(html, />文件管理</);
  assert.match(html, />权限管理</);
  assert.match(html, />通知公告</);
  assert.match(html, />界面管理</);
  assert.match(html, />权限审核</);
  assert.match(html, />用户管理</);
  assert.match(html, />角色管理</);
  assert.match(html, />角色授权审核</);
  assert.match(html, /id="iamActor"/);
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
  assert.match(js, /pages\/user-admin\.html\?embed=admin/);
  assert.match(js, /pages\/role-admin\.html\?embed=admin/);
  assert.match(js, /pages\/role-approval\.html\?embed=admin/);
  assert.match(js, /"portal-news": \{ src: "pages\/portal-news-admin\.html\?embed=admin/);
  assert.match(js, /features: \{ src: `\$\{INTERFACE_SRC\}&view=features`/);
  assert.match(js, /settings: \{ src: `\$\{INTERFACE_SRC\}&view=settings`/);
});

test("权限预览仅按指定演示用户当前生效的角色判断功能路由", () => {
  let menus = [];
  const window = {
    location: { search: "?iam-user=u-demo" },
    BaigeIamStore: { effectiveMenus(id) { assert.equal(id, "u-demo"); return menus; } },
    localStorage: { getItem: () => JSON.stringify({ "admin@cimtec.net.cn": { "writing:": true } }) },
  };
  vm.runInNewContext(read("src/data.js"), { window, URLSearchParams });
  const policy = window.BaigePermissions;
  assert.equal(policy.previewUserId, "u-demo");
  assert.equal(policy.canOpen("home"), true);
  assert.equal(policy.canOpen("writing"), false);
  menus = ["writing", "tools", "qa", "system", "review"];
  assert.equal(policy.canOpen("writing"), true);
  assert.equal(policy.canOpen("smart-tools", "OCR识别"), true);
  assert.equal(policy.canOpen("qa", "对话"), true);
  assert.equal(policy.canOpen("qa", "智能问数"), false);
  assert.equal(policy.canOpen("home-settings"), false);
  menus = ["qa:智能问数", "smart-tools:OCR识别", "frontier:全球鹰", "library", "datasets"];
  assert.equal(policy.canOpen("qa"), true);
  assert.equal(policy.canOpen("qa", "智能问数"), true);
  assert.equal(policy.canOpen("qa", "对话"), false);
  assert.equal(policy.canOpen("smart-tools"), true);
  assert.equal(policy.canOpen("smart-tools", "文档翻译"), false);
  assert.equal(policy.canOpen("frontier"), true);
  assert.equal(policy.canOpen("frontier", "智研通"), false);
  assert.equal(policy.canOpen("library", "文库首页"), true);
  assert.equal(policy.canOpen("datasets", "船海产业数据集"), true);
  menus = [];
  assert.equal(policy.canOpen("qa"), false);
  assert.equal(policy.canOpen("smart-tools"), false);
  assert.equal(policy.canOpen("writing"), false);
});

test("角色菜单读取首页分类，并兼容旧角色的整组授权", () => {
  const saved = new Map();
  const window = {
    addEventListener() {},
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) },
  };
  const context = vm.createContext({ window });
  for (const file of ["src/data.js", "src/feature-config.js", "src/iam-menu-catalog.js"]) vm.runInContext(read(file), context);

  const features = window.BaigeFeatureConfig;
  const catalog = window.BaigeIamMenuCatalog;
  const config = features.read();
  config.categories.home[0].label = "研究业务";
  config.features["tool:OCR识别"].homeCategory = config.categories.home[0].id;
  saved.set(features.storageKey, JSON.stringify(config));

  const groups = catalog.groups();
  assert.equal(groups[0].items[0].label, "首页");
  const ocr = groups.find(group => group.label === "研究业务").items.find(item => item.key === "smart-tools:OCR识别");
  assert.equal(ocr.parentLabel, "智能工具");
  assert.equal(ocr.parentId, "smart-tools");
  assert.equal(ocr.legacyKey, "tools");
  assert.ok(groups.some(group => group.items.some(item => item.key === "review" && item.protected)));
  const legacy = new Set(catalog.expand(["qa", "tools", "frontier", "library", "review", "unlisted"]));
  for (const key of ["qa:对话", "smart-tools:OCR识别", "frontier:全球鹰", "frontier:智研通", "library", "review", "unlisted"]) {
    assert.ok(legacy.has(key), key);
  }
  for (const key of ["home", "qa:智能问数", "tools", "frontier"]) assert.ok(!legacy.has(key), key);
  assert.equal(catalog.label("smart-tools:OCR识别"), "OCR识别");
  assert.equal(catalog.label("data-platform:数据中台"), "数据中台");
});

test("账号预览按首页分类展示已开通的客户端菜单", () => {
  const window = { addEventListener() {} };
  const context = vm.createContext({ window });
  for (const file of ["src/data.js", "src/feature-config.js", "src/iam-menu-catalog.js"]) vm.runInContext(read(file), context);

  const groups = window.BaigeIamMenuCatalog.grantedGroups(["qa", "smart-tools:OCR识别", "system", "retired"]);
  const entries = groups.flatMap(group => group.items);
  assert.equal(groups[0].label, "客户端");
  assert.equal(groups.find(group => group.items.some(item => item.key === "qa:对话")).label, "知识与研究");
  assert.deepEqual(Array.from(entries, item => item.key), ["home", "qa:对话", "smart-tools:OCR识别"]);
  assert.ok(groups.every(group => group.items.length));
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
