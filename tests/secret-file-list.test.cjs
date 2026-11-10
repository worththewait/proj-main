const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const window = {};
const context = vm.createContext({ window });
for (const name of ["ui.js", "secret-file-list.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src", name), "utf8"), context);
}
const list = window.BaigeSecretFileList;

test("secrecy lists use the same four headings and distinguish scan, review and ingestion outcomes", () => {
  const headings = [...list.head.matchAll(/<th scope="col">([^<]+)<\/th>/g)].map(match => match[1]);
  assert.deepEqual(headings, ["文件名", "上传时间", "文档状态", "操作"]);
  assert.match(list.header("翻译任务"), /文档状态<\/th><th scope="col">翻译任务<\/th><th scope="col">操作/);
  const expected = { detecting: "检测中", passed: "已通过", hit: "涉密可疑", submitted: "审核中",
    approved: "审核通过", stored: "已入库", rejected: "已驳回", failed: "失败" };
  for (const [code, label] of Object.entries(expected)) {
    assert.equal(list.label(code), label);
    assert.equal(list.canView(code), ["passed", "approved", "stored"].includes(code), code);
  }
  assert.equal(list.canView("draft"), false);
  assert.equal(list.canView("unknown"), false);
  assert.equal(list.label("draft"), "—");
});

test("document time shows the date and minute without exposing arbitrary markup", () => {
  assert.match(list.time("2026-11-09 14:30:15"), /title="2026-11-09 14:30:15">2026-11-09 14:30</);
  assert.equal(list.time("<b>"), "—");
  assert.equal(list.time(null), "—");
});
