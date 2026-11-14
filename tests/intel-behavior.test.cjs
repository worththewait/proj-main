const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const controller = path.join(__dirname, '..', 'src', 'pages', 'intel.js');

function loadIntel(runtime = {}) {
  assert.ok(fs.existsSync(controller), 'the integrated intel controller must be available');
  const source = fs.readFileSync(controller, 'utf8');
  const initialization = source.indexOf("document.addEventListener('keydown'");
  assert.ok(initialization > 0, 'controller must initialize its document interactions');
  const fixedNow = new Date(2026, 10, 3, 12, 0, 0).getTime();
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedNow])); }
    static now() { return fixedNow; }
  }
  const context = vm.createContext({ Date: FixedDate, console, setTimeout, clearTimeout, ...runtime });
  vm.runInContext(source.slice(0, initialization), context, { filename: controller });
  return (expression) => vm.runInContext(expression, context);
}

function replaceInput(evaluate, items) {
  evaluate(`INPUT = ${JSON.stringify(items)};
    MODEL = buildEvents();
    byKey = new Map(MODEL.events.map(event => [event.key, event]));
    stageOf = new Map(MODEL.rows.map(row => [row.it.id, row.stage]));
    follows = new Set();
    syncTracks();`);
}

function report(id, title, options = {}) {
  return { id, d: '11-02', hm: '09:00', src: '国际船舶网', summary: '', ...options, title };
}

function element(dataset = {}) {
  const classes = new Set();
  const marker = { textContent: '' };
  return {
    dataset, textContent: '',
    classList: {
      add: (name) => classes.add(name),
      remove: (name) => classes.delete(name),
      contains: (name) => classes.has(name),
      toggle: (name, on) => { if (on) classes.add(name); else classes.delete(name); },
    },
    setAttribute() {},
    querySelector: () => marker,
  };
}

function interactions() {
  const nodes = {};
  const selectors = {};
  const timers = [];
  const evaluate = loadIntel({
    document: {
      getElementById: (id) => nodes[id] || null,
      querySelectorAll: (selector) => selectors[selector] || [],
    },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return timers.length; },
    clearTimeout() {},
  });
  // Rendering/toasts are output boundaries; exercise the real bound handlers and data transitions.
  evaluate('render = () => {}; toast = message => { globalThis.lastToast = message; };');
  return { nodes, selectors, timers, evaluate };
}

test('intel integrates all nine early editions and keeps cross-month dates readable', () => {
  const evaluate = loadIntel();
  assert.equal(evaluate('Object.keys(EARLY_BY_DAY).length'), 9);
  assert.equal(evaluate("earlyOf({y:2026,m:11,d:3}).length"), 9);
  assert.equal(evaluate("earlyOf({y:2026,m:11,d:2}).length"), 7);
  assert.equal(evaluate("earlyOf({y:2026,m:10,d:27}).length"), 21);
  assert.equal(evaluate("dayKeyBack({y:2026,m:11,d:2}, 2)"), '10-31');
  assert.equal(evaluate("ebStamp({date:'10-31',time:'08:30'})"), '10月31日 08:30');
});

test('same subject orders for distinct quantities remain independently followable events', () => {
  const evaluate = loadIntel();
  replaceInput(evaluate, [
    report('one', '福建船政签署 16 艘粮食船建造订单'),
    report('two', '福建船政签署 2+2 艘平台供应船建造订单'),
  ]);
  assert.equal(evaluate('MODEL.events.length'), 2);
  assert.equal(evaluate('new Set(MODEL.events.map(event => event.subj.n)).size'), 1);
  assert.notEqual(evaluate('MODEL.events[0].key'), evaluate('MODEL.events[1].key'));
  evaluate('follows.add(MODEL.events[0].key); syncTracks();');
  assert.equal(evaluate('TRACKS.length'), 1);
  assert.equal(evaluate('plazaBatches().flat().length'), 1);
});

test('same-action reports form one progress node and choose the most authoritative source', () => {
  const evaluate = loadIntel();
  replaceInput(evaluate, [
    report('start', '霍尔木兹海峡一艘油轮发生爆炸', { d: '11-01', hm: '08:00' }),
    report('official', '霍尔木兹海峡油轮爆炸事故通报', { d: '11-01', hm: '09:00', src: '新华社' }),
    report('later', '霍尔木兹海峡爆炸后展开搜救', { d: '11-02', hm: '08:00' }),
  ]);
  assert.equal(evaluate('MODEL.events.length'), 1);
  assert.equal(evaluate('nodesOf(MODEL.events[0]).length'), 2);
  assert.equal(evaluate('nodesOf(MODEL.events[0])[0].lead.id'), 'official');
  const track = JSON.parse(evaluate('JSON.stringify(toTrack(MODEL.events[0]))'));
  assert.equal(track.count, 3);
  assert.equal(track.nodeCount, 2);
  assert.equal(track.lastAct, '搜救');
  assert.equal(track.lead.title, '霍尔木兹海峡爆炸后展开搜救');
  assert.equal(track.timeline[1].more.length, 1);
});

test('completed events stay available in the model but leave the topic plaza', () => {
  const evaluate = loadIntel();
  replaceInput(evaluate, [
    report('done', '霍尔木兹海峡油轮爆炸事故原因查明'),
    report('open', '马士基签署 4 艘集装箱船订单'),
  ]);
  assert.equal(evaluate('MODEL.events.length'), 2);
  assert.equal(evaluate('MODEL.events.find(event => event.subj.n === "霍尔木兹海峡").atEnd'), true);
  assert.equal(evaluate('plazaBatches().flat().length'), 1);
  assert.equal(evaluate('plazaBatches()[0][0].subj.n'), '马士基');
});

test('following removes only that event from the plaza and unfollowing returns it', () => {
  const evaluate = loadIntel();
  evaluate('follows = new Set(); syncTracks();');
  const before = evaluate('plazaBatches().flat().length');
  evaluate('follows.add(plazaBatches()[0][0].key); syncTracks();');
  assert.equal(evaluate('TRACKS.length'), 1);
  assert.equal(evaluate('plazaBatches().flat().length'), before - 1);
  assert.equal(evaluate('plazaBatches().flat().some(event => follows.has(event.key))'), false);
  evaluate('unfollowTrack(TRACKS[0].id);');
  assert.equal(evaluate('TRACKS.length'), 0);
  assert.equal(evaluate('plazaBatches().flat().length'), before);
});

test('subject filtering retains a single timeline row per event, including shared-subject events', () => {
  const evaluate = loadIntel();
  replaceInput(evaluate, [
    report('a', '福建船政签署 16 艘粮食船建造订单'),
    report('b', '福建船政签署 2+2 艘平台供应船建造订单'),
    report('c', '马士基签署 4 艘集装箱船订单'),
  ]);
  evaluate('MODEL.events.forEach(event => follows.add(event.key)); syncTracks(); subjFilter = "福建船政";');
  const timeline = evaluate('tkFeedInner()');
  assert.equal((timeline.match(/data-thread=/g) || []).length, 2);
  assert.doesNotMatch(timeline, /马士基/);
  const filters = evaluate('subjBar()');
  assert.equal((filters.match(/data-subj="福建船政"/g) || []).length, 1);
  assert.match(filters, /取消关注 福建船政/);
});

test('tracking input keeps exactly five natural days and ignores future or stale reports', () => {
  const evaluate = loadIntel();
  const items = [
    report('stale', '马士基签署 2 艘订单', { d: '10-29' }),
    report('boundary', '马士基签署 3 艘订单', { d: '10-30' }),
    report('today', '马士基签署 4 艘订单', { d: '11-03' }),
    report('future', '马士基签署 5 艘订单', { d: '11-04' }),
  ];
  evaluate(`ITEMS.splice(0, ITEMS.length, ...${JSON.stringify(items)}); recomputeInput();`);
  assert.equal(evaluate('BASE_D'), '11-03');
  assert.deepEqual(JSON.parse(evaluate('JSON.stringify(INPUT.map(item => item.id))')), ['boundary', 'today']);
});

test('daily collection imports pending reports once and rebuilds the event model', () => {
  const evaluate = loadIntel();
  const before = evaluate('ITEMS.length');
  const rowsBefore = evaluate('MODEL.rows.length');
  const pending = evaluate('PENDING.length');
  assert.equal(pending, 2);
  evaluate('autoRun();');
  assert.equal(evaluate('ITEMS.length'), before + pending);
  assert.equal(evaluate('PENDING.length'), 0);
  assert.equal(evaluate('fetchedIds.size'), 2);
  assert.ok(evaluate('MODEL.rows.length') > rowsBefore, 'imported reports must go through the whole aggregation chain');
  assert.equal(evaluate('MODEL.events.some(event => event.type === "市场")'), true);
  evaluate(`PENDING.push(${JSON.stringify(report('next', '福建船政签署 8 艘新船订单'))}); autoRun();`);
  assert.equal(evaluate('ITEMS.length'), before + pending);
  assert.equal(evaluate('PENDING.length'), 1);
});

test('original article links prefer direct URLs and provide a source-title search fallback', () => {
  const evaluate = loadIntel();
  assert.equal(evaluate("origOf({id:'rt01',url:'https://example.org/article',title:'标题'})"), 'https://example.org/article');
  assert.match(evaluate("origOf({id:'rt01'})"), /^http:\/\/mp\.weixin\.qq\.com\/s\?__biz=/);
  assert.equal(evaluate("origOf({id:'rt02'})"), 'https://finance.sina.com.cn/roll/2026-11-03/doc-inixmnpy9970066.shtml');
  const fallback = evaluate("origOf({src:'新华社',title:'船舶报道'})");
  assert.equal(new URL(fallback).searchParams.get('q'), '新华社 船舶报道');
  const link = evaluate("origLink('https://example.org/article?a=1&b=2')");
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /data-orig/);
});

test('live feed spans selected day and the previous two days in reverse time order', () => {
  const evaluate = loadIntel();
  evaluate(`selDate = {y:2026,m:11,d:2}; LIVE.splice(0, LIVE.length,
    {id:'old',day:'10-30',time:'23:00',title:'too old'},
    {id:'third',day:'10-31',time:'20:00',title:'third day'},
    {id:'second',day:'11-01',time:'12:00',title:'yesterday'},
    {id:'first',day:'11-02',time:'08:00',title:'today'});`);
  const html = evaluate('liveRail()');
  assert.doesNotMatch(html, /data-live="old"/);
  assert.ok(html.indexOf('data-live="first"') < html.indexOf('data-live="second"'));
  assert.ok(html.indexOf('data-live="second"') < html.indexOf('data-live="third"'));
  assert.match(html, /2026-11-01 12:00/);
  assert.match(html, /2026-10-31 20:00/);
});

test('unknown entities remain trackable and future delivery in summaries does not finish a current order', () => {
  const evaluate = loadIntel();
  replaceInput(evaluate, [
    report('unknown', '新兴海运签署 3 艘船舶订单', { summary: '预计2028年交付。' }),
  ]);
  assert.equal(evaluate('MODEL.events.length'), 1);
  assert.equal(evaluate('MODEL.events[0].atEnd'), false);
  assert.equal(evaluate('MODEL.events[0].stage'), '签约');
  assert.equal(evaluate('plazaBatches().flat().length'), 1);
});

test('customization cancellation discards draft changes and saving applies the next draft', () => {
  const { nodes, selectors, evaluate } = interactions();
  const cell = element({ tag: '绿色船舶' });
  const cancel = element();
  const save = element();
  nodes.cfgEntry = element();
  selectors['.cfg-cell[data-tag]'] = [cell];
  selectors['[data-cfgback]'] = [cancel];
  selectors['[data-cfgsave]'] = [save];
  evaluate('bind();');
  nodes.cfgEntry.onclick();
  assert.equal(evaluate('subscribed.includes("绿色船舶")'), true);
  cell.onclick();
  assert.equal(evaluate('draftSubscribed.includes("绿色船舶")'), false);
  assert.equal(evaluate('subscribed.includes("绿色船舶")'), true);
  cancel.onclick();
  assert.equal(evaluate('subscribed.includes("绿色船舶")'), true);
  nodes.cfgEntry.onclick();
  assert.equal(evaluate('draftSubscribed.includes("绿色船舶")'), true);
  cell.onclick();
  save.onclick();
  assert.equal(evaluate('subscribed.includes("绿色船舶")'), false);
  assert.equal(evaluate('view'), 'early');
});

test('unfollowed plaza topics open chronological detail without implicitly following them', () => {
  const { selectors, evaluate } = interactions();
  evaluate('autoRun();');
  const key = evaluate('plazaBatches()[0][0].key');
  const preview = element({ plzadetail: key });
  selectors['[data-plzadetail]'] = [preview];
  evaluate('bindTrack();');
  preview.onclick();
  assert.equal(evaluate('detailTrack.id'), key);
  assert.equal(evaluate('follows.has(detailTrack.id)'), false);

  replaceInput(evaluate, [
    report('m1', '马士基签署 2 艘集装箱船订单', { d: '10-30', hm: '08:00' }),
    report('m2', '马士基签署的集装箱船订单开工', { d: '11-01', hm: '09:00' }),
  ]);
  evaluate('MODEL.events.forEach(event => follows.add(event.key)); syncTracks();');
  evaluate('detailTrack = TRACKS[0];');
  const detail = evaluate('viewThreadDetail()');
  assert.ok(detail.indexOf('10-30 08:00') < detail.indexOf('11-01 09:00'), 'progress must read from initial event to the latest development');
  assert.match(detail, /data-orig/);
});

test('topic batches limit repeated categories while subscription preferences do not filter tracking', () => {
  const evaluate = loadIntel();
  const items = [];
  for (let i = 1; i <= 8; i += 1) {
    items.push(report(`accident-${i}`, `霍尔木兹海峡“船舶${i}”发生爆炸`));
    items.push(report(`order-${i}`, `马士基签署 ${i} 艘集装箱船订单`));
  }
  replaceInput(evaluate, items);
  const batches = JSON.parse(evaluate('JSON.stringify(plazaBatches().map(batch => batch.map(event => event.type)))'));
  assert.deepEqual(batches.map((batch) => batch.length), [6, 6, 4]);
  assert.ok(batches.every((batch) => batch.filter((type) => type === '事故').length <= 4));
  assert.ok(batches.every((batch) => batch.filter((type) => type === '订单').length <= 4));
  evaluate('subscribed = [];');
  assert.equal(evaluate('plazaBatches().flat().length'), 16);
  assert.equal(evaluate('plazaBatches()[0][0].type'), '事故');
});

test('a different calendar year never relabels the demonstration articles as that year', () => {
  const evaluate = loadIntel();
  evaluate('selDate = {y:2025,m:11,d:2};');
  assert.equal(evaluate('earlyOf(selDate).length'), 0);
  assert.equal(evaluate('liveDays(selDate).length'), 0);
  assert.match(evaluate('liveRail()'), /近日暂无实时情报/);
  assert.match(evaluate('emptyEarly()'), /回到最新一期/);
});
