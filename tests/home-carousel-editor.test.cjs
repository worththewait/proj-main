const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const script = path.join(root, 'src/pages/home-carousel-editor.js');
const imageA = 'data:image/jpeg;base64,/9j/AA==';
const imageB = 'data:image/jpeg;base64,/9j/AQ==';
const fixture = () => [
  {id: 'one', title: '知识与工具', description: '第一张说明', image: '', art: 'ship', route: 'qa', child: '对话'},
  {id: 'two', title: '专业知识', description: '第二张说明', image: '', art: 'knowledge', route: 'knowledge', child: ''},
  {id: 'three', title: '工具入口', description: '第三张说明', image: '', art: 'tools', route: 'smart-tools', child: ''},
];
const plain = value => JSON.parse(JSON.stringify(value));

function setup({processImage = async () => imageA} = {}) {
  assert.ok(fs.existsSync(script), '轮播编辑器尚未实现');
  const decode = value => value.replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>');
  const elements = new Map();
  class Element {
    constructor(id = '') { this.id = id; this.value = ''; this.dataset = {}; this.attributes = {}; this.listeners = {}; this.children = []; this.textContent = ''; this.disabled = false; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, props = {}) { const event = {target: this, currentTarget: this, preventDefault() {}, ...props}; for (const callback of this.listeners[name] || []) callback(event); }
    set innerHTML(value) {
      this.html = value;
      this.children = [...value.matchAll(/<(button|span|option)\b([^>]*)>/g)].map(([, tag, attrs]) => {
        const child = new Element(); child.tagName = tag;
        child.attributes = Object.fromEntries([...attrs.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, key, val]) => [key, decode(val)]));
        child.dataset = Object.fromEntries(Object.entries(child.attributes).filter(([key]) => key.startsWith('data-')).map(([key, val]) => [key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), val]));
        return child;
      });
    }
    get innerHTML() { return this.html || ''; }
    matches(selector) { return [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, key, val]) => Object.hasOwn(this.attributes, key) && (val === undefined || this.attributes[key] === val)); }
    querySelectorAll(selector) { return this.children.filter(child => child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : null; }
    setAttribute(key, value) { this.attributes[key] = String(value); }
    removeAttribute(key) { delete this.attributes[key]; }
    focus() { elements.forEach(el => {el.focused = false;}); this.focused = true; document.activeElement = this; }
  }
  const ids = ['carouselSlideCount', 'carouselSlideList', 'addCarouselSlide', 'carouselSlideTitle', 'carouselSlideDescription', 'carouselSlideDestination', 'carouselSlideUpload', 'clearCarouselSlideImage', 'moveCarouselSlideUp', 'moveCarouselSlideDown', 'deleteCarouselSlide', 'carouselSlidePreview', 'carouselSettingsFeedback', 'carouselSlideImageNote'];
  ids.forEach(id => elements.set(id, new Element(id)));
  const document = {activeElement: null, querySelector: selector => elements.get(selector.slice(1)) || null};
  const window = {BaigeHomeCarousel: {previewMarkup: item => `<div>${item.title} ${item.description}</div>`}};
  const context = vm.createContext({window, document, console});
  for (const file of ['src/data.js', 'src/ui.js', 'src/home-card-images.js', 'src/home-carousel-model.js']) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  window.BaigeHomeCardImages = {...window.BaigeHomeCardImages, process: processImage};
  vm.runInContext(fs.readFileSync(script, 'utf8'), context);
  const get = id => elements.get(id);
  const editor = window.BaigeHomeCarouselEditor;
  const select = id => get('carouselSlideList').emit('click', {target: get('carouselSlideList').querySelector(`[data-carousel-slide="${id}"]`)});
  const edit = (id, value, event = 'input') => {get(id).value = value; get(id).emit(event);};
  const upload = () => {get('carouselSlideUpload').files = [{type: 'image/png', size: 42}]; get('carouselSlideUpload').emit('change');};
  return {get, editor, select, edit, upload, document};
}

test('editing fields changes a copied draft and keeps the selected fields in place', () => {
  const app = setup(); const original = fixture(); app.editor.beginDraft(original);
  const field = app.get('carouselSlideTitle');
  app.edit('carouselSlideTitle', '我的研究入口');
  app.edit('carouselSlideDescription', '正在编辑的说明');
  app.edit('carouselSlideDestination', JSON.stringify(['smart-tools', 'PPT生成']), 'change');
  const result = plain(app.editor.validateDraft());
  assert.equal(result[0].title, '我的研究入口');
  assert.equal(result[0].description, '正在编辑的说明');
  assert.deepEqual([result[0].route, result[0].child], ['smart-tools', 'PPT生成']);
  assert.equal(original[0].title, '知识与工具');
  assert.equal(app.get('carouselSlideTitle'), field);
  assert.match(app.get('carouselSlidePreview').innerHTML, /我的研究入口/);
  assert.match(app.get('carouselSlideList').querySelector('[data-carousel-slide="one"]').attributes['aria-label'], /我的研究入口/);
});

test('keyboard activation restores focus to the replacement slide button in the same tab order', () => {
  const app = setup(); app.editor.beginDraft(fixture());
  const list = app.get('carouselSlideList');
  const oldButton = list.querySelector('[data-carousel-slide="two"]');
  oldButton.focus();
  // Native Enter on a button generates a click with detail=0; exercise that
  // event at the editor boundary rather than reimplement browser key handling.
  list.emit('click', {target: oldButton, detail: 0});
  const newButton = list.querySelector('[data-carousel-slide="two"]');
  assert.notEqual(newButton, oldButton);
  assert.equal(app.document.activeElement, newButton);
  assert.equal(newButton.attributes['aria-pressed'], 'true');
  assert.deepEqual(list.querySelectorAll('[data-carousel-slide]').map(button => button.dataset.carouselSlide), ['one', 'two', 'three']);
  assert.equal(app.get('carouselSlideTitle').value, '专业知识');
});

test('add, delete and reorder retain the selected slide and enforce one to eight slides', () => {
  const app = setup(); app.editor.beginDraft(fixture());
  app.select('three'); app.get('moveCarouselSlideUp').emit('click');
  assert.deepEqual(plain(app.editor.validateDraft()).map(item => item.id), ['one', 'three', 'two']);
  assert.equal(app.get('carouselSlideTitle').value, '工具入口');
  app.get('moveCarouselSlideDown').emit('click');
  assert.deepEqual(plain(app.editor.validateDraft()).map(item => item.id), ['one', 'two', 'three']);
  for (let i = 0; i < 7; i++) app.get('addCarouselSlide').emit('click');
  const eight = plain(app.editor.validateDraft());
  assert.equal(eight.length, 8); assert.equal(new Set(eight.map(item => item.id)).size, 8);
  assert.equal(app.get('addCarouselSlide').disabled, true);
  for (let i = 0; i < 10; i++) app.get('deleteCarouselSlide').emit('click');
  assert.equal(app.editor.validateDraft().length, 1);
  assert.equal(app.get('deleteCarouselSlide').disabled, true);
  assert.equal(app.get('moveCarouselSlideUp').disabled, true);
  assert.equal(app.get('moveCarouselSlideDown').disabled, true);
});

test('invalid title and a tampered external target prevent validation and focus the bad field', () => {
  const app = setup(); app.editor.beginDraft(fixture());
  app.edit('carouselSlideTitle', '   ');
  assert.equal(app.editor.validateDraft(), null);
  assert.equal(app.get('carouselSlideTitle').focused, true);
  assert.equal(app.get('carouselSlideTitle').attributes['aria-invalid'], 'true');
  app.edit('carouselSlideTitle', '有效标题');
  assert.equal(app.get('carouselSlideTitle').attributes['aria-invalid'], undefined);
  app.edit('carouselSlideDestination', 'https://example.com', 'change');
  assert.equal(app.editor.validateDraft(), null);
  assert.equal(app.get('carouselSlideDestination').focused, true);
  app.edit('carouselSlideDestination', JSON.stringify(['knowledge', '']), 'change');
  assert.equal(app.editor.validateDraft()[0].route, 'knowledge');
});

test('a later draft invalidates an unfinished upload without changing the new fields', async () => {
  let complete; const states = [];
  const app = setup({processImage: () => new Promise(resolve => {complete = resolve;})});
  app.editor.onBusyChange(value => states.push(value));
  app.editor.beginDraft(fixture()); app.upload();
  assert.equal(app.editor.isBusy(), true);
  assert.equal(app.editor.validateDraft(), null);
  app.editor.beginDraft(fixture()); app.edit('carouselSlideTitle', '新的草稿');
  complete(imageA); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.editor.isBusy(), false);
  assert.equal(app.editor.validateDraft()[0].image, '');
  assert.equal(app.editor.validateDraft()[0].title, '新的草稿');
  assert.ok(states.includes(true)); assert.equal(states.at(-1), false);
});

test('latest upload wins, failed replacement preserves it, and pending edits are not reset', async () => {
  const jobs = [];
  const app = setup({processImage: (file, options) => {assert.equal(options.aspectRatio, 8 / 3); return new Promise((resolve, reject) => jobs.push({resolve, reject}));}});
  app.editor.beginDraft(fixture()); app.upload(); app.upload();
  app.edit('carouselSlideDescription', '上传期间编辑');
  jobs[1].resolve(imageB); await new Promise(resolve => setImmediate(resolve));
  jobs[0].resolve(imageA); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.editor.validateDraft()[0].image, imageB);
  assert.equal(app.get('carouselSlideDescription').value, '上传期间编辑');
  app.upload(); jobs[2].reject(new Error('请更换图片'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.editor.validateDraft()[0].image, imageB);
  assert.match(app.get('carouselSettingsFeedback').textContent, /更换图片/);
});

test('clearing or deleting a slide cancels that upload even when the promise completes later', async () => {
  for (const button of ['clearCarouselSlideImage', 'deleteCarouselSlide']) {
    let complete; const app = setup({processImage: () => new Promise(resolve => {complete = resolve;})});
    app.editor.beginDraft(fixture()); app.upload(); app.get(button).emit('click');
    assert.equal(app.editor.isBusy(), false);
    complete(imageA); await new Promise(resolve => setImmediate(resolve));
    assert.ok(app.editor.validateDraft().every(slide => slide.image === ''));
    if (button === 'deleteCarouselSlide') assert.ok(app.editor.validateDraft().every(slide => slide.id !== 'one'));
  }
});
