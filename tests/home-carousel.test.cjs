const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup({reducedMotion = false, locked = false} = {}) {
  class Element {
    constructor() { this.listeners = {}; this.attributes = {}; this.dataset = {}; this.children = []; this.hidden = false; this.inside = true; this._html = ''; }
    addEventListener(name, callback) { (this.listeners[name] ||= []).push(callback); }
    emit(name, props = {}) { const event = {target: this, preventDefault() {this.prevented = true;}, ...props}; for (const callback of this.listeners[name] || []) callback(event); return event; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name]; }
    set innerHTML(value) {
      this.htmlWrites = (this.htmlWrites || 0) + 1;
      this._html = value;
      this.children = [...value.matchAll(/<button\b[^>]*data-carousel-index="(\d+)"[^>]*>/g)].map(match => {
        const child = new Element(); child.dataset.carouselIndex = match[1]; return child;
      });
    }
    get innerHTML() { return this._html; }
    querySelectorAll() { return this.children; }
    closest(selector) { return selector.includes('data-carousel-index') && this.dataset.carouselIndex !== undefined ? this : null; }
    contains(node) { return Boolean(node?.inside); }
    classList = {toggle() {}};
  }
  const elements = Object.fromEntries(['homeCarousel', 'homeCarouselLink', 'homeCarouselPrevious', 'homeCarouselNext', 'homeCarouselDots', 'homeCarouselToggle', 'homeCarouselStatus', 'homeCarouselControls'].map(id => [id, new Element()]));
  const document = new Element(); document.hidden = false; document.modal = false;
  document.querySelector = selector => selector === 'dialog[open]' ? (document.modal ? {} : null) : elements[selector.slice(1)];
  const timers = new Map(); let timerId = 0, deactivate;
  const navigations = [];
  const media = {matches: reducedMotion, addEventListener() {}};
  const window = {matchMedia: () => media, BaigeHomeAccess: {status: () => locked ? 'locked' : 'granted', navigate: (...args) => navigations.push(args), onChange() {}}, BaigePage: {onDeactivate(callback) {deactivate = callback;}}};
  const context = vm.createContext({window, document, setInterval(fn) {timers.set(++timerId, fn); return timerId;}, clearInterval(id) {timers.delete(id);}});
  for (const file of ['src/data.js', 'src/ui.js', 'src/home-card-images.js', 'src/home-carousel-model.js', 'src/pages/home-carousel.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context);
  return {get: id => elements[id], document, api: window.BaigeHomeCarousel, model: window.BaigeHomeCarouselModel, timers, navigations, tick: () => [...timers.values()].forEach(fn => fn()), deactivate: () => deactivate()};
}

test('carousel moves automatically, wraps with arrows and jumps by dot without stacking timers', () => {
  const app = setup();
  assert.match(app.get('homeCarouselLink').innerHTML, /让知识与工具/);
  assert.equal(app.timers.size, 1);
  app.tick(); assert.match(app.get('homeCarouselLink').innerHTML, /有据可循/);
  app.get('homeCarouselPrevious').emit('click');
  app.get('homeCarouselPrevious').emit('click');
  assert.match(app.get('homeCarouselLink').innerHTML, /从资料到成果/);
  app.get('homeCarouselDots').emit('click', {target: app.get('homeCarouselDots').children[0]});
  assert.match(app.get('homeCarouselLink').innerHTML, /让知识与工具/);
  assert.equal(app.timers.size, 1);
});

test('hover, focus, manual pause, hidden documents and deactivated pages pause playback', () => {
  const app = setup(); const root = app.get('homeCarousel');
  root.emit('mouseenter'); assert.equal(app.timers.size, 0);
  root.emit('mouseleave'); assert.equal(app.timers.size, 1);
  root.emit('focusin'); assert.equal(app.timers.size, 0);
  root.emit('focusout', {relatedTarget: null}); assert.equal(app.timers.size, 1);
  app.get('homeCarouselToggle').emit('click'); assert.equal(app.timers.size, 0);
  app.get('homeCarouselToggle').emit('click'); assert.equal(app.timers.size, 1);
  app.document.hidden = true; app.document.emit('visibilitychange'); assert.equal(app.timers.size, 0);
  app.document.hidden = false; app.document.emit('visibilitychange'); assert.equal(app.timers.size, 1);
  app.deactivate(); assert.equal(app.timers.size, 0);
  app.api.activate(); assert.equal(app.timers.size, 1);
  app.document.modal = true; const before = app.get('homeCarouselLink').innerHTML;
  app.tick(); assert.equal(app.get('homeCarouselLink').innerHTML, before);
});

test('reduced motion starts paused and a single slide has no rotating controls', () => {
  const app = setup({reducedMotion: true});
  assert.equal(app.timers.size, 0);
  app.api.setSlides(app.model.defaults().slice(0, 1));
  assert.equal(app.get('homeCarouselControls').hidden, true);
  assert.equal(app.timers.size, 0);
});

test('hover and focus do not replace pause artwork underneath an in-progress pointer click', () => {
  const app = setup(); const root = app.get('homeCarousel'); const toggle = app.get('homeCarouselToggle');
  const initialWrites = toggle.htmlWrites;
  root.emit('mouseenter'); root.emit('focusin');
  assert.equal(toggle.htmlWrites, initialWrites);
  toggle.emit('click');
  assert.equal(toggle.getAttribute('aria-label'), '播放轮播');
});

test('carousel uses configured internal routes through the existing permission flow', () => {
  const app = setup({locked: true});
  const slides = app.model.defaults(); slides[0].route = 'frontier'; slides[0].child = '智研通';
  app.api.setSlides(slides); app.get('homeCarouselLink').emit('click');
  assert.deepEqual(app.navigations[0].slice(0, 2), ['frontier', '智研通']);
  assert.match(app.get('homeCarouselLink').getAttribute('aria-label'), /申请/);
  const key = app.get('homeCarousel').emit('keydown', {key: 'ArrowRight'});
  assert.equal(key.prevented, true);
  assert.match(app.get('homeCarouselLink').innerHTML, /有据可循/);
});
