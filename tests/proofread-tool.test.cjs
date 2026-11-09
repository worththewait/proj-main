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

test("proofread tool exposes the document and result workspace hooks", () => {
  const js = read("src/proofread-tool.js");
  for (const token of ["pr-editor", "pr-result", "文件列表", "审校范围", "开始审校", "全部采纳", "全部不采纳"]) {
    assert.ok(js.includes(token), token);
  }
  assert.doesNotMatch(js, /返回工具目录|data-options/);
  const css = read("proofread-tool.css");
  assert.match(css, /\.pr-app\s*\{[^}]*grid-template-columns: minmax\(0, 1\.55fr\) minmax\(0, 1fr\)/);
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
  const table = get('.secret-file-table');
  assert.ok(table);
  assert.deepEqual(table.querySelectorAll('th').map(cell => cell.textContent), ['文件名', '上传时间', '文档状态', '操作']);
});

test("file status filters and name search combine and can be reset from an empty result", () => {
  const flow = setupFlow();
  const submitFile = (fileName, text) => flow.store.submitFile({fileName, text, source: 'upload'});
  submitFile('海试通知.txt', '工做');
  const completed = submitFile('海试报告.txt', '工做');
  const rejected = submitFile('设备台账.txt', '内部资料工做');
  flow.tick(3000);
  flow.store.startReview({fileId: completed.id, types: ['错别字']});
  flow.store.audit(rejected.id, 'submitted');
  flow.store.audit(rejected.id, 'rejected');
  flow.tick(3000);
  const {get} = flow.mount();
  const filter = value => get(`[data-file-filter="${value}"]`);
  const search = get('[data-file-search]');
  const searchForm = get('[data-file-search-form]');
  const names = () => get('[data-intake-table]').querySelectorAll('.wr-file-name span').map(cell => cell.textContent);

  assert.equal(filter('all').attributes['aria-pressed'], 'true');
  filter('ready').emit('click');
  assert.equal(filter('all').attributes['aria-pressed'], 'false');
  assert.equal(filter('ready').attributes['aria-pressed'], 'true');
  assert.deepEqual(names(), ['海试通知.txt']);
  filter('audit').emit('click');
  assert.deepEqual(names(), ['设备台账.txt']);
  filter('done').emit('click');
  assert.deepEqual(names(), ['海试报告.txt']);

  search.value = '海试';
  searchForm.emit('submit');
  assert.deepEqual(names(), ['海试报告.txt']);
  filter('all').emit('click');
  assert.deepEqual(names(), ['海试报告.txt', '海试通知.txt']);
  search.value = '海试通知';
  searchForm.emit('submit');
  filter('done').emit('click');
  assert.deepEqual(names(), []);
  assert.equal(get('[data-files-empty]').hidden, false);

  get('[data-file-filter-reset]').emit('click');
  assert.equal(filter('all').attributes['aria-pressed'], 'true');
  assert.equal(search.value, '');
  assert.equal(get('[data-files-empty]').hidden, true);
  assert.deepEqual(names(), ['设备台账.txt', '海试报告.txt', '海试通知.txt']);
});

test("a newly uploaded file is visible when a filter and search were active", async () => {
  const {get} = setupFlow().mount();
  const search = get('[data-file-search]');
  get('[data-file-filter="ready"]').emit('click');
  search.value = '另一个文件';
  get('[data-file-search-form]').emit('submit');
  const input = get('[data-file]');
  input.files = [{name: '新上传材料.txt', size: 12, text: async () => '工做内容'}];
  input.emit('change');
  await new Promise(setImmediate);

  assert.equal(search.value, '');
  assert.equal(get('[data-file-filter="all"]').attributes['aria-pressed'], 'true');
  assert.equal(get('[data-file-table]').hidden, false);
  assert.match(get('[data-intake-table] tr').textContent, /新上传材料\.txt/);
});

function setupFlow(storage = new Map()) {
  let time = 100000;
  let interval;
  let nextTimeout = 0;
  const timeouts = new Map();
  let failWrites = false;
  let allowDiscard = false;
  const confirmations = [];
  const downloads = [];
  const blobs = new Map();
  class TestURL extends URL {
    static createObjectURL(blob) {
      const url = 'blob:test/' + blobs.size;
      blobs.set(url, blob);
      return url;
    }
    static revokeObjectURL(url) { blobs.delete(url); }
  }
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
    confirm(message) {
      confirmations.push(message);
      return allowDiscard;
    },
  };
  const ctx = vm.createContext({window, Date: Clock, URL: TestURL, Blob, DOMException, console,
    document: {currentScript: {src: 'file:///prototype/src/proofread-file.js'}},
    setInterval: callback => { interval = callback; return 1; }, clearInterval: () => { interval = null; },
    setTimeout(callback, delay) {
      const id = ++nextTimeout;
      timeouts.set(id, {callback, due: time + delay});
      return id;
    },
    clearTimeout: id => timeouts.delete(id),
  });
  vm.runInContext(read("src/proofread-store.js"), ctx);
  vm.runInContext(read("src/proofread-file.js"), ctx);
  vm.runInContext(read("src/secret-file-list.js"), ctx);
  vm.runInContext(read("src/proofread-tool.js"), ctx);
  const store = window.BaigeProofreadStore;
  const tool = window.BaigeProofreadTool;
  store.initialize([], []);
  return {
    store, storage, tool, confirmations, downloads,
    confirmDiscard(value) { allowDiscard = value; },
    draft(text = "工做严各") {
      const doc = store.createDraft();
      return store.saveDraft(doc.id, "测试文档", text);
    },
    tick(ms) { time += ms; return store.advance(tool.scanSecret, tool.detect); },
    mount() {
      const {document, Element} = require('./helpers/feature-dom.cjs')();
      document.visibilityState = 'visible';
      const createElement = document.createElement;
      document.createElement = tag => {
        const element = createElement(tag);
        if (tag === 'a') {
          element.click = () => downloads.push({name: element.download, blob: blobs.get(element.href)});
        }
        return element;
      };
      ctx.document = document;
      const root = new Element('section');
      document.append(root);
      let dirty = false;
      tool.render(root, value => { dirty = value; });
      root.querySelectorAll('input[value]').forEach(input => { input.value = input.attributes.value; });
      return {
        root, document,
        isDirty: () => dirty,
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
  assert.equal(reopened('#proofreadRail'), null);
  assert.equal(reopened('[data-run]').hidden, true);
  assert.equal(reopened('[data-original]'), null);
  const [punctuation, typo] = flow.store.read().history[0].issues;
  assert.equal(punctuation.word, '，，');
  assert.equal(typo.word, '严各');
  reopened(`[data-accept="${punctuation.id}"]`).emit('click');
  reopened(`[data-ignore="${typo.id}"]`).emit('click');
  assert.equal(reopened('[data-char]').textContent, `字数统计 ${original.length - 1}`);
  assert.equal(reopened(`[data-hit="${punctuation.id}"]`).textContent, punctuation.suggestion);
  assert.equal(reopened(`[data-hit="${typo.id}"]`).textContent, typo.word);
  const decided = flow.store.read().history[0];
  assert.equal(decided.originalText, original);
  assert.equal(decided.accepted.length, 0);
  assert.equal(decided.ignored.length, 0);
});

test("text review opens automatically after the five-second notice closes", () => {
  const flow = setupFlow();
  const {get, advance} = flow.mount();
  typeDraft(get, '工做');
  submitDraft(get);
  assert.equal(get('[data-notice-countdown]')?.textContent, '5 秒后自动关闭');
  advance(1000);
  assert.equal(get('[data-notice-countdown]').textContent, '4 秒后自动关闭');
  advance(3999);
  assert.equal(get('[data-notice-countdown]').textContent, '1 秒后自动关闭');
  assert.equal(get('[data-intake-notice]').open, true);
  assert.equal(get('[data-workbench]').hidden, true);
  assert.equal(flow.store.read().history[0].status, 'running');
  advance(1);
  assert.equal(get('[data-intake-notice]').open, false);
  assert.equal(get('[data-workbench]').hidden, false);
  assert.equal(get('#proofreadRail'), null);
  assert.equal(get('[data-run]').textContent, '停止审校');
  get('[data-run]').emit('click');
  advance(10000);
  assert.equal(flow.store.read().history[0].status, 'stopped');
  assert.equal(get('[data-run]').hidden, true);
  get('[data-workbench] [data-intake-back]').emit('click');
  assert.equal(get('[data-intake-start]'), null);
  assert.equal(get('[data-intake-review]').attributes.title, '查看状态');
});

test("saved legacy results apply the accepted change once and retain later issue locations", () => {
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
  assert.equal(get('[data-char]').textContent, `字数统计 ${original.length - 1}`);
  assert.equal(get(`[data-hit="${punctuation.id}"]`).textContent, '，');
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

test("accepting a shorter replacement updates the local preview and can be undone before saving", () => {
  const flow = setupFlow();
  const draft = flow.draft("计划完成，，请严各审校。");
  flow.store.startReview({fileId: draft.id, types: ["错别字", "标点"]});
  const done = flow.tick(10000).history[0];
  const [first, second] = done.issues;
  const {get, isDirty} = flow.mount();
  get('[data-intake-review]').emit('click');
  get(`[data-accept="${first.id}"]`).emit('click');
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '，');
  assert.equal(get(`[data-hit="${second.id}"]`).textContent, '严各');
  assert.equal(get('[data-char]').textContent, `字数统计 ${draft.text.length - 1}`);
  assert.equal(isDirty(), true);
  get('[data-accept-all]').emit('click');
  assert.equal(get('[data-accept-all]').disabled, true);
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '，');
  assert.equal(get(`[data-hit="${second.id}"]`).textContent, '严格');
  const undo = get(`[data-undo-decision="${first.id}"]`);
  assert.ok(undo, '已采纳建议应提供撤回入口');
  undo.emit('click');

  const {history: [saved], records: [file]} = flow.store.read();
  assert.equal(saved.accepted.length, 0);
  assert.equal(saved.originalText, draft.text);
  assert.equal(saved.text, draft.text);
  assert.equal(file.text, draft.text);
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '，，');
  assert.equal(get(`[data-hit="${second.id}"]`).textContent, '严格');
  assert.equal(get('[data-char]').textContent, `字数统计 ${draft.text.length}`);
  assert.ok(get(`[data-accept="${first.id}"]`));
  assert.ok(get(`[data-ignore="${first.id}"]`));
  assert.equal(get(`[data-undo-decision="${first.id}"]`), null);
  assert.equal(get('[data-accept-all]').disabled, false);
  assert.equal(isDirty(), true);
  get(`[data-undo-decision="${second.id}"]`).emit('click');
  assert.equal(isDirty(), false, '撤回全部修改后不应再提示未保存');
});

test("undoing a rejected suggestion restores its choices and leaves other decisions intact", () => {
  const flow = setupFlow();
  const draft = flow.draft("工做严各。");
  flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  const {issues: [first, second]} = flow.tick(10000).history[0];
  const {get} = flow.mount();
  get('[data-intake-review]').emit('click');
  get(`[data-accept="${second.id}"]`).emit('click');
  get(`[data-ignore="${first.id}"]`).emit('click');
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '工做');
  assert.match(get(`[data-issue="${first.id}"]`).textContent, /未采纳/);

  const undo = get(`[data-undo-decision="${first.id}"]`);
  assert.ok(undo, '未采纳建议应提供撤回入口');
  undo.emit('click');

  const saved = flow.store.read().history[0];
  assert.equal(saved.ignored.length, 0);
  assert.equal(saved.accepted.length, 0);
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '工做');
  assert.equal(get(`[data-hit="${second.id}"]`).textContent, '严格');
  assert.ok(get(`[data-ignore="${first.id}"]`));
  get(`[data-accept="${first.id}"]`).emit('click');
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '工作');
});

test("returning from an edited result asks before discarding and reopening cannot recover unsaved edits", () => {
  const flow = setupFlow();
  const draft = flow.draft('工做严各。');
  flow.store.startReview({fileId: draft.id, types: ['错别字']});
  const {issues: [first]} = flow.tick(10000).history[0];
  const {get, root, isDirty} = flow.mount();
  get('[data-intake-review]').emit('click');
  get(`[data-accept="${first.id}"]`).emit('click');
  assert.equal(root.dataset.autosaved, 'false');
  assert.equal(isDirty(), true);

  get('[data-workbench] [data-intake-back]').emit('click');
  assert.match(flow.confirmations[0], /未保存.*丢失/);
  assert.equal(get('[data-workbench]').hidden, false);
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '工作');
  assert.equal(isDirty(), true);

  flow.confirmDiscard(true);
  get('[data-workbench] [data-intake-back]').emit('click');
  assert.equal(get('[data-files]').hidden, false);
  assert.equal(isDirty(), false);
  assert.equal(root.dataset.autosaved, 'true');
  get('[data-intake-review]').emit('click');
  assert.equal(get(`[data-hit="${first.id}"]`).textContent, '工做');
  get(`[data-accept="${first.id}"]`).emit('click');
  root.remove();

  const reopened = flow.mount();
  reopened.get('[data-intake-review]').emit('click');
  assert.equal(reopened.get(`[data-hit="${first.id}"]`).textContent, '工做');
  assert.equal(reopened.isDirty(), false);
});

test("confirming locks the current result and exposes its separate screening in the file list", () => {
  const flow = setupFlow();
  const draft = flow.draft("工做严各确宝。");
  flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  flow.tick(10000);
  const {get, advance, isDirty} = flow.mount();
  get('[data-intake-review]').emit('click');
  get('[data-accept]').emit('click');
  get('[data-ignore]').emit('click');
  get('[data-finalize]').emit('click');
  assert.equal(get('[data-final-dialog]').open, true);
  assert.match(get('[data-final-summary]').textContent, /已采纳 1 条.*不采纳 1 条.*未处理 1 条/);
  assert.equal(flow.store.read().history[0].output, undefined);
  assert.equal(isDirty(), true);

  flow.fail();
  get('[data-final-submit]').emit('click');
  assert.match(get('[data-workbench] [data-status]').textContent, /存储空间不足/);
  assert.ok(get('[data-undo-decision]'));
  assert.equal(flow.store.read().history[0].output, undefined);
  assert.equal(isDirty(), true);
  flow.restore();

  get('[data-finalize]').emit('click');
  get('[data-final-submit]').emit('click');
  assert.equal(get('[data-final-dialog]').open, false);
  assert.equal(get('[data-intake-notice]').open, true);
  assert.match(get('[data-notice-title]').textContent, /校对结果已送审/);
  const {history: [saved], records: [original]} = flow.store.read();
  assert.equal(saved.output.text, "工作严各确宝。");
  assert.equal(saved.output.secretStatus, "detecting");
  assert.equal(isDirty(), false);
  assert.equal(original.text, draft.text);
  assert.equal(original.secretStatus, "passed");
  assert.equal(get('[data-finalize]').hidden, true);
  assert.equal(get('[data-download]').disabled, true);
  assert.equal(get('[data-bulk]').hidden, true);
  assert.equal(get('[data-accept], [data-ignore], [data-undo-decision]'), null);
  get('[data-notice-close]').emit('click');

  get('[data-workbench] [data-intake-back]').emit('click');
  get('[data-file-filter="audit"]').emit('click');
  assert.equal(get('[data-intake-table] .secret-file-state').textContent, '检测中');
  assert.equal(get('[data-intake-review]'), null);
  assert.equal(get('[data-intake-download]'), null);
  get('[data-intake-secret]').emit('click');
  assert.match(get('[data-secret-title]').textContent, /校对结果核查/);
  advance(3000);
  assert.match(get('[data-secret-title]').textContent, /已通过/);
  get('[data-secret-close]').emit('click');
  get('[data-file-filter="done"]').emit('click');
  get('[data-intake-review]').emit('click');
  assert.equal(get('[data-download]').disabled, false);
  assert.equal(get('[data-view-output-audit]').hidden, false);
  assert.equal(get('[data-undo-decision]'), null);
});

test("download uses the same confirmation and stays blocked if the saved result is rejected", () => {
  const flow = setupFlow();
  const draft = flow.draft("内部资料的工做。");
  flow.store.startReview({fileId: draft.id, types: ["错别字"]});
  flow.tick(3000);
  flow.store.audit(draft.id, "submitted");
  flow.store.audit(draft.id, "passed");
  flow.tick(5000);
  const {get, advance} = flow.mount();
  get('[data-intake-review]').emit('click');
  get('[data-download]').emit('click');
  assert.equal(get('[data-final-dialog]').open, true);
  get('[data-final-cancel]').emit('click');
  assert.equal(get('[data-final-dialog]').open, false);
  assert.equal(flow.store.read().history[0].output, undefined);
  get('[data-accept]').emit('click');
  get('[data-download]').emit('click');
  get('[data-final-submit]').emit('click');
  get('[data-notice-close]').emit('click');
  advance(3000);

  get('[data-view-output-audit]').emit('click');
  assert.match(get('[data-secret-title]').textContent, /校对结果核查.*涉密可疑/);
  get('[data-secret-submit]').emit('click');
  assert.equal(get('[data-download]').disabled, true);
  get('[data-secret-reject]').emit('click');
  assert.match(get('[data-secret-title]').textContent, /校对结果核查.*已驳回/);
  assert.match(get('[data-secret-body]').textContent, /人工审核未通过/);
  assert.equal(get('[data-download]').disabled, true);
  assert.equal(get('[data-undo-decision]'), null);
  const {history: [saved], records: [original]} = flow.store.read();
  assert.equal(saved.output.secretStatus, "rejected");
  assert.equal(original.secretStatus, "passed");
  assert.equal(flow.downloads.length, 0);
});

test("download saves unsaved choices and waits for approval, then downloads the saved result once", async () => {
  const flow = setupFlow();
  const draft = flow.draft('工做严各。');
  flow.store.startReview({fileId: draft.id, types: ['错别字']});
  flow.tick(10000);
  const {get, advance, isDirty} = flow.mount();
  get('[data-intake-review]').emit('click');
  get('[data-accept]').emit('click');
  get('[data-download]').emit('click');
  assert.equal(get('[data-final-dialog]').open, true);
  assert.match(get('[data-final-title]').textContent, /保存后下载/);
  assert.match(get('[data-final-text]').textContent, /核查通过后会自动下载/);
  assert.equal(flow.store.read().history[0].output, undefined);
  get('[data-final-submit]').emit('click');
  assert.equal(flow.store.read().history[0].output.secretStatus, 'detecting');
  assert.equal(isDirty(), false);
  assert.equal(get('[data-download]').disabled, true);
  assert.equal(flow.downloads.length, 0);
  advance(1000);
  assert.equal(flow.downloads.length, 0, '核查结束前不能下载');
  advance(6000);
  assert.equal(flow.store.read().history[0].output.secretStatus, 'passed');
  assert.equal(get('[data-download]').disabled, false);
  assert.equal(flow.downloads.length, 1);
  assert.match(get('[data-workbench] [data-status]').textContent, /已发起.*下载/);
  assert.equal(flow.downloads[0].name, '测试文档.txt');
  assert.equal(await flow.downloads[0].blob.text(), '工作严各。');
  advance(1000);
  assert.equal(flow.downloads.length, 1, '自动下载只发起一次');

  get('[data-download]').emit('click');
  assert.equal(get('[data-final-dialog]').open, false);
  assert.equal(get('[data-intake-notice]').open, false);
  assert.equal(flow.downloads.length, 2);
  assert.equal(await flow.downloads[1].blob.text(), '工作严各。');
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

test("uploaded files pass screening before manual review and can reopen the result in two columns", async () => {
  const flow = setupFlow();
  const {get, advance} = flow.mount();
  get('[data-file]').files = [{name: '会议纪要.txt', size: 12, text: async () => '工做内容'}];
  get('[data-file]').emit('change');
  await new Promise(setImmediate);
  assert.equal(get('[data-intake-notice]').open, true);
  assert.match(get('[data-notice-countdown]').textContent, /5\s*秒后自动关闭/);
  assert.equal(flow.store.read().records[0].secretStatus, 'detecting');
  assert.equal(get('[data-intake-table] tr').children.length, 4);
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(get('[data-intake-start]'), null);
  assert.equal(get('[data-intake-view]'), null);
  assert.equal(get('[data-intake-download]'), null);
  get('[data-notice-close]').emit('click');
  advance(3000);
  assert.equal(flow.store.read().records[0].secretStatus, 'passed');
  assert.equal(flow.store.read().history.length, 0);
  assert.equal(get('[data-files]').hidden, false);
  assert.equal(get('[data-workbench]').hidden, true);
  get('[data-intake-view]').emit('click');
  assert.equal(get('[data-file-preview]').open, true);
  assert.equal(get('[data-preview-text]').textContent, '工做内容');
  get('[data-preview-close]').emit('click');
  get('[data-intake-start]').emit('click');
  assert.equal(get('[data-dialog]').open, true);
  get('[data-confirm]').emit('click');
  assert.equal(get('[data-workbench]').hidden, false);
  assert.deepEqual(get('.pr-app').children.map(column => column.className), ['pr-editor', 'pr-result']);
  assert.equal(flow.store.read().history[0].status, 'running');
  get('[data-workbench] [data-intake-back]').emit('click');
  get('[data-intake-review]').emit('click');
  assert.equal(get('.pr-app').children.length, 2);
  assert.equal(get('[data-run]').hidden, false);
  advance(4000);
  get('[data-workbench] [data-intake-back]').emit('click');
  const viewResult = get('[data-intake-review]');
  assert.equal(viewResult.attributes.title, '查看结果');
  viewResult.emit('click');
  assert.equal(get('[data-workbench]').hidden, false);
  assert.equal(get('.pr-app').children.length, 2);
  assert.match(get('[data-doc]').textContent, /工做/);
  assert.ok(get('[data-accept]'));
});

test("uploaded suspicious files require manual approval before offering proofreading", async () => {
  const flow = setupFlow();
  const {get, advance} = flow.mount();
  get('[data-file]').files = [{name: '资料.md', size: 18, text: async () => '内部资料工做'}];
  get('[data-file]').emit('change');
  await new Promise(setImmediate);
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
  assert.equal(get('.secret-file-badge').textContent, '审核通过');
  assert.equal(get('[data-workbench]').hidden, true);
});

test("an unreadable upload remains a failed row with details and deletion only", async () => {
  const flow = setupFlow();
  const {get} = flow.mount();
  get('[data-file]').files = [{name: '空文件.txt', size: 0}];
  get('[data-file]').emit('change');
  await new Promise(setImmediate);
  assert.equal(flow.store.read().records[0].secretStatus, 'failed');
  assert.equal(get('[data-intake-table] .secret-file-badge').textContent, '失败');
  assert.equal(get('[data-intake-notice]').open, false);
  assert.equal(get('[data-intake-view]'), null);
  assert.equal(get('[data-intake-download]'), null);
  assert.ok(get('[data-delete]'));
  get('[data-intake-secret]').emit('click');
  assert.match(get('[data-secret-body]').textContent, /无法读取文件.*没有可校对的文字/);
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
