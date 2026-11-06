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
  for (const token of ["pr-rail", "pr-editor", "pr-result", "审校记录", "文件列表", "审校范围", "开始审校", "全部采纳", "全部不采纳"]) {
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

test("the file list opens first without showing the input or the review workspace", () => {
  const {get} = setupFlow().mount();
  assert.equal(get('[data-files]').hidden, false);
  assert.equal(get('[data-intake-editor]').hidden, true);
  assert.equal(get('[data-workbench]').hidden, true);
  assert.equal(get('[data-files-empty]').hidden, false);
  assert.ok(get('[data-upload]'));
  assert.deepEqual(get('.wr-file-table').querySelectorAll('th').map(cell => cell.textContent), [
    '文件名', '文件来源', '文档类型', '版本号', '创建时间', '解析状态', '涉密审查状态', '最近更新', '操作',
  ]);
});

function setupFlow(storage = new Map()) {
  let time = 100000;
  let interval;
  let nextTimeout = 0;
  const timeouts = new Map();
  let failWrites = false;
  class Clock extends Date { static now() { return time; } }
  class FileReader {
    readAsText(file) { this.result = file.text; this.onload(); }
  }
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
  const ctx = vm.createContext({window, Date: Clock, FileReader, console,
    setInterval: callback => { interval = callback; return 1; }, clearInterval: () => { interval = null; },
    setTimeout(callback, delay) {
      const id = ++nextTimeout;
      timeouts.set(id, {callback, due: time + delay});
      return id;
    },
    clearTimeout: id => timeouts.delete(id),
  });
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
      return {
        root, document,
        get: selector => root.querySelector(selector),
        advance(ms) {
          const end = time + ms;
          while (timeouts.size) {
            const [id, timer] = [...timeouts].sort((a, b) => a[1].due - b[1].due)[0];
            if (timer.due > end) break;
            time = timer.due;
            interval?.();
            if (timeouts.delete(id)) timer.callback();
          }
          time = end;
          interval?.();
        },
      };
    },
    fail() { failWrites = true; },
    restore() { failWrites = false; },
  };
}

function typeDraft(get, text) {
  get('[data-new]').emit('click');
  const editor = get('[data-draft-text]');
  editor.value = text;
  editor.emit('input');
}

function submitDraft(get) {
  assert.equal(get('[data-intake-submit]').disabled, false);
  get('[data-intake-editor]').emit('submit');
  assert.equal(get('[data-dialog]').open, true);
  get('[data-confirm]').emit('click');
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

test("submitting text locks the original and background completion does not interrupt a new draft", () => {
  const flow = setupFlow();
  const {get, root, advance} = flow.mount();
  const original = '计划完成，，这份文稿需要严各审校。';
  typeDraft(get, original);
  submitDraft(get);
  assert.equal(get('[data-intake-notice]').open, true);
  assert.equal(get('[data-intake-editor]').hidden, true);
  assert.equal(get('[data-workbench]').hidden, true);
  assert.equal(get('[data-doc]').attributes.contenteditable, 'false');
  const first = flow.store.read().history[0];
  assert.equal(first.originalText, original);
  get('[data-notice-close]').emit('click');
  typeDraft(get, '另一份尚未提交的正文');
  advance(10000);
  assert.equal(get('[data-intake-notice]').open, false);
  assert.equal(get('[data-draft-text]').value, '另一份尚未提交的正文');
  assert.equal(get('[data-intake-editor]').hidden, false);
  assert.equal(flow.store.read().history[0].status, 'done');

  root.remove();
  const {get: reopened} = flow.mount();
  assert.equal(reopened('[data-draft-text]').value, '');
  reopened('[data-intake-review]').emit('click');
  assert.equal(reopened('[data-workbench]').classList.contains('is-result-only'), true);
  assert.equal(reopened('#proofreadRail').hidden, true);
  assert.equal(reopened('[data-run]').hidden, true);
  assert.equal(reopened('[data-original]'), null);
  const [punctuation, typo] = flow.store.read().history[0].issues;
  assert.equal(punctuation.word, '，，');
  assert.equal(typo.word, '严各');
  reopened(`[data-accept="${punctuation.id}"]`).emit('click');
  reopened(`[data-ignore="${typo.id}"]`).emit('click');
  assert.equal(reopened('[data-doc]').textContent.length, original.length);
  assert.equal(reopened(`[data-hit="${punctuation.id}"]`).textContent, punctuation.word);
  assert.equal(reopened(`[data-hit="${typo.id}"]`).textContent, typo.word);
  const decided = flow.store.read().history[0];
  assert.equal(decided.originalText, original);
  assert.ok(decided.accepted.includes(punctuation.id));
  assert.ok(decided.ignored.includes(typo.id));
});

test("text review opens automatically after the five-second notice closes", () => {
  const flow = setupFlow();
  const {get, advance} = flow.mount();
  typeDraft(get, '工做');
  submitDraft(get);
  advance(4999);
  assert.equal(get('[data-intake-notice]').open, true);
  assert.equal(get('[data-workbench]').hidden, true);
  assert.equal(flow.store.read().history[0].status, 'running');
  advance(1);
  assert.equal(get('[data-intake-notice]').open, false);
  assert.equal(get('[data-workbench]').hidden, false);
  assert.equal(get('#proofreadRail').hidden, false);
  assert.equal(get('[data-run]').textContent, '停止审校');
  get('[data-run]').emit('click');
  advance(10000);
  assert.equal(flow.store.read().history[0].status, 'stopped');
  assert.equal(get('[data-run]').hidden, true);
  get('[data-workbench] [data-intake-back]').emit('click');
  assert.equal(get('[data-intake-start]'), null);
  assert.equal(get('[data-intake-review]').textContent, '查看状态');
});

test("saved legacy results display the original and retain issue locations after old text replacements", () => {
  const flow = setupFlow();
  const original = '计划完成，，请严各审校。';
  const draft = flow.draft(original);
  flow.store.startReview({fileId: draft.id, types: ['错别字', '标点']});
  const data = flow.tick(10000);
  const review = data.history[0];
  const [punctuation, typo] = review.issues;
  // Older saves replaced accepted text and moved later issue offsets into the revision.
  review.text = original.replace('，，', '，');
  review.accepted.push(punctuation.id);
  typo.start--;
  typo.end--;
  flow.storage.set('baige.proofread.v1', JSON.stringify(data));

  const {get} = flow.mount();
  get('[data-intake-review]').emit('click');
  assert.equal(get('[data-doc]').textContent.length, original.length);
  assert.equal(get(`[data-hit="${typo.id}"]`).textContent, '严各');
  assert.match(get(`[data-issue="${punctuation.id}"]`).textContent, /已采纳/);
});

test("sensitive submissions wait for manual review and cancelled jobs cannot restart", () => {
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
  assert.throws(() => flow.store.startReview({fileId: draft.id, types: ["错别字"]}), /校对|审校/);
  assert.equal(flow.store.read().history.length, 1);
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

test("decisions are recorded without modifying original text or issue offsets", () => {
  const flow = setupFlow();
  const draft = flow.draft("截止目前工做，，");
  const review = flow.store.startReview({fileId: draft.id, types: ["错别字", "标点", "语法"]});
  const done = flow.tick(10000).history[0];
  const punctuation = done.issues.find(issue => issue.type === "标点");
  flow.store.decide(review.reviewId, punctuation.id, true);
  flow.store.decide(review.reviewId, "all", false);
  const decided = flow.store.read().history[0];
  assert.equal(decided.text, draft.text);
  assert.equal(decided.originalText, draft.text);
  assert.deepEqual(decided.issues, done.issues);
  assert.equal(flow.store.read().records[0].text, draft.text);
  assert.equal(decided.accepted[0], punctuation.id);
  assert.equal(decided.ignored.length, 2);
  assert.throws(() => flow.store.startReview({fileId: draft.id, types: ["错别字"]}), /校对|审校/);
  assert.equal(flow.store.read().history.length, 1);
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

test("uploaded files pass screening before manual review and can reopen the result in two columns", () => {
  const flow = setupFlow();
  const {get, advance} = flow.mount();
  get('[data-file]').files = [{name: '会议纪要.txt', text: '工做内容'}];
  get('[data-file]').emit('change');
  assert.equal(get('[data-intake-notice]').open, true);
  assert.equal(flow.store.read().records[0].secretStatus, 'detecting');
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(get('[data-intake-start]'), null);
  get('[data-notice-close]').emit('click');
  advance(3000);
  assert.equal(flow.store.read().records[0].secretStatus, 'passed');
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(get('[data-files]').hidden, false);
  assert.equal(get('[data-workbench]').hidden, true);
  get('[data-intake-start]').emit('click');
  assert.equal(get('[data-dialog]').open, true);
  get('[data-confirm]').emit('click');
  assert.equal(get('[data-workbench]').hidden, false);
  assert.equal(get('#proofreadRail').hidden, false);
  assert.equal(get('[data-workbench]').classList.contains('is-result-only'), false);
  assert.equal(flow.store.read().history[0].status, 'running');
  advance(4000);
  get('[data-workbench] [data-intake-back]').emit('click');
  const viewResult = get('[data-intake-review]');
  assert.equal(viewResult.textContent, '查看结果');
  viewResult.emit('click');
  assert.equal(get('[data-workbench]').hidden, false);
  assert.equal(get('#proofreadRail').hidden, true);
  assert.equal(get('[data-workbench]').classList.contains('is-result-only'), true);
  assert.match(get('[data-doc]').textContent, /工做/);
  assert.ok(get('[data-accept]'));
});

test("uploaded suspicious files require manual approval before offering proofreading", () => {
  const flow = setupFlow();
  const {get, advance} = flow.mount();
  get('[data-file]').files = [{name: '资料.txt', text: '内部资料工做'}];
  get('[data-file]').emit('change');
  advance(5000);
  assert.equal(flow.store.read().records[0].secretStatus, 'hit');
  assert.equal(get('[data-intake-start]'), null);
  get('[data-intake-secret]').emit('click');
  get('[data-secret-submit]').emit('click');
  assert.equal(flow.store.read().records[0].secretStatus, 'submitted');
  get('[data-secret-approve]').emit('click');
  assert.equal(flow.store.read().records[0].secretStatus, 'passed');
  assert.equal(flow.store.read().history.length, 0);
  get('[data-secret-close]').emit('click');
  assert.ok(get('[data-intake-start]'));
  assert.equal(get('[data-workbench]').hidden, true);
});

test("unsubmitted text stays local and a failed submission retains it for retry without partial records", () => {
  const flow = setupFlow();
  const {get} = flow.mount();
  typeDraft(get, '   ');
  assert.equal(get('[data-intake-submit]').disabled, true);
  get('[data-intake-editor]').emit('submit');
  assert.equal(get('[data-dialog]').open, false);
  typeDraft(get, '只在内存里的正文');
  assert.equal(flow.store.read().records.length, 0);
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(flow.storage.get('baige.proofread.v1').includes('只在内存里的正文'), false);
  flow.fail();
  submitDraft(get);
  assert.equal(get('[data-intake-notice]').open, false);
  assert.equal(get('[data-intake-editor]').hidden, false);
  assert.equal(get('[data-draft-text]').value, '只在内存里的正文');
  assert.equal(flow.store.read().records.length, 0);
  assert.equal(flow.store.read().history.length, 0);
  flow.restore();
  submitDraft(get);
  assert.equal(flow.store.read().records.length, 1);
  assert.equal(flow.store.read().records[0].text, '只在内存里的正文');
  assert.equal(flow.store.read().history.length, 1);
});

test("deleting a file also clears its review history", () => {
  const flow = setupFlow();
  const draft = flow.draft("工做");
  flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  flow.tick(10000);
  assert.equal(flow.store.read().records.length, 1);
  assert.equal(flow.store.read().history.length, 1);
  flow.store.remove(draft.id);
  assert.equal(flow.store.read().records.length, 0);
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(flow.store.remove(draft.id), null);
});

test("file list asks for confirmation before deleting a submitted file", () => {
  const flow = setupFlow();
  const draft = flow.draft('要被删除的正文');
  flow.store.startReview({fileId: draft.id, types: ['错别字']});
  flow.tick(10000);
  const {get} = flow.mount();
  const remove = get('[data-delete]');
  assert.ok(remove, '文件列表应有删除入口');
  remove.emit('click');
  assert.equal(get('[data-confirm-delete]').open, true);
  assert.match(get('[data-delete-text]').textContent, /1 条审校记录/);
  get('[data-delete-ok]').emit('click');
  assert.equal(get('[data-confirm-delete]').open, false);
  assert.equal(flow.store.read().records.length, 0);
  assert.equal(flow.store.read().history.length, 0);
});

test("returning to the file list preserves unsubmitted text in the current tool", () => {
  const flow = setupFlow();
  const {get} = flow.mount();
  typeDraft(get, '临时内容');
  get('[data-intake-editor] [data-intake-back]').emit('click');
  assert.equal(get('[data-files]').hidden, false);
  assert.equal(get('[data-intake-editor]').hidden, true);
  assert.equal(get('[data-delete]'), null);
  get('[data-new]').emit('click');
  assert.equal(get('[data-draft-text]').value, '临时内容');
  assert.equal(flow.store.read().records.length, 0);
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
