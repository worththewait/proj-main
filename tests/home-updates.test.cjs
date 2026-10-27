const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup() {
  class Element {
    constructor(dataset = {}) { this.dataset = dataset; this.listeners = {}; this.open = false; this.innerHTML = ''; this.textContent = ''; this.isConnected = true; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name, target = this) { this.listeners[name]?.({target}); }
    closest(selector) { return selector.includes('data-product-update') && this.dataset.productUpdate ? this : selector.includes('data-all-product-updates') && this.all ? this : selector.includes('data-update-target') && this.dataset.updateTarget ? this : null; }
    focus() { this.focused = true; }
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
  return {elements, document, navigations, open, config:window.BaigeHomeConfig, refresh:()=>window.BaigeHomeUpdates.refresh(), deactivate: () => deactivate(), Element};
}

test('news opens the selected Baige demo detail and closing restores its trigger', () => {
  const app = setup(); const trigger = app.open('knowledge');
  assert.equal(app.elements.productUpdatesDialog.open, true);
  assert.match(app.elements.productUpdateContent.innerHTML, /行业、企业、部门/);
  assert.doesNotMatch(app.elements.productUpdateContent.innerHTML, /Doubao|方舟/);
  app.elements.closeProductUpdates.emit('click');
  assert.equal(app.elements.productUpdatesDialog.open, false);
  assert.equal(trigger.focused, true);
});

test('all news displays three unique entries while an unknown id does not open', () => {
  const app = setup(); app.open('unknown');
  assert.equal(app.elements.productUpdatesDialog.open, false);
  const trigger = new app.Element(); trigger.all = true; app.document.emit('click', trigger);
  assert.equal((app.elements.productUpdateContent.innerHTML.match(/<article/g) || []).length, 3);
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


test('published updates refresh a mounted homepage while drafts stay hidden, then deletion removes them', () => {
  const app=setup();
  app.config.saveSection('updates',[
    {id:'new',title:'最新发布',date:'2026-10-27',body:'正文',status:'published'},
    {id:'draft',title:'未发布草稿',date:'2026-10-27',body:'待完善',status:'draft'},
  ]);
  app.refresh();
  assert.match(app.elements.homeUpdatesList.innerHTML,/最新发布/);
  assert.doesNotMatch(app.elements.homeUpdatesList.innerHTML,/未发布草稿/);
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
