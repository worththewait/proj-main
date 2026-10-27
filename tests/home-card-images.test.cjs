const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const imageScript = path.join(__dirname, '../src/home-card-images.js');

function setup({readFails = false, decodeFails = false, outputLength = 100, alwaysTooLarge = false, source = 'data:image/png;base64,iVBORw0KGgo='} = {}) {
  assert.ok(fs.existsSync(imageScript), '本地图片处理尚未实现');
  let readCount = 0, encodeCount = 0;
  const window = {};
  class FileReader {
    readAsDataURL() { readCount++; if (readFails) this.onerror(); else { this.result = source; this.onload(); } }
  }
  class Image {
    constructor() { this.naturalWidth = 2000; this.naturalHeight = 1500; }
    set src(value) { if (decodeFails) this.onerror(); else this.onload(); }
  }
  const canvas = {width: 0, height: 0, getContext: () => ({fillRect() {}, drawImage() {}}), toDataURL() { encodeCount++; return 'data:image/jpeg;base64,/9j/' + 'A'.repeat(alwaysTooLarge || encodeCount === 1 ? 300000 : outputLength); }};
  const context = vm.createContext({window, FileReader, Image, document: {createElement: () => canvas}});
  vm.runInContext(fs.readFileSync(imageScript, 'utf8'), context);
  return {images: window.BaigeHomeCardImages, canvas, readCount: () => readCount, encodeCount: () => encodeCount};
}

test('raster-only saved URLs reject script, SVG, malformed and oversized data', () => {
  const {images} = setup();
  assert.equal(images.isSafeImage('data:image/jpeg;base64,/9j/AA=='), true);
  for (const value of ['https://example.com/a.png', 'javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,<bad>', 'data:image/jpeg;base64,/9j/' + 'A'.repeat(260000)]) assert.equal(images.isSafeImage(value), false);
});

test('unsupported and oversized local files are rejected before being read', async () => {
  const app = setup();
  await assert.rejects(app.images.process({type: 'image/svg+xml', size: 50}), /PNG|JPG|WebP/);
  await assert.rejects(app.images.process({type: 'image/png', size: 10 * 1024 * 1024 + 1}), /10MB/);
  assert.equal(app.readCount(), 0);
});

test('decoded image is cropped to 2:1 and re-encoded below the persisted size limit', async () => {
  const app = setup();
  const result = await app.images.process({type: 'image/png', size: 50});
  assert.equal(app.canvas.width, 1200);
  assert.equal(app.canvas.height, 600);
  assert.ok(result.length <= 260000);
  assert.equal(app.images.isSafeImage(result), true);
  assert.ok(app.encodeCount() > 1, 'an oversized first export must be recompressed');
});

test('carousel images use an 8:3 crop while shortcut uploads retain their default ratio', async () => {
  const app = setup();
  await app.images.process({type: 'image/png', size: 50}, {aspectRatio: 8 / 3});
  assert.equal(app.canvas.width, 1200);
  assert.equal(app.canvas.height, 450);
});

test('read and decode failures report a usable error instead of saving empty data', async () => {
  for (const options of [{readFails: true}, {decodeFails: true}, {alwaysTooLarge: true}]) {
    const {images} = setup(options);
    await assert.rejects(images.process({type: 'image/png', size: 50}), /读取|处理|压缩|更换/);
  }
});


test('renamed SVG or non-image bytes cannot enter the image decoder as a raster upload', async () => {
  const app = setup({source: 'data:image/png;base64,PHN2Zy8+'});
  await assert.rejects(app.images.process({type: 'image/png', size: 50}), /有效|格式|读取/);
});
