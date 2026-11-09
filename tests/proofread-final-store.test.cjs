const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/proofread-store.js'), 'utf8');
const original = '甲错。乙错。丙错。';

function setup() {
  const values = new Map();
  let now = 10000;
  const scans = [];
  const localStorage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  function open() {
    const window = {localStorage};
    vm.runInNewContext(source, {window, Date: class extends Date { static now() { return now; } }});
    return window.BaigeProofreadStore;
  }
  function advance(store, ms, replacement = '修订后的表述') {
    now += ms;
    return store.advance((fileName, text) => {
      scans.push({fileName, text});
      return text.includes('内部资料') ? ['内部资料'] : [];
    }, () => [
      {id: 'first', start: 0, end: 2, suggestion: replacement},
      {id: 'second', start: 3, end: 5, suggestion: '乙改'},
      {id: 'third', start: 6, end: 8, suggestion: '丙改'},
    ]);
  }
  return {open, advance, scans};
}

test('confirmation saves the exact preview once and freezes suggestions', () => {
  const flow = setup();
  const store = flow.open();
  const file = store.submitFile({fileName: '样稿.docx', text: original, source: 'upload'});
  flow.advance(store, 3000);
  const {reviewId} = store.startReview({fileId: file.id, types: ['错别字']});
  assert.throws(() => store.confirmResult(reviewId), /完成/);
  flow.advance(store, 3000);

  store.decide(reviewId, 'first', true);
  store.decide(reviewId, 'second', false);
  const before = store.read().history[0];
  const preview = store.documentParts(before).map(part => part.text).join('');
  assert.equal(preview, '修订后的表述。乙错。丙错。');
  const output = store.confirmResult(reviewId);
  assert.equal(output.text, preview);
  assert.equal(output.fileName, '样稿.txt');
  assert.equal(output.secretStatus, 'detecting');
  assert.equal(store.read().records[0].text, original);
  assert.equal(store.read().history[0].originalText, original);
  assert.throws(() => store.decide(reviewId, 'third', true), /已确认/);
  assert.throws(() => store.undoDecision(reviewId, 'first'), /已确认/);
  assert.throws(() => store.undoDecision(reviewId, 'second'), /已确认/);

  const reloaded = flow.open();
  assert.equal(reloaded.confirmResult(reviewId).detectAt, output.detectAt);
  const after = flow.advance(reloaded, 3000);
  assert.equal(after.records.length, 1);
  assert.equal(after.records[0].secretStatus, 'passed');
  assert.equal(after.history[0].status, 'done');
  assert.equal(after.history[0].output.secretStatus, 'passed');
  assert.ok(after.history[0].output.updated > output.updated);
  assert.deepEqual(flow.scans, [
    {fileName: '样稿.docx', text: original},
    {fileName: '样稿.txt', text: preview},
  ]);
  assert.equal(reloaded.confirmResult(reviewId).secretStatus, 'passed');
});

test('confirmation persists local decisions together with the exact output', () => {
  const flow = setup();
  const store = flow.open();
  const file = store.submitFile({fileName: '样稿.docx', text: original, source: 'upload'});
  flow.advance(store, 3000);
  const {reviewId} = store.startReview({fileId: file.id, types: ['错别字']});
  flow.advance(store, 3000);
  store.decide(reviewId, 'first', true);
  const decisions = {accepted: ['second'], ignored: ['third']};
  const draft = {...store.read().history[0], ...decisions};

  assert.equal(store.documentParts(draft).map(part => part.text).join(''), '甲错。乙改。丙错。');
  assert.deepEqual(Array.from(flow.open().read().history[0].accepted), ['first']);
  assert.equal(flow.open().read().history[0].output, undefined);

  const output = store.confirmResult(reviewId, decisions);
  const saved = flow.open().read().history[0];
  assert.deepEqual(Array.from(saved.accepted), ['second']);
  assert.deepEqual(Array.from(saved.ignored), ['third']);
  assert.equal(saved.output.text, '甲错。乙改。丙错。');
  assert.equal(saved.output.secretStatus, 'detecting');
  assert.deepEqual(store.confirmResult(reviewId, {accepted: ['first'], ignored: []}), output);
});

test('invalid local decisions leave the original state and audit untouched', () => {
  const flow = setup();
  const store = flow.open();
  const file = store.submitFile({fileName: '样稿.txt', text: original, source: 'upload'});
  flow.advance(store, 3000);
  const {reviewId} = store.startReview({fileId: file.id, types: ['错别字']});
  flow.advance(store, 3000);
  store.decide(reviewId, 'first', true);
  const before = JSON.stringify(store.read());
  for (const decisions of [
    {accepted: ['unknown'], ignored: []},
    {accepted: ['second'], ignored: ['second']},
    {accepted: ['second', 'second'], ignored: []},
    {accepted: 'second', ignored: []},
    null,
  ]) {
    assert.throws(() => store.confirmResult(reviewId, decisions), /审校选择/);
    assert.equal(JSON.stringify(store.read()), before);
  }
});

test('manual audit changes only the output that belongs to the given review and file', () => {
  const flow = setup();
  const store = flow.open();
  const file = store.submitFile({fileName: '样稿.txt', text: original, source: 'upload'});
  const other = store.submitFile({fileName: '其他.txt', text: '另一份文档', source: 'upload'});
  flow.advance(store, 3000);
  const {reviewId} = store.startReview({fileId: file.id, types: ['错别字']});
  flow.advance(store, 3000, '内部资料');
  store.decide(reviewId, 'first', true);
  store.confirmResult(reviewId);
  const afterScan = flow.advance(store, 3000);
  assert.equal(afterScan.history[0].output.secretStatus, 'hit');
  assert.throws(() => store.audit(other.id, 'submitted', reviewId), /审核状态/);
  assert.throws(() => store.audit(file.id, 'submitted'), /审核状态/);
  assert.equal(store.audit(file.id, 'submitted', reviewId).secretStatus, 'submitted');
  flow.advance(store, 1000);
  const output = store.audit(file.id, 'rejected', reviewId);
  assert.equal(output.secretStatus, 'rejected');
  assert.match(output.auditReason, /未通过/);
  assert.ok(output.updated > afterScan.history[0].output.updated);
  const persisted = flow.open().read();
  assert.equal(persisted.records.find(item => item.id === file.id).secretStatus, 'passed');
  assert.equal(persisted.history[0].status, 'done');
  assert.equal(persisted.history[0].output.text, '内部资料。乙错。丙错。');
  assert.equal(persisted.history[0].output.secretStatus, 'rejected');
});
