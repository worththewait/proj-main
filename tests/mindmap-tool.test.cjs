const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadTool() {
  const window = { BaigeUI: { icon: () => "", escapeHtml: (value) => String(value) } };
  const storage = { getItem: () => null, setItem: () => {} };
  const context = vm.createContext({ window, console, localStorage: storage });
  vm.runInContext(read("src/mindmap-tool.js"), context, { filename: "mindmap-tool.js" });
  return window.BaigeMindmapTool;
}

test("mind map mounts on the smart-tools page for the mind-map tool only", () => {
  assert.match(read("src/pages/smart-tools.js"), /tool\.name === "思维导图生成" && window\.BaigeMindmapTool/);
  assert.match(read("pages/smart-tools.html"), /mindmap-tool\.css/);
  assert.match(read("pages/smart-tools.html"), /src\/mindmap-tool\.js/);
  const js = read("src/mindmap-tool.js");
  for (const token of ["自然语言", "文档上传", "输入大纲", "填入示例需求", "生成思维导图", "生成流程图", "编辑大纲", "重新生成", "导出图片", "历史记录"]) {
    assert.ok(js.includes(token), token);
  }
});

test("outline parsing keeps ### branches and indented list items on separate levels", () => {
  const tool = loadTool();
  const doc = tool.parseOutline([
    "## 8000TEU甲板机械选型",
    "### 总体目标",
    "- 提升装卸效率",
    "  - 更细的一层",
    "### 关键技术",
    "- 电动液压起重机",
  ].join("\n"));

  assert.equal(doc.name, "8000TEU甲板机械选型");
  assert.deepEqual(Array.from(doc.children, (child) => child.name), ["总体目标", "关键技术"]);
  assert.equal(doc.children[0].depth, 1);
  assert.deepEqual(Array.from(doc.children[0].children, (child) => child.name), ["提升装卸效率"]);
  assert.equal(doc.children[0].children[0].depth, 2);
  assert.deepEqual(Array.from(doc.children[0].children[0].children, (child) => child.name), ["更细的一层"]);
  assert.equal(doc.children[0].children[0].children[0].depth, 3);
  // 每个分支下的条目不能串到别的分支
  assert.deepEqual(Array.from(doc.children[1].children, (child) => child.name), ["电动液压起重机"]);
});

test("outline title falls back when the root heading is missing", () => {
  const tool = loadTool();
  assert.equal(tool.outlineTitle("## 绿色船舶技术路线\n### 动力方案"), "绿色船舶技术路线");
  assert.equal(tool.outlineTitle("### 只有分支"), "未命名导图");
  assert.equal(tool.outlineTitle(""), "未命名导图");
});

test("workspace renders a two-column shell with a dotted canvas", () => {
  const css = read("mindmap-tool.css");
  assert.match(css, /\.mm-app\s*\{[^}]*grid-template-columns: 344px minmax\(0, 1fr\)/);
  assert.match(css, /\.mm-canvas\s*\{[^}]*background-image: radial-gradient/);
  // 导图样式内联在 SVG 上，导出为图片时不再依赖页面 CSS
  const js = read("src/mindmap-tool.js");
  assert.match(js, /<path d="M\$\{sx\}[^`]*fill="none" stroke="\$\{tone\}"/);
  assert.match(js, /<text x="\$\{node\.x\}" y="\$\{y\}" fill="#333" font-size="16"/);
  assert.match(js, /<line x1="\$\{node\.x\}"[^`]*stroke="\$\{tone\}"/);
});

test("generating shows the outline as an indented list instead of raw markdown", () => {
  const js = read("src/mindmap-tool.js");
  assert.match(js, /function toStreamLine/);
  assert.match(js, /replace\(\/\^##\\s\+\/, ""\)/);
  assert.match(js, /mm-stream-bullet/);
  // 流式过程不能把 ## / - 原文直接塞进页面
  assert.doesNotMatch(js, /escape\(l\)\}<\/span>/);
});

test("history is scoped to this tool and capped", () => {
  const js = read("src/mindmap-tool.js");
  assert.match(js, /const KEY = "baige\.mindmap\.v1"/);
  assert.match(js, /slice\(0, 30\)/);
});
