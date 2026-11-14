const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = name => fs.readFileSync(path.join(__dirname, '../src', name), 'utf8');

function element() {
  const handlers = {};
  return {
    handlers, innerHTML: '', hidden: false,
    classList: { add() {}, remove() {}, toggle() { return false; } },
    addEventListener(name, fn) { handlers[name] = fn; },
    setAttribute() {}, querySelectorAll() { return []; }, focus() {}, append() {}, before() {}, remove() { this.removed = true; },
  };
}
function app({denyFrontier = false, hash = '', preview = false, account = false, fromSession = false} = {}) {
  const nodes = new Map();
  const doc = element();
  doc.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const frames = [];
  doc.querySelector('#pageHost').append = frame => frames.push(frame);
  doc.createElement = () => {
    const messages = [];
    return Object.assign(element(), {messages, contentWindow: {postMessage(message) { messages.push(message); }}});
  };
  const win = element();
  const alerts = [];
  win.alert = message => alerts.push(message);
  win.BaigeUI = {icon: () => '', escapeHtml: String};
  const location = {hash};
  let updatePermissions = () => {};
  let menus = [];
  let status = 'normal';
  if (preview || account) {
    win.location = {pathname: '/index.html', search: preview ? '?iam-user=u-demo' : fromSession ? '' : '?iam-account=u-demo'};
    win.sessionStorage = {getItem: key => fromSession && key === 'baige.iam.client-account' ? 'u-demo' : null};
    win.localStorage = {getItem: () => JSON.stringify({'admin@cimtec.net.cn': {'writing:': true}})};
    win.BaigeIamStore = {
      users: () => status ? [{id: 'u-demo', nickname: '演示用户', status}] : [],
      effectiveMenus: () => menus,
      subscribe(callback) { updatePermissions = callback; },
    };
  }
  win.history = {replaceState(_state, _title, hash) { location.hash = hash; }};
  const context = vm.createContext({window: win, document: doc, location, URLSearchParams});
  vm.runInContext(source('data.js'), context);
  if (denyFrontier) {
    const original = win.BaigePermissions;
    win.BaigePermissions = {...original, canOpen(id, child) { return id === 'frontier' ? false : original.canOpen(id, child); }};
  }
  vm.runInContext(source('app.js'), context);
  const nav = doc.querySelector('#navigation');
  const click = dataset => nav.handlers.click({target: {closest(selector) {
    if (selector === '[data-child]' && dataset.child) return {dataset};
    if (selector === '[data-nav]' && dataset.nav) return {dataset};
    return null;
  }}});
  return {nav, frames, alerts, location, click, win, accountRoot: doc.querySelector('#accountRoot'),
    setMenus(value) { menus = value; updatePermissions(); },
    setStatus(value) { status = value; updatePermissions(); },
  };
}

test('a disabled or deleted preview account loses the default home entry and its loaded frame', () => {
  const a = app({preview: true, hash: '#home'});
  assert.match(a.nav.innerHTML, /data-nav="home"/);
  const home = a.frames[0];
  a.setStatus('disabled');
  assert.equal(a.win.BaigePermissions.canOpen('home'), false);
  assert.equal(home.removed, true);
  assert.doesNotMatch(a.nav.innerHTML, /data-nav="home"/);
  a.setStatus('');
  assert.equal(a.win.BaigePermissions.canOpen('home'), false);
  a.setStatus('normal');
  assert.match(a.nav.innerHTML, /data-nav="home"/);
  assert.notEqual(a.frames.at(-1), home);
  assert.equal(a.alerts.length, 0);
});

test('sidebar shows granted and unavailable children with clear status', () => {
  const a = app();
  assert.match(a.nav.innerHTML, /data-child="对话"/);
  assert.match(a.nav.innerHTML, /data-child="智能问数"/);
  assert.match(a.nav.innerHTML, /data-child="全球鹰"/);
  assert.match(a.nav.innerHTML, /data-child="智研通"/);
  assert.match(a.nav.innerHTML, /aria-expanded="false" aria-controls="sub-qa"/);
  assert.match(a.nav.innerHTML, /aria-expanded="false" aria-controls="sub-frontier"/);
  assert.match(a.nav.innerHTML, /aria-expanded="false" aria-controls="sub-data-platform"/);
  assert.match(a.nav.innerHTML, /id="sub-qa" hidden/);
  assert.match(a.nav.innerHTML, /id="sub-frontier" hidden/);
  assert.match(a.nav.innerHTML, /需申请/);
});

test('collapsible groups expand without leaving the current page', () => {
  const a = app();
  const frameCount = a.frames.length;
  const initialHash = a.location.hash;
  a.click({nav: 'data-platform'});
  assert.match(a.nav.innerHTML, /aria-expanded="true" aria-controls="sub-data-platform"/);
  assert.doesNotMatch(a.nav.innerHTML, /id="sub-data-platform" hidden/);
  assert.equal(a.frames.length, frameCount);
  assert.equal(a.location.hash, initialHash);
});

test('digital group expands and its children open dedicated pages', () => {
  const a = app();
  a.click({nav: 'digital'});
  assert.match(a.nav.innerHTML, /aria-expanded="true" aria-controls="sub-digital"/);
  assert.doesNotMatch(a.nav.innerHTML, /id="sub-digital" hidden/);
  assert.match(a.nav.innerHTML, /data-child="标准编制"/);
  assert.match(a.nav.innerHTML, /data-child="专利编制"/);
  assert.equal(a.frames.length, 1);

  a.click({parent: 'digital', child: '标准编制'});
  assert.equal(a.frames.length, 2);
  assert.match(a.frames[1].src, /pages\/digital-standard\.html/);
  assert.equal(a.location.hash, '#digital/' + encodeURIComponent('标准编制'));

  a.click({nav: 'digital'});
  assert.match(a.nav.innerHTML, /aria-expanded="false" aria-controls="sub-digital"/);
  assert.equal(a.location.hash, '#digital/' + encodeURIComponent('标准编制'));

  for (const [file, title] of [['pages/digital-standard.html', '标准编制'], ['pages/digital-patent.html', '专利编制']]) {
    const html = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
    assert.match(html, new RegExp(`<h1 id="pageTitle">${title}</h1>`));
    assert.match(html, /data-page="digital"/);
  }
});

test('a fully unavailable group remains expandable', () => {
  const a = app({denyFrontier: true});
  a.click({nav: 'frontier'});
  assert.match(a.nav.innerHTML, /aria-expanded="true" aria-controls="sub-frontier"/);
  a.click({nav: 'frontier'});
  assert.match(a.nav.innerHTML, /aria-expanded="false" aria-controls="sub-frontier"/);
  assert.match(a.nav.innerHTML, /data-child="全球鹰"/);
  assert.match(a.nav.innerHTML, /data-child="智研通"/);
});

test('a denied history route keeps the current page and restores its address', () => {
  const a = app();
  const frameCount = a.frames.length;
  a.location.hash = '#frontier/' + encodeURIComponent('智研通');
  a.win.handlers.hashchange();
  assert.equal(a.frames.length, frameCount);
  assert.equal(a.location.hash, '#home');
  assert.match(a.alerts[0], /智研通.*未开通/);
});

test('a denied initial route opens home with permission guidance', () => {
  const a = app({hash: '#qa/' + encodeURIComponent('智能问数')});
  assert.equal(a.location.hash, '#home');
  assert.equal(a.frames.length, 1);
  assert.match(a.alerts[0], /智能问数.*未开通/);
});

test('unavailable child gives permission guidance without leaving current page', () => {
  const a = app();
  a.click({nav: 'qa'});
  const frameCount = a.frames.length;
  const hash = a.location.hash;
  a.click({parent: 'qa', child: '智能问数'});
  assert.equal(a.frames.length, frameCount);
  assert.equal(a.location.hash, hash);
  assert.match(a.alerts[0], /智能问数.*未开通/);
  assert.match(a.alerts[0], /申请/);
});

test('role preview rejects direct routes until approved and evicts revoked open pages', () => {
  const a = app({hash: '#writing', preview: true});
  assert.equal(a.location.hash, '#home');
  assert.match(a.alerts[0], /尚未获得.*百舸写作/);
  assert.doesNotMatch(a.nav.innerHTML, /data-nav="writing"/);
  a.setMenus(['writing']);
  assert.match(a.nav.innerHTML, /data-nav="writing"/);
  a.click({nav: 'writing'});
  const writing = a.frames.at(-1);
  assert.match(writing.src, /pages\/writing\.html\?.*&iam-user=u-demo/);
  assert.equal(a.location.hash, '#writing');
  a.setMenus([]);
  assert.equal(writing.removed, true);
  assert.equal(a.location.hash, '#home');
});

test('role preview sends current child grants to the mounted tool catalog', () => {
  const a = app({preview: true});
  a.setMenus(['smart-tools:OCR识别']);
  a.click({nav: 'smart-tools'});
  const tools = a.frames.at(-1);
  a.win.handlers.message({source: tools.contentWindow, data: {type: 'baige:ready', pageId: 'smart-tools'}});
  assert.deepEqual(Array.from(tools.messages.at(-1).allowedChildren), ['OCR识别']);
  a.setMenus(['smart-tools:OCR识别', 'smart-tools:文档翻译']);
  assert.deepEqual(Array.from(tools.messages.at(-1).allowedChildren), ['文档翻译', 'OCR识别']);
});

test('a selected IAM account uses approved permissions in the normal client and ignores legacy grants', () => {
  const client = app({hash: '#writing', account: true});
  assert.equal(client.win.BaigePermissions.accountUserId, 'u-demo');
  assert.equal(client.win.BaigePermissions.previewUserId, null);
  assert.equal(client.accountRoot.hidden, false);
  assert.equal(client.location.hash, '#home');
  assert.doesNotMatch(client.nav.innerHTML, /data-nav="writing"/);
  client.setMenus(['writing']);
  assert.match(client.nav.innerHTML, /data-nav="writing"/);
  client.click({nav: 'writing'});
  const writing = client.frames.at(-1);
  assert.match(writing.src, /[?&]iam-account=u-demo/);
  client.setStatus('disabled');
  assert.equal(writing.removed, true);
  assert.doesNotMatch(client.nav.innerHTML, /data-nav="(?:home|writing)"/);
  client.setStatus('normal');
  assert.match(client.nav.innerHTML, /data-nav="writing"/);
});

test('an account selected for the tab stays scoped when the console is reopened without a query', () => {
  const client = app({account: true, fromSession: true});
  assert.equal(client.win.BaigePermissions.accountUserId, 'u-demo');
  assert.equal(client.win.BaigePermissions.canOpen('writing'), false);
  assert.match(client.frames[0].src, /[?&]iam-account=u-demo/);
});

test('a revoked child removes its hidden frame even while another child remains granted', () => {
  const client = app({account: true});
  client.setMenus(['digital:标准编制', 'digital:专利编制', 'smart-tools:OCR识别', 'smart-tools:文档翻译']);
  client.click({parent: 'digital', child: '标准编制'});
  const digital = client.frames.at(-1);
  client.click({nav: 'smart-tools'});
  const toolCatalog = client.frames.at(-1);
  client.click({nav: 'home'});
  client.setMenus(['digital:专利编制', 'smart-tools:OCR识别']);
  assert.equal(digital.removed, true);
  assert.equal(toolCatalog.removed, true);
  assert.match(client.nav.innerHTML, /data-child="专利编制"/);
  assert.doesNotMatch(client.nav.innerHTML, /data-child="标准编制"/);
});
