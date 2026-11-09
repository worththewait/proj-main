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
  return { store: window.BaigeWritingStore, timers, context };
}

function setupMaterialList() {
  const { store, context } = setup();
  const { document, Element } = require("./helpers/feature-dom.cjs")();
  document.body = new Element("body");
  document.append(document.body);
  document.body.innerHTML = read("pages/writing.html").match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  const toast = document.querySelector("#writingToast");
  Object.defineProperty(toast, "classList", { value: { add() {}, remove() {} } });
  context.window.BaigeUI = { escapeHtml: String, icon: () => "" };
  Object.assign(context, { document, setTimeout() {}, clearTimeout() {} });
  vm.runInContext(read("src/pages/writing.js"), context);
  const get = (selector) => document.querySelector(selector);
  get("[data-wr-manage-materials]").emit("click");
  return {
    store,
    get,
    filter: (value) => get(`[data-wr-file-filter="${value}"]`),
    names: () => get("[data-wr-material-table]").querySelectorAll(".wr-file-name [title]").map(cell => cell.textContent),
    picker: document.querySelectorAll("input").find(input => input.type === "file"),
  };
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

test("material search filters after submission, clears with the input, and survives audit updates", () => {
  const { store, get, filter, names } = setupMaterialList();
  const passed = store.uploads().find(item => item.status === "passed");
  const flagged = store.uploads().find(item => item.status === "hit");
  const search = get("[data-wr-file-search]");
  const searchForm = get("form[data-wr-file-search-form]");
  assert.ok(searchForm?.contains(search), "filename search has a form for click and Enter submission");
  assert.equal(searchForm.querySelector('button[type="submit"]')?.textContent.trim(), "搜索");
  assert.equal(filter("all").attributes["aria-pressed"], "true");

  filter("ready").emit("click");
  assert.deepEqual(names(), [passed.name]);
  search.value = flagged.name.toUpperCase();
  search.emit("input");
  assert.deepEqual(names(), [passed.name]);
  assert.equal(searchForm.emit("submit").defaultPrevented, true);
  assert.deepEqual(names(), []);

  search.value = "";
  search.emit("input");
  assert.deepEqual(names(), [passed.name]);
  assert.equal(filter("ready").attributes["aria-pressed"], "true");

  search.value = flagged.name.toUpperCase();
  search.emit("input");
  searchForm.emit("submit");
  filter("audit").emit("click");
  assert.equal(filter("audit").attributes["aria-pressed"], "true");
  assert.deepEqual(names(), [flagged.name]);
  assert.equal(get('[data-wr-file-action="preview"]'), null);

  store.reviewUpload(flagged.id, "passed");
  assert.equal(get("[data-wr-file-search]"), search);
  assert.equal(search.value, flagged.name.toUpperCase());
  assert.deepEqual(names(), []);

  get("[data-wr-file-filter-reset]").emit("click");
  assert.equal(filter("all").attributes["aria-pressed"], "true");
  assert.equal(search.value, "");
  assert.deepEqual(names().sort(), [passed.name, flagged.name].sort());
});

test("successful material uploads clear filters so the new file is visible", () => {
  const { get, filter, names, picker } = setupMaterialList();
  const search = get("[data-wr-file-search]");
  assert.ok(search, "the material list exposes filename search");
  filter("ready").emit("click");
  search.value = "未找到的文件";
  search.emit("input");
  get("[data-wr-file-search-form]").emit("submit");
  assert.deepEqual(names(), []);

  picker.files = [{ name: "新上传素材.pdf", size: 512 }];
  picker.emit("change");

  assert.equal(filter("all").attributes["aria-pressed"], "true");
  assert.equal(search.value, "");
  assert.ok(names().includes("新上传素材.pdf"));
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
  assert.match(js, /data-wr-manage-materials/);
  assert.match(js, /data-wr-material-upload/);
  assert.match(js, /if \(view !== "materials"\) return/);
  assert.match(js, /materialPickerHtml\("data-wr-upload", composeState\.uploads\)/);
  assert.match(js, /materialPickerHtml\("data-wr-wizard-upload", wizardState\.uploads\)/);
  assert.match(css, /\.wr-workspace/);
  assert.match(html, /material-table\.css/);
  assert.match(read("material-table.css"), /\.wr-file-table/);
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

test("both material pickers show only approved uploads and preserve selected IDs", () => {
  const { store } = setup();
  const js = read("src/pages/writing.js");
  const start = js.indexOf("  function materialPickerHtml(");
  const end = js.indexOf("  function selectedMaterials(", start);
  assert.ok(start >= 0 && end > start, "shared material picker must be present");
  const picker = vm.runInNewContext(`(${js.slice(start, end).trim()})`, {
    store,
    html: (value) => String(value).replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;"),
    fileSize: (size) => `${size} B`,
  });
  const passed = store.uploads().find((item) => item.status === "passed");
  const hit = store.uploads().find((item) => item.status === "hit");
  for (const attribute of ["data-wr-upload", "data-wr-wizard-upload"]) {
    const markup = picker(attribute, new Set([passed.id, hit.id]));
    assert.ok(markup.includes(`${attribute}="${passed.id}" checked`));
    assert.ok(!markup.includes(hit.id), "unapproved uploads must not appear in the picker");
  }
  store.reviewUpload(hit.id, "passed");
  assert.ok(picker("data-wr-upload", new Set()).includes(hit.id));
  store.removeUpload(passed.id);
  store.removeUpload(hit.id);
  assert.match(picker("data-wr-wizard-upload", new Set()), /暂无可选文件/);
});
