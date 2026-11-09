const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadTool() {
  const context = vm.createContext({ window: {} });
  vm.runInContext(read("src/ui.js"), context);
  vm.runInContext(read("src/flowchart-tool.js"), context);
  return context.window.BaigeFlowchartTool;
}

test("plain steps link in order and support arrow-separated input", () => {
  const graph = loadTool().parseSteps("接收材料 → 登记材料；完成归档");
  assert.deepEqual(Array.from(graph.nodes, (node) => node.label), ["接收材料", "登记材料", "完成归档"]);
  assert.deepEqual(Array.from(graph.edges, ({ from, to }) => [from, to]), [[0, 1], [1, 2]]);
});

test("decimal measurements at the beginning of a step are kept as label text", () => {
  const graph = loadTool().parseSteps("记录厚度\n0.25 毫米处复测");
  assert.equal(graph.nodes[1].label, "0.25 毫米处复测");
});

test("decision targets stay separate and a terminal step does not fall through", () => {
  const graph = loadTool().parseSteps("1. 接收材料\n2. 材料齐全？｜是：3｜否：4\n3. 完成归档 | 结束\n4. 退回补充 | 下一步: 1");
  assert.equal(graph.nodes[1].kind, "decision");
  assert.equal(graph.nodes[2].kind, "end");
  assert.deepEqual(Array.from(graph.edges, ({ from, to, label }) => [from, to, label]), [[0, 1, ""], [1, 2, "是"], [1, 3, "否"], [3, 0, ""]]);
});

test("invalid or incomplete branch input reports the problem", () => {
  const tool = loadTool();
  assert.throws(() => tool.parseSteps("接收材料"), /至少/);
  assert.throws(() => tool.parseSteps("核查材料 | 是: 2\n完成归档"), /第 1 步.*是.*否/);
  assert.throws(() => tool.parseSteps("核查材料 | 是: 2 | 否: 5\n完成归档"), /第 1 步.*第 5 步/);
  assert.throws(() => tool.parseSteps("1. 核查材料\n3. 完成归档"), /第 2 步.*编号/);
});

test("SVG embeds directional connectors and escapes labels for preview and export", () => {
  const tool = loadTool();
  const graph = tool.parseSteps("接收 <材料>\n是否齐全？ | 是: 3 | 否: 4\n归档 | 结束\n退回 | 结束");
  const svg = tool.buildSvg(graph);
  assert.match(svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, /接收 &lt;材料&gt;/);
  assert.match(svg, /marker-end="url\(#fc-arrow\)"/);
  assert.match(svg, />是<\/text>/);
  assert.match(svg, />否<\/text>/);
  assert.match(svg, /<polygon/);
});
