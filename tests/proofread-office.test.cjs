const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadOffice() {
  const context = vm.createContext({ TextDecoder });
  context.window = context;
  for (const file of ['src/proofread-office.js', 'assets/vendor/proofread/xlsx.full.min.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), context, { filename: file });
  }
  return context;
}

for (const format of ['xls', 'xlsx']) {
  test(`reading ${format} preserves Chinese text and zeroes from every worksheet`, async () => {
    const { XLSX, BaigeProofreadOffice } = loadOffice();
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['船舶工做', 0], [], ['下一行']]), '进度');
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['绝密材料']]), '归档');
    const bytes = XLSX.write(book, { type: 'array', bookType: format, bookSST: true });
    const content = await BaigeProofreadOffice.read(format, bytes);
    assert.match(content, /船舶工做\t0\n下一行[\s\S]*绝密材料/);
  });
}

test('a renamed text file is rejected instead of entering review as an Excel file', async () => {
  const { BaigeProofreadOffice } = loadOffice();
  const bytes = new TextEncoder().encode('文件名,工程编号\n无效的工作簿,123').buffer;
  await assert.rejects(BaigeProofreadOffice.read('xls', bytes));
});
