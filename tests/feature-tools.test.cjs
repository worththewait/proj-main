const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const createDOM=require('./helpers/feature-dom.cjs');
const project=path.join(__dirname,'..');

function setup(realModel=false){
  const {document,Element}=createDOM();
  document.innerHTML=fs.readFileSync(path.join(project,'pages/smart-tools.html'),'utf8').match(/<body\b[^>]*>([\s\S]*?)<\/body>/)[1];
  let activate,change;
  const navigations=[];
  const storage=new Map();
  const window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener(){},confirm:()=>true,BaigePage:{onActivate(callback){activate=callback;},onDeactivate(){},navigate:(...args)=>navigations.push(args)}};
  const context=vm.createContext({window,document,console});
  function load(file){vm.runInContext(fs.readFileSync(path.join(project,file),'utf8'),context,{filename:file});}
  load('src/data.js');load('src/ui.js');load('src/home-directory-icons.js');
  const categories=[{id:'documents',label:'资料处理'},{id:'writing',label:'写作创作'},{id:'research',label:'研究辅助'},{id:'empty',label:'待补充'}];
  const groups={'文档处理':'documents','写作创作':'writing','研究辅助':'research'};
  const entries=window.BaigeData.tools.map(tool=>({...tool,id:`tool:${tool.name}`,route:'smart-tools',child:tool.name,toolCategory:groups[tool.group],iconImage:'',image:tool.name==='OCR识别'?'assets/document-layers.svg':''}));
  if(realModel){load('src/home-card-images.js');load('src/feature-config.js');}
  else window.BaigeFeatureConfig={read:()=>({categories:{tools:categories}}),catalog:()=>entries,get:id=>entries.find(entry=>entry.id===id),
    iconMarkup:entry=>`<span data-managed-icon="${entry.icon}"></span>`,subscribe(callback){change=callback;}};
  load('src/tool-workspace.js');load('src/pages/smart-tools.js');activate({child:''});
  const get=id=>document.querySelector(`#${id}`);
  return {get,document,Element,categories,entries,model:window.BaigeFeatureConfig,change:()=>change?.(),activate:child=>activate({child}),navigations};
}

test('real persisted feature settings immediately drive popular images and tool classification',()=>{
  const app=setup(true),image='data:image/jpeg;base64,/9j/AA==';
  app.model.renameCategory('tools','documents','资料解析');
  app.model.saveFeature('tool:OCR识别',{icon:'branch',iconImage:image,image,toolCategory:'writing'});
  const hot=app.get('content').querySelector('.featured-tool[data-tool="OCR识别"]');
  assert.equal(hot.querySelector('img').attributes.src,image);
  assert.equal(hot.dataset.toolGroup,'写作创作');
  assert.match(app.get('toolCategories').textContent,/资料解析/);
  const entry=app.get('toolResults').querySelector('.tool-entry[data-tool="OCR识别"]');
  assert.equal(entry.querySelector('.feature-custom-icon').attributes.src,image);
  app.activate('OCR识别');
  assert.ok(app.get('content').querySelector('.tool-icon').querySelector('.feature-custom-icon'));
});

test('tool categories include managed names and empty categories; deleted filter falls back to all',()=>{
  const app=setup();
  assert.match(app.get('toolCategories').textContent,/资料处理/);
  const empty=app.get('toolCategories').querySelector('[data-category="empty"]');assert.ok(empty);empty.emit('click');
  assert.match(app.get('resultCount').textContent,/显示 0 个工具/);
  app.categories.pop();app.change();
  assert.match(app.get('resultCount').textContent,/显示 11 个工具/);
  app.categories[0].label='资料 <script>';app.change();
  assert.match(app.get('toolCategories').textContent,/资料 <script>/);
  assert.equal(app.get('toolCategories').querySelector('script'),null);
});

test('popular image and configured icons refresh without dropping open tool state',()=>{
  const app=setup();
  const catalog=app.get('content').children[0];
  app.activate('OCR识别');
  const detail=app.get('content').children[0],draft=new app.Element('input');detail.append(draft);draft.value='用户草稿';draft.emit('input');
  const ocr=app.entries.find(entry=>entry.name==='OCR识别');ocr.icon='branch';ocr.image='data:image/png;base64,iVBORw0KGgo=';ocr.toolCategory='research';
  app.change();
  assert.equal(app.get('content').children[0],detail);
  assert.equal(draft.value,'用户草稿');
  assert.ok(detail.querySelector('[data-managed-icon="branch"]'));
  assert.ok(app.get('toolWorkspaceBar').querySelector('[data-workspace-tab="OCR识别"]').querySelector('[data-managed-icon="branch"]'));
  assert.ok(app.get('toolWorkspaceBar').querySelector('.unsaved-dot'));
  app.activate('');
  assert.equal(app.get('content').children[0],catalog);
  const hot=catalog.querySelector('.featured-tool[data-tool="OCR识别"]');
  assert.equal(hot.querySelector('img').attributes.src,ocr.image);
  assert.equal(hot.dataset.toolGroup,'研究辅助');
  assert.ok(catalog.querySelector('.tool-entry[data-tool="OCR识别"]').querySelector('[data-managed-icon="branch"]'));
});
