const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const project = path.join(__dirname, '..');
const decode = value => value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');

// The fake DOM supplies browser mechanics; all directory data, filtering,
// permission decisions, application updates and navigation run production scripts.
function setup() {
  let document;
  class Element {
    constructor(tag = 'div', attributes = {}) {
      this.tagName = tag.toUpperCase(); this.attributes = attributes; this.children = [];
      this.listeners = {}; this.parentElement = null; this.value = ''; this.checked = false;
      this.hidden = false; this.open = false; this.disabled = false; this._text = '';
      this.dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
    }
    get id() { return this.attributes.id || ''; }
    get isConnected() { return this === document || Boolean(this.parentElement?.isConnected); }
    append(child) { child.parentElement = this; this.children.push(child); }
    set innerHTML(html) {
      this.children.forEach(child => { child.parentElement = null; }); this.children = []; this._text = '';
      const stack = [this];
      for (const token of html.matchAll(/<!--[\s\S]*?-->|<\/?[\w-]+\b[^>]*>|[^<]+/g)) {
        const value = token[0];
        if (value.startsWith('<!--')) continue;
        if (value.startsWith('</')) { if (stack.length > 1) stack.pop(); continue; }
        if (value.startsWith('<')) {
          const tag = value.match(/^<([\w-]+)/)[1];
          const attrs = Object.fromEntries([...value.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, val]) => [key, decode(val)]));
          for (const [, key] of value.matchAll(/\b(data-[\w-]+)(?=\s|\/?>)/g)) attrs[key] ||= '';
          const child = new Element(tag, attrs); stack.at(-1).append(child);
          if (!['img', 'input', 'br', 'hr', 'meta', 'link', 'path', 'circle', 'rect', 'line', 'polyline', 'polygon'].includes(tag) && !value.endsWith('/>')) stack.push(child);
        } else stack.at(-1)._text += decode(value);
      }
    }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
    set textContent(value) { this.children.forEach(child => {child.parentElement = null;}); this.children = []; this._text = value; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, props = {}) {
      const event = {target: this, preventDefault() {this.defaultPrevented = true;}, ...props};
      for (let node = this; node; node = node.parentElement) for (const callback of node.listeners[name] || []) callback(event);
      return event;
    }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part === ':disabled') return this.disabled;
        if (part === 'dialog:not([open])') return this.tagName === 'DIALOG' && !this.open;
        const tag = part.match(/^[a-z]+/i)?.[0];
        if (tag && this.tagName !== tag.toUpperCase()) return false;
        const id = part.match(/#([\w-]+)/)?.[1]; if (id && this.id !== id) return false;
        if ([...part.matchAll(/\.([\w-]+)/g)].some(([, name]) => !(this.attributes.class || '').split(/\s+/).includes(name))) return false;
        return [...part.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, key, val]) => Object.hasOwn(this.attributes, key) && (val === undefined || this.attributes[key] === val));
      });
    }
    closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
    contains(element) { return element === this || this.children.some(child => child.contains(element)); }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    getClientRects() { return this.isConnected && !this.hidden ? [{}] : []; }
    focus() { document.activeElement = this; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  document = new Element('document');
  document.innerHTML = '<div id="featureGroups"></div><div id="featureResults"></div><input id="featureSearch"><button id="featureClear"></button><input id="availableOnly"><div id="featureSearchSummary"></div><div id="commonFunctions"></div><button id="unrelated" data-home-route="knowledge"></button><dialog id="homeAccessDialog"><h2 id="homeAccessTitle"></h2><p id="homeAccessDescription"></p><p id="homeAccessFeedback"></p><button id="applyHomeAccess"></button><button id="closeHomeAccess"></button></dialog>';
  document.getElementById = id => document.querySelector(`#${id}`);
  const navigations = [];
  const window = {BaigePage: {navigate: (...args) => navigations.push(args), onActivate() {}, onDeactivate() {}}};
  const context = vm.createContext({window, document, HTMLElement: Element, console});
  for (const file of ['src/data.js', 'src/ui.js', 'src/home-access.js', 'src/pages/landing.js']) vm.runInContext(fs.readFileSync(path.join(project, file), 'utf8'), context, {filename: file});
  const get = id => document.getElementById(id);
  const items = () => get('featureResults').querySelectorAll('button.home-directory-item');
  const route = (id, child = '') => items().find(item => item.dataset.homeRoute === id && item.dataset.homeChild === child);
  const query = value => {get('featureSearch').value = value; get('featureSearch').emit('input');};
  const group = id => get('featureGroups').querySelector(`[data-feature-group="${id}"]`).emit('click');
  const available = checked => {get('availableOnly').checked = checked; get('availableOnly').emit('change');};
  return {get, document, window, navigations, items, route, query, group, available};
}

// A collapsed parent, duplicate workspace entry, or expanded dataset resources
// would otherwise make specific functions inaccessible or repeat them.
test('directory exposes exactly 26 unique independent destinations with real child routes', () => {
  const app = setup();
  assert.equal(app.items().length, 26);
  const destinations = app.items().map(item => `${item.dataset.homeRoute}:${item.dataset.homeChild}`);
  assert.equal(new Set(destinations).size, 26);
  for (const destination of ['qa:对话', 'qa:智能问数', 'library:', 'frontier:全球鹰', 'frontier:智研通', 'data-platform:数据标注平台', 'data-platform:爬虫平台', 'data-platform:数据中台', 'datasets:']) assert.ok(destinations.includes(destination), destination);
  for (const duplicate of ['qa:', 'frontier:', 'smart-tools:', 'data-platform:', 'datasets:船海产业数据集']) assert.ok(!destinations.includes(duplicate), duplicate);
  app.group('knowledge-research'); assert.equal(app.items().length, 7);
  app.group('tools-platforms'); assert.equal(app.items().length, 19);
});

test('available filter removes only the three denied destinations including when querying their parent', () => {
  const app = setup(); app.available(true);
  assert.equal(app.items().length, 23);
  assert.ok(app.route('library'));
  assert.equal(app.route('library', '文件管理'), undefined);
  assert.equal(app.route('library', '权限管理'), undefined);
  assert.equal(app.route('qa', '智能问数'), undefined);
  assert.equal(app.route('smart-tools', '标准编制'), undefined);
  assert.equal(app.route('frontier', '智研通'), undefined);
  app.query('百舸问答'); assert.deepEqual(app.items().map(item => item.dataset.homeChild), ['对话']);
  app.query('智能问数'); assert.equal(app.items().length, 0);
  app.query('前沿工具'); assert.deepEqual(app.items().map(item => item.dataset.homeChild), ['全球鹰']);
});

test('search matches concrete names, descriptions, parent modules and tool categories without unrelated siblings', () => {
  const app = setup();
  app.query('文档翻译'); assert.deepEqual(app.items().map(item => item.dataset.homeChild), ['文档翻译']);
  app.query('可编辑'); assert.deepEqual(app.items().map(item => item.dataset.homeChild), ['OCR识别']);
  app.query('百舸问答'); assert.equal(app.items().length, 2);
  app.query('百舸文库'); assert.deepEqual(app.items().map(item => item.dataset.homeChild), ['']);
  app.query('文件管理'); assert.equal(app.items().length, 0);
  app.query('权限管理'); assert.equal(app.items().length, 0);
  app.query('数据平台'); assert.equal(app.items().length, 3);
  app.query('文档处理'); assert.equal(app.items().length, 4);
  app.query('智能工具'); assert.equal(app.items().length, 11);
  app.query(' ocr '); assert.deepEqual(app.items().map(item => item.dataset.homeChild), ['OCR识别']);
  assert.match(app.get('featureSearchSummary').textContent, /1/);
});

test('search temporarily spans categories and clearing or Escape restores the prior category', () => {
  const app = setup(); app.group('knowledge-research');
  app.query('翻译'); assert.equal(app.items().length, 2);
  app.get('featureClear').emit('click'); assert.equal(app.items().length, 7);
  assert.equal(app.get('featureGroups').querySelector('[data-feature-group="knowledge-research"]').attributes['aria-pressed'], 'true');
  app.query('翻译'); app.get('featureSearch').emit('keydown', {key: 'Escape'}); assert.equal(app.items().length, 7);
  assert.equal(app.document.activeElement, app.get('featureSearch'));
  app.query('翻译'); app.group('tools-platforms'); assert.equal(app.items().length, 19);
  assert.equal(app.get('featureSearch').value, '');
});

test('empty state reset clears query and availability and returns every destination', () => {
  const app = setup(); app.group('knowledge-research'); app.available(true); app.query('不存在的功能');
  assert.equal(app.items().length, 0);
  app.get('featureResults').querySelector('[data-reset-directory]').emit('click');
  assert.equal(app.items().length, 26);
  assert.equal(app.get('availableOnly').checked, false);
  assert.equal(app.get('featureSearch').value, '');
  assert.equal(app.document.activeElement, app.get('featureSearch'));
});

test('whole-item click navigates once to its exact destination and common shortcuts retain navigation', () => {
  const app = setup();
  app.route('data-platform', '爬虫平台').querySelector('strong').emit('click');
  assert.equal(JSON.stringify(app.navigations), JSON.stringify([['data-platform', '爬虫平台']]));
  app.get('commonFunctions').innerHTML = '<button class="home-common-card" data-home-route="smart-tools" data-home-child="OCR识别"><span>OCR识别</span></button>';
  app.get('commonFunctions').querySelector('span').emit('click');
  assert.equal(JSON.stringify(app.navigations[1]), JSON.stringify(['smart-tools', 'OCR识别']));
  app.get('unrelated').emit('click'); assert.equal(app.navigations.length, 2);
});

test('library entry navigates to the library without backend management shortcuts', () => {
  const app = setup();
  app.route('library').querySelector('strong').emit('click');
  assert.equal(JSON.stringify(app.navigations), JSON.stringify([['library', '']]));
  assert.equal(app.route('library', '文件管理'), undefined);
  assert.equal(app.route('library', '权限管理'), undefined);
});

test('denied child opens application, updates only that item to pending, and restores focus after redraw', () => {
  const app = setup();
  const original = app.route('qa', '智能问数'); original.emit('click');
  assert.equal(app.navigations.length, 0);
  assert.equal(app.get('homeAccessDialog').open, true);
  assert.match(app.get('homeAccessDescription').textContent, /智能问数/);
  app.get('applyHomeAccess').emit('click');
  const updated = app.route('qa', '智能问数');
  assert.notEqual(updated, original); assert.equal(original.isConnected, false);
  assert.match(updated.textContent, /待审批/); assert.match(updated.textContent, /查看申请/);
  assert.match(app.route('frontier', '智研通').textContent, /需申请/);
  app.get('closeHomeAccess').emit('click'); assert.equal(app.document.activeElement, updated);
  app.available(true); assert.equal(app.items().length, 23);
});
