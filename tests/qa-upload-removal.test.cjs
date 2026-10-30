const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

test("百舸问答对话不再提供上传文件入口或附件逻辑", () => {
  const html = read("pages/qa.html");
  const script = read("src/pages/home.js");
  const css = read("qa-visual.css");

  assert.doesNotMatch(html, /attachmentInput|addAttachment|conversationAttachments|qa-attachments/);
  assert.doesNotMatch(script, /attachmentInput|addAttachment|attachmentNames|conversationAttachments/);
  assert.doesNotMatch(css, /qa-attachment/);
  assert.match(html, /id="conversationForm"/);
  assert.match(html, /id="homePrompt"/);
  assert.match(html, /class="qa-modes"/);
});
