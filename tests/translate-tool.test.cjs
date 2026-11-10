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
  const window = {
    BaigeUI: { icon: () => "<svg></svg>", escapeHtml: (value) => String(value) },
    BaigeProofreadTool: { scanSecret: name => name.includes("机密") ? ["机密"] : [] },
  };
  const document = { querySelector: () => null, createElement: () => fakeNode(), body: { append() {} } };
  const context = vm.createContext({ window, document, console, setTimeout, clearTimeout });
  vm.runInContext(read("src/secret-file-list.js"), context);
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
  assert.match(html, /src\/translate-audit\.js[^]*src\/translate-tool\.js/);
});

test("工作区沿用纠错布局，统一涉密列表保留两个语言列和翻译状态列", () => {
  const js = read("src/translate-tool.js");
  for (const token of [
    "上传本地文件", "支持拖放 PDF、Word", "100 MB",
    "翻译记录", "源语言", "目标语言", "上传时间", "翻译状态",
    "下载", "查看", "上一页", "下一页", "第 ", "页 / 共 ", "页",
  ]) assert.ok(js.includes(token), token);
  const css = read("translate-tool.css");
  assert.match(css, /\.dt-table/);
  assert.match(css, /\.dt-dialog/);
  assert.match(js, /class="dt-page pr-intake"/);
  assert.match(js, /fileList\.header\("源语言", "目标语言", "翻译状态"\)/);
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
      ["机密秘密.pdf", "中文", "英文", "待解析"],
      ["小作文2.pdf", "中文", "英文", "翻译成功"],
      ["小作文.docx", "中文", "英文", "翻译失败"],
    ],
  );
  assert.ok(records.some(item => item.status === "error" && tool.STATUS[item.status].label === "翻译失败"));
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
  assert.match(body.innerHTML, /<td>中文<\/td><td>英文<\/td>/);
  assert.match(body.innerHTML, /32\.67 KB/);
  const firstRow = body.innerHTML.split("</tr>")[0];
  assert.match(firstRow, /data-status="hit"/);
  assert.match(firstRow, /class="dt-status-empty"[^>]*>—<\/span>/);
  assert.doesNotMatch(firstRow, /翻译成功|翻译失败/);
  assert.doesNotMatch(firstRow, /data-dt-action="(?:view|download)"/);
  assert.match(firstRow, /data-dt-action="delete"/);
  const secondRow = body.innerHTML.split("</tr>")[1];
  assert.match(secondRow, /data-dt-action="view"/);
  assert.match(secondRow, /data-dt-action="download"/);
  assert.equal((body.innerHTML.match(/<tr>/g) || []).length, 5);
  assert.match(pager.innerHTML, /第 1 页 \/ 共 6 页/);
  assert.match(pager.innerHTML, /data-dt-action="prev" disabled/);
});
