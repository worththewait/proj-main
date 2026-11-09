const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
function setup(){
 let active;
 class Element{
  constructor(){this.value='';this.innerHTML='';this.textContent='';this.hidden=false;this.dataset={};this.attributes={};this.listeners={};this.open=false;this.offsetWidth=0;this.isConnected=true;this.classList={add(){},remove(){}};}
  addEventListener(t,fn){(this.listeners[t]||=[]).push(fn);}
  emit(t,target=this,extra={}){for(const fn of this.listeners[t]||[])fn({target,preventDefault(){},...extra});}
  setAttribute(k,v){this.attributes[k]=String(v);}removeAttribute(k){delete this.attributes[k];}
  querySelector(){return new Element();}querySelectorAll(){return [];}
  focus(){active=this;}showModal(){this.open=true;}close(){this.open=false;}
  closest(sel){const m=sel.match(/^\[data-([\w-]+)\]$/);if(!m)return null;const k=m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase());return this.dataset[k]!==undefined?this:null;}
 }
 const els=new Map(),get=id=>{if(!els.has(id))els.set(id,new Element());return els.get(id);};
 const document={querySelector:s=>get(s.slice(1)),addEventListener(){},get activeElement(){return active;}};
 const window={BaigePage:{onActivate(){}},addEventListener(){}};
 const c=vm.createContext({window,document,setTimeout:()=>1,clearTimeout(){},location:{hash:''},history:{replaceState(){}},console});
 for(const f of ['src/data.js','src/ui.js','src/secret-file-list.js','src/pages/knowledge.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),c);
 const action=(container,key,value)=>{const el=new Element();el.dataset[key]=value;get(container).emit('click',el);};
 const search=q=>{get('kbSearchInput').value=q;get('kbSearchForm').emit('submit');};
 return {get,window,action,search,tab:key=>action('kbTabs','kbTab',key)};
}
test('current scope search matches organization names while keeping stable scope counts',()=>{
 const a=setup();a.tab('department');a.search('HR');
 assert.match(a.get('kbSections').innerHTML,/ces/);assert.match(a.get('kbSections').innerHTML,/测试0930/);
 assert.doesNotMatch(a.get('kbSections').innerHTML,/新闻部test/);
 assert.match(a.get('kbTabs').innerHTML,/部门知识库<span class="kb-tab-count">8/);
 assert.match(a.get('kbTabs').innerHTML,/aria-selected="true"[^>]*data-kb-tab="department"/);
});
test('all scope search is explicit and personal type filters cannot remove public bases',()=>{
 const a=setup();a.tab('personal');a.get('kbTypeFilter').value='图片';a.get('kbTypeFilter').emit('change');
 a.get('kbSearchScope').value='all';a.get('kbSearchScope').emit('change');a.search('714');
 assert.match(a.get('kbSections').innerHTML,/714企业知识库/);
 assert.match(a.get('kbWorkbar').innerHTML,/全部分类/);
});
test('file type control is personal-only and bases retain consistent clickable destinations',()=>{
 const a=setup();assert.equal(a.get('kbTypeFilterField').hidden,true);
 assert.equal((a.get('kbSections').innerHTML.match(/data-kb-open=/g)||[]).length,4);
 a.tab('personal');assert.equal(a.get('kbTypeFilterField').hidden,false);
 assert.match(a.get('kbSections').innerHTML,/上传时间/);assert.match(a.get('kbSections').innerHTML,/涉密可疑/);
});
test('personal documents open secrecy details while preview stays blocked until approved',()=>{
 const a=setup();a.tab('personal');
 a.action('kbSections','kbPreview','personal-sensitive');
 assert.equal(a.get('kbDocumentDialog').open,false);
 a.action('kbSections','kbAudit','personal-sensitive');
 assert.equal(a.get('kbDocumentDialog').open,true);
 assert.equal(a.get('kbDocumentStatus').textContent,'涉密可疑');
 a.action('kbSections','kbPreview','personal-writing');
 assert.equal(a.get('kbDocumentTitle').textContent,'查看文件');
});
test('unconnected question entry truthfully describes the pending independent page',()=>{
 const a=setup();a.action('kbSections','kbOpen','industry-doc');
 assert.match(a.get('kbToast').textContent,/待接入/);assert.doesNotMatch(a.get('kbToast').textContent,/已打开/);
});
test('shared directory exposes every public list ID while preserving legacy question source IDs',()=>{
 const a=setup(),d=a.window.BaigeData.knowledgeDirectory;
 const bases=[...d.industryBases,...d.enterpriseGroups.flatMap(g=>g.bases),...d.departmentGroups.flatMap(g=>g.bases)];
 assert.equal(bases.length,17);assert.equal(new Set(bases.map(b=>b.id)).size,17);
 assert.equal(a.window.BaigeData.knowledgeBases.length,8);
 assert.ok(a.window.BaigeData.knowledgeBases.some(b=>b.id==='industry-ship'));
});
test('editing a personal document escapes its name and cancelled edits preserve the previous value',()=>{
 const a=setup();a.tab('personal');a.action('kbSections','kbEdit','personal-writing');
 assert.equal(a.get('kbEditDialog').open,true);
 a.get('kbEditName').value='临时修改';a.get('kbEditCancel').emit('click');
 assert.match(a.get('kbSections').innerHTML,/专业写作专用/);
 a.action('kbSections','kbEdit','personal-writing');a.get('kbEditName').value='<script>资料</script>';a.get('kbEditForm').emit('submit');
 assert.match(a.get('kbSections').innerHTML,/&lt;script&gt;资料&lt;\/script&gt;/);
 assert.doesNotMatch(a.get('kbSections').innerHTML,/<script>/);
});
test('type filtering stays scoped to personal documents and clearing restores the current category',()=>{
 const a=setup();a.tab('personal');a.get('kbTypeFilter').value='图片';a.get('kbTypeFilter').emit('change');
 assert.equal(a.get('kbEmpty').hidden,false);
 assert.match(a.get('kbWorkbar').innerHTML,/显示 0 个文档/);
 a.tab('industry');assert.equal(a.get('kbEmpty').hidden,true);assert.equal(a.get('kbTypeFilterField').hidden,true);
 a.search('不存在');assert.equal(a.get('kbEmpty').hidden,false);
 a.action('kbWorkbar','kbClearSearch','');assert.equal(a.get('kbEmpty').hidden,true);
 assert.equal((a.get('kbSections').innerHTML.match(/data-kb-open=/g)||[]).length,4);
});
