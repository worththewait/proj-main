const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("global AI ball is wired into the shell with current routes", () => {
  const html = read("index.html");
  const script = read("src/ai-ball.js");
  const account = read("src/account.js");

  assert.match(html, /ai-ball\.css\?v=20261030-home-directory/);
  assert.match(html, /ai-ball\.js\?v=20261030-home-directory/);
  assert.match(html, /account\.js\?v=20261030-quick-ball/);
  assert.match(html, /home-directory-icons\.js\?v=20261024-directory/);

  assert.match(script, /qb-entries/);
  assert.match(script, /qb-pos/);
  assert.match(script, /MAX_ENTRIES = 6/);
  assert.doesNotMatch(script, /fixedEntries|QB_FIXED/);
  assert.match(script, /知识与研究/);
  assert.match(script, /工具与平台/);
  assert.match(script, /BaigePermissions\?\.canOpen/);
  assert.match(script, /home-directory-icons|BaigeDirectoryIcons/);
  assert.match(script, /qa:对话/);
  assert.match(script, /标准编制/);
  assert.match(script, /专利编制/);
  assert.match(script, /文献伴读/);
  assert.match(script, /文档翻译/);
  assert.match(script, /纠错校对/);
  assert.match(script, /PPT生成/);
  assert.match(script, /function openSettings/);
  assert.match(script, /function openQuickQa/);
  assert.match(script, /window\.BaigeAiBall = Object\.freeze/);
  assert.match(script, /data-tone/);
  assert.match(read("ai-ball.css"), /\[data-tone="purple"\]/);
  assert.match(read("ai-ball.css"), /\[data-tone="teal"\]/);

  assert.match(account, /快捷入口设置/);
  assert.match(account, /window\.BaigeAiBall\?\.openSettings\(\)/);
});
