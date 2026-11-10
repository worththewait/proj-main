const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function makeStore() {
  const store = new Map();
  const node = (key) => {
    if (store.has(key)) return store.get(key);
    const value = {
      innerHTML: "", textContent: "", value: "", style: {}, dataset: {}, hidden: false, open: false,
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      addEventListener() {}, click() {}, focus() {}, querySelectorAll: () => [], contains: () => false,
      showModal() {}, close() {},
    };
    value.querySelector = (selector) => node(`${key}>${selector}`);
    store.set(key, value);
    return value;
  };
  return { node, store };
}

function loadTool() {
  const { node } = makeStore();
  const window = { BaigeUI: { icon: () => "<svg class='icon'></svg>", escapeHtml: (value) => String(value) } };
  const document = { querySelector: () => null, createElement: () => node("el"), body: { append() {} }, addEventListener() {} };
  const context = vm.createContext({ window, document, console, setTimeout, clearTimeout });
  vm.runInContext(read("src/literature-tool.js"), context, { filename: "literature-tool.js" });
  return { tool: window.BaigeLiteratureTool, node };
}

test("文献伴读仅在同名工具页挂载，样式与脚本已引入", () => {
  const page = read("src/pages/smart-tools.js");
  assert.match(page, /tool\.name === "文献伴读" && window\.BaigeLiteratureTool/);
  assert.match(page, /BaigeLiteratureTool\?\.deactivate\(\)/);
  assert.match(page, /if \(child === "文献伴读"\) window\.BaigeLiteratureTool\?\.resume\(\)/);
  const html = read("pages/smart-tools.html");
  assert.match(html, /literature-tool\.css/);
  assert.match(html, /src\/literature-tool\.js/);
});

test("列表页还原上传区、历史表与状态分支", () => {
  const js = read("src/literature-tool.js");
  for (const token of [
    "文献伴读", "百舸文献伴读，读懂每一篇船舶科研文献。",
    "拖放文档到此处，或点击选择文件", "支持 PDF、Word，最大文件大小 100MB", "选择文件",
    "文献伴读历史", "文件名", "文档状态", "时间", "操作", "开始伴读", "删除",
    "已入库", "检测中", "涉密可疑", "失败",
  ]) assert.ok(js.includes(token), token);
  const css = read("literature-tool.css");
  assert.match(css, /\.lt-dropzone/);
  assert.match(css, /\.lt-table/);
  assert.match(css, /\.lt-reader-body/);
});

test("演示记录 9 篇，检测中不可伴读且不显示删除", () => {
  const { tool } = loadTool();
  const records = tool.seedRecords();
  assert.equal(records.length, 9);
  assert.equal(tool.PAGE_SIZE, 10);
  const parsing = records.filter(rec => rec.status === "parsing");
  assert.equal(parsing.length, 2);
  assert.equal(tool.STATUS.parsing.canRead, false);
  assert.equal(tool.STATUS.parsing.canDelete, false);
  assert.equal(tool.STATUS.done.canRead, true);
  assert.equal(tool.STATUS.done.canDelete, true);
});

test("渲染列表后包含文献名、状态与伴读按钮", () => {
  const { tool, node } = loadTool();
  const root = node("root");
  tool.render(root);
  const table = node("root>[data-lt-list]>[data-lt-table]");
  assert.match(table.innerHTML, /试点总结框架-数据需要10\.13\.docx/);
  assert.match(table.innerHTML, /已入库/);
  assert.match(table.innerHTML, /开始伴读/);
  assert.match(table.innerHTML, /data-lt-action="read"/);
});

test("阅读页含五个页签与伴读面板", () => {
  const { tool, node } = loadTool();
  const root = node("root");
  tool.render(root);
  tool.openReader("lt-0");
  const reader = node("root>[data-lt-reader]");
  for (const label of ["返回", "伴读", "思维导图", "翻译", "专业术语", "问答"]) {
    assert.ok(reader.innerHTML.includes(label), label);
  }
  assert.match(reader.innerHTML, /data-lt-action="tab"/);
  const panel = node("root>[data-lt-reader]>[data-lt-panel]");
  assert.match(panel.innerHTML, /概要/);
  assert.match(panel.innerHTML, /按页导读/);
});
