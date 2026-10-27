const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function session() {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../src/qa-session.js"), "utf8"), context);
  return new context.window.BaigeQuestionSession([
    { id: "industry", name: "船舶标准", scope: "行业" },
    { id: "company", name: "企业问答", scope: "企业" },
    { id: "department", name: "部门研究资料", scope: "部门" },
  ]);
}

test("knowledge selection can span scopes and only takes effect after confirmation", () => {
  const state = session();
  state.beginSelection();
  state.select("industry", true);
  state.select("company", true);
  assert.equal(state.mode, "general");
  assert.equal(state.selected.length, 0);
  assert.equal(state.confirmSelection(), true);
  const request = state.prepareQuestion("  查询船舶标准  ");
  assert.equal(request.status, "ready");
  assert.equal(request.question, "查询船舶标准");
  assert.equal(request.mode, "knowledge");
  assert.deepEqual(Array.from(request.knowledgeBaseIds), ["industry", "company"]);
});

test("cancelling an edit preserves the previously confirmed knowledge scope", () => {
  const state = session();
  state.beginSelection();
  state.select("industry", true);
  state.confirmSelection();
  state.beginSelection();
  state.select("industry", false);
  state.select("department", true);
  state.cancelSelection();
  assert.deepEqual(Array.from(state.prepareQuestion("问题").knowledgeBaseIds), ["industry"]);
  state.beginSelection();
  assert.deepEqual(Array.from(state.draftIds), ["industry"]);
});

test("cancelling the initial picker keeps general mode", () => {
  const state = session();
  state.beginSelection();
  state.select("company", true);
  state.cancelSelection();
  assert.equal(state.mode, "general");
  assert.equal(state.selected.length, 0);
});

test("search and scope filtering do not discard hidden selections", () => {
  const state = session();
  state.beginSelection();
  state.select("industry", true);
  assert.deepEqual(Array.from(state.findKnowledge("企业", "问答"), item => item.id), ["company"]);
  assert.equal(state.findKnowledge("企业", "船舶").length, 0);
  assert.deepEqual(Array.from(state.draftIds), ["industry"]);
});

test("empty or unknown selections cannot activate knowledge mode", () => {
  const state = session();
  state.beginSelection();
  state.select("unknown", true);
  assert.equal(state.confirmSelection(), false);
  assert.equal(state.mode, "general");
  assert.equal(state.selected.length, 0);
});

test("general questions omit knowledge sources without forgetting the previous selection", () => {
  const state = session();
  state.beginSelection();
  state.select("company", true);
  state.confirmSelection();
  state.useGeneral();
  const request = state.prepareQuestion("问题");
  assert.equal(request.mode, "general");
  assert.equal(request.knowledgeBaseIds.length, 0);
  assert.equal(state.selected.length, 1);
  state.beginSelection();
  assert.deepEqual(Array.from(state.draftIds), ["company"]);
});

test("blank questions are rejected before creating a request", () => {
  const state = session();
  assert.equal(state.prepareQuestion("  \n ").status, "empty");
});
