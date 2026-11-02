const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("QA conversation history supports per-item deletion with confirmation", () => {
  const script = read("src/pages/home.js");
  const html = read("pages/qa.html");
  const css = read("qa-visual.css");

  assert.match(script, /data-history-delete/);
  assert.match(script, /window\.confirm\(`删除历史会话/);
  assert.match(script, /conversations = conversations\.filter\(entry => entry\.id !== id\)/);
  assert.match(script, /current\?\.id === id/);
  assert.match(script, /saveHistory\(\);\n      return;/);

  assert.match(css, /\.qa-history-delete/);
  assert.match(css, /\.qa-history-entry\.is-active \.qa-history-delete/);
  assert.match(html, /qa-visual\.css\?v=20261030-refined-history-delete/);
  assert.match(html, /home\.js\?v=20261030-refined-history-delete/);
});
