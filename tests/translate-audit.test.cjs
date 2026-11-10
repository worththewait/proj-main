const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const load = read => {
  const window = { BaigeUI: {}, BaigeProofreadFile: { read } };
  const context = vm.createContext({ window });
  for (const name of ["proofread-tool.js", "translate-audit.js"]) {
    const file = path.join(__dirname, "../src", name);
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  return window.BaigeTranslateAudit;
};

test("translation checks both the filename and body using the shared scanner", async () => {
  const file = { name: "内部资料.docx" };
  const audit = load(async input => {
    assert.equal(input, file);
    return "普通段落。涉及军品的记录。";
  });
  const result = await audit.inspect(file);
  assert.equal(result.auditStatus, "hit");
  assert.deepEqual(Array.from(result.keywords), ["内部资料", "军品"]);
  assert.deepEqual(Object.keys(result).sort(), ["auditStatus", "keywords"]);
});

test("a readable document without a keyword passes without exposing its body", async () => {
  const audit = load(async () => "普通的设备维护记录。");
  const result = await audit.inspect({ name: "维护记录.pdf" });
  assert.equal(result.auditStatus, "passed");
  assert.equal(result.keywords.length, 0);
  assert.deepEqual(Object.keys(result).sort(), ["auditStatus", "keywords"]);
});

test("missing, empty, and unreadable documents fail closed without leaking reader errors", async () => {
  const invalid = await load(async () => "普通文档").inspect(null);
  const file = { name: "维护记录.docx" };
  const empty = await load(async () => " \n ").inspect(file);
  const unreadable = await load(async () => { throw new Error("private content"); }).inspect(file);
  for (const result of [invalid, empty, unreadable]) {
    assert.equal(result.auditStatus, "failed");
    assert.equal(result.keywords.length, 0);
    assert.match(result.auditReason, /重新/);
    assert.doesNotMatch(JSON.stringify(result), /private content/);
  }
});

test("manual review follows the supported transitions only", () => {
  const audit = load(async () => "");
  assert.equal(audit.transition("hit", "submitted"), true);
  assert.equal(audit.transition("submitted", "approved"), true);
  assert.equal(audit.transition("submitted", "rejected"), true);
  assert.equal(audit.transition("hit", "approved"), false);
  assert.equal(audit.transition("detecting", "approved"), false);
  assert.equal(audit.transition("failed", "submitted"), false);
  assert.equal(audit.transition("approved", "rejected"), false);
});

test("the translation parser is gated on audit approval and consumes screened text once", async () => {
  const file = { name: "内部资料.docx" };
  const audit = load(async () => "第一段\n\n第二段");
  assert.equal((await audit.inspect(file)).auditStatus, "hit");
  assert.throws(() => audit.parse(file, "hit"), /通过涉密审查/);
  assert.throws(() => audit.parse(file, "submitted"), /通过涉密审查/);
  assert.equal(audit.parse(file, "approved"), 2);
  assert.throws(() => audit.parse(file, "approved"), /没有可解析/);
});
