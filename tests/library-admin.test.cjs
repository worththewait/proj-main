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

test("library admin scopes file and permission management to department uploads", () => {
  const html = read("pages/library-admin.html");
  assert.match(html, /function libKbFilesOf\(name\) \{[\s\S]{0,160}uploadsForDept\(BaigeLibraryStore\.getCurrentDept\(\)\)/);
  assert.match(html, /DOCS = BaigeLibraryStore\.uploadsForDept\(adminDept\)/);
  assert.match(html, /仅显示本部门上传文档/);
  assert.match(html, /canManageDoc\(id, BaigeLibraryStore\.getCurrentDept\(\)\)/);
  assert.match(html, /canManageDoc\(target\._storeId/);
  assert.doesNotMatch(html, /data-src="crawl"/);
  assert.match(read("src/library-store.js"), /function uploadsForDept\(dept\)/);
  assert.match(read("src/library-store.js"), /function canManageDoc\(id, dept\)/);
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
  assert.match(html, /BaigeLibraryStore\.setPermissions/);
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
  assert.match(html, /setPersonPermissions/);
  assert.match(html, /effectivePersonLevel/);
  assert.match(html, /dept-node collapsed/);
  assert.match(html, /toggleDeptPeople/);
  assert.match(html, /部门整体/);
  assert.match(read("pages/library.html"), /id="libraryUser"/);
  assert.match(html, /function renderTypes\(\)\{[\s\S]{0,220}const types = UPLOAD_TYPES/);
  assert.match(html, /class="perm-table-wrap"/);
  assert.match(html, /#libPermRoot \.perm-table-wrap\{[^}]*max-height[^}]*overflow:auto/);
  assert.doesNotMatch(html, /source === 'crawl'[\s\S]{0,120}row\.style\.display = 'none'/);
  assert.match(read("src/app.js"), /const pageFile = item\.files\?\.\[route\.child\] \|\| item\.file/);
  assert.match(read("src/app.js"), /page\.file !== pageFile/);
});
