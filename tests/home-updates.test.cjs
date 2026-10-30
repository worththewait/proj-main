const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; this.listeners = {}; this.open = false; this.innerHTML = ''; this.textContent = ''; this.isConnected = true; this.scrollTop = 0; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name, target = this) { this.listeners[name]?.({target}); }
    matches(selector) {
      if (selector.startsWith('.')) return (this.className || '').split(/\s+/).includes(selector.slice(1));
      const attribute = selector.match(/^\[data-([\w-]+)(?:="([^"]*)")?\]$/);
      if (!attribute) return this.tagName?.toLowerCase() === selector.toLowerCase();
      const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      return Object.hasOwn(this.dataset, key) && (attribute[2] === undefined || this.dataset[key] === attribute[2]);
    }
    closest(selector) { return selector.split(',').some(part => this.matches(part.trim())) ? this : null; }
    querySelectorAll(selector) {
      return Array.from(this.innerHTML.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi), match => {
        const element = new Element(); element.tagName = match[1].toUpperCase();
        element.className = match[2].match(/\bclass="([^"]*)"/)?.[1] || '';
        for (const attribute of match[2].matchAll(/\bdata-([\w-]+)(?:="([^"]*)")?/g)) {
          const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
          element.dataset[key] = attribute[2] || '';
        }
        return element;
      }).filter(element => element.matches(selector));
    }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getBoundingClientRect() { return {top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0}; }
    focus() { this.focused = true; }
    scrollIntoView() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
  }
  const ids = ['productUpdatesDialog', 'productUpdateDialogTitle', 'productUpdateContent', 'closeProductUpdates', 'dismissProductUpdates', 'homeUpdatesList'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const document = new Element(); document.querySelector = selector => elements[selector.slice(1)];
  const navigations = [], storage = new Map(); let deactivate;
  const window = {BaigeHomeAccess: {navigate: (...args) => navigations.push(args)}, BaigePage: {onDeactivate: callback => {deactivate = callback;}}};
  window.localStorage = {getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)};
  window.addEventListener = () => {};
  const context = vm.createContext({window, document});
  for (const file of ["data.js","home-card-images.js","home-carousel-model.js","home-config.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname,"../src",file),"utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/ui.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/pages/home-updates.js'), 'utf8'), context);
  const open = id => {const trigger = new Element({productUpdate: id}); document.emit('click', trigger); return trigger;};
  const openAll = () => {const trigger = new Element({allProductUpdates: ''}); document.emit('click', trigger); return trigger;};
  const loadEarlier = () => elements.productUpdateContent.emit('click', new Element({loadEarlierUpdates: ''}));
  const expand = id => elements.productUpdateContent.emit('click', new Element({expandUpdate: id}));
  return {elements, document, navigations, open, openAll, loadEarlier, expand, config:window.BaigeHomeConfig, refresh:()=>window.BaigeHomeUpdates.refresh(), deactivate: () => deactivate(), Element};
}

function archiveRecords() {
  const dates = [
    '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27',
    '2026-10-26', '2026-10-25', '2026-10-24', '2026-10-23', '2026-10-22',
    '2026-10-21', '2026-10-20', '2026-10-19',
    '2026-09-30', '2026-09-29', '2026-09-28', '2026-09-27', '2026-09-26',
    '2026-09-25', '2026-09-24', '2026-09-23', '2026-08-31', '2026-08-30',
  ];
  return dates.map((date, index) => ({
    id: `entry-${index + 1}`, title: `产品动态 ${index + 1}`, date,
    body: `${'这是动态摘要内容。'.repeat(40)}全文结尾 ${index + 1}`,
    status: 'published', destination: {route: 'smart-tools', child: 'OCR识别'},
  }));
}

function articles(app) {
  return Array.from(app.elements.productUpdateContent.innerHTML.matchAll(/<article\b([^>]*)>([\s\S]*?)<\/article>/g), match => ({
    id: match[1].match(/\bdata-update-id="([^"]*)"/)?.[1], html: match[2],
  }));
}

const articleIds = app => articles(app).map(article => article.id);
const expandedIds = app => articles(app).filter(article => /\bclass="[^"]*\bhome-update-body\b/.test(article.html)).map(article => article.id);
const monthLabels = app => (app.elements.productUpdateContent.innerHTML.match(/2026\s*年\s*(?:10|9|8)\s*月/g) || []).map(label => label.replace(/\s+/g, ''));

test('news opens the selected Baige demo detail and closing restores its trigger', () => {
  const app = setup(); const trigger = app.open('knowledge');
  assert.equal(app.elements.productUpdatesDialog.open, true);
  assert.match(app.elements.productUpdateContent.innerHTML, /行业、企业、部门/);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML, /Doubao|方舟/);
  app.elements.closeProductUpdates.emit('click');
  assert.equal(app.elements.productUpdatesDialog.open, false);
  assert.equal(trigger.focused, true);
});

test('all news starts with ten recent entries while an unknown id does not open', () => {
  const app = setup(); app.open('unknown');
  assert.equal(app.elements.productUpdatesDialog.open, false);
  app.openAll();
  assert.equal(articles(app).length, 10);
  assert.equal(app.elements.productUpdateContent.dataset.mode, 'all');
});

test('loading earlier news preserves order across month boundaries without duplicate entries or month headings', () => {
  const app = setup(); app.config.saveSection('updates', archiveRecords()); app.openAll();
  assert.deepEqual(articleIds(app), ['entry-1', 'entry-2', 'entry-3', 'entry-4', 'entry-5', 'entry-6', 'entry-7', 'entry-8', 'entry-9', 'entry-10']);
  assert.deepEqual(monthLabels(app), ['2026年10月']);
  assert.equal(expandedIds(app).length, 0);
  assert.equal((app.elements.productUpdateContent.innerHTML.match(/\bhome-update-preview\b/g) || []).length, 10);
  assert.match(app.elements.productUpdateContent.innerHTML, /<time\b[^>]*datetime="2026-10-31"/);
  assert.match(app.elements.productUpdateContent.innerHTML, /\bdata-load-earlier-updates\b/);

  app.loadEarlier();
  assert.deepEqual(articleIds(app), ['entry-1', 'entry-2', 'entry-3', 'entry-4', 'entry-5', 'entry-6', 'entry-7', 'entry-8', 'entry-9', 'entry-10', 'entry-11', 'entry-12', 'entry-13', 'entry-14', 'entry-15', 'entry-16', 'entry-17', 'entry-18', 'entry-19', 'entry-20']);
  assert.deepEqual(monthLabels(app), ['2026年10月', '2026年9月']);
  assert.match(app.elements.productUpdateContent.innerHTML, /\bdata-load-earlier-updates\b/);

  app.loadEarlier();
  assert.deepEqual(articleIds(app), ['entry-1', 'entry-2', 'entry-3', 'entry-4', 'entry-5', 'entry-6', 'entry-7', 'entry-8', 'entry-9', 'entry-10', 'entry-11', 'entry-12', 'entry-13', 'entry-14', 'entry-15', 'entry-16', 'entry-17', 'entry-18', 'entry-19', 'entry-20', 'entry-21', 'entry-22', 'entry-23']);
  assert.deepEqual(monthLabels(app), ['2026年10月', '2026年9月', '2026年8月']);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML, /\bdata-load-earlier-updates\b/);
});

test('reopening all news starts a fresh ten-entry list after loading and expanding', () => {
  const app = setup(); app.config.saveSection('updates', archiveRecords()); app.openAll();
  app.loadEarlier(); app.expand('entry-11');
  assert.equal(articles(app).length, 20);
  assert.deepEqual(expandedIds(app), ['entry-11']);
  app.elements.closeProductUpdates.emit('click'); app.openAll();
  assert.equal(articles(app).length, 10);
  assert.deepEqual(expandedIds(app), []);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML, /data-update-id="entry-11"/);
});

test('expanding another news item replaces the previous full body and clicking it again collapses it', () => {
  const app = setup(); app.config.saveSection('updates', archiveRecords()); app.openAll();
  app.expand('entry-1');
  assert.deepEqual(expandedIds(app), ['entry-1']);
  assert.match(articles(app)[0].html, /全文结尾 1/);
  app.expand('entry-2');
  assert.deepEqual(expandedIds(app), ['entry-2']);
  assert.doesNotMatch(articles(app)[0].html, /全文结尾 1/);
  assert.match(articles(app)[1].html, /全文结尾 2/);
  app.expand('entry-2');
  assert.deepEqual(expandedIds(app), []);
  assert.doesNotMatch(articles(app)[1].html, /全文结尾 2/);
  assert.equal(articles(app).length, 10);
});

test('unloaded, unknown and unpublished news cannot be expanded or used to navigate', () => {
  const app = setup();
  app.config.saveSection('updates', [...archiveRecords(),
    {id: 'draft', title: '草稿', date: '2026-11-01', body: '草稿内容', status: 'draft', destination: {route: 'smart-tools', child: 'OCR识别'}},
    {id: 'withdrawn', title: '已撤回', date: '2026-11-01', body: '撤回内容', status: 'unpublished', destination: {route: 'smart-tools', child: 'OCR识别'}},
  ]);
  app.openAll(); const before = app.elements.productUpdateContent.innerHTML;
  for (const id of ['entry-11', 'draft', 'withdrawn', 'unknown']) {
    app.expand(id);
    app.elements.productUpdateContent.emit('click', new app.Element({updateTarget: id}));
    assert.equal(app.elements.productUpdateContent.innerHTML, before);
    assert.equal(app.elements.productUpdatesDialog.open, true);
    assert.equal(app.navigations.length, 0);
  }
});

test('a displayed record withdrawn while the dialog is open cannot expand or navigate', () => {
  const app = setup(); const records = archiveRecords();
  app.config.saveSection('updates', records); app.openAll();
  const before = app.elements.productUpdateContent.innerHTML;
  app.config.saveSection('updates', records.map(item => item.id === 'entry-1' ? {...item, status: 'unpublished'} : item));
  app.expand('entry-1');
  app.elements.productUpdateContent.emit('click', new app.Element({updateTarget: 'entry-1'}));
  assert.equal(app.elements.productUpdateContent.innerHTML, before);
  assert.equal(app.elements.productUpdatesDialog.open, true);
  assert.equal(app.navigations.length, 0);
});

test('all news with one published item remains a collapsible list rather than a detail view', () => {
  const app = setup(); app.config.saveSection('updates', archiveRecords().slice(0, 1)); app.openAll();
  assert.equal(app.elements.productUpdateContent.dataset.mode, 'all');
  assert.equal(app.elements.productUpdateDialogTitle.textContent, '全部产品动态');
  assert.deepEqual(articleIds(app), ['entry-1']);
  assert.deepEqual(expandedIds(app), []);
  assert.match(app.elements.productUpdateContent.innerHTML, /\bhome-update-preview\b/);
  assert.match(app.elements.productUpdateContent.innerHTML, /data-expand-update="entry-1"/);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML, /\bdata-load-earlier-updates\b/);
  app.expand('entry-1');
  assert.equal(app.elements.productUpdateContent.dataset.mode, 'all');
  assert.deepEqual(expandedIds(app), ['entry-1']);
});

test('detail actions navigate through permissions and leaving home dismisses the modal', () => {
  const app = setup(); app.open('tools');
  const action = new app.Element({updateTarget: 'tools'});
  app.elements.productUpdateContent.emit('click', action);
  assert.equal(app.elements.productUpdatesDialog.open, false);
  assert.deepEqual(app.navigations[0].slice(0, 2), ['smart-tools', '']);
  app.open('workbench'); app.deactivate();
  assert.equal(app.elements.productUpdatesDialog.open, false);
});


test('published updates refresh a mounted homepage while drafts and cancelled updates stay hidden, then deletion removes them', () => {
  const app=setup();
  app.config.saveSection('updates',[
    {id:'new',title:'最新发布',date:'2026-10-27',body:'正文',status:'published'},
    {id:'draft',title:'未发布草稿',date:'2026-10-27',body:'待完善',status:'draft'},
    {id:'unpublished',title:'已取消发布',date:'2026-10-27',body:'正文',status:'unpublished'},
  ]);
  app.refresh();
  assert.match(app.elements.homeUpdatesList.innerHTML,/最新发布/);
  assert.doesNotMatch(app.elements.homeUpdatesList.innerHTML,/未发布草稿/);
  assert.doesNotMatch(app.elements.homeUpdatesList.innerHTML,/已取消发布/);
  app.open('new');assert.equal(app.elements.productUpdateDialogTitle.textContent,'最新发布');
  app.config.saveSection('updates',[]);app.refresh();
  assert.doesNotMatch(app.elements.homeUpdatesList.innerHTML,/最新发布/);
  assert.match(app.elements.homeUpdatesList.innerHTML,/暂无产品动态/);
});
test('user authored dynamic title and body are escaped as plain text', () => {
  const app=setup();
  app.config.saveSection('updates',[{id:'custom',title:'<img src=x>',date:'2026-10-27',body:'<script>bad()</script>',status:'published'}]);
  app.refresh();app.open('custom');
  assert.match(app.elements.homeUpdatesList.innerHTML,/&lt;img src=x&gt;/);
  assert.match(app.elements.productUpdateContent.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML,/<script>/);
  app.elements.closeProductUpdates.emit('click'); app.openAll();
  assert.match(app.elements.productUpdateContent.innerHTML,/&lt;img src=x&gt;/);
  assert.match(app.elements.productUpdateContent.innerHTML,/&lt;script&gt;/);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML,/<script>|<img\b/);
  app.expand('custom');
  assert.deepEqual(expandedIds(app), ['custom']);
  assert.match(app.elements.productUpdateContent.innerHTML,/&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML,/<script>|<img\b/);
});

test('authored news displays its publication date on home and opens detail before its configured function', () => {
  const app=setup();
  app.config.saveSection('updates',[{id:'linked',title:'识别能力更新',date:'2026-10-27',body:'先查看这段正文。',status:'published',destination:{route:'smart-tools',child:'OCR识别'}}]);
  app.refresh(); app.open('linked');
  assert.equal(app.navigations.length,0);
  assert.equal(app.elements.productUpdatesDialog.open,true);
  assert.match(app.elements.productUpdateContent.innerHTML,/先查看这段正文/);
  assert.match(app.elements.productUpdateContent.innerHTML,/进入.*OCR识别/);
  assert.match(app.elements.homeUpdatesList.innerHTML,/<time datetime="2026-10-27">26-10-27<\/time>/);
  app.elements.productUpdateContent.emit('click',new app.Element({updateTarget:'linked'}));
  assert.deepEqual(app.navigations[0].slice(0,2),['smart-tools','OCR识别']);
  assert.equal(app.elements.productUpdatesDialog.open,false);
});

test('news without a destination has no action and a withdrawn record cannot navigate', () => {
  const app=setup();
  const entry={id:'optional',title:'纯文字动态',date:'2026-10-27',body:'内容',status:'published',destination:null};
  app.config.saveSection('updates',[entry]);app.open('optional');
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML,/data-update-target/);
  app.config.saveSection('updates',[{...entry,destination:{route:'knowledge',child:''}}]);app.open('optional');
  app.config.saveSection('updates',[]);
  app.elements.productUpdateContent.emit('click',new app.Element({updateTarget:'optional'}));
  assert.equal(app.navigations.length,0);
});
