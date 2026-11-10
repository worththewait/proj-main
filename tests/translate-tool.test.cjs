const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function fakeNode() {
  return {
    innerHTML: "", textContent: "", value: "", style: {}, dataset: {}, open: false, hidden: true,
    classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, querySelector: () => fakeNode(), querySelectorAll: () => [],
    contains: () => false, append() {}, click() {}, showModal() { this.open = true; }, close() { this.open = false; },
  };
}

function loadTool() {
  const window = { BaigeUI: { icon: () => "<svg></svg>", escapeHtml: (value) => String(value) } };
  const document = { querySelector: () => null, createElement: () => fakeNode(), body: { append() {} } };
  const context = vm.createContext({ window, document, console, setTimeout, clearTimeout });
  vm.runInContext(read("src/translate-tool.js"), context, { filename: "translate-tool.js" });
  return window.BaigeDocTranslateTool;
}

test("文档翻译仅在同名工具页挂载，样式与脚本已引入", () => {
  const page = read("src/pages/smart-tools.js");
  assert.match(page, /tool\.name === "文档翻译" && window\.BaigeDocTranslateTool/);
  assert.match(page, /BaigeDocTranslateTool\?\.deactivate\(\)/);
  assert.match(page, /if \(child === "文档翻译"\) window\.BaigeDocTranslateTool\?\.resume\(\)/);
  const html = read("pages/smart-tools.html");
  assert.match(html, /translate-tool\.css/);
  assert.match(html, /src\/translate-tool\.js/);
});

test("工作区还原线上上传卡片与六列历史表格", () => {
  const js = read("src/translate-tool.js");
  for (const token of [
    "翻译文档上传", "拖放文档到此处，或点击选择文件", "支持 PDF、Word，最大文件大小 100MB", "选择文件",
    "文档翻译历史", "文件名", "源语言", "目标语言", "状态", "时间", "操作",
    "下载", "查看", "上一页", "下一页", "第 ", "页 / 共 ", "页",
  ]) assert.ok(js.includes(token), token);
  const css = read("translate-tool.css");
  assert.match(css, /\.dt-dropzone/);
  assert.match(css, /\.dt-table/);
  assert.match(css, /\.dt-dialog/);
});

test("上传仅接受 PDF / Word，且限制 100MB", () => {
  const tool = loadTool();
  for (const name of ["规范.pdf", "报告.PDF", "说明.doc", "纪要.docx"]) assert.equal(tool.isAllowed(name), true, name);
  for (const name of ["清单.xlsx", "图片.png", "笔记.txt", ""]) assert.equal(tool.isAllowed(name), false, name);
  assert.equal(tool.MAX_SIZE, 100 * 1024 * 1024);
});

test("文件大小格式化与线上展示一致", () => {
  const tool = loadTool();
  assert.equal(tool.formatSize(33454), "32.67 KB");
  assert.equal(tool.formatSize(83702), "81.74 KB");
  assert.equal(tool.formatSize(2 * 1024 * 1024), "2.00 MB");
  assert.equal(tool.formatSize(0), "");
});

test("演示历史共 27 条、分 6 页，首屏与线上记录一致", () => {
  const tool = loadTool();
  const records = tool.seedRecords();
  assert.equal(records.length, 27);
  assert.equal(Math.ceil(records.length / tool.PAGE_SIZE), 6);
  const first = JSON.parse(JSON.stringify(
    records.slice(0, 3).map(({ name, from, to, status }) => [name, from, to, tool.STATUS[status].label]),
  ));
  assert.deepEqual(
    first,
    [
      ["机密秘密.pdf", "中文", "英文", "翻译成功"],
      ["小作文2.pdf", "中文", "英文", "翻译成功"],
      ["小作文.docx", "中文", "英文", "翻译失败"],
    ],
  );
  assert.ok(records.some(item => tool.STATUS[item.status].label === "处理失败"));
  assert.ok(records.every(item => !/\.xlsx$/i.test(item.name)), "历史不应出现上传不支持的格式");
});

test("渲染后首页显示 5 条、分页为第 1 页 / 共 6 页", () => {
  const tool = loadTool();
  const root = fakeNode();
  const body = fakeNode();
  const pager = fakeNode();
  root.querySelector = (selector) => selector === "[data-dt-body]" ? body : selector === "[data-dt-pager]" ? pager : fakeNode();
  tool.render(root);
  assert.match(body.innerHTML, /机密秘密\.pdf/);
  assert.match(body.innerHTML, /翻译成功/);
  assert.match(body.innerHTML, /翻译失败/);
  assert.equal((body.innerHTML.match(/<tr>/g) || []).length, 5);
  assert.match(pager.innerHTML, /第 1 页 \/ 共 6 页/);
  assert.match(pager.innerHTML, /data-dt-action="prev" disabled/);
});
