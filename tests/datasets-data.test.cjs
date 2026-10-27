const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function load() {
  const context = { window: {} };
  for (const file of ["../src/data.js", "../src/datasets-data.js"]) {
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context);
  }
  return context.window;
}

test("every dataset card has a detail route and a matching record", () => {
  const { BaigeData, BaigeDatasets, BaigePermissions } = load();
  const nav = BaigeData.navigation.find((item) => item.id === "datasets");
  assert.equal(BaigeDatasets.length, 8);
  assert.equal(nav.children.length, 8);
  assert.equal(nav.subnav, false);
  assert.equal(nav.autoChild, false);
  assert.deepEqual(Array.from(nav.children), Array.from(BaigeDatasets, (dataset) => dataset.name));
  const html = fs.readFileSync(path.join(__dirname, "../pages/datasets.html"), "utf8");
  const cardNames = Array.from(html.matchAll(/data-dataset="([^"]+)"/g), (match) => match[1]);
  assert.deepEqual(cardNames, Array.from(BaigeDatasets, (dataset) => dataset.name));
  for (const dataset of BaigeDatasets) {
    assert.equal(html.includes(`href="#${dataset.name}"`), true);
    assert.equal(BaigePermissions.canOpen("datasets", dataset.name), true);
  }
});

test("dataset records carry readable sections and local icons", () => {
  const { BaigeDatasets } = load();
  for (const dataset of BaigeDatasets) {
    assert.match(dataset.updated, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(dataset.summary.length > 0);
    assert.ok(dataset.sections.length >= 4);
    assert.ok(dataset.sections.some((section) => section.contact));
    assert.match(dataset.icon, /^\.\.\/assets\/datasets\/[^/]+\.png$/);
  }
});

test("the ship-industry dataset keeps its four value and five scenario items", () => {
  const { BaigeDatasets } = load();
  const dataset = BaigeDatasets.find((item) => item.name === "船海产业数据集");
  assert.ok(dataset);
  assert.equal(dataset.sections[0].items.length, 4);
  assert.equal(dataset.sections[1].items.length, 5);
  assert.equal(dataset.sections[2].title, "服务模式");
  assert.equal(dataset.sections[3].title, "业务咨询");
});
