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
  for (const token of ["pr-rail", "pr-editor", "pr-result", "审校助手", "审校记录", "文件选择", "审校范围", "开始审校", "全部采纳", "全部忽略"]) {
    assert.ok(js.includes(token), token);
  }
  assert.doesNotMatch(js, /返回工具目录|data-options/);
  const css = read("proofread-tool.css");
  assert.match(css, /grid-template-columns: clamp\([^)]*\) repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.pr-issue/);
  assert.match(css, /\.pr-hit/);
  // 智能工具页只在纠错校对时挂载该工作台。
  assert.match(read("src/pages/smart-tools.js"), /tool\.name === "纠错校对" && window\.BaigeProofreadTool/);
  assert.match(read("pages/smart-tools.html"), /proofread-tool\.css/);
});

test("review records are shown by default and the file list remains available", () => {
  const js = read("src/proofread-tool.js");
  assert.match(js, /data-view="history" aria-selected="true"[\s\S]*?data-view="files" aria-selected="false"/);
  assert.match(js, /data-upload/);
  assert.doesNotMatch(js, /历史对话|新建审校/);
});

function loadReviewFlow() {
  const element = {value: "", querySelectorAll: () => [], setAttribute() {}, scrollIntoView() {}};
  const run = {};
  let tick;
  const window = {BaigeUI: {icon: () => "", escapeHtml: String}};
  const context = vm.createContext({
    window,
    setInterval: callback => { tick = callback; return 1; },
    clearInterval: () => { tick = undefined; },
    setTimeout: () => 1,
    clearTimeout() {},
  });
  const source = read("src/proofread-tool.js").replace(
    "  window.BaigeProofreadTool =",
    `  window.testFlow = {state, switchView, openDoc, openReview, startCheck, acceptIssue, ignoreIssue,
      stop: () => stopCheck(), setDOM: value => { dom = value; }};
  window.BaigeProofreadTool =`,
  );
  vm.runInContext(source, context);
  const flow = window.testFlow;
  flow.setDOM(new Proxy({run}, {get: (elements, name) => elements[name] ?? element}));
  return {
    ...flow,
    run,
    hasTimer: () => Boolean(tick),
    finish() {
      for (let i = 0; tick && i < 20; i++) tick();
      assert.equal(flow.state.status, "done");
    },
  };
}

test("cleared files preview their original text until an explicit start creates a running record", () => {
  const flow = loadReviewFlow();
  const record = {id: "file", name: "公开稿", fileName: "公开稿.txt", text: "工做严各", secretStatus: "detecting"};
  flow.state.records.push(record);
  flow.switchView("files");
  flow.openDoc(record.id);
  assert.equal(flow.state.session, null);
  assert.equal(flow.hasTimer(), false);

  record.secretStatus = "passed";
  flow.openDoc(record.id);
  assert.equal(flow.state.session.text, record.text);
  assert.equal(flow.state.view, "files");
  assert.equal(flow.state.status, "idle");
  assert.equal(flow.state.issues.length, 0);
  assert.equal(flow.state.history.length, 0);
  assert.equal(flow.hasTimer(), false);

  flow.startCheck();
  assert.equal(flow.state.view, "history");
  assert.equal(flow.state.status, "running");
  assert.equal(flow.state.history.length, 1);
  const reviewId = flow.state.session.reviewId;
  assert.ok(reviewId);
  assert.equal(flow.state.history[0].reviewId, reviewId);
  assert.equal(flow.state.history[0].status, "running");
  assert.equal(flow.state.session.text, record.text);

  flow.startCheck();
  assert.equal(flow.state.history.length, 1);
  flow.finish();
  assert.equal(flow.state.history[0].status, "done");
  const [first, second] = flow.state.issues;
  assert.equal(first.type, "错别字");
  flow.acceptIssue(first.id);
  flow.ignoreIssue(second.id);

  flow.switchView("files");
  flow.openDoc(record.id);
  assert.equal(flow.state.session.text, "工做严各");
  flow.startCheck();
  flow.finish();
  assert.equal(flow.state.history.length, 2);
  assert.notEqual(flow.state.session.reviewId, reviewId);
  assert.equal(flow.state.accepted.size, 0);
  assert.equal(flow.state.ignored.size, 0);

  flow.openReview(reviewId);
  assert.equal(flow.state.session.text, "工作严各");
  assert.equal(flow.state.issues[0].type, "错别字");
  assert.equal(flow.state.accepted.has(first.id), true);
  assert.equal(flow.state.ignored.has(second.id), true);
});

test("stopping preserves the review record and retrying creates a separate run", () => {
  const flow = loadReviewFlow();
  const record = {id: "file", name: "公开稿", fileName: "公开稿.txt", text: "工做", secretStatus: "passed"};
  flow.state.records.push(record);
  flow.switchView("files");
  flow.openDoc(record.id);
  flow.state.session.reviewTypes = ["错别字"];
  flow.startCheck();
  const stoppedId = flow.state.session.reviewId;
  flow.stop();
  assert.equal(flow.hasTimer(), false);
  assert.equal(flow.state.status, "stopped");
  assert.equal(flow.state.history[0].status, "stopped");
  flow.openReview(stoppedId);
  assert.equal(flow.state.session.text, record.text);
  assert.equal(flow.state.status, "stopped");

  flow.startCheck();
  assert.equal(flow.state.history.length, 2);
  assert.notEqual(flow.state.session.reviewId, stoppedId);
  flow.finish();
  assert.equal(flow.state.history[1].reviewId, stoppedId);
  assert.equal(flow.state.history[1].status, "stopped");
  assert.deepEqual(Array.from(flow.state.session.reviewTypes), ["错别字"]);
});

test("re-review uses the corrected document and chosen scope while keeping the original record", () => {
  const flow = loadReviewFlow();
  const file = {id: "file", name: "公开稿", fileName: "公开稿.txt", text: "工做，，其它", secretStatus: "passed"};
  flow.state.records.push(file);
  flow.openDoc(file.id);
  assert.equal(flow.run.textContent, "开始审校");
  flow.startCheck();
  assert.equal(flow.run.textContent, "停止审校");
  flow.finish();
  assert.equal(flow.run.textContent, "重新审校");
  assert.equal(flow.run.disabled, false);
  const firstReviewId = flow.state.session.reviewId;
  const typo = flow.state.issues.find((issue) => issue.word === "工做");
  flow.acceptIssue(typo.id);

  flow.startCheck(["错别字", "标点"]);
  assert.equal(flow.state.history.length, 2);
  assert.notEqual(flow.state.session.reviewId, firstReviewId);
  assert.equal(flow.state.session.text, "工作，，其它");
  flow.finish();
  assert.deepEqual(Array.from(flow.state.issues, (issue) => issue.word), ["，，"]);
  assert.equal(flow.state.accepted.size, 0);
  assert.equal(file.text, "工做，，其它");

  flow.openReview(firstReviewId);
  assert.equal(flow.state.session.text, "工作，，其它");
  assert.equal(flow.state.accepted.has(typo.id), true);
  assert.equal(flow.state.issues.length, 3);
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
  assert.deepEqual(Array.from(tool.detect("工做其它，，", ["标点"]), (issue) => issue.word), ["，，"]);
  assert.deepEqual(Array.from(tool.scanSecret("纪要.txt", "型号研制任务")), ["型号", "研制"]);
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
