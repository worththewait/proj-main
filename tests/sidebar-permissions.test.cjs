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
function app({denyFrontier = false, hash = '', preview = false} = {}) {
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
  if (preview) {
    win.location = {search: '?iam-user=u-demo'};
    win.BaigeIamStore = {
      users: () => [{id: 'u-demo', nickname: '演示用户', status: 'normal'}],
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
  return {nav, frames, alerts, location, click, win, setMenus(value) { menus = value; updatePermissions(); }};
}

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
