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
    setAttribute() {}, querySelectorAll() { return []; }, focus() {}, append() {},
  };
}
function app({denyFrontier = false, hash = ''} = {}) {
  const nodes = new Map();
  const doc = element();
  doc.querySelector = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const frames = [];
  doc.querySelector('#pageHost').append = frame => frames.push(frame);
  doc.createElement = () => Object.assign(element(), {contentWindow: {postMessage() {}}});
  const win = element();
  const alerts = [];
  win.alert = message => alerts.push(message);
  win.BaigeUI = {icon: () => '', escapeHtml: String};
  const location = {hash};
  win.history = {replaceState(_state, _title, hash) { location.hash = hash; }};
  const context = vm.createContext({window: win, document: doc, location});
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
  return {nav, frames, alerts, location, click, win};
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

test('collapsible groups open after the parent is activated', () => {
  const a = app();
  a.click({nav: 'data-platform'});
  assert.match(a.nav.innerHTML, /aria-expanded="true" aria-controls="sub-data-platform"/);
  assert.doesNotMatch(a.nav.innerHTML, /id="sub-data-platform" hidden/);
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
  a.click({nav: 'qa'});
  const currentHash = a.location.hash;
  a.location.hash = '#frontier/' + encodeURIComponent('智研通');
  a.win.handlers.hashchange();
  assert.equal(a.location.hash, currentHash);
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
