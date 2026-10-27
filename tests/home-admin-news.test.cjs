const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  class Element {
    constructor(id) { this.id=id; this.value=''; this.dataset={}; this.listeners={}; this.attributes={}; this.hidden=false; this.isConnected=true; this.textContent=''; this.innerHTML=''; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, target=this) { for (const callback of this.listeners[name] || []) callback({target, preventDefault(){}}); }
    querySelectorAll() { return []; }
    setAttribute(name,value) { this.attributes[name]=String(value); }
    removeAttribute(name) { delete this.attributes[name]; }
    focus() { this.focused=true; }
    closest(selector) { const key=selector.slice(6,-1).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()); return this.dataset[key] ? this : null; }
    showModal() { this.open=true; }
    close() { this.open=false; this.emit('close'); }
  }
  const elements = new Map();
  const get = id => {if(!elements.has(id)) elements.set(id,new Element(id)); return elements.get(id);};
  const document = {querySelector: selector => get(selector.slice(1)), querySelectorAll: () => []};
  const storage = new Map();
  const window = {localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},BaigePage:{onDeactivate(){},onActivate(){}},BaigeHomeCarouselEditor:{beginDraft(){},onBusyChange(){},isBusy(){return false;},validateDraft(){return [];}}};
  const context=vm.createContext({window,document});
  for(const file of ['data.js','ui.js','home-card-images.js','home-carousel-model.js','home-config.js','pages/home-admin.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
  const trigger=(action,id)=>{const target=new Element();target.dataset[action]=id;get('updatesTable').emit('click',target);};
  return {get,config:window.BaigeHomeConfig,trigger};
}
const published={id:'published',title:'已发布标题',body:'完整正文\n第二行',date:'2026-10-27',status:'published',destination:{route:'smart-tools',child:'OCR识别'}};
const draft={id:'draft',title:'草稿标题',body:'草稿正文',date:'2026-10-26',status:'draft',destination:null};

test('published rows offer a complete read-only view and deletion, while drafts remain editable', () => {
  const app=setup(); app.config.saveSection('updates',[published,draft]); app.get('updatesSearch').emit('input');
  const html=app.get('updatesTable').innerHTML;
  assert.match(html,/data-view-update="published"/); assert.doesNotMatch(html,/data-edit-update="published"/);
  assert.match(html,/data-delete-update="published"/); assert.match(html,/data-edit-update="draft"/);
  app.trigger('viewUpdate','published');
  assert.equal(app.get('updateDetailTitle').textContent,published.title);
  assert.equal(app.get('updateDetailBody').textContent,published.body);
  assert.match(app.get('updateDetailDestination').textContent,/OCR识别/);
  assert.equal(app.get('updateDetailStatus').textContent,'已发布');
  assert.equal(app.get('updateDetailView').hidden,false); assert.equal(app.get('updateForm').hidden,true);
  app.get('closeUpdateDetail').emit('click');
  app.trigger('editUpdate','draft'); assert.equal(app.get('updateTitle').value,'草稿标题');
  app.get('updateTitle').value='修改后的草稿'; app.get('saveUpdateDraft').emit('click');
  assert.equal(app.config.read().updates.find(x=>x.id==='draft').title,'修改后的草稿');
});

test('a draft opened before publication or deletion cannot overwrite or recreate the record', () => {
  for (const change of ['published','deleted']) for (const action of ['submit','draft']) {
    const app=setup(); app.config.saveSection('updates',[draft]); app.trigger('editUpdate','draft');
    app.get('updateTitle').value='过期编辑';
    app.config.saveSection('updates',change==='published'?[{...draft,status:'published',title:'已发布的最新内容'}]:[]);
    const before=JSON.stringify(app.config.read().updates);
    if(action==='submit') app.get('updateForm').emit('submit'); else app.get('saveUpdateDraft').emit('click');
    assert.equal(JSON.stringify(app.config.read().updates),before);
    assert.match(app.get('updateFeedback').textContent,/已发布|已删除/);
  }
});

test('editing a draft can publish it and deleting published content removes it', () => {
  const app=setup(); app.config.saveSection('updates',[draft,published]);
  app.trigger('editUpdate','draft'); app.get('updateTitle').value='发布草稿'; app.get('updateForm').emit('submit');
  const saved=app.config.read().updates.find(item=>item.id==='draft');
  assert.equal(saved.status,'published'); assert.equal(saved.title,'发布草稿');
  assert.match(saved.date,/^\d{4}-\d{2}-\d{2}$/);
  app.trigger('deleteUpdate','published'); assert.equal(app.get('deleteUpdateDialog').open,true);
  app.get('confirmDeleteUpdate').emit('click');
  assert.equal(app.config.read().updates.some(item=>item.id==='published'),false);
});

test('an outdated edit button cannot open a published record for editing', () => {
  const app=setup(); app.config.saveSection('updates',[published]); app.trigger('editUpdate','published');
  assert.equal(app.get('updateDetailView').hidden,false); assert.equal(app.get('updateForm').hidden,true);
});
