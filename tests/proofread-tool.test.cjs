const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

function loadTool() {
  const window = { BaigeUI: { icon: () => "", escapeHtml: (value) => String(value) } };
  const context = vm.createContext({ window, console });
  vm.runInContext(read("src/proofread-tool.js"), context, { filename: "proofread-tool.js" });
  return window.BaigeProofreadTool;
}

test("proofread tool exposes the three-column workspace hooks", () => {
  const js = read("src/proofread-tool.js");
  for (const token of ["pr-rail", "pr-editor", "pr-result", "审校助手", "历史对话", "新建审校", "审核配置", "开始审校", "全部采纳", "全部忽略"]) {
    assert.ok(js.includes(token), token);
  }
  const css = read("proofread-tool.css");
  assert.match(css, /grid-template-columns: 236px minmax\(0, 1fr\) 292px/);
  assert.match(css, /\.pr-issue/);
  assert.match(css, /\.pr-hit/);
  // 智能工具页只在纠错校对时挂载该工作台。
  assert.match(read("src/pages/smart-tools.js"), /tool\.name === "纠错校对" && window\.BaigeProofreadTool/);
  assert.match(read("pages/smart-tools.html"), /proofread-tool\.css/);
});

test("left rail switches between the review history and the new-document entry", () => {
  const js = read("src/proofread-tool.js");
  // 两个入口分别使用平台已有的 history / newchat 图标。
  assert.match(js, /icon\('history'\)/);
  assert.match(js, /icon\('newchat'\)/);
  assert.match(js, /data-view="history"/);
  assert.match(js, /data-view="editor"/);
  // 进入工具时默认停在历史文件列表。
  assert.match(js, /state\.view = 'history'/);
  const css = read("proofread-tool.css");
  assert.match(css, /\.pr-switch-btn\.is-active/);
  assert.match(css, /\.pr-doc\.is-alert/);
});

test("uploaded files carry the library secret-review states, new documents do not", () => {
  const tool = loadTool();
  assert.deepEqual(Array.from(tool.scanSecret("纪要.txt", "型号研制任务")), ["型号", "研制"]);
  assert.deepEqual(Array.from(tool.scanSecret("公开稿.md", "普通内容")), []);
  // 文件名也参与检测。
  assert.deepEqual(Array.from(tool.scanSecret("涉密清单.txt", "正文")), ["涉密"]);

  const js = read("src/proofread-tool.js");
  for (const label of ["检测中", "已通过", "涉密可疑", "审核中", "无需检测"]) assert.ok(js.includes(label), label);
  // 本地新建的文档不进入检测流程。
  assert.match(js, /source: 'new'[\s\S]{0,160}secretStatus: 'none'/);
  // 未通过的三种状态会拦截编辑区。
  assert.match(js, /const BLOCKED = \['detecting', 'hit', 'submitted'\]/);

  const css = read("proofread-tool.css");
  for (const selector of [".pr-tag.is-success", ".pr-guard", ".pr-secret", ".pr-timeline li.is-warn"]) {
    assert.ok(css.includes(selector), selector);
  }
  assert.match(js, /流转记录/);
  assert.match(js, /命中关键词/);
});

test("detects dictionary typos and punctuation issues in the sample document", () => {
  const tool = loadTool();
  const issues = tool.detect("各部门需要对本年度的工做进行严各的审校，确宝数据准却，，其它事项另行通知。");
  const words = Array.from(issues, (item) => item.word);
  assert.deepEqual(words.sort(), ["严各", "其它", "，，", "工做", "确宝", "准却"].sort());
  const work = issues.find((item) => item.word === "工做");
  assert.equal(work.suggestion, "工作");
  assert.equal(work.type, "错别字");
  const grammar = issues.find((item) => item.word === "其它");
  assert.equal(grammar.suggestion, "其他");
  assert.equal(grammar.type, "语法");
  const punct = issues.find((item) => item.word === "，，");
  assert.equal(punct.type, "标点");
  assert.equal(punct.suggestion, "，");
});

test("every issue carries a stable display number and offsets inside the text", () => {
  const tool = loadTool();
  const text = "工做要严各";
  const issues = tool.detect(text);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].no, "01");
  assert.equal(issues[1].no, "02");
  for (const issue of issues) {
    assert.equal(text.slice(issue.start, issue.end), issue.word);
  }
  // 默认示例覆盖错别字与标点两类，便于演示。
  assert.match(tool.SAMPLE, /工做/);
  assert.match(tool.SAMPLE, /会仪/);
});
