const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("notification center and notice admin are wired into the platform", () => {
  const index = read("index.html");
  const account = read("src/account.js");
  const admin = read("admin.html");
  const adminJs = read("admin.js");
  const page = read("pages/notice-admin.html");

  assert.match(index, /src\/notice-store\.js/);
  assert.ok(index.indexOf("notice-store.js") < index.indexOf("account.js"));
  assert.match(account, /notice-dialog/);
  assert.match(account, /id="noticeList"/);
  assert.match(account, /id="noticeDetail"/);
  assert.match(account, /无数据/);
  assert.match(account, /markAllRead/);
  assert.match(account, /data-notice-id/);
  assert.match(read("account.css"), /account-dialog\.notice-dialog/);

  assert.match(admin, /data-admin-view="notices"/);
  assert.match(admin, />通知公告</);
  assert.match(adminJs, /pages\/notice-admin\.html\?embed=admin/);
  assert.match(page, /公告列表/);
  assert.match(page, /新建公告/);
  assert.match(page, /id="noticeEditor"/);
  assert.match(page, /id="filterType"/);
  assert.match(page, /data-notice-status="正常"/);
  assert.match(page, /notice-store\.js/);
  assert.match(read("notice-admin.css"), /notice-editor/);
});
