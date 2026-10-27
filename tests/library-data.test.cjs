const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/library-data.js"), "utf8"), context);
  return context.window.BaigeLibraryData;
}

test("library demo data keeps categories, documents and preview chapters consistent", () => {
  const { categories, docs, content } = load();
  assert.equal(categories.length, 8);
  assert.equal(docs.length, 24);
  assert.equal(content.length, 6);
  const categoryNames = new Set(categories.map((category) => category.name));
  const titles = new Set();
  for (const doc of docs) {
    assert.ok(doc.t && doc.org && doc.date && doc.cat && doc.type);
    assert.ok(categoryNames.has(doc.cat));
    assert.ok(doc.abstract && doc.abstract.length > 4);
    assert.equal(titles.has(doc.t), false);
    titles.add(doc.t);
  }
  for (const chapter of content) {
    assert.ok(chapter.h);
    assert.ok(Array.isArray(chapter.paras) && chapter.paras.length > 0);
  }
});
