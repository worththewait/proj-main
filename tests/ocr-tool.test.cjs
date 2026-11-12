const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadTool({ document, URL, schedule = setTimeout } = {}) {
  const window = {
    BaigeUI: { icon: () => "<svg></svg>", escapeHtml: value => String(value) },
    BaigeProofreadFile: { read: file => file.text() },
    BaigeProofreadPdf: { read: async bytes => new TextDecoder().decode(bytes) },
    BaigeProofreadTool: { scanSecret: (_name, text) => text.includes("机密") ? ["机密"] : [] },
  };
  const context = vm.createContext({ window, document, URL, Blob, atob, TextEncoder, setTimeout: schedule, clearTimeout, navigator: {} });
  for (const file of ["secret-file-list", "translate-audit", "ocr-audit"]) {
    const script = `src/${file}.js`;
    vm.runInContext(read(script), context, { filename: script });
  }
  vm.runInContext(read("src/ocr-sample-files.js"), context, { filename: "ocr-sample-files.js" });
  vm.runInContext(read("src/ocr-source-zip.js"), context, { filename: "ocr-source-zip.js" });
  vm.runInContext(read("src/ocr-tool.js"), context, { filename: "ocr-tool.js" });
  return window.BaigeOcrTool;
}

test("OCR 工具已接入智能工具页", () => {
  const html = read("pages/smart-tools.html");
  assert.match(html, /ocr-tool\.css/);
  assert.match(html, /src\/ocr-sample-files\.js[\s\S]*src\/ocr-tool\.js/);
  assert.match(html, /src\/ocr-audit\.js[\s\S]*src\/ocr-tool\.js/);
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
});

test("原文件弹窗只在确认后下载所选文件，取消会清空勾选", async () => {
  const { root, page, input, search, dialog, sourceList, confirm, selectAll, count, downloads } = mountTool();
  assert.match(root.innerHTML, /data-oc-action="download-source"[^>]+aria-label="下载原文件"[^>]*>/);
  search.value = "不会匹配到文件";
  search.emit("input");
  page.click({ ocAction: "download-source" });
  assert.equal(dialog.open, true);
  assert.match(sourceList.innerHTML, /思维导图 - 百舸门户\.pdf/);
  assert.doesNotMatch(sourceList.innerHTML, /演示样例/);
  assert.match(root.innerHTML, />取消</);
  assert.match(root.innerHTML, />确认下载</);
  assert.equal(confirm.disabled, true);
  assert.equal(downloads.length, 0);

  const checks = sourceList.querySelectorAll("[data-oc-source-file]");
  assert.equal(checks.length, loadTool().seedRecords().length);
  selectAll.checked = true;
  dialog.emit("change", { target: selectAll });
  assert.ok(checks.filter(check => !check.disabled).every(check => check.checked));
  assert.equal(checks.find(check => check.dataset.ocSourceFile === "f5").checked, false);
  checks[0].checked = false;
  dialog.emit("change", { target: checks[0] });
  assert.equal(selectAll.indeterminate, true);
  page.click({ ocAction: "close-source-download" });
  assert.equal(dialog.open, false);
  assert.equal(downloads.length, 0);
  page.click({ ocAction: "download-source" });
  assert.equal(confirm.disabled, true);
  page.click({ ocAction: "close-source-download" });

  const file = new Blob(["示例 PDF 原始内容"], { type: "application/pdf" });
  file.name = "船舶记录.pdf";
  const otherFile = new Blob(["另一份文档"], { type: "application/pdf" });
  otherFile.name = "另一份文件.pdf";
  input.files = [file, otherFile];
  input.emit("change");
  await new Promise(setImmediate);
  page.click({ ocAction: "download-source" });
  const selected = sourceList.querySelectorAll("[data-oc-source-file]")[1];
  selected.checked = true;
  dialog.emit("change", { target: selected });
  assert.equal(confirm.disabled, false);
  assert.equal(count.textContent, "已选 1 项");
  assert.equal(downloads.length, 0);
  await page.click({ ocAction: "confirm-source-download" });
  assert.equal(downloads.at(-1).name, "船舶记录.pdf");
  assert.equal(downloads.at(-1).blob, file);
  assert.equal(dialog.open, false);
});

test("多选原文件只下载一个 ZIP，保留重名文件的内容", async () => {
  const { page, input, dialog, sourceList, downloads } = mountTool();
  input.files = [new Blob(["A"]), new Blob(["B"]), new Blob(["C"])];
  for (const [index, file] of input.files.entries()) {
    file.name = index === 2 ? "记录 (2).pdf" : "记录.pdf";
  }
  input.emit("change");
  await new Promise(setImmediate);
  page.click({ ocAction: "download-source" });
  const selected = sourceList.querySelectorAll("[data-oc-source-file]").slice(0, 3);
  for (const check of selected) check.checked = true;
  dialog.emit("change", { target: selected[0] });
  await page.click({ ocAction: "confirm-source-download" });

  assert.equal(downloads.length, 1);
  assert.equal(downloads[0].name, "OCR原文件.zip");
  const bytes = Buffer.from(await downloads[0].blob.arrayBuffer());
  const entries = new Map();
  let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const length = bytes.readUInt32LE(offset + 18);
    const nameEnd = offset + 30 + bytes.readUInt16LE(offset + 26);
    const dataStart = nameEnd + bytes.readUInt16LE(offset + 28);
    entries.set(bytes.toString("utf8", offset + 30, nameEnd), bytes.toString("utf8", dataStart, dataStart + length));
    offset = dataStart + length;
  }
  assert.deepEqual(entries, new Map([["记录 (2).pdf", "C"], ["记录.pdf", "B"], ["记录 (3).pdf", "A"]]));
});

test("右上导出已完成的 Markdown 或 JSON 解析结果", async () => {
  const { root, page, input, resultButton, downloads, finishParsing } = mountTool();
  assert.match(root.innerHTML, />下载解析结果</);
  assert.equal(resultButton.disabled, true);
  page.click({ ocFile: "f4" });
  assert.equal(resultButton.disabled, true);
  page.click({ ocFile: "f1" });
  assert.equal(resultButton.disabled, false);

  const file = new Blob(["示例 PDF 原始内容"], { type: "application/pdf" });
  file.name = "船舶记录.pdf";
  input.files = [file];
  input.emit("change");
  await new Promise(setImmediate);
  assert.equal(resultButton.disabled, true);
  finishParsing();
  assert.equal(resultButton.disabled, false);
  page.click({ ocAction: "download-result" });
  assert.equal(downloads[0].name, "船舶记录-解析结果.md");
  assert.match(await downloads[0].blob.text(), /# 船舶记录\n[\s\S]*解析结果由本地示例内容生成/);

  page.click({ ocTab: "json" });
  page.click({ ocAction: "download-result" });
  assert.equal(downloads[1].name, "船舶记录-解析结果.json");
  const result = JSON.parse(await downloads[1].blob.text());
  assert.equal(result.source, "船舶记录.pdf");
  assert.equal(result.pages, 1);
  assert.ok(result.paragraphs[0].includes("演示环境"));
  assert.equal(Object.hasOwn(result, "file"), false);
});

test("OCR 核查通过前隐藏原文和结果并拦截源文件下载", async () => {
  const { page, input, preview, result, resultButton, sourceList, downloads, finishParsing } = mountTool();
  const file = new Blob(["船舶资料正文"]);
  file.name = "船舶资料.docx";
  input.files = [file];
  input.emit("change");
  assert.match(preview.innerHTML, /正在进行涉密核查/);
  assert.doesNotMatch(preview.innerHTML, /船舶资料正文/);
  assert.match(result.innerHTML, /核查通过后自动解析/);
  page.click({ ocAction: "download-source" });
  const box = sourceList.querySelectorAll("[data-oc-source-file]")[0];
  assert.equal(box.disabled, true);
  box.checked = true;
  await page.click({ ocAction: "confirm-source-download" });
  assert.equal(downloads.length, 0);

  await new Promise(setImmediate);
  assert.match(preview.innerHTML, /船舶资料正文/);
  assert.match(result.innerHTML, /正在解析/);
  assert.equal(resultButton.disabled, true);
  assert.equal(sourceList.querySelectorAll("[data-oc-source-file]")[0].disabled, false);
  finishParsing();
  assert.equal(resultButton.disabled, false);
});

test("可疑文件须提交人工审核，图片和无文字 PDF 自动转人工", async () => {
  const { page, input, auditDialog, auditBody, list, preview, finishParsing, resultButton } = mountTool();
  const uploads = [
    ["含机密的演示文字", "记录.docx"],
    ["image", "图片.png"],
    ["", "扫描.pdf"],
  ].map(([text, name]) => Object.assign(new Blob([text || " "]), { name }));
  input.files = uploads;
  input.emit("change");
  await new Promise(setImmediate);

  const ids = [...list.innerHTML.matchAll(/data-oc-file="([^"]+)"/g)].map(match => match[1]);
  page.click({ ocAction: "audit", ocAuditId: ids[2] });
  assert.equal(auditDialog.open, true);
  assert.match(auditBody.innerHTML, /涉密可疑/);
  assert.doesNotMatch(auditBody.innerHTML, /含机密的演示文字/);
  page.click({ ocAction: "audit-submit" });
  assert.match(auditBody.innerHTML, /审核中/);
  page.click({ ocAction: "audit-reject" });
  assert.match(auditBody.innerHTML, /已驳回/);

  page.click({ ocFile: ids[0] });
  assert.match(preview.innerHTML, /等待人工审核/);
  page.click({ ocAction: "audit", ocAuditId: ids[1] });
  assert.match(auditBody.innerHTML, /图片/);
  assert.match(auditBody.innerHTML, /审核中/);
  page.click({ ocFile: ids[1] });
  page.click({ ocAction: "audit-approve" });
  assert.match(preview.innerHTML, /<img/);
  finishParsing();
  assert.equal(resultButton.disabled, false);
});

function mountTool() {
  function element() {
    const handlers = {};
    return {
      addEventListener(type, callback) { handlers[type] = callback; },
      emit(type, event) { return handlers[type]?.(event); },
      querySelector: () => null,
      setAttribute() {},
      open: false,
      showModal() { this.open = true; },
      close() { this.open = false; },
    };
  }
  const downloads = [];
  const blobs = new Map();
  const parsing = [];
  const document = {
    contains: () => false,
    querySelector: () => element(),
    createElement() {
      return {
        click() { downloads.push({ name: this.download, blob: blobs.get(this.href) }); },
        remove() {},
      };
    },
    body: { append() {} },
  };
  const tool = loadTool({
    document,
    URL: {
      createObjectURL(blob) {
        const url = `blob:${blobs.size}`;
        blobs.set(url, blob);
        return url;
      },
      revokeObjectURL(url) { blobs.delete(url); },
    },
    schedule(callback, delay) { if (delay === 1200) parsing.push(callback); },
  });
  const nodes = {
    ".oc-page": element(),
    "[data-oc-list]": element(),
    "[data-oc-preview]": element(),
    "[data-oc-result]": element(),
    "[data-oc-search]": element(),
    ".oc-file-input": element(),
    "[data-oc-source-dialog]": element(),
    "[data-oc-source-list]": element(),
    "[data-oc-source-all]": element(),
    "[data-oc-source-count]": element(),
    "[data-oc-audit-dialog]": element(),
    "[data-oc-audit-body]": element(),
    "[data-oc-audit-actions]": element(),
    '[data-oc-action="confirm-source-download"]': element(),
    '[data-oc-action="download-result"]': element(),
  };
  let checks = [];
  const sourceList = nodes["[data-oc-source-list]"];
  Object.defineProperty(sourceList, "innerHTML", {
    get() { return this.markup; },
    set(value) {
      this.markup = value;
      checks = [...value.matchAll(/data-oc-source-file="([^"]+)"([^>]*)>/g)]
        .map(([, id, attrs]) => ({ dataset: { ocSourceFile: id }, checked: attrs.includes("checked"), disabled: attrs.includes("disabled") }));
    },
  });
  sourceList.querySelectorAll = selector => selector.endsWith(":checked") ? checks.filter(box => box.checked) : checks;
  const page = nodes[".oc-page"];
  page.click = dataset => page.emit("click", {
    target: {
      closest: selector => dataset[{
        "[data-oc-action]": "ocAction", "[data-oc-tab]": "ocTab", "[data-oc-file]": "ocFile",
      }[selector]] ? { dataset } : null,
    },
  });
  const root = { classList: { add() {} }, querySelector: selector => nodes[selector] };
  tool.render(root);
  return {
    root, page, input: nodes[".oc-file-input"], downloads,
    preview: nodes["[data-oc-preview]"],
    result: nodes["[data-oc-result]"],
    list: nodes["[data-oc-list]"],
    auditDialog: nodes["[data-oc-audit-dialog]"],
    auditBody: nodes["[data-oc-audit-body]"],
    search: nodes["[data-oc-search]"],
    dialog: nodes["[data-oc-source-dialog]"],
    sourceList,
    selectAll: nodes["[data-oc-source-all]"],
    count: nodes["[data-oc-source-count]"],
    confirm: nodes['[data-oc-action="confirm-source-download"]'],
    resultButton: nodes['[data-oc-action="download-result"]'],
    finishParsing: () => parsing.shift()(),
  };
}

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
