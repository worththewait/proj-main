const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const project = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(project, file), "utf8");

function setup() {
  const storage = new Map();
  const timers = [];
  const window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    addEventListener() {},
    dispatchEvent() {},
    setTimeout(fn) { timers.push(fn); return timers.length; },
  };
  const context = { window, console, CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options?.detail; } } };
  vm.createContext(context);
  vm.runInContext(read("src/writing-store.js"), context);
  return { store: window.BaigeWritingStore, timers };
}

test("writing templates seed personal and public templates", () => {
  const { store } = setup();
  const templates = store.templates();
  assert.ok(templates.some((item) => item.scope === "personal" && item.name === "宣贯会工作方案"));
  assert.ok(templates.some((item) => item.scope === "public"));
  assert.ok(templates.some((item) => item.id === "tpl-tech-report" && item.name === "科技报告模板"));
  assert.ok(store.template("tpl-propaganda").outline.length > 0);
});

test("uploaded documents stay unselectable until secret review passes", () => {
  const { store, timers } = setup();
  const before = store.uploads();
  const passedSeed = before.find((item) => item.status === "passed");
  const hitSeed = before.find((item) => item.status === "hit");
  assert.ok(passedSeed);
  assert.ok(hitSeed);
  assert.deepEqual(Array.from(store.selectableUploads().map((item) => item.id)), [passedSeed.id]);
  store.addUploads([{ name: "核心秘密参数.pdf", size: 1024, type: "pdf" }]);
  const pending = store.uploads().at(-1);
  assert.equal(pending.status, "detecting");
  assert.equal(store.selectableUploads().some((item) => item.id === pending.id), false);
  while (timers.length) timers.shift()();
  const reviewed = store.uploads().find((item) => item.id === pending.id);
  assert.equal(reviewed.status, "hit");
  assert.equal(store.selectableUploads().some((item) => item.id === pending.id), false);
  store.reviewUpload(pending.id, "passed");
  assert.equal(store.selectableUploads().some((item) => item.id === pending.id), true);
});

test("writing page exposes the complete template-to-upload flow", () => {
  const html = read("pages/writing.html");
  const js = read("src/pages/writing.js");
  const css = read("writing.css");
  assert.match(html, /writing-store\.js/);
  assert.match(html, /pages\/writing\.js/);
  assert.match(html, /writing\.css/);
  for (const token of ["大纲编辑", "编辑章节信息", "新建写作", "上传文档", "开始写作", "涉密检测", "导出"]) {
    assert.match(js, new RegExp(token));
  }
  assert.match(js, /只有.*已通过.*才可勾选/);
  assert.match(js, /passed \? "" : "disabled"/);
  assert.match(js, /passed \? "" : "is-locked"/);
  assert.match(css, /\.wr-workspace/);
  assert.match(css, /\.wr-file-table/);
  assert.match(css, /\.wr-secret-alert/);
  assert.match(js, /function openPublicWizard/);
  assert.match(js, /function renderWizard/);
  assert.match(js, /function wizardUploadsHtml/);
  assert.match(js, /data-wr-wizard-next/);
  assert.match(js, /data-wr-wizard-finish/);
  assert.match(js, /filePicker\.click/);
  assert.match(js, /data-wr-file-action/);
  assert.match(js, /data-wr-secret/);
  assert.match(css, /\.wr-wizard/);
});
