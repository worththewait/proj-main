const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function read(file) {
  return fs.readFileSync(path.join(__dirname, "..", file), "utf8");
}

test("百舸文库 links only to the user-facing library; admin demo remains available as a file", () => {
  const context = { window: {} };
  vm.runInNewContext(read("src/data.js"), context);
  const item = context.window.BaigeData.findNavItem("library");
  assert.ok(item);
  assert.deepEqual(Array.from(item.children), ["文库首页"]);
  assert.equal(item.subnav, false);
  assert.equal(item.files, undefined);
  assert.equal(item.file, "pages/library.html");
  assert.ok(fs.existsSync(path.join(__dirname, "../pages/library-admin.html")));
});

test("library admin scopes file and permission management to department types", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /function libKbFilesOf\(name\) \{[\s\S]{0,200}getManageDept\(\)[\s\S]{0,200}managerTypes\(dept\)/);
  assert.match(html, /id="libDeptSelect"/);
  assert.match(html, /function renderLibDeptSwitcher\(\)/);
  assert.match(html, /function switchLibDept\(dept\)/);
  assert.match(html, /BaigeLibraryStore\.setManageDept\(dept\)/);
  assert.match(html, /BaigeLibraryStore\.managers\.map/);
  assert.match(html, /DOCS = BaigeLibraryStore\.managedDocs\(adminDept\)/);
  assert.match(html, /仅显示该部门负责的文档类型/);
  assert.match(html, /canManageDoc\(id, BaigeLibraryStore\.getManageDept\(\)\)/);
  assert.match(html, /canManageDoc\(target\._storeId/);
  assert.match(html, /data-src="upload"/);
  assert.match(html, /data-src="crawl"/);
  assert.match(html, /function setSource\(s\)/);
  assert.match(html, /source==='crawl'/);
  assert.match(html, /id="wizardTypeHint"/);
  assert.match(html, /文档类型 <span style="color:var\(--danger\)">\*<\/span>/);
  assert.match(read("src/library-store.js"), /const LIBRARY_MANAGERS/);
  assert.match(read("src/library-store.js"), /function managerTypes\(dept\)/);
  assert.match(read("src/library-store.js"), /function canManageDoc\(id, dept\)/);
});

test("personal permissions are additive to the department baseline", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /basePerm/);
  assert.match(html, /extraPerm/);
  assert.match(html, /function permSourceHtml\(d\)/);
  assert.match(html, /部门基础/);
  assert.match(html, /个人未加授/);
  assert.match(html, /revokeMinLevel/);
  assert.match(html, /不额外授权（沿用部门权限）/);
  assert.match(html, /个人权限必须高于部门基础权限/);
});

test("library upload wizard only offers manager types and auto-selects a single type", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /id="wizardTypeHint"/);
  assert.match(html, /managerTypes\.length === 1/);
  assert.match(html, /single\?'disabled':''/);
  assert.match(html, /请选择文档类型/);
  assert.match(html, /category: tags\[0\]\?\.tag \|\| '其他'/);
  assert.match(html, /文档类型 <span style="color:var\(--danger\)">\*<\/span>/);
});

test("library admin page keeps the full file and permission views behind the platform shell", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /<body data-page="library">/);
  assert.match(html, /id="adminBack"/);
  assert.match(html, /id="libPanel-upload"/);
  assert.match(html, /id="libPanel-perm"/);
  assert.match(html, /id="uploadWizardModal"/);
  assert.match(html, /id="revokeMask"/);
  assert.match(html, /\.sidebar-wrap,\.topbar,\.wm\{display:none!important\}/);
  assert.match(html, /bridge\.onActivate\(\(\) => show\(requestedChild\)\)/);
  assert.match(html, /params\.get\("view"\) === "perm"/);
  assert.match(html, /adminEmbed/);
  assert.match(html, /const CATS = BaigeLibraryStore\.categories/);
  assert.doesNotMatch(html, /CRAWL_TYPES/);
  assert.match(html, /function reloadDocsFromStore/);
  assert.match(html, /BaigeLibraryStore\.(setGrantMode|clearPermissions)/);
  assert.match(html, /ownerDept/);
  assert.match(html, /accessMode/);
  assert.match(html, /permissionExpiry/);
  assert.match(html, /id="revokeExpiry"/);
  assert.match(html, /自动获取封面/);
  assert.match(html, /autoPdfCover/);
  assert.match(html, /wizardPublishMode/);
  assert.match(html, /setPublishMode/);
  assert.match(html, /peopleForDept/);
  assert.match(html, /selectPerson/);
  assert.match(html, /setGrantMode/);
  assert.match(html, /effectivePersonLevel/);
  assert.match(html, /dept-node collapsed/);
  assert.match(html, /toggleDeptPeople/);
  assert.match(html, /部门整体/);
  assert.match(read("pages/library.html"), /id="libraryUser"/);
  assert.match(html, /function renderTypes\(\)\{[\s\S]{0,280}managerTypes\(adminDept\)/);
  assert.match(html, /class="perm-table-wrap"/);
  assert.match(html, /#libPermRoot \.perm-table-wrap\{[^}]*max-height[^}]*overflow:auto/);
  assert.doesNotMatch(html, /source === 'crawl'[\s\S]{0,120}row\.style\.display = 'none'/);
  assert.match(read("src/app.js"), /const pageFile = item\.files\?\.\[route\.child\] \|\| item\.file/);
  assert.match(read("src/app.js"), /page\.file !== pageFile/);
});

test("own department is hidden and department no-grant revokes all permissions", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /DEPTS\.filter\(d => d !== adminDept\)/);
  assert.match(html, /不授权（收回该部门全部权限）/);
  assert.match(html, /function pickNone\(\)\{ selectedLevel=0; revokeGrantMode='limited'/);
  assert.match(html, /已收回该部门在 /);
  assert.match(html, /const noPermission = Number\(d\.perm\) === 0/);
  assert.match(html, /<span class="pbadge none">没有权限<\/span>/);
});

test("permission modal supports target-level limited and public modes", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /name="revokeGrantMode"/);
  assert.match(html, /id="grantModeBox"/);
  assert.match(html, /function renderGrantMode/);
  assert.match(html, /BaigeLibraryStore\.setGrantMode/);
  assert.match(html, /class="src-tabs"/);
  assert.match(html, /class="type-chip/);
  assert.doesNotMatch(html, /data-access="limited"/);
  assert.match(html, /全部公开只影响当前部门/);
  assert.match(html, /全部公开只影响当前部门\/人员：可在线阅读全文并下载/);
});

test("limited and all-public permissions use different level ranges", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /function revokeMaxLevel\(\)\{/);
  assert.match(html, /return revokeAllLimited\(\) \? 3 : 4;/);
  assert.match(html, /function revokeAllLimited\(\)/);
  assert.match(html, /有限公开文档中为试读状态，只能看前 2 页/);
  assert.match(html, /const isTrial = BaigeLibraryStore\.isTrialAccess/);
  assert.match(html, /全部公开 · 可下载/);
  assert.match(html, /grantModeBox\.hidden = !allLimited/);
  assert.match(html, /BaigeLibraryStore\.clearPermissions/);
});
