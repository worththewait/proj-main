const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadTool() {
  const window = { BaigeUI: { icon: () => "<svg></svg>", escapeHtml: value => String(value) } };
  const document = { querySelector: () => null, contains: () => false, createElement: () => ({ setAttribute() {}, append() {}, classList: { add() {} }, style: {} }), body: { append() {} } };
  const context = vm.createContext({ window, document, console, JSON, Math, Number, String, Object, Array, Date, setTimeout, clearTimeout, navigator: {} });
  vm.runInContext(read("src/ocr-tool.js"), context, { filename: "ocr-tool.js" });
  return window.BaigeOcrTool;
}

test("OCR 工具已接入智能工具页", () => {
  const html = read("pages/smart-tools.html");
  assert.match(html, /ocr-tool\.css/);
  assert.match(html, /src\/ocr-tool\.js/);
  const router = read("src/pages/smart-tools.js");
  assert.match(router, /tool\.name === "OCR识别" && window\.BaigeOcrTool/);
  assert.match(router, /BaigeOcrTool\?\.resume\(\)/);
  assert.match(router, /BaigeOcrTool\?\.deactivate\(\)/);
});

test("工作区为三栏：文件列表 / 文档预览 / 解析结果", () => {
  const js = read("src/ocr-tool.js");
  for (const token of [
    "OCR解析工具", "上传文件", "搜索文件...", "点击上传文件，拖拽文件到此处",
    "支持的文件格式：PDF、Excel、Docx、Doc、图片", "大小不超过100M",
    "请先选择文件", "Markdown渲染", "保存", "复制", "下载",
  ]) assert.ok(js.includes(token), token);

  const css = read("ocr-tool.css");
  assert.match(css, /grid-template-columns:\s*196px/);
  assert.match(css, /\.oc-files/);
  assert.match(css, /\.oc-preview/);
  assert.match(css, /\.oc-result/);
  assert.match(css, /\.oc-drop/);
});

test("结果区八个标签与线上一致", () => {
  const tool = loadTool();
  assert.equal(tool.TABS.map(tab => tab.label).join(","), "Markdown,JSON,内容,表格,图表,公式,图片,页眉页脚");
  const css = read("ocr-tool.css");
  assert.match(css, /\.oc-tab\.is-active/);
  assert.match(css, /\.oc-result-foot/);
});

test("演示文件与状态覆盖完成与失败两种结果", () => {
  const tool = loadTool();
  const records = tool.seedRecords();
  assert.ok(records.length >= 8);
  assert.ok(records.some(item => item.status === "done"));
  assert.ok(records.some(item => item.status === "failed"));
  const done = records.find(item => item.status === "done");
  assert.ok(done.paragraphs.length && done.pages, "解析完成的文件应有正文与页数");
});

test("上传仅接受文档与图片，且不超过 100MB", () => {
  const tool = loadTool();
  for (const name of ["a.pdf", "b.doc", "c.docx", "d.xls", "e.xlsx", "f.png", "g.jpg", "H.JPEG"]) {
    assert.equal(tool.isAllowed(name), true, name);
  }
  for (const name of ["a.txt", "b.zip", "c.exe"]) assert.equal(tool.isAllowed(name), false, name);
  assert.equal(tool.MAX_SIZE, 100 * 1024 * 1024);
  assert.equal(tool.formatSize(1024), "1 KB");
  assert.equal(tool.formatSize(2 * 1024 * 1024), "2.0 MB");
});

test("上传按钮用文件+向上箭头图标，与下载图标区分", () => {
  const js = read("src/ocr-tool.js");
  assert.match(js, /const UPLOAD_ICON = '<svg class="icon"[^']*M6 3h7l5 5v13H6Z/);
  assert.match(js, /data-oc-action="upload">\$\{UPLOAD_ICON\}/);
  assert.doesNotMatch(js, /data-oc-action="upload">\$\{icon\("upload"\)\}/);
  assert.match(js, /data-oc-action="download">\$\{icon\("download"\)\}/);
});

test("下载按钮回传上传的源文件", () => {
  const js = read("src/ocr-tool.js");
  assert.match(js, /function downloadSource/);
  assert.match(js, /URL\.createObjectURL\(record\.file\)/);
  assert.match(js, /link\.download = record\.name/);
  assert.match(js, /该记录为演示数据，上传文件后可下载原文件/);
  assert.match(js, /file, status: "running"/);
});

test("搜索、上传、标签切换与复制在脚本中闭环", () => {
  const js = read("src/ocr-tool.js");
  assert.match(js, /data-oc-search/);
  assert.match(js, /state\.keyword/);
  assert.match(js, /addFiles\(/);
  assert.match(js, /解析中/);
  assert.match(js, /解析完成/);
  assert.match(js, /解析失败/);
  assert.match(js, /data-oc-tab/);
  assert.match(js, /data-oc-render/);
  assert.match(js, /navigator\.clipboard/);
  // 焦点描边不落在工作区容器上
  assert.match(read("ocr-tool.css"), /\.tool-detail-workspace\.oc-workspace:focus \{ outline: none; \}/);
});
