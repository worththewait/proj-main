const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function setup(values = {}, fail = false) {
  const storage = new Map(Object.entries(values));
  const window = {localStorage: {
    getItem: key => storage.get(key) ?? null,
    setItem(key, value) {if (fail) throw Error('quota'); storage.set(key, value);},
  }};
  const context = vm.createContext({window});
  for (const file of ['data.js', 'home-card-images.js', 'home-carousel-model.js', 'home-config.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  return {model: window.BaigeHomeConfig, storage};
}
test('catalog exposes 26 distinct real destinations, excluding settings and library administration', () => {
  const {model} = setup();
  assert.equal(model.catalog.length, 26);
  assert.equal(new Set(model.catalog.map(item => `${item.route}:${item.child}`)).size, 26);
  assert.ok(model.catalog.some(item => item.name === '智能问数'));
  assert.ok(model.catalog.some(item => item.name === '数据中台'));
  assert.ok(!model.catalog.some(item => ['文件管理','权限管理','自定义首页'].includes(item.name)));
});
test('recommendations allow zero through four choices and reject duplicates, unknowns and overflow', () => {
  const {model} = setup();
  for (let n = 0; n <= 4; n++) assert.equal(model.validateRecommendations(model.catalog.slice(0,n).map(x => x.id)).length, n);
  assert.equal(model.validateRecommendations(model.catalog.slice(0,5).map(x => x.id)), null);
  assert.equal(model.validateRecommendations(['missing']), null);
  assert.equal(model.validateRecommendations(['route:qa','route:qa']), null);
});
test('v1 choices and slides migrate without overwriting legacy storage', () => {
  const old = JSON.stringify({version:1, commonIds:['tool:OCR识别'], title:'原有标题', description:'提示'});
  const {model, storage} = setup({'baige.homepage.v1':old});
  assert.equal(JSON.stringify(model.read().recommendedIds), JSON.stringify(['tool:OCR识别']));
  assert.equal(model.read().slides.length, 3);
  assert.equal(storage.size, 1);
  assert.equal(storage.get('baige.homepage.v1'), old);
});
test('saving recommendations does not overwrite independently published updates or slides', () => {
  const {model} = setup();
  const updates = [{id:'news-1', title:'发布测试', date:'2026-10-26', body:'正文', status:'published'}];
  model.saveSection('updates', updates);
  model.saveSection('recommendedIds', ['tool:PPT生成']);
  assert.equal(model.read().updates[0].title, '发布测试');
  assert.equal(model.read().recommendedIds.length, 1);
  assert.equal(model.read().slides.length, 3);
  model.saveSection('recommendedIds', []);
  assert.equal(model.read().recommendedIds.length, 0);
});
test('published news requires title, valid calendar date and body; drafts allow an unfinished body', () => {
  const {model} = setup();
  const entry = {id:'test', title:'动态', date:'2026-10-26', body:'正文', status:'published'};
  assert.ok(model.validateUpdates([entry]));
  assert.equal(model.validateUpdates([{...entry, body:''}]), null);
  assert.ok(model.validateUpdates([{...entry, body:'', status:'draft'}]));
  assert.ok(model.validateUpdates([{...entry, body:'', status:'unpublished'}]));
  for (const date of ['2026-02-30','2026-13-01','not-a-date']) assert.equal(model.validateUpdates([{...entry,date}]),null);
  assert.equal(model.validateUpdates([entry,entry]),null);
  assert.equal(model.validateUpdates([{...entry,status:'external'}]),null);
});
test('only published entries are returned, descending by date with stable same-day order', () => {
  const {model} = setup();
  const entry = {title:'标题', body:'正文', status:'published'};
  model.saveSection('updates', [
    {...entry,id:'old',date:'2026-10-24'}, {...entry,id:'draft',date:'2026-10-27',status:'draft'},
    {...entry,id:'unpublished',date:'2026-10-27',status:'unpublished'},
    {...entry,id:'new',date:'2026-10-26'}, {...entry,id:'same',date:'2026-10-26'},
  ]);
  assert.equal(JSON.stringify(model.published().map(x=>x.id)),JSON.stringify(['new','same','old']));
});
test('storage error is surfaced and invalid writes leave saved configuration untouched', () => {
  const {model, storage} = setup({},true);
  assert.throws(()=>model.saveSection('recommendedIds',[]), /未能保存/);
  assert.equal(storage.size,0);
  const app = setup();
  assert.throws(()=>app.model.saveSection('recommendedIds',['bad']),/配置无效/);
  assert.equal(app.storage.size,0);
});
test('corrupt optional section cannot discard other valid sections and returned objects are detached', () => {
  const {model} = setup({'baige.home-config.v2':JSON.stringify({version:2,recommendedIds:[],slides:'broken',updates:[]})});
  const value = model.read();
  assert.equal(value.recommendedIds.length,0);
  assert.equal(value.updates.length,10);
  assert.equal(value.slides.length,3);
  value.slides[0].title='mutated';
  assert.notEqual(model.read().slides[0].title,'mutated');
});

test('news saves without an editable date and preserves a selected internal destination', () => {
  const {model} = setup();
  model.saveSection('updates', [{id:'linked',title:'工具更新',body:'查看新能力',status:'published',destination:{route:'smart-tools',child:'OCR识别'}}]);
  const saved=model.published()[0];
  assert.equal(JSON.stringify(saved.destination),JSON.stringify({route:'smart-tools',child:'OCR识别'}));
  assert.match(saved.date,/^\d{4}-\d{2}-\d{2}$/);
  model.saveSection('updates',[{...saved,destination:null}]);
  assert.equal(model.published()[0].destination,null);
});

test('news rejects external or unknown destinations without losing the previous record', () => {
  const {model} = setup();
  const entry={id:'safe',title:'动态',date:'2026-10-27',body:'正文',status:'published',destination:{route:'knowledge',child:''}};
  model.saveSection('updates',[entry]);
  for(const destination of ['https://example.com',{route:'https://example.com',child:''},{route:'smart-tools',child:'未知工具'},{route:'home-settings',child:''}]) {
    assert.throws(()=>model.saveSection('updates',[{...entry,destination}]),/配置无效/);
    assert.equal(model.read().updates[0].destination.route,'knowledge');
  }
});

test('existing demo records keep their internal actions while older authored records remain readable', () => {
  const {model} = setup({'baige.home-config.v2':JSON.stringify({version:2,updates:[
    {id:'tools',title:'工具更新',body:'演示正文',date:'2026-10-24',status:'published'},
    {id:'older',title:'已有动态',body:'保留用户内容',date:'2026-10-26',status:'published'},
  ]})});
  assert.equal(model.read().updates[0].destination.route,'smart-tools');
  assert.equal(model.read().updates[1].destination,null);
  assert.equal(model.read().updates[1].body,'保留用户内容');
});

test('old administrative destinations are removed without losing user-authored slides or updates', () => {
  const initial=setup().model.defaults();
  initial.slides[0]={...initial.slides[0],title:'保留的轮播',route:'library',child:'文件管理'};
  initial.updates=[{id:'existing',title:'保留的动态',body:'原正文',date:'2026-10-27',status:'published',destination:{route:'library',child:'权限管理'}}];
  const {model,storage}=setup({'baige.home-config.v2':JSON.stringify(initial)});
  const config=model.read();
  assert.equal(config.slides[0].title,'保留的轮播');
  assert.equal(config.slides[0].route,'library');
  assert.equal(config.slides[0].child,'文库首页');
  assert.equal(config.updates[0].title,'保留的动态');
  assert.equal(config.updates[0].destination,null);
  assert.equal(model.updateDestinations().some(item=>item.route==='library' && ['文件管理','权限管理'].includes(item.child)),false);
  assert.ok(storage.get('baige.home-config.v2').includes('权限管理'), 'read must not mutate original storage');
});

test('existing saved updates receive the new examples once without losing edits or restoring deleted examples', () => {
  const previous = {version:2, updates:[{id:'custom',title:'自定义',body:'原内容',date:'2026-10-27',status:'published'}]};
  const {model} = setup({'baige.home-config.v2':JSON.stringify(previous)});
  const first = model.read();
  assert.equal(first.updates.length, 11);
  assert.equal(first.updates[0].title, '自定义');
  model.saveSection('updates', first.updates.filter(item => item.id !== 'library-news'));
  assert.equal(model.read().updates.some(item => item.id === 'library-news'), false);
});
