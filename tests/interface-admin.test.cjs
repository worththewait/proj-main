const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("interface management merges home settings and feature management into one page", () => {
  const html = read("pages/interface-admin.html");
  assert.match(html, /<h1>界面管理<\/h1>/);
  assert.equal((html.match(/class="iface-tab"/g) || []).length, 5);
  for (const view of ["recommend", "carousel", "updates", "features", "categories"]) {
    assert.match(html, new RegExp(`data-view="${view}"`));
  }
  for (const id of ["panelRecommendations", "panelCarousel", "panelUpdates", "featureListPanel", "featureCategoryPanel"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /id="ifaceTabs"/);
  // 原页签保留给两个脚本绑定，但界面上不再出现第二层导航。
  assert.match(html, /class="legacy-tabs" hidden/);
  assert.match(html, /src\/pages\/home-admin\.js/);
  assert.match(html, /src\/pages\/feature-admin\.js/);
  assert.match(html, /src\/pages\/interface-admin\.js/);
  assert.match(html, /interface-admin\.css/);
  for (const file of ["pages/interface-admin.html", "pages/feature-admin.html"]) {
    const page = read(file);
    assert.match(page, /id="uploadFeatureIcon" type="file"/);
    assert.match(page, /id="resetFeatureIcon"/);
  }
});

test("interface tabs drive panels and keep the legacy deep links working", () => {
  const js = read("src/pages/interface-admin.js");
  assert.match(js, /panelRecommendations/);
  assert.match(js, /tabRecommendations/);
  assert.match(js, /settings: "recommend"/);
  assert.match(js, /features: "features"/);
  assert.match(js, /history\.replaceState/);
  assert.match(js, /BaigeFeatureConfig\?\.subscribe/);

  // 推荐候选与首页入口共用同一份功能配置，保存图标后立即刷新。
  const home = read("src/pages/home-admin.js");
  assert.match(home, /features\?\.subscribe\(renderOptions\)/);

  const css = read("interface-admin.css");
  assert.match(css, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.legacy-tabs \{ display: none !important; \}/);
});
