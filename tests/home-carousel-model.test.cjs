const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const project = path.join(__dirname, '..');
const plain = value => JSON.parse(JSON.stringify(value));
function setup() {
  const window = {};
  const context = vm.createContext({window});
  for (const file of ['src/data.js', 'src/home-card-images.js', 'src/home-carousel-model.js']) {
    vm.runInContext(fs.readFileSync(path.join(project, file), 'utf8'), context, {filename: file});
  }
  return {model: window.BaigeHomeCarouselModel, data: window.BaigeData, policy: window.BaigePermissions};
}

test('default slides are three valid independent copies with known platform targets', () => {
  const {model} = setup();
  const original = plain(model.defaults());
  assert.equal(original.length, 3);
  assert.deepEqual(original.map(item => item.id), ['slide-workbench', 'slide-knowledge', 'slide-tools']);
  assert.deepEqual(original.map(item => [item.route, item.child]), [['qa', '对话'], ['knowledge', ''], ['smart-tools', '']]);
  assert.ok(model.validate(model.defaults()));
  const changed = model.defaults(); changed[0].title = '改动'; changed.reverse();
  assert.deepEqual(plain(model.defaults()), original);
  const copied = model.clone(model.defaults()); copied[0].description = '改动';
  assert.deepEqual(plain(model.defaults()), original);
});

test('destinations expose each real parent and child exactly once without filtering locked targets', () => {
  const {model, data, policy} = setup();
  const destinations = plain(model.destinations());
  const expected = data.navigation.filter(item => !['home','home-settings'].includes(item.id)).flatMap(item => [
    [item.id, ''], ...(item.id === 'smart-tools' ? data.tools.map(tool => [item.id, tool.name]) : (item.children || []).map(child => [item.id, child])),
  ]);
  assert.equal(destinations.length, expected.length);
  assert.equal(new Set(destinations.map(item => item.key)).size, expected.length);
  for (const [route, child] of expected) {
    const destination = destinations.find(item => item.route === route && item.child === child);
    assert.ok(destination, `${route}:${child}`);
    assert.equal(destination.key, JSON.stringify([route, child]));
    assert.ok(destination.label.length);
  }
  assert.equal(policy.canOpen('smart-tools', '标准编制'), false);
  const locked = {...model.defaults()[0], route: 'smart-tools', child: '标准编制'};
  assert.ok(model.validate([locked]), 'configuration must leave access checks to the navigation layer');
  destinations[0].label = '改动';
  assert.notEqual(model.destinations()[0].label, '改动');
});

test('validation trims copy while retaining configured order and never mutates input', () => {
  const {model} = setup();
  const values = plain(model.defaults()).reverse();
  values[0].title = '  自定义标题  ';
  values[0].description = '  自定义说明  ';
  const snapshot = JSON.stringify(values);
  const result = model.validate(values);
  assert.equal(result[0].title, '自定义标题');
  assert.equal(result[0].description, '自定义说明');
  assert.deepEqual(plain(result).map(item => item.id), values.map(item => item.id));
  assert.equal(JSON.stringify(values), snapshot);
  result[0].title = '进一步改动';
  assert.equal(JSON.stringify(values), snapshot);
  assert.ok(model.validate([{...values[0], description: ''}]));
});

test('missing, duplicate, malformed and oversized slide records are rejected', () => {
  const {model} = setup();
  const slide = plain(model.defaults()[0]);
  for (const value of [undefined, null, {}, '', [], [null], [false], [slide, {...slide}],
    Array.from({length: 9}, (_, i) => ({...slide, id: `slide-${i}`})),
  ]) assert.equal(model.validate(value), null);
  for (const field of ['id', 'title', 'description', 'image', 'art', 'route', 'child']) {
    const copy = {...slide}; delete copy[field];
    assert.equal(model.validate([copy]), null, `missing ${field}`);
  }
  for (const patch of [
    {id: ''}, {id: 'unsafe id'}, {id: '<img>'}, {id: 'a'.repeat(65)}, {title: '  '}, {title: '字'.repeat(33)},
    {description: '字'.repeat(81)}, {art: 'unknown'}, {image: false}, {route: 1}, {child: null},
  ]) assert.equal(model.validate([{...slide, ...patch}]), null, JSON.stringify(patch));
  const max = Array.from({length: 8}, (_, i) => ({...slide, id: `slide-${i}`, title: '字'.repeat(32), description: '字'.repeat(80)}));
  assert.equal(model.validate(max).length, 8);
  assert.deepEqual(plain(model.limits), {maxSlides: 8, maxTitle: 32, maxDescription: 80});
});

test('unknown routes, unrelated children and external destinations cannot validate', () => {
  const {model} = setup();
  const slide = plain(model.defaults()[0]);
  for (const patch of [
    {route: 'https://example.com', child: ''}, {route: 'javascript:alert(1)', child: ''}, {route: '../index.html', child: ''},
    {route: 'home', child: ''}, {route: 'unknown', child: ''}, {route: 'knowledge', child: '对话'},
    {route: 'qa', child: 'https://example.com'}, {route: 'smart-tools', child: '未知工具'},
  ]) assert.equal(model.validate([{...slide, ...patch}]), null, JSON.stringify(patch));
});

test('only validated local raster data can be stored as a custom image', () => {
  const {model} = setup();
  const slide = plain(model.defaults()[0]);
  assert.ok(model.validate([{...slide, image: 'data:image/jpeg;base64,/9j/AA=='}]));
  for (const image of [
    'https://example.com/banner.jpg', '../assets/baige-logo.svg', 'javascript:alert(1)',
    'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/jpeg;base64,<bad>',
    'data:image/jpeg;base64,/9j/' + 'A'.repeat(260000),
  ]) assert.equal(model.validate([{...slide, image}]), null);
});
