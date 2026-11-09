const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const scripts = ["proofread-store.js", "proofread-tool.js", "mindmap-documents.js"]
  .map(name => fs.readFileSync(path.join(__dirname, "../src", name), "utf8"));

function setup() {
  const storage = new Map();
  const originals = new Map();
  let time = 10000;
  function open({ cache = true } = {}) {
    const window = {
      localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
      BaigeUI: {},
      BaigeProofreadFile: {
        async read(file) {
          if (!file.text) throw new Error("文件没有可读取的正文。");
          return file.text;
        },
      },
    };
    if (cache) window.BaigeLocalFiles = {
      async save(key, file) { originals.set(key, file); },
      async read(key) { return originals.get(key); },
      async remove(key) { originals.delete(key); },
    };
    const context = vm.createContext({ window, Date: class extends Date { static now() { return time; } } });
    for (const script of scripts) vm.runInContext(script, context);
    return { mindmap: window.BaigeMindmapDocuments, proofread: window.BaigeProofreadStore };
  }
  return { open, originals, tick(ms) { time += ms; } };
}

test("mindmap resumes detection after reload and keeps proofread documents separate", async () => {
  const app = setup();
  const { mindmap, proofread } = app.open();
  const file = { name: "检验纪要.md", text: "# 船舶检验\n- 核对记录" };
  const entry = await mindmap.submit(file);
  assert.equal(entry.secretStatus, "detecting");
  assert.equal(entry.text, undefined);
  assert.equal(proofread.read().records.length, 0);
  await assert.rejects(mindmap.original(entry.id), /仅可下载通过/);
  app.tick(2599);
  assert.equal(app.open().mindmap.list()[0].secretStatus, "detecting");
  app.tick(1);
  const reloaded = app.open().mindmap;
  assert.equal(reloaded.list()[0].secretStatus, "passed");
  assert.equal(reloaded.list()[0].text, file.text);
  assert.equal(await reloaded.original(entry.id), file);
  await reloaded.remove(entry.id);
  assert.equal(reloaded.list().length, 0);
  assert.equal(app.originals.size, 0);
});

test("shared secrecy detection covers file names and content, then requires human review", async () => {
  const app = setup();
  const { mindmap } = app.open();
  const first = await mindmap.submit({ name: "内部资料.md", text: "# 检验结果" });
  const second = await mindmap.submit({ name: "工作记录.md", text: "涉及军品" });
  app.tick(3000);
  const rows = mindmap.list();
  assert.deepEqual(Array.from(rows.find(row => row.id === first.id).keywords), ["内部资料"]);
  assert.deepEqual(Array.from(rows.find(row => row.id === second.id).keywords), ["军品"]);
  assert.equal(rows.every(row => row.secretStatus === "hit" && !Object.hasOwn(row, "text")), true);
  assert.throws(() => mindmap.audit(first.id, "passed"), /审核状态/);
  assert.equal(mindmap.audit(first.id, "submitted").text, undefined);
  assert.equal(mindmap.audit(first.id, "passed").text, "# 检验结果");
  mindmap.audit(second.id, "submitted");
  const rejected = mindmap.audit(second.id, "rejected");
  assert.match(rejected.auditReason, /未通过/);
  assert.equal(rejected.text, undefined);
  await assert.rejects(mindmap.original(second.id), /仅可下载通过/);
});

test("unavailable originals and failed extraction are handled without a fake download", async () => {
  const app = setup();
  const { mindmap } = app.open({ cache: false });
  const failed = await mindmap.submit({ name: "空文件.txt" });
  assert.equal(failed.secretStatus, "failed");
  assert.match(failed.auditReason, /没有可读取/);
  await assert.rejects(mindmap.original(failed.id), /仅可下载通过/);
  assert.equal(app.open().mindmap.list()[0].secretStatus, "failed");
  const row = await mindmap.submit({ name: "检验纪要.docx", text: "记录正文" });
  app.tick(3000);
  assert.equal(mindmap.list()[0].text, "记录正文");
  await assert.rejects(mindmap.original(row.id), /没有保存原文件/);
  await mindmap.remove(row.id);
  await mindmap.remove(failed.id);
  assert.equal(mindmap.list().length, 0);
});
