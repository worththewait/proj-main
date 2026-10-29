const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

test("customer support help and feedback keep only the simplified content", () => {
  const account = fs.readFileSync(path.join(__dirname, "..", "src", "account.js"), "utf8");
  assert.match(account, /如何开始问答/);
  assert.match(account, /功能无法使用怎么办/);
  assert.doesNotMatch(account, /如何设置推荐功能/);
  assert.doesNotMatch(account, /尚未接入人工在线客服/);
  assert.doesNotMatch(account, /系统反馈仅在原型内演示/);

  assert.match(account, /id="accountFeedbackContent"/);
  assert.doesNotMatch(account, /accountFeedbackType/);
  assert.doesNotMatch(account, /反馈类型/);
  assert.doesNotMatch(account, /feedback\.type/);
});
