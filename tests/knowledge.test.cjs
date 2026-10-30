const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("knowledge page implements the four-scope knowledge hub", () => {
  const html = read("pages/knowledge.html");
  assert.match(html, /企业知识文档/);
  assert.match(html, /id="kbSearchForm"/);
  assert.match(html, /id="kbSections"/);
  assert.match(html, /id="kbTabs"/);
  assert.match(html, /id="kbWorkbar"/);
  assert.match(html, /id="kbEmpty"/);
  assert.match(html, /knowledge\.css/);
  assert.match(html, /src\/pages\/knowledge\.js/);
  assert.doesNotMatch(html, /正在集成/);
  assert.doesNotMatch(html, /knowledgeScopes|category-tabs/);

  const js = read("src/pages/knowledge.js");
  for (const name of ["知识问答参考文档", "714所", "中国船舶综合经济技术研究院", "HR部", "新闻部", "敏感词导入模板"]) {
    assert.match(js, new RegExp(name));
  }
  assert.match(js, /data-kb-collapse/);
  assert.match(js, /data-kb-filter/);
  assert.match(js, /data-kb-edit/);
  assert.match(js, /data-kb-delete/);
  assert.match(js, /personalPanel/);
  assert.match(js, /matchesBase/);
  assert.match(js, /data-kb-tab/);
  assert.match(js, /kb-group-head/);

  const css = read("knowledge.css");
  assert.match(css, /\.kb-grid/);
  assert.match(css, /\.kb-card/);
  assert.match(css, /\.kb-table/);
  assert.match(css, /\.kb-search/);
  assert.match(css, /\.kb-tabs/);
  assert.match(css, /\.kb-group-head/);
});
