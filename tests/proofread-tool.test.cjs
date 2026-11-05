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
  for (const token of ["pr-rail", "pr-editor", "pr-result", "审校助手", "审校记录", "文件列表", "审校范围", "开始审校", "全部采纳", "全部不采纳"]) {
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
  assert.doesNotMatch(js, /历史对话/);
  assert.match(js, /新建审校/);
  assert.match(js, /<textarea data-draft-text/);
  assert.match(js, /contenteditable="false"/);
});

function setupFlow(storage = new Map()) {
  let time = 100000;
  let interval;
  let failWrites = false;
  class Clock extends Date { static now() { return time; } }
  const window = {
    BaigeUI: {icon: () => "", escapeHtml: String},
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => {
        if (failWrites) throw new Error("存储空间不足");
        storage.set(key, value);
      },
    },
    addEventListener() {},
  };
  const ctx = vm.createContext({window, Date: Clock, console,
    setInterval: callback => { interval = callback; return 1; }, clearInterval: () => { interval = null; }});
  vm.runInContext(read("src/proofread-store.js"), ctx);
  vm.runInContext(read("src/proofread-tool.js"), ctx);
  const store = window.BaigeProofreadStore;
  const tool = window.BaigeProofreadTool;
  store.initialize([], []);
  return {
    store, storage, tool,
    draft(text = "工做严各") {
      const doc = store.createDraft();
      return store.saveDraft(doc.id, "测试文档", text);
    },
    tick(ms) { time += ms; return store.advance(tool.scanSecret, tool.detect); },
    mount() {
      const {document, Element} = require('./helpers/feature-dom.cjs')();
      document.visibilityState = 'visible';
      ctx.document = document;
      const root = new Element('section');
      document.append(root);
      tool.render(root);
      root.querySelectorAll('input[value]').forEach(input => { input.value = input.attributes.value; });
      return {root, document, advance: ms => { time += ms; interval?.(); }};
    },
    fail() { failWrites = true; },
  };
}

test("drafts persist and submitting locks the original before asynchronous review", () => {
  const flow = setupFlow();
  const draft = flow.draft();
  const restored = setupFlow(flow.storage);
  assert.equal(restored.store.read().records[0].text, "工做严各");
  const review = flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  assert.equal(review.status, "detecting");
  assert.throws(() => flow.store.saveDraft(draft.id, "修改", "新正文"), /锁定/);
  assert.equal(flow.store.startReview({fileId: draft.id, types: ["错别字"]}).reviewId, review.reviewId);
  assert.equal(flow.store.read().history.length, 1);
  assert.equal(flow.tick(2700).history[0].status, "running");
  const finished = flow.tick(3100).history[0];
  assert.equal(finished.status, "done");
  assert.equal(finished.originalText, "工做严各");
  assert.equal(finished.issues.length, 2);
});

test("closing and reloading restores elapsed tasks and independent background results", () => {
  const flow = setupFlow();
  const first = flow.draft();
  flow.store.startReview({fileId: first.id, types: ["错别字"]});
  const second = flow.draft("准奋");
  flow.store.startReview({fileId: second.id, types: ["错别字"]});
  const reloaded = setupFlow(flow.storage);
  const data = reloaded.tick(10000);
  assert.equal(data.history.length, 2);
  assert.ok(data.history.every(review => review.status === "done" && review.unread));
  assert.equal(data.history[1].originalText, first.text);
  assert.equal(data.history[0].originalText, second.text);
});

test("UI submission locks the editor and dismissing the modal preserves a separate draft", () => {
  const flow = setupFlow();
  const ui = flow.mount();
  const get = selector => ui.root.querySelector(selector);
  get('[data-new]').emit('click');
  get('[data-draft-text]').value = '这份文稿需要严各审校。';
  get('[data-draft-text]').emit('input');
  get('[data-run]').emit('click');
  assert.equal(get('[data-dialog]').open, true);
  get('[data-confirm]').emit('click');
  assert.equal(get('[data-secret]').open, true);
  assert.equal(get('[data-draft]').hidden, true);
  assert.equal(get('[data-doc]').attributes.contenteditable, 'false');
  const first = flow.store.read().history[0];
  get('[data-secret-close]').emit('click');
  get('[data-new]').emit('click');
  get('[data-draft-text]').value = '另一份尚未提交的正文';
  get('[data-draft-text]').emit('input');
  ui.advance(10000);
  assert.equal(get('[data-secret]').open, false);
  assert.equal(get('[data-draft-text]').value, '另一份尚未提交的正文');
  assert.equal(get('[data-draft]').hidden, false);
  assert.equal(flow.store.read().history[0].status, 'done');
  ui.root.remove();
  const reopened = flow.mount();
  assert.equal(reopened.root.querySelector('[data-draft-text]').value, '另一份尚未提交的正文');
  reopened.root.querySelector('[data-notice]').emit('click');
  reopened.root.querySelector('[data-accept]').emit('click');
  assert.match(reopened.root.querySelector('[data-doc]').textContent, /严格/);
  reopened.root.querySelector('[data-original]').emit('click');
  assert.match(reopened.root.querySelector('[data-doc]').textContent, /严各/);
  assert.equal(flow.store.read().history.find(item => item.reviewId === first.reviewId).originalText, first.originalText);
});

test("waiting in the modal enters review automatically and manual approval resumes it", () => {
  const flow = setupFlow();
  const ui = flow.mount();
  const get = selector => ui.root.querySelector(selector);
  get('[data-new]').emit('click');
  get('[data-draft-text]').value = '工做';
  get('[data-draft-text]').emit('input');
  get('[data-run]').emit('click');
  get('[data-confirm]').emit('click');
  ui.advance(2800);
  assert.equal(get('[data-secret]').open, false);
  assert.equal(get('[data-run]').textContent, '停止审校');
  get('[data-new]').emit('click');
  get('[data-draft-text]').value = '内部资料工做';
  get('[data-draft-text]').emit('input');
  get('[data-run]').emit('click');
  get('[data-confirm]').emit('click');
  ui.advance(2800);
  get('[data-secret-submit]').emit('click');
  assert.equal(flow.store.read().history[0].status, 'submitted');
  get('[data-secret-approve]').emit('click');
  assert.equal(get('[data-secret]').open, false);
  assert.equal(flow.store.read().history[0].status, 'running');
  get('[data-run]').emit('click');
  ui.advance(10000);
  assert.equal(flow.store.read().history[0].status, 'stopped');
});

test("sensitive submissions wait for manual review and cancelled jobs stay stopped", () => {
  const flow = setupFlow();
  const draft = flow.draft("涉密材料工做");
  const review = flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  assert.equal(flow.tick(3000).history[0].status, "hit");
  flow.store.audit(draft.id, "submitted");
  assert.equal(flow.tick(10000).history[0].status, "submitted");
  flow.store.stopReview(review.reviewId);
  flow.store.audit(draft.id, "passed");
  assert.equal(flow.tick(10000).history[0].status, "stopped");
  assert.equal(flow.store.read().records[0].secretStatus, "passed");
  const retry = flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  assert.equal(retry.status, "running");
  assert.equal(flow.tick(4000).history[0].status, "done");
  assert.equal(flow.store.read().history[1].status, "stopped");
});

test("manual approval resumes the submitted task while rejection blocks it", () => {
  const flow = setupFlow();
  const first = flow.draft("内部资料工做");
  flow.store.startReview({fileId: first.id, types: ["错别字"]});
  flow.tick(3000);
  flow.store.audit(first.id, "submitted");
  flow.store.audit(first.id, "passed");
  assert.equal(flow.tick(5000).history[0].status, "done");
  const second = flow.draft("机密工做");
  flow.store.startReview({fileId: second.id, types: ["错别字"]});
  flow.tick(3000);
  flow.store.audit(second.id, "submitted");
  flow.store.audit(second.id, "rejected");
  assert.equal(flow.tick(10000).history[0].status, "rejected");
  assert.throws(() => flow.store.startReview({fileId: second.id, types: ["错别字"]}), /审核/);
});

test("decisions change only the revision and changed content is screened as a new version", () => {
  const flow = setupFlow();
  const draft = flow.draft("截止目前工做，，");
  const review = flow.store.startReview({fileId: draft.id, types: ["错别字", "标点", "语法"]});
  const done = flow.tick(10000).history[0];
  const grammar = done.issues.find(issue => issue.type === "语法");
  flow.store.decide(review.reviewId, grammar.id, true);
  flow.store.decide(review.reviewId, "all", false);
  const revised = flow.store.read().history[0];
  assert.equal(revised.text, "截至目前工做，，");
  assert.equal(revised.originalText, draft.text);
  assert.equal(flow.store.read().records[0].text, draft.text);
  assert.equal(revised.accepted.length, 1);
  assert.equal(revised.ignored.length, 2);
  const next = flow.store.startReview({reviewId: review.reviewId, types: ["错别字"]});
  assert.equal(next.status, "detecting");
  assert.equal(next.version, 2);
  assert.equal(next.originalText, revised.text);
  assert.notEqual(next.id, draft.id);
  const data = flow.tick(10000);
  assert.equal(data.history[0].issues.length, 1);
  assert.equal(data.history[1].accepted.length, 1);
});

test("empty submissions and failed saves never create partial or duplicated tasks", () => {
  const flow = setupFlow();
  const draft = flow.draft("   ");
  assert.throws(() => flow.store.startReview({fileId: draft.id, types: ["错别字"]}), /正文/);
  flow.store.saveDraft(draft.id, "稿件", "工做");
  flow.fail();
  assert.throws(() => flow.store.startReview({fileId: draft.id, types: ["错别字"]}), /空间/);
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(flow.store.read().records[0].secretStatus, "draft");
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
