const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const createDOM=require('./helpers/feature-dom.cjs');
const project=path.join(__dirname,'..');

function setup(realModel=false, integrations={}){
  const {document,Element}=createDOM();
  document.innerHTML=fs.readFileSync(path.join(project,'pages/smart-tools.html'),'utf8').match(/<body\b[^>]*>([\s\S]*?)<\/body>/)[1];
  let activate,deactivate,change;
  const navigations=[];
  const storage=new Map();
  const window={localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},addEventListener(){},confirm:()=>true,BaigePage:{onActivate(callback){activate=callback;},onDeactivate(callback){deactivate=callback;},navigate:(...args)=>navigations.push(args)},...integrations};
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
  return {get,document,Element,categories,entries,ui:window.BaigeUI,model:window.BaigeFeatureConfig,change:()=>change?.(),activate:child=>activate({child}),deactivate:()=>deactivate(),navigations};
}

function assertOutlineIcon(node){
  const svg=node.querySelector('svg');
  assert.ok(svg, 'expected an SVG icon');
  assert.equal(svg.attributes.fill,'none');
  assert.equal(svg.attributes.stroke,'currentColor');
  assert.equal(svg.attributes['stroke-width'],'1.5');
  assert.equal(node.querySelector('img'),null);
  return svg;
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
  const tab=app.get('toolWorkspaceBar').querySelector('[data-workspace-tab="OCR识别"]');
  const option=app.get('toolWorkspaceBar').querySelector('[data-open-tool="OCR识别"]');
  const expected=new app.Element();expected.innerHTML=app.ui.icon('branch');
  assert.equal(assertOutlineIcon(tab).innerHTML,expected.querySelector('svg').innerHTML);
  assert.equal(assertOutlineIcon(option).innerHTML,expected.querySelector('svg').innerHTML);
});

test('tool categories include managed names and empty categories; deleted filter falls back to all',()=>{
  const app=setup();
  assert.match(app.get('toolCategories').textContent,/资料处理/);
  const empty=app.get('toolCategories').querySelector('[data-category="empty"]');assert.ok(empty);empty.emit('click');
  assert.match(app.get('resultCount').textContent,/显示 0 个工具/);
  app.categories.pop();app.change();
  assert.match(app.get('resultCount').textContent,/显示 10 个工具/);
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
  const tab=app.get('toolWorkspaceBar').querySelector('[data-workspace-tab="OCR识别"]');
  const expected=new app.Element();expected.innerHTML=app.ui.icon('branch');
  assert.equal(assertOutlineIcon(tab).innerHTML,expected.querySelector('svg').innerHTML);
  assert.ok(app.get('toolWorkspaceBar').querySelector('.unsaved-dot'));
  app.activate('');
  assert.equal(app.get('content').children[0],catalog);
  const hot=catalog.querySelector('.featured-tool[data-tool="OCR识别"]');
  assert.equal(hot.querySelector('img').attributes.src,ocr.image);
  assert.equal(hot.dataset.toolGroup,'研究辅助');
  assert.ok(catalog.querySelector('.tool-entry[data-tool="OCR识别"]').querySelector('[data-managed-icon="branch"]'));
});

test('all ten tool tabs and opened-tool options use matching outline icons',()=>{
  const app=setup(true);
  assert.equal(app.entries.length,10);
  for(const entry of app.entries) app.activate(entry.name);
  for(const entry of app.entries){
    const tab=app.get('toolWorkspaceBar').querySelector(`[data-workspace-tab="${entry.name}"]`);
    const option=app.get('toolWorkspaceBar').querySelector(`[data-open-tool="${entry.name}"]`);
    assert.ok(tab,`missing tab for ${entry.name}`);
    assert.ok(option,`missing option for ${entry.name}`);
    const expected=new app.Element();expected.innerHTML=app.ui.icon(app.model.get(entry.id).icon);
    assert.equal(assertOutlineIcon(tab).innerHTML,expected.querySelector('svg').innerHTML,entry.name);
    assert.equal(assertOutlineIcon(option).innerHTML,expected.querySelector('svg').innerHTML,entry.name);
  }
});

test('generic tools share a workspace frame with header and content panels',()=>{
  const app=setup(true);
  const dedicated=['纠错校对','思维导图生成','流程图生成'];
  for(const entry of app.entries.filter(item=>!dedicated.includes(item.name))){
    app.activate(entry.name);
    const panel=app.get('content').querySelector('.tool-workspace-panel');
    const frame=panel.querySelector('.tool-workspace-frame');
    assert.ok(panel.classList.contains('tool-detail-workspace'),entry.name);
    assert.ok(frame,`missing workspace frame for ${entry.name}`);
    assert.ok(frame.querySelector('header.tool-page-header'),entry.name);
    assert.ok(frame.querySelector('section.integration-panel'),entry.name);
  }
});

test('the separate flowchart workspace mounts once and keeps its state across tool switches',()=>{
  const calls=[];
  let markDirty;
  const app=setup(true,{BaigeFlowchartTool:{
    render(panel,onDirty){panel.innerHTML='<div data-flowchart-workspace></div>';markDirty=onDirty;calls.push('render');},
    resume(){calls.push('resume');},
    deactivate(){calls.push('deactivate');},
  }});
  const entry=app.get('toolResults').querySelector('[data-tool="流程图生成"]');
  assert.equal(entry.dataset.toolGroup,'研究辅助');
  entry.emit('click');
  assert.deepEqual(app.navigations.at(-1),['smart-tools','流程图生成']);
  calls.length=0;
  app.activate('流程图生成');
  const workspace=app.get('content').querySelector('[data-flowchart-workspace]');
  assert.ok(workspace);
  markDirty(true);
  assert.ok(app.get('toolWorkspaceBar').querySelector('.unsaved-dot'));
  app.activate('思维导图生成');
  app.activate('流程图生成');
  assert.equal(app.get('content').querySelector('[data-flowchart-workspace]'),workspace);
  app.deactivate();
  assert.deepEqual(calls,['render','resume','deactivate','resume','deactivate']);
});
