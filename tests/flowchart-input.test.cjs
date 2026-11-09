const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const window = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/flowchart-input.js"), "utf8"), { window });
const { parse } = window.BaigeFlowchartInput;
const labels = ({ nodes }) => Array.from(nodes, ({ label }) => label);
const routes = ({ edges }) => Array.from(edges, ({ from, to, label }) => [from, to, label]);

test("plain sentence creates a sequence without requiring symbols", () => {
  const graph = parse("先接收报修申请，再安排维修，最后确认结果。");
  assert.deepEqual(labels(graph), ["接收报修申请", "安排维修", "确认结果"]);
  assert.deepEqual(routes(graph), [[0, 1, ""], [1, 2, ""]]);
  assert.deepEqual(Array.from(graph.nodes, ({ kind }) => kind), ["start", "step", "end"]);
});

test("a pasted list keeps numbers in step text and strips list markers", () => {
  const graph = parse("1. 记录厚度\r\n（二）0.25 毫米处复测 → 归档报告");
  assert.deepEqual(labels(graph), ["记录厚度", "0.25 毫米处复测", "归档报告"]);
  assert.deepEqual(labels(parse("先导试验\n记录结果")), ["先导试验", "记录结果"]);
});

test("an explicit yes and no form a fork and keep both outcomes terminal", () => {
  const graph = parse("先核对检验材料。如果材料齐全，就安排现场检验；否则，通知申请人补充。");
  assert.deepEqual(labels(graph), ["核对检验材料", "材料齐全？", "安排现场检验", "通知申请人补充"]);
  assert.deepEqual(routes(graph), [[0, 1, ""], [1, 2, "是"], [1, 3, "否"]]);
  assert.deepEqual(Array.from(graph.nodes, ({ kind }) => kind), ["start", "decision", "end", "end"]);
  assert.deepEqual(labels(parse("接收材料\n若材料齐全，则归档；否则退回补充。")), ["接收材料", "材料齐全？", "归档", "退回补充"]);
  assert.deepEqual(routes(parse("如果材料齐全就归档，否则退回补充")), [[0, 1, "是"], [0, 2, "否"]]);
});

test("ambiguous conditions and missing outcomes report a plain-language correction", () => {
  assert.throws(() => parse("接收材料。如果材料齐全，就归档。"), /两种结果/);
  assert.throws(() => parse("若材料齐全，就；否则退回。"), /两种结果/);
  assert.throws(() => parse("接收材料。如果材料齐全，就归档；否则退回。最后登记结果。"), /无论结果如何/);
  assert.throws(() => parse("接收材料；视情况归档。"), /两种结果/);
  assert.throws(() => parse("核对材料｜是：2"), /日常说法/);
});

test("an explicitly shared next step joins the two branches", () => {
  const graph = parse("核对材料。如果材料齐全，就安排检验；否则退回补充；无论结果如何，最后登记结果。");
  assert.deepEqual(labels(graph), ["核对材料", "材料齐全？", "安排检验", "退回补充", "登记结果"]);
  assert.deepEqual(routes(graph), [[0, 1, ""], [1, 2, "是"], [1, 3, "否"], [2, 4, ""], [3, 4, ""]]);
  assert.throws(() => parse("如果材料齐全就归档，否则退回；两种情况都"), /补充两种结果/);
});

test("empty and oversized flows are rejected before rendering", () => {
  assert.throws(() => parse(""), /至少两个步骤/);
  assert.throws(() => parse("接收材料\n" + "内容".repeat(21)), /第 2 步太长/);
  assert.throws(() => parse(Array(25).fill("核对材料").join("\n")), /最多生成 24 个/);
});
