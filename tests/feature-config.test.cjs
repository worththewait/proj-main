const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const key = 'baige.feature-config.v1';
const raster = 'data:image/png;base64,iVBORw0KGgo=';
function setup(values = {}, {readFails = false, writeFails = false} = {}) {
  const storage = new Map(Object.entries(values));
  const handlers = new Map();
  const window = {
    localStorage: {
      getItem(name) {if (readFails) throw Error('blocked'); return storage.get(name) ?? null;},
      setItem(name, value) {if (writeFails) throw Error('quota'); storage.set(name, value);},
    },
    addEventListener(name, handler) {handlers.set(name, handler);},
  };
  const context = vm.createContext({window});
  for (const file of ['data.js', 'home-directory-icons.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8'), context);
  const modelFile = path.join(__dirname, '../src/feature-config.js');
  assert.ok(fs.existsSync(modelFile), '共享功能管理模型尚未实现');
  vm.runInContext(fs.readFileSync(modelFile, 'utf8'), context);
  return {model: window.BaigeFeatureConfig, storage, emit: (name, event) => handlers.get(name)?.(event)};
}

test('defaults keep all distinct destinations, both taxonomy scopes, and only existing popular illustrations', () => {
  const {model} = setup();
  const entries = model.catalog();
  assert.equal(entries.length, 27);
  assert.equal(new Set(entries.map(item => `${item.route}:${item.child}`)).size, 27);
  assert.equal(entries.filter(item => item.homeCategory === 'knowledge-research').length, 7);
  assert.equal(entries.filter(item => item.isTool).length, 11);
  assert.equal(entries.filter(item => item.usesImage).length, 3);
  assert.equal(entries.filter(item => item.image).length, 3);
  assert.equal(model.get('tool:提示词生成').icon, 'bulb');
  assert.equal(model.get('tool:OCR识别').image, 'assets/document-layers.svg');
  assert.equal(model.get('route:digital:标准编制').toolCategory, '');
  assert.equal(model.idFor('qa', '对话'), 'route:qa');
  assert.equal(model.idFor('library', '文库首页'), 'route:library');
  assert.equal(model.idFor('smart-tools', '不存在'), null);
  assert.equal(model.get('missing'), null);
});

test('saving one feature merges current configuration and same-name destinations remain independent', () => {
  const {model} = setup();
  model.saveFeature('tool:标准编制', {icon: 'book', iconImage: raster, image: raster, homeCategory: 'knowledge-research'});
  model.saveFeature('route:digital:标准编制', {icon: 'chart'});
  assert.equal(model.get('tool:标准编制').icon, 'book');
  assert.equal(model.get('tool:标准编制').iconImage, raster);
  assert.equal(model.get('tool:标准编制').image, raster);
  assert.equal(model.get('tool:标准编制').homeCategoryLabel, '知识与研究');
  assert.equal(model.get('route:digital:标准编制').icon, 'chart');
  assert.equal(model.get('route:digital:标准编制').iconImage, '');
  assert.equal(model.get('tool:标准编制').route, 'smart-tools');
  assert.equal(model.get('route:digital:标准编制').route, 'digital');
});

test('category rename changes display labels without changing membership IDs or routes', () => {
  const {model} = setup();
  model.renameCategory('home', 'knowledge-research', '专业研究');
  model.renameCategory('tools', 'documents', '资料处理');
  assert.equal(model.get('route:qa').homeCategoryLabel, '专业研究');
  assert.equal(model.get('tool:OCR识别').toolCategoryLabel, '资料处理');
  assert.equal(model.get('tool:OCR识别').toolCategory, 'documents');
  assert.equal(model.get('tool:OCR识别').child, 'OCR识别');
});

test('new categories can be assigned and occupied deletion migrates every member atomically', () => {
  const {model, storage} = setup();
  const created = model.addCategory('tools', '专题处理').categories.tools.find(item => item.label === '专题处理');
  model.saveFeature('tool:OCR识别', {toolCategory: created.id});
  const before = storage.get(key);
  assert.throws(() => model.deleteCategory('tools', created.id), /迁|选择|目标/);
  assert.equal(storage.get(key), before);
  model.deleteCategory('tools', 'documents', created.id);
  assert.equal(model.catalog().filter(item => item.toolCategory === created.id).length, 4);
  assert.ok(!model.read().categories.tools.some(item => item.id === 'documents'));
  assert.equal(model.catalog().length, 27);
  assert.equal(model.get('tool:OCR识别').route, 'smart-tools');
});

test('home-category migration never changes tool-category membership', () => {
  const {model} = setup();
  model.deleteCategory('home', 'tools-platforms', 'knowledge-research');
  assert.equal(model.read().categories.home.length, 1);
  assert.equal(model.catalog().filter(item => item.homeCategory === 'knowledge-research').length, 27);
  assert.equal(model.get('tool:文档翻译').toolCategory, 'documents');
  assert.throws(() => model.deleteCategory('home', 'knowledge-research'), /至少|最后/);
});

test('invalid labels, duplicate names and cross-scope IDs cannot mutate saved data', () => {
  const {model, storage} = setup();
  model.addCategory('home', '新分类');
  const before = storage.get(key);
  for (const label of ['', '  ', 'x'.repeat(21), '含\n换行']) assert.throws(() => model.addCategory('home', label));
  assert.throws(() => model.addCategory('home', ' 新分类 '), /同名|存在|重复/);
  assert.throws(() => model.renameCategory('tools', 'documents', '研究辅助'), /同名|存在|重复/);
  assert.throws(() => model.renameCategory('home', 'documents', '未知'));
  assert.throws(() => model.saveFeature('route:qa', {homeCategory: 'documents'}));
  assert.throws(() => model.saveFeature('route:qa', {toolCategory: 'research'}));
  assert.throws(() => model.deleteCategory('tools', 'documents', 'knowledge-research'));
  assert.throws(() => model.addCategory('__proto__', '非法'));
  assert.equal(storage.get(key), before);
});

test('only whitelisted icons, local raster images and approved default assets can be saved', () => {
  const {model, storage} = setup();
  model.saveFeature('route:qa', {icon: 'bulb', image: raster});
  const before = storage.get(key);
  for (const patch of [
    {icon: '<svg onload=alert(1)>'}, {iconImage: 'https://example.com/x.png'},
    {iconImage: 'data:image/svg+xml;base64,PHN2Zz4='}, {image: 'javascript:alert(1)'},
    {image: '../secret.png'}, {image: 'data:image/png;base64,PHN2Zz4='},
    {name: '伪造名称'}, {route: 'external'}, {iconImage: raster + 'A'.repeat(260000)},
  ]) assert.throws(() => model.saveFeature('route:qa', patch));
  assert.equal(storage.get(key), before);
  assert.throws(() => model.saveFeature('missing', {icon: 'book'}));
  assert.match(model.iconMarkup(model.get('route:qa')), /<svg/);
  model.saveFeature('route:qa', {iconImage: raster});
  assert.match(model.iconMarkup(model.get('route:qa')), /class="feature-custom-icon"/);
  assert.match(model.iconMarkup(model.get('route:qa')), /src="data:image\/png;base64,/);
  assert.doesNotMatch(model.iconMarkup({icon: 'file', iconImage: 'x" onerror="alert(1)'}), /onerror/);
});

test('malformed saved configuration falls back safely and reads return detached values', () => {
  for (const stored of ['{bad', JSON.stringify({version: 99}), JSON.stringify({version:1,categories:{home:[],tools:[]},features:{}})]) {
    const {model, storage} = setup({[key]: stored});
    assert.equal(model.catalog().length, 27);
    assert.equal(model.read().categories.home.length, 2);
    assert.equal(storage.get(key), stored, 'reading must not rewrite corrupt user data');
    const copy = model.read();
    copy.categories.home[0].label = 'mutated';
    copy.features['route:qa'].icon = 'bug';
    assert.equal(model.get('route:qa').icon, 'chat');
    assert.equal(model.read().categories.home[0].label, '知识与研究');
  }
});

test('write and read storage failures report failure rather than pretending changes were saved', () => {
  for (const options of [{writeFails: true}, {readFails: true}]) {
    const {model, storage} = setup({}, options);
    assert.equal(model.catalog().length, 27);
    assert.throws(() => model.saveFeature('route:qa', {icon: 'book'}), /未能|存储|保存/);
    assert.equal(storage.size, 0);
  }
});

test('saved changes persist across model reloads and subscriptions ignore unrelated storage events', () => {
  const app = setup();
  let calls = 0;
  const unsubscribe = app.model.subscribe(() => {calls++;});
  app.model.saveFeature('tool:OCR识别', {icon: 'pen'});
  assert.equal(calls, 1);
  app.emit('storage', {key: 'unrelated'});
  assert.equal(calls, 1);
  app.emit('storage', {key});
  assert.equal(calls, 2);
  unsubscribe();
  app.model.saveFeature('tool:OCR识别', {icon: 'book'});
  assert.equal(calls, 2);
  assert.equal(setup(Object.fromEntries(app.storage)).model.get('tool:OCR识别').icon, 'book');
});
