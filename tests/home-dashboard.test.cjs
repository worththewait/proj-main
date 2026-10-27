const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const project = path.join(__dirname, '..');
const tinyImage = 'data:image/jpeg;base64,/9j/AA==';
const script = path.join(project, 'src/pages/home-dashboard.js');

function setup({stored = null, storageFails = false, granted = true, standalone = false, processImage, configStored} = {}) {
  assert.ok(fs.existsSync(script), '首页行为脚本尚未实现');
  const elements = new Map();
  class Element {
    constructor(id) { this.id = id; this.value = ''; this.textContent = ''; this.dataset = {}; this.listeners = {}; this.children = []; this.open = false; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, props = {}) { const event = {preventDefault() {this.defaultPrevented = true;}, target: this, ...props}; for (const callback of this.listeners[name] || []) callback(event); return event; }
    set innerHTML(html) {
      this.html = html;
      this.children = [...html.matchAll(/<(input|button|span|img)\b([^>]*)>/g)].map(match => {
        const child = new Element('');
        child.tagName = match[1].toUpperCase();
        child.attributes = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map(attr => [attr[1], attr[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&')]));
        for (const [, name] of match[2].matchAll(/\b(data-[\w-]+)(?=\s|$)/g)) child.attributes[name] ||= '';
        child.value = child.attributes.value || '';
        child.checked = /\bchecked\b/.test(match[2]);
        child.type = child.attributes.type || '';
        child.dataset = Object.fromEntries(Object.entries(child.attributes).filter(([name]) => name.startsWith('data-')).map(([name, value]) => [name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()), value]));
        child.matches = selector => (!selector.startsWith('input') || child.tagName === 'INPUT') && (!selector.includes(':checked') || child.checked) && [...selector.matchAll(/\[([\w-]+)(?:="([^"]*)")?\]/g)].every(([, name, value]) => Object.hasOwn(child.attributes, name) && (value === undefined || child.attributes[name] === value));
        return child;
      });
    }
    get innerHTML() { return this.html || ''; }
    querySelectorAll(selector) { return this.children.filter(child => child.matches(selector)); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches?.(selector) ? this : null; }
    focus() { this.focused = true; }
    showModal() { this.open = true; }
    close() { this.open = false; this.emit('close'); }
    setAttribute(name, value) { (this.attributes ||= {})[name] = String(value); }
    scrollIntoView() {}
  }
  const ids = ['quickQuestionForm', 'quickQuestion', 'quickQuestionSend', 'quickQuestionFeedback', 'commonFunctions', 'dashboardIntroTitle', 'dashboardIntroDescription', 'customizeHomepage', 'homepageSettings', 'homepageSettingsForm', 'homepageIntroTitle', 'homepageIntroDescription', 'homepageCommonOptions', 'homepageSettingsFeedback', 'resetHomepageSettings', 'cancelHomepageSettings', 'closeHomepageSettings', 'saveHomepageSettings', 'homepageCommonCount', 'homepageSettingsStatus', 'homepageCardSettings'];
  ids.push('commonFunctionTabs', 'customizeCarousel', 'homepageCarouselSettings', 'carouselSlideTitle');
  ids.forEach(id => elements.set(id, new Element(id)));
  elements.get('commonFunctionTabs').innerHTML = '<button data-home-tab="mine"></button><button data-home-tab="recommended"></button>';
  const document = new Element('document');
  document.querySelector = selector => elements.get(selector.slice(1)) || null;
  const navigations = [], accessCalls = [], listeners = [];
  let openHomeSettings, settingsClosedMessages = 0;
  const storage = new Map(stored === null ? [] : [['baige.homepage.v1', stored]]);
  const window = {
    localStorage: {
      getItem(key) { if (storageFails) throw Error('storage unavailable'); return storage.get(key) || null; },
      setItem(key, value) { if (storageFails) throw Error('storage unavailable'); storage.set(key, value); },
    },
    BaigePage: {navigate: (...args) => navigations.push(args), onHomeSettings: callback => { openHomeSettings = callback; }, homeSettingsClosed() {settingsClosedMessages++; return !standalone;}},
    BaigeHomeAccess: {
      canOpen: () => granted,
      status: () => granted ? 'granted' : 'locked',
      navigate: (...args) => accessCalls.push(args),
      onChange: callback => listeners.push(callback),
    },
  };
  window.parent = standalone ? window : {};
  window.addEventListener = () => {};
  if (configStored) storage.set("baige.home-config.v2", JSON.stringify(configStored));
  const context = vm.createContext({window, document, console});
  vm.runInContext(fs.readFileSync(path.join(project, 'src/data.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(project, 'src/ui.js'), 'utf8'), context);
  const imageScript = path.join(project, 'src/home-card-images.js');
  if (fs.existsSync(imageScript)) vm.runInContext(fs.readFileSync(imageScript, 'utf8'), context);
  if (processImage) window.BaigeHomeCardImages = {...window.BaigeHomeCardImages, process: processImage};
  vm.runInContext(fs.readFileSync(path.join(project, 'src/home-carousel-model.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(project, "src/home-config.js"), "utf8"), context);
  const carouselModel = window.BaigeHomeCarouselModel;
  let slideDraft = carouselModel.defaults(), displayedSlides = carouselModel.defaults(), carouselBusy = false, busyChanged;
  window.BaigeHomeCarousel = {setSlides(value) {displayedSlides = carouselModel.clone(value);}};
  window.BaigeHomeCarouselEditor = {
    beginDraft(value) {slideDraft = carouselModel.clone(value);},
    validateDraft() {return carouselBusy ? null : carouselModel.validate(slideDraft);},
    isBusy: () => carouselBusy,
    onBusyChange(callback) {busyChanged = callback;},
  };
  vm.runInContext(fs.readFileSync(script, 'utf8'), context);
  const get = id => elements.get(id);
  function choose(count) { get('homepageCommonOptions').querySelectorAll('input[data-home-common-option]').forEach((child, index) => child.checked = index < count); }
  function cardInput(id, kind = 'text') { return get('homepageCardSettings').querySelector(`[data-home-card-${kind}="${id}"]`); }
  function editCard(id, value) { const input = cardInput(id); input.value = value; get('homepageCardSettings').emit('input', {target: input}); }
  function upload(id, file) { const input = cardInput(id, 'upload'); input.files = [file]; get('homepageCardSettings').emit('change', {target: input}); }
  function resetCard(id) { get('homepageCardSettings').emit('click', {target: cardInput(id, 'reset')}); }
  return {get, window, document, storage, navigations, accessCalls, choose, cardInput, editCard, upload, resetCard, openSettings: () => openHomeSettings(), editSlides: fn => fn(slideDraft), slides: () => displayedSlides, slideDraft: () => slideDraft, closedMessages: () => settingsClosedMessages, setCarouselBusy(value) {carouselBusy = value; busyChanged?.();}};
}

test('nonempty quick question sends trimmed text in navigation payload only', () => {
  const app = setup();
  assert.equal(app.get('quickQuestionSend').disabled, true);
  app.get('quickQuestion').value = '  绿色船舶有哪些发展方向？  ';
  app.get('quickQuestion').emit('input');
  assert.equal(app.get('quickQuestionSend').disabled, false);
  app.get('quickQuestionForm').emit('submit');
  assert.equal(JSON.stringify(app.navigations), JSON.stringify([['qa', '对话', {question: '绿色船舶有哪些发展方向？'}]]));
  assert.equal(app.storage.size, 0);
});

test('knowledge quick question carries selected sources without storing them', () => {
  const app = setup();
  app.window.BaigeHomeKnowledge = {getQuestionOptions: () => ({knowledgeBaseIds: ['industry-ship', 'enterprise-policy']})};
  app.get('quickQuestion').value = '基于知识库梳理要求';
  app.get('quickQuestionForm').emit('submit');
  assert.equal(JSON.stringify(app.navigations[0][2]), JSON.stringify({question: '基于知识库梳理要求', knowledgeBaseIds: ['industry-ship', 'enterprise-policy']}));
  assert.equal(app.storage.size, 0);
});

test('IME and Shift+Enter preserve draft without sending', () => {
  const app = setup();
  app.get('quickQuestion').value = '船舶';
  app.get('quickQuestion').emit('keydown', {key: 'Enter', isComposing: true});
  app.get('quickQuestion').emit('keydown', {key: 'Enter', keyCode: 229});
  app.get('quickQuestion').emit('keydown', {key: 'Enter', shiftKey: true});
  assert.equal(app.navigations.length, 0);
});

test('denied quick question opens access flow while preserving text', () => {
  const app = setup({granted: false});
  app.get('quickQuestion').value = '船舶标准';
  app.get('quickQuestionForm').emit('submit');
  assert.equal(app.navigations.length, 0);
  assert.equal(app.accessCalls[0][0], 'qa');
  assert.equal(app.accessCalls[0][1], '对话');
  assert.equal(app.get('quickQuestion').value, '船舶标准');
});

test('XD homepage starts with four distinct real shortcuts including PPT', () => {
  const app = setup();
  const cards = app.get('commonFunctions').querySelectorAll('button[data-home-route]');
  assert.equal(cards.length, 4);
  assert.equal(new Set(cards.map(card => `${card.dataset.homeRoute}:${card.dataset.homeChild}`)).size, 4);
  assert.ok(cards.some(card => card.dataset.homeChild === 'PPT生成'));
});

test('legacy common lists fit four slots without rewriting storage or losing the first custom entry', () => {
  for (const ids of [
    ['tool:文档翻译', 'tool:OCR识别', 'tool:思维导图生成'],
    ['tool:文档翻译', 'tool:OCR识别', 'tool:思维导图生成', 'tool:PPT生成', 'route:qa', 'route:knowledge'],
  ]) {
    const stored = JSON.stringify({version: 1, title: '我的首页', description: '提示', commonIds: ids, cards: {'tool:文档翻译': {text: '我的翻译', image: tinyImage}}});
    const app = setup({stored});
    const cards = app.get('commonFunctions').querySelectorAll('button[data-home-route]');
    assert.equal(cards.length, 4);
    assert.equal(new Set(cards.map(card => `${card.dataset.homeRoute}:${card.dataset.homeChild}`)).size, 4);
    assert.deepEqual(cards.map(card => card.dataset.homeChild), ['文档翻译', 'OCR识别', '思维导图生成', 'PPT生成']);
    assert.match(app.get('commonFunctions').innerHTML, /我的翻译/);
    assert.match(app.get('commonFunctions').innerHTML, /data:image\/jpeg/);
    assert.equal(app.storage.get('baige.homepage.v1'), stored);
  }
});

test('standalone homepage preserves question and offers platform link without navigating', () => {
  const app = setup({standalone: true});
  const question = '请总结绿色船舶技术的发展方向';
  app.get('quickQuestion').value = question;
  app.get('quickQuestionForm').emit('submit');
  assert.equal(app.navigations.length, 0);
  assert.equal(app.accessCalls.length, 0);
  assert.equal(app.get('quickQuestion').value, question);
  assert.match(app.get('quickQuestionFeedback').innerHTML, /href="\.\.\/index\.html#home"/);
  assert.match(app.get('quickQuestionFeedback').innerHTML, /打开平台首页/);
  assert.equal(app.storage.size, 0);
});

test('saved recommendations support fewer than four, including zero, without changing my shortcuts', () => {
  for (const recommendedIds of [[], ['route:qa'], ['tool:PPT生成','route:intel']]) {
    const app = setup({configStored:{version:2,recommendedIds}});
    const tabs=app.get('commonFunctionTabs');
    tabs.emit('click',{target:tabs.querySelector('[data-home-tab="recommended"]')});
    assert.equal(app.get('commonFunctions').querySelectorAll('button[data-home-route]').length,recommendedIds.length);
    tabs.emit('click',{target:tabs.querySelector('[data-home-tab="mine"]')});
    assert.equal(app.get('commonFunctions').querySelectorAll('button[data-home-route]').length,4);
  }
});
test('returning to a mounted homepage refreshes recommendations and carousel from settings', () => {
  const app=setup();
  const tabs=app.get('commonFunctionTabs');
  tabs.emit('click',{target:tabs.querySelector('[data-home-tab="recommended"]')});
  app.window.BaigeHomeConfig.saveSection('recommendedIds',['route:intel']);
  const slides=app.window.BaigeHomeConfig.read().slides;slides[0].title='配置后的轮播';
  app.window.BaigeHomeConfig.saveSection('slides',slides);
  app.window.BaigeHomeDashboard.refresh();
  assert.equal(app.get('commonFunctions').querySelectorAll('button[data-home-route]').length,1);
  assert.match(app.get('commonFunctions').innerHTML,/百舸情报/);
  assert.equal(app.slides()[0].title,'配置后的轮播');
});
test('removed settings fields no longer change fixed question heading and prompt', () => {
  const app=setup({stored:JSON.stringify({version:1,title:'旧自定义标题',description:'旧提示',commonIds:['tool:PPT生成']})});
  assert.equal(app.get('dashboardIntroTitle').textContent,'专业问题找百舸');
  assert.equal(app.get('quickQuestion').placeholder,'输入您的问题，百舸为您解答');
});
