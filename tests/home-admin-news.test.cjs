const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup(featureEntries = null) {
  class Element {
    constructor(id) {
      this.id=id; this.value=''; this.dataset={}; this.listeners={}; this.attributes={}; this.hidden=false; this.isConnected=true; this.textContent=''; this.innerHTML='';
      this.classes=new Set();
      this.classList={
        add:name=>this.classes.add(name),
        remove:name=>this.classes.delete(name),
        contains:name=>this.classes.has(name),
        toggle:(name,force)=>{const on=force===undefined?!this.classes.has(name):force; if(on) this.classes.add(name); else this.classes.delete(name); return on;},
      };
    }
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
  let featureChanged;
  if(featureEntries)window.BaigeFeatureConfig={catalog:()=>featureEntries,read:()=>({categories:{home:[{id:'knowledge-research',label:'专业研究'},{id:'tools-platforms',label:'工具与平台'},{id:'added',label:'专题服务'}]}}),iconMarkup:item=>`<span data-managed-icon="${item.icon}"></span>`,subscribe(callback){featureChanged=callback;}};
  const timers = [];
  const context=vm.createContext({window,document,setTimeout:(fn,ms)=>{timers.push({fn,ms});return timers.length;},clearTimeout:()=>{}});
  for(const file of ['data.js','ui.js','home-card-images.js','home-carousel-model.js','home-config.js','pages/home-admin.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8'),context);
  const trigger=(action,id)=>{const target=new Element();target.dataset[action]=id;get('updatesTable').emit('click',target);};
  return {get,config:window.BaigeHomeConfig,trigger,timers,featureChanged:()=>featureChanged?.()};
}

test('recommendation management follows managed home categories and icon changes',()=>{
  const entries=[{id:'tool:PPT生成',icon:'branch',homeCategory:'added',homeCategoryLabel:'专题服务'}];
  const app=setup(entries);
  assert.match(app.get('recommendFilters').innerHTML,/专题服务/);
  assert.match(app.get('recommendFilters').innerHTML,/专业研究/);
  assert.match(app.get('recommendOptions').innerHTML,/data-managed-icon="branch"/);
  entries[0].icon='scan';app.featureChanged();
  assert.match(app.get('recommendOptions').innerHTML,/data-managed-icon="scan"/);
  assert.match(app.get('recommendCount').textContent,/已选 4 \/ 4 项/);
});
const published={id:'published',title:'已发布标题',body:'完整正文\n第二行',date:'2026-10-27',status:'published',destination:{route:'smart-tools',child:'OCR识别'}};
const draft={id:'draft',title:'草稿标题',body:'草稿正文',date:'2026-10-26',status:'draft',destination:null};
const unpublished={id:'unpublished',title:'取消发布标题',body:'已取消正文',date:'2026-10-25',status:'unpublished',destination:null};

test('published and cancelled updates are listed, drafts stay hidden, with the right actions', () => {
  const app=setup();
  app.config.saveSection('updates',[published,draft,unpublished]);
  app.get('updatesSearch').emit('input');
  const html=app.get('updatesTable').innerHTML;
  assert.match(html,/已发布标题/);
  assert.match(html,/取消发布标题/);
  assert.doesNotMatch(html,/草稿标题/);
  assert.match(html,/data-view-update="published"/);
  assert.match(html,/data-unpublish-update="published"/);
  assert.match(html,/data-view-update="unpublished"/);
  assert.match(html,/data-publish-update="unpublished"/);
  assert.doesNotMatch(html,/data-edit-update/);
  assert.match(html,/已发布/);
  assert.match(html,/取消发布/);
  assert.match(app.get('updatesSummary').textContent,/共 2 条动态 · 已发布 1 条 · 取消发布 1 条/);
});

test('unpublishing keeps the row with a cancelled status and removes it only from the homepage', () => {
  const app=setup();
  app.config.saveSection('updates',[published,draft]);
  app.trigger('viewUpdate','published');
  assert.equal(app.get('updateDetailTitle').textContent,published.title);
  assert.equal(app.get('updateDetailStatus').textContent,'已发布');
  app.get('closeUpdateDetail').emit('click');
  app.trigger('unpublishUpdate','published');
  assert.equal(app.config.read().updates.find(item=>item.id==='published').status,'unpublished');
  assert.equal(app.config.published().some(item=>item.id==='published'),false);
  assert.match(app.get('updatesTable').innerHTML,/已发布标题/);
  assert.match(app.get('updatesTable').innerHTML,/data-publish-update="published"/);
  assert.match(app.get('updatesTable').innerHTML,/取消发布/);
  assert.match(app.get('updatesSummary').textContent,/共 1 条动态 · 已发布 0 条 · 取消发布 1 条/);
  assert.equal(app.get('adminNotice').textContent,'');
  assert.match(app.get('adminToast').innerHTML,/已取消发布，首页已移除/);
  assert.equal(app.get('adminToast').classList.contains('is-visible'),true);
  assert.equal(app.timers.at(-1).ms,2000);
  app.timers.at(-1).fn();
  assert.equal(app.get('adminToast').classList.contains('is-visible'),false);
  app.trigger('viewUpdate','published');
  assert.equal(app.get('updateDetailStatus').textContent,'取消发布');
});

test('a cancelled update can be published again', () => {
  const app=setup();
  app.config.saveSection('updates',[unpublished]);
  app.trigger('publishUpdate','unpublished');
  const saved=app.config.read().updates.find(item=>item.id==='unpublished');
  assert.equal(saved.status,'published');
  assert.match(saved.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(app.config.published().some(item=>item.id==='unpublished'),true);
  assert.match(app.get('updatesTable').innerHTML,/已发布标题|取消发布标题/);
  assert.match(app.get('updatesTable').innerHTML,/data-unpublish-update="unpublished"/);
  assert.match(app.get('updatesSummary').textContent,/共 1 条动态 · 已发布 1 条 · 取消发布 0 条/);
  assert.equal(app.get('adminNotice').textContent,'');
  assert.match(app.get('adminToast').innerHTML,/已重新发布，首页产品动态已同步更新/);
  assert.equal(app.get('adminToast').classList.contains('is-visible'),true);
  assert.equal(app.timers.at(-1).ms,2000);
  app.timers.at(-1).fn();
  assert.equal(app.get('adminToast').classList.contains('is-visible'),false);
});

test('new updates publish immediately and require a body', () => {
  const app=setup();
  app.config.saveSection('updates',[]);
  app.get('newUpdate').emit('click');
  assert.equal(app.get('updateForm').hidden,false);
  app.get('updateTitle').value='新动态';
  app.get('updateForm').emit('submit');
  assert.match(app.get('updateFeedback').textContent,/正文/);
  assert.equal(app.get('updateForm').hidden,false);
  app.get('updateBody').value='正文内容';
  app.get('updateForm').emit('submit');
  const saved=app.config.read().updates.find(item=>item.title==='新动态');
  assert.equal(saved.status,'published');
  assert.match(saved.date,/^\d{4}-\d{2}-\d{2}$/);
  assert.equal(app.get('updateForm').hidden,true);
  assert.match(app.get('updatesTable').innerHTML,/新动态/);
  assert.match(app.get('updatesSummary').textContent,/共 1 条动态 · 已发布 1 条 · 取消发布 0 条/);
});

test('searching covers published and cancelled updates but not drafts', () => {
  const app=setup();
  app.config.saveSection('updates',[published,draft,unpublished]);
  app.get('updatesSearch').value='取消';
  app.get('updatesSearch').emit('input');
  assert.match(app.get('updatesTable').innerHTML,/取消发布标题/);
  assert.doesNotMatch(app.get('updatesTable').innerHTML,/草稿标题/);
  app.get('updatesSearch').value='草稿';
  app.get('updatesSearch').emit('input');
  assert.doesNotMatch(app.get('updatesTable').innerHTML,/草稿标题/);
  assert.match(app.get('updatesTable').innerHTML,/没有匹配的动态/);
  app.get('updatesSearch').value='';
  app.get('updatesSearch').emit('input');
  assert.match(app.get('updatesTable').innerHTML,/已发布标题/);
  assert.match(app.get('updatesTable').innerHTML,/取消发布标题/);
});

test('product updates paginate at ten per page and search resets to page one', () => {
  const app=setup();
  const items=Array.from({length:12},(_,i)=>({
    id:`page-${i}`,
    title:`条目${String(i+1).padStart(2,'0')}`,
    body:'正文',
    date:`2026-10-${String(28-i).padStart(2,'0')}`,
    status:'published',
  }));
  app.config.saveSection('updates',items);
  app.get('updatesSearch').emit('input');
  const rows=()=>(app.get('updatesTable').innerHTML.match(/<tr>/g)||[]).length;
  assert.equal(rows(),10);
  assert.equal(app.get('updatesPager').hidden,false);
  assert.match(app.get('updatesPager').innerHTML,/aria-label="第 1 页"/);
  assert.match(app.get('updatesPager').innerHTML,/aria-current="page"/);
  assert.match(app.get('updatesSummary').textContent,/第 1\/2 页/);
  assert.match(app.get('updatesTable').innerHTML,/条目01/);
  assert.doesNotMatch(app.get('updatesTable').innerHTML,/条目11/);

  const target={dataset:{newsPage:'2'},disabled:false,closest(selector){return selector==='[data-news-page]'?this:null;}};
  app.get('updatesPager').emit('click',target);
  assert.equal(rows(),2);
  assert.match(app.get('updatesTable').innerHTML,/条目11/);
  assert.match(app.get('updatesTable').innerHTML,/条目12/);
  assert.doesNotMatch(app.get('updatesTable').innerHTML,/条目01/);
  assert.match(app.get('updatesSummary').textContent,/第 2\/2 页/);

  app.get('updatesSearch').value='条目12';
  app.get('updatesSearch').emit('input');
  assert.equal(rows(),1);
  assert.match(app.get('updatesSummary').textContent,/第 1\/1 页/);
  assert.equal(app.get('updatesPager').hidden,true);
});

test('update panel has no status filters or draft save control', () => {
  const page=fs.readFileSync(path.join(__dirname,'../pages/home-settings.html'),'utf8');
  assert.doesNotMatch(page,/updatesFilters|data-news-filter|saveUpdateDraft/);
  assert.match(page,/展示已发布与取消发布动态/);
  assert.match(page,/id="adminToast"/);
  assert.match(page,/id="updatesPager"/);
  const script=fs.readFileSync(path.join(__dirname,'../src/pages/home-admin.js'),'utf8');
  assert.match(script,/data-unpublish-update/);
  assert.match(script,/data-publish-update/);
  assert.match(script,/status === 'unpublished'/);
  assert.match(script,/function showToast\(text\)/);
  assert.match(script,/NEWS_PAGE_SIZE = 10/);
  assert.match(script,/data-news-page/);
  assert.match(script,/2000/);
});

test('published updates can still be deleted, and deletion is the only removal', () => {
  const app=setup();
  app.config.saveSection('updates',[published]);
  app.trigger('deleteUpdate','published');
  assert.equal(app.get('deleteUpdateDialog').open,true);
  app.get('confirmDeleteUpdate').emit('click');
  assert.equal(app.config.read().updates.length,0);
  assert.equal(app.config.published().length,0);
});
