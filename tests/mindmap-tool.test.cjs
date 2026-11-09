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
  for (const token of ["描述主题", "上传文档", "输入大纲", "试个示例", "生成思维导图", "编辑大纲", "重新生成", "导出图片", "历史记录"]) {
    assert.ok(js.includes(token), token);
  }
  assert.doesNotMatch(js, /data-mm-flow|流程图生成待接入/);
  assert.match(js, /data-tool="流程图生成"/);
});

test("plain outlines use the first line as the title and retain indentation as hierarchy", () => {
  const tool = loadTool();
  const doc = tool.parseOutline(tool.normalizeOutline("设备维护\n检查项目\n  船体外板\n  动力系统\n工作安排\n  确认检修时间"));
  assert.equal(doc.name, "设备维护");
  assert.deepEqual(Array.from(doc.children, branch => branch.name), ["检查项目", "工作安排"]);
  assert.deepEqual(Array.from(doc.children[0].children, child => child.name), ["船体外板", "动力系统"]);
  assert.equal(tool.normalizeOutline("## 标题\n### 分支"), "## 标题\n### 分支");
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

test("document outlines preserve Markdown sections and use local excerpts for plain text", () => {
  const tool = loadTool();
  const markdown = tool.parseOutline(tool.outlineFromFile("船舶.md", "# 船舶维护\n## 甲板\n- 检查起重机\n## 机舱\n- 检查油液"));
  assert.equal(markdown.name, "船舶维护");
  assert.deepEqual(Array.from(markdown.children, branch => branch.name), ["甲板", "机舱"]);
  const plain = tool.parseOutline(tool.outlineFromFile("设备检查.txt", "检查绞车。更换密封。\n记录问题。"));
  assert.equal(plain.name, "设备检查");
  assert.deepEqual(Array.from(plain.children[0].children, item => item.name), ["检查绞车。", "更换密封。", "记录问题。"]);
});

test("workspace renders a two-column shell with a dotted canvas", () => {
  const css = read("mindmap-tool.css");
  assert.match(css, /\.mm-app\s*\{[^}]*grid-template-columns: clamp\([^)]*\) minmax\(0, 1fr\)/);
  assert.doesNotMatch(css, /\.mm-app\.is-file-mode/);
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
