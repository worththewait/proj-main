const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function setup() {
  let activeElement;
  class Element {
    constructor(id='') { this.id=id; this.value=''; this.textContent=''; this.innerHTML=''; this.hidden=false; this.open=false; this.disabled=false; this.files=[]; this.dataset={}; this.attributes={}; this.listeners={}; this.isConnected=true; const classes=new Set();this.classList={add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c),toggle:(c,on)=>{if(on)classes.add(c);else classes.delete(c);}}; }
    addEventListener(type,fn) { (this.listeners[type] ||= []).push(fn); }
    emit(type,target=this,extra={}) { const event={target,preventDefault(){this.defaultPrevented=true;},...extra};for(const fn of this.listeners[type]||[])fn(event);return event; }
    querySelectorAll() { return []; }
    setAttribute(key,value) { this.attributes[key]=String(value); }
    getAttribute(key) { return this.attributes[key]??null; }
    removeAttribute(key) { delete this.attributes[key]; }
    focus() { activeElement=this; }
    showModal() { this.open=true; }
    close() { this.open=false; this.emit('close'); }
    contains(target) { return target===this; }
    closest(selector) { const m=/^\[data-([\w-]+)\]$/.exec(selector);if(!m)return null;const key=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[key]!==undefined?this:null; }
  }
  const elements=new Map();const get=id=>{if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);};
  const tabs=['list','categories'].map((name,i)=>{const el=get(i?'featureCategoryTab':'featureListTab');el.dataset.featureTab=name;return el;});
  const scopes=['home','tools'].map(name=>{const el=get(`scope-${name}`);el.dataset.categoryScope=name;return el;});
  const document={querySelector:s=>get(s.slice(1)),querySelectorAll:s=>s==='[data-feature-tab]'?tabs:s==='[data-category-scope]'?scopes:[],addEventListener(){},get activeElement(){return activeElement;}};
  const events={};const storage=new Map();let failStorage=false;
  const window={document,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(failStorage)throw Error('quota');storage.set(k,v);}},addEventListener:(t,fn)=>(events[t]||=[]).push(fn),dispatchEvent:e=>(events[e.type]||[]).forEach(fn=>fn(e))};
  const context=vm.createContext({window,document,CustomEvent:class {constructor(type,init={}){this.type=type;this.detail=init.detail;}},setTimeout:()=>1,clearTimeout(){},URLSearchParams,location:{search:''}});
  for(const file of ['src/data.js','src/ui.js','src/home-directory-icons.js','src/home-card-images.js','src/feature-config.js'])vm.runInContext(source(file),context);
  const controller=path.join(__dirname,'../src/pages/feature-admin.js');if(fs.existsSync(controller))vm.runInContext(fs.readFileSync(controller,'utf8'),context);
  const action=(container,key,value)=>{const el=new Element();el.dataset[key]=value;get(container).emit('click',el);return el;};
  return {get,window,config:window.BaigeFeatureConfig,action,failStorage:()=>{failStorage=true;}};
}

test('feature management paginates all existing functions and searching resets the page',()=>{
  const app=setup();const rows=()=>(app.get('featureTable').innerHTML.match(/<tr>/g)||[]).length;
  assert.equal(rows(),10);assert.match(app.get('featureSummary').textContent,/27/);
  app.action('featurePager','featurePage','3');assert.equal(rows(),7);
  app.get('featureSearch').value='OCR';app.get('featureSearch').emit('input');
  assert.equal(rows(),1);assert.match(app.get('featureTable').innerHTML,/OCR识别/);assert.equal(app.get('featurePager').hidden,true);
});

test('tool-category filter excludes non-tools and keeps the full catalog intact',()=>{
  const app=setup();app.get('featureToolFilter').value='documents';app.get('featureToolFilter').emit('change');
  assert.equal((app.get('featureTable').innerHTML.match(/<tr>/g)||[]).length,4);
  assert.doesNotMatch(app.get('featureTable').innerHTML,/百舸写作/);assert.equal(app.config.catalog().length,27);
});

test('editing a feature saves its selected icon and category through the shared model',()=>{
  const app=setup();app.config.addCategory('home','综合服务');const category=app.config.read().categories.home.find(c=>c.label==='综合服务');
  app.action('featureTable','editFeature','tool:OCR识别');assert.equal(app.get('featureEditor').open,true);
  app.get('editFeatureHome').value=category.id;app.get('editFeatureHome').emit('change');
  app.get('editFeatureIcon').value='file';app.get('editFeatureIcon').emit('change');app.get('featureEditorForm').emit('submit');
  assert.equal(app.config.get('tool:OCR识别').homeCategory,category.id);assert.equal(app.config.get('tool:OCR识别').icon,'file');assert.equal(app.get('featureEditor').open,false);
});

test('cancelling a dirty edit offers continue or discard without saving',()=>{
  const app=setup();app.action('featureTable','editFeature','tool:OCR识别');app.get('editFeatureIcon').value='book';app.get('editFeatureIcon').emit('change');
  app.get('cancelFeatureEdit').emit('click');assert.equal(app.get('featureDiscardDialog').open,true);assert.equal(app.get('featureEditor').open,true);
  app.get('continueFeatureEdit').emit('click');assert.equal(app.get('featureDiscardDialog').open,false);assert.equal(app.get('featureEditor').open,true);
  app.get('cancelFeatureEdit').emit('click');app.get('discardFeatureEdit').emit('click');
  assert.equal(app.get('featureEditor').open,false);assert.equal(app.config.get('tool:OCR识别').icon,'scan');
});

test('failed storage retains the edited values and shows an error instead of success',()=>{
  const app=setup();app.action('featureTable','editFeature','tool:OCR识别');app.get('editFeatureIcon').value='book';app.get('editFeatureIcon').emit('change');app.failStorage();app.get('featureEditorForm').emit('submit');
  assert.equal(app.get('featureEditor').open,true);assert.equal(app.get('editFeatureIcon').value,'book');assert.match(app.get('featureEditorFeedback').textContent,/保存|存储/);assert.equal(app.config.get('tool:OCR识别').icon,'scan');
});

test('category management adds, renames and migrates populated categories',()=>{
  const app=setup();app.get('addFeatureCategory').emit('click');app.get('featureCategoryName').value='综合服务';app.get('featureCategoryForm').emit('submit');
  let added=app.config.read().categories.home.find(c=>c.label==='综合服务');assert.ok(added);
  app.action('featureCategoryTable','renameCategory',added.id);app.get('featureCategoryName').value='综合工作';app.get('featureCategoryForm').emit('submit');assert.equal(app.config.read().categories.home.find(c=>c.id===added.id).label,'综合工作');
  app.config.saveFeature('route:qa',{homeCategory:added.id});app.action('featureCategoryTable','deleteCategory',added.id);assert.equal(app.get('categoryMigrationField').hidden,false);
  const target=app.config.read().categories.home.find(c=>c.id!==added.id);app.get('featureCategoryTarget').value=target.id;app.get('featureCategoryForm').emit('submit');
  assert.equal(app.config.read().categories.home.some(c=>c.id===added.id),false);assert.equal(app.config.get('route:qa').homeCategory,target.id);
});

test('closing an edited category preserves it until the user explicitly discards',()=>{
  const app=setup();app.get('addFeatureCategory').emit('click');app.get('featureCategoryName').value='待保存分类';app.get('cancelFeatureCategory').emit('click');
  assert.equal(app.get('featureCategoryDialog').open,true);assert.equal(app.get('featureDiscardDialog').open,true);
  app.get('continueFeatureEdit').emit('click');assert.equal(app.get('featureCategoryName').value,'待保存分类');assert.equal(app.get('featureCategoryDialog').open,true);
  app.get('cancelFeatureCategory').emit('click');app.get('discardFeatureEdit').emit('click');assert.equal(app.get('featureCategoryDialog').open,false);assert.equal(app.config.read().categories.home.some(c=>c.label==='待保存分类'),false);
});

test('late image processing cannot overwrite the next feature after discarding',async()=>{
  const app=setup();let finish;app.window.BaigeHomeCardImages={...app.window.BaigeHomeCardImages,process:()=>new Promise(resolve=>{finish=resolve;})};
  app.action('featureTable','editFeature','tool:OCR识别');app.get('uploadFeatureImage').files=[{name:'test.png'}];app.get('uploadFeatureImage').emit('change');assert.equal(app.get('saveFeatureEdit').disabled,true);
  app.get('cancelFeatureEdit').emit('click');app.get('discardFeatureEdit').emit('click');app.action('featureTable','editFeature','route:qa');
  finish('data:image/jpeg;base64,/9j/AAAA');await Promise.resolve();await Promise.resolve();
  assert.match(app.get('featureEditorTitle').textContent,/对话/);assert.doesNotMatch(app.get('featureImagePreview').innerHTML,/\/9j\/AAAA/);assert.equal(app.get('saveFeatureEdit').disabled,false);
});
