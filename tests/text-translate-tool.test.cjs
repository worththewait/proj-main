const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function fakeNode() {
  return {
    innerHTML: "", textContent: "", value: "", style: {}, dataset: {}, open: false, hidden: true, disabled: false,
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, querySelector: () => fakeNode(), querySelectorAll: () => [],
    contains: () => false, append() {}, click() {}, focus() {},
    showModal() { this.open = true; }, close() { this.open = false; },
  };
}

function loadTool() {
  const window = { BaigeUI: { icon: () => "<svg></svg>", escapeHtml: (value) => String(value) } };
  const document = { querySelector: () => null, createElement: () => fakeNode(), body: { append() {} } };
  const context = vm.createContext({ window, document, console, setTimeout, clearTimeout });
  vm.runInContext(read("src/text-translate-tool.js"), context, { filename: "text-translate-tool.js" });
  return window.BaigeTextTranslateTool;
}

test("文本翻译仅在同名工具页挂载，样式与脚本已引入", () => {
  const page = read("src/pages/smart-tools.js");
  assert.match(page, /tool\.name === "文本翻译" && window\.BaigeTextTranslateTool/);
  assert.match(page, /BaigeTextTranslateTool\?\.deactivate\(\)/);
  assert.match(page, /if \(child === "文本翻译"\) window\.BaigeTextTranslateTool\?\.resume\(\)/);
  const html = read("pages/smart-tools.html");
  assert.match(html, /text-translate-tool\.css/);
  assert.match(html, /src\/text-translate-tool\.js/);
});

test("工作区还原线上语言栏、双栏输入输出与最近翻译", () => {
  const js = read("src/text-translate-tool.js");
  for (const token of [
    "支持中英日韩俄语言互译", "输入文本", "翻译结果", "请输入需要翻译的文本...", "翻译结果将显示在这里",
    "可直接在文本框中使用键盘快捷键进行操作（Ctrl+C 复制 / Ctrl+V 粘贴）", "开始翻译",
    "最近翻译", "查看历史全部记录", "翻译历史记录", "搜索翻译内容", "查询", "重置",
    "语言方向", "原文", "译文", "时间", "上一页", "下一页",
  ]) assert.ok(js.includes(token), token);
  const css = read("text-translate-tool.css");
  assert.match(css, /\.tt-panel/);
  assert.match(css, /\.tt-history-item/);
  assert.match(css, /\.tt-dialog/);
});

test("语言选项覆盖中英日韩俄五语", () => {
  const tool = loadTool();
  assert.deepEqual(Array.from(tool.LANGS), ["中文", "英文", "日文", "韩文", "俄文"]);
});

test("演示历史 33 条、最近展示 10 条、弹窗分 7 页", () => {
  const tool = loadTool();
  const records = tool.seedRecords();
  assert.equal(records.length, 33);
  assert.equal(tool.RECENT_LIMIT, 10);
  assert.equal(Math.ceil(records.length / tool.PAGE_SIZE), 7);
  const first = JSON.parse(JSON.stringify(records.slice(0, 2).map(r => [r.from, r.to, r.source, r.result])));
  assert.deepEqual(first, [
    ["中文", "英文", "你是谁", "Who are you?"],
    ["中文", "英文", "身份证", "ID card"],
  ]);
});

test("语言方向在源语言缺失时以破折号占位", () => {
  const tool = loadTool();
  assert.equal(tool.direction({ from: "中文", to: "英文" }), "中文 → 英文");
  assert.equal(tool.direction({ from: "", to: "中文" }), "— → 中文");
});

test("渲染后最近翻译显示 10 条并保留原文与译文", () => {
  const tool = loadTool();
  const root = fakeNode();
  const recent = fakeNode();
  root.querySelector = (selector) => selector === "[data-tt-recent]" ? recent : fakeNode();
  tool.render(root);
  assert.equal((recent.innerHTML.match(/tt-history-item/g) || []).length, 10);
  assert.match(recent.innerHTML, /你是谁/);
  assert.match(recent.innerHTML, /Who are you\?/);
  assert.match(recent.innerHTML, /中文 → 英文/);
});
