const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/proofread-pdf.js'), 'utf8');

function loadPdfAdapter(pages, failure) {
  let destroyed = false;
  const window = {
    BaigePdfBinaryDataFactory: class {},
    pdfjsLib: {
      getDocument() {
        const pdf = {
          numPages: pages.length,
          async getPage(pageNumber) {
            return {getTextContent: async () => ({items: pages[pageNumber - 1]})};
          },
        };
        return {
          promise: failure ? Promise.reject(failure) : Promise.resolve(pdf),
          async destroy() { destroyed = true; },
        };
      },
    },
  };
  const document = {currentScript: {src: 'file:///prototype/src/proofread-pdf.js'}};
  vm.runInNewContext(source, {window, document, URL, Uint8Array});
  return {read: window.BaigeProofreadPdf.read, destroyed: () => destroyed};
}

test('PDF extraction preserves split Chinese text, lines, and page order', async () => {
  const adapter = loadPdfAdapter([
    [{str: '船舶'}, {str: '试航', hasEOL: true}, {str: '核对设计变更。'}],
    [{str: '机电设备验收。'}],
  ]);
  assert.equal(await adapter.read(new ArrayBuffer(1)), '船舶试航\n核对设计变更。\n\n机电设备验收。');
  assert.equal(adapter.destroyed(), true);
});

test('image-only and password-protected PDFs receive distinct errors and release the worker', async () => {
  const scanned = loadPdfAdapter([[], []]);
  await assert.rejects(scanned.read(new ArrayBuffer(1)), /文字型 PDF 或先通过 OCR/);
  assert.equal(scanned.destroyed(), true);

  const locked = loadPdfAdapter([], {name: 'PasswordException'});
  await assert.rejects(locked.read(new ArrayBuffer(1)), /已加密/);
  assert.equal(locked.destroyed(), true);
});
