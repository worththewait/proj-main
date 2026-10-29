const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = file => fs.readFileSync(path.join(__dirname, "../src", file), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));

function events(target = {}) {
  const listeners = new Map();
  target.addEventListener = (name, callback) => {
    if (!listeners.has(name)) listeners.set(name, []);
    listeners.get(name).push(callback);
  };
  target.emit = (name, event = {}) => {
    for (const callback of listeners.get(name) || []) callback(event);
  };
  return target;
}

function element() {
  const classes = new Set();
  const attributes = new Map();
  return events({
    value: "", hidden: false, disabled: false, open: false, isConnected: true,
    classList: {
      contains(name) { return classes.has(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force = !classes.has(name)) { force ? classes.add(name) : classes.delete(name); return force; },
    },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    querySelectorAll() { return []; },
    focus() {},
    showModal() { this.open = true; },
    close() { this.open = false; this.emit("close"); },
  });
}

function environment(pageId = "home", savedStorage = new Map()) {
  const nodes = new Map();
  const document = events({
    body: { dataset: { page: pageId } },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element());
      return nodes.get(selector);
    },
  });
  const window = events({ BaigeUI: { hydrate() {}, icon() { return ""; }, escapeHtml(value) { return String(value); } } });
  window.localStorage = { getItem: key => savedStorage.get(key) ?? null, setItem: (key, value) => savedStorage.set(key, value) };
  const location = { hash: "", href: "file:///prototype/index.html" };
  const timers = [];
  window.setTimeout = fn => { timers.push(fn); };
  const context = vm.createContext({ window, document, location });
  vm.runInContext(source("data.js"), context);
  return { window, document, location, context, nodes, timers };
}

function application() {
  const env = environment();
  const frames = [];
  env.window.BaigePermissions = { canOpen() { return true; } };
  env.document.createElement = () => {
    const frame = element();
    frame.messages = [];
    frame.contentWindow = { postMessage(message) { frame.messages.push(plain(message)); } };
    return frame;
  };
  env.document.querySelector("#pageHost").append = frame => frames.push(frame);
  vm.runInContext(source("app.js"), env.context);
  const frame = id => frames.find(item => item.src.startsWith(env.window.BaigeData.findNavItem(id).file));
  const send = (id, type, payload = {}, sender = frame(id).contentWindow) => env.window.emit("message", {
    source: sender, data: { type: `baige:${type}`, pageId: id, ...payload },
  });
  function clickNav(id) {
    env.document.querySelector("#navigation").emit("click", {
      target: { closest(selector) { return selector === "[data-nav]" ? { dataset: { nav: id } } : null; } },
    });
  }
  send("home", "ready");
  return { ...env, frames, frame, send, clickNav };
}

test("homepage question waits for a new QA frame to be ready and never enters its URL", () => {
  const app = application();
  app.send("home", "navigate", { id: "qa", child: "对话", question: "  请介绍绿色船舶的发展趋势  " });
  const qa = app.frame("qa");
  assert.equal(qa.messages.length, 0);
  assert.equal(qa.src, `${app.window.BaigeData.findNavItem("qa").file}#%E5%AF%B9%E8%AF%9D`);
  assert.equal(app.location.hash, "#qa/%E5%AF%B9%E8%AF%9D");
  app.send("qa", "ready");
  assert.equal(qa.messages.at(-1).question, "请介绍绿色船舶的发展趋势");
});

test("a mounted QA receives a new question once and ordinary navigation does not replay it", () => {
  const app = application();
  app.clickNav("qa");
  app.send("qa", "ready");
  app.clickNav("home");
  app.send("home", "navigate", { id: "qa", child: "对话", question: "归纳船舶标准" });
  const qa = app.frame("qa");
  assert.equal(qa.messages.filter(message => message.question).length, 1);
  app.send("qa", "ready");
  app.window.emit("hashchange");
  app.clickNav("home");
  app.clickNav("qa");
  assert.equal(qa.messages.filter(message => message.question).length, 1);
  assert.equal(qa.messages.at(-1).question, undefined);
});

test("a question from an unregistered window cannot create or activate QA", () => {
  const app = application();
  app.send("home", "navigate", { id: "qa", child: "对话", question: "伪造消息" }, {});
  assert.equal(app.frames.length, 1);
  assert.equal(app.location.hash, "");
});

test("navigation accepts questions only for QA conversation and rejects invalid payloads", () => {
  for (const question of [null, {}, 12, "  ", "问".repeat(16001)]) {
    const app = application();
    app.send("home", "navigate", { id: "qa", child: "对话", question });
    app.send("qa", "ready");
    assert.equal(app.frame("qa").messages.at(-1).question, undefined);
  }
  for (const [id, child] of [["knowledge", ""], ["qa", "智能问数"]]) {
    const app = application();
    app.send("home", "navigate", { id, child, question: "仅允许对话接收" });
    app.send(id, "ready");
    assert.equal(app.frame(id).messages.at(-1).question, undefined);
  }
});

test("leaving QA before readiness cancels an undelivered question", () => {
  const app = application();
  app.send("home", "navigate", { id: "qa", child: "对话", question: "尚未投递" });
  app.clickNav("home");
  app.send("qa", "ready");
  app.clickNav("qa");
  assert.equal(app.frame("qa").messages.filter(message => message.question).length, 0);
});

function bridge(pageId) {
  const env = environment(pageId);
  const parentMessages = [];
  env.window.parent = { postMessage(message) { parentMessages.push(plain(message)); } };
  vm.runInContext(source("page-bridge.js"), env.context);
  return { ...env, parentMessages };
}

test("all independently registered homepage cleanup handlers run on trusted deactivation", () => {
  const env = bridge("home");
  const calls = [];
  env.window.BaigePage.onDeactivate(() => calls.push("product-updates"));
  env.window.BaigePage.onDeactivate(() => calls.push("access-dialog"));
  const data = {type: "baige:deactivate", pageId: "home"};
  env.window.emit("message", {source: {}, data});
  assert.deepEqual(calls, []);
  env.window.emit("message", {source: env.window.parent, data});
  assert.deepEqual(calls, ["product-updates", "access-dialog"]);
});

test("homepage prompt settings survive mode switches without hiding the knowledge guidance", () => {
  const env = bridge("home");
  vm.runInContext(source("qa-session.js"), env.context);
  vm.runInContext(source("pages/home-knowledge.js"), env.context);
  const node = selector => env.document.querySelector(selector);
  env.window.BaigeHomeKnowledge.setPrompt("我的提问提示");
  node("#quickGeneralMode").emit("click");
  assert.equal(node("#quickQuestion").placeholder, "我的提问提示");
  node("#quickKnowledgeMode").emit("click");
  node("#quickKnowledgeResults").emit("change", {target: {matches: () => true, value: "industry-ship", checked: true}});
  node("#quickKnowledgeConfirm").emit("click");
  env.window.BaigeHomeKnowledge.setPrompt("更新后的提示");
  assert.match(node("#quickQuestion").placeholder, /已选知识库/);
  node("#quickGeneralMode").emit("click");
  assert.equal(node("#quickQuestion").placeholder, "更新后的提示");
});

test("homepage web search toggle is independent and reflected in the prompt", () => {
  const env = bridge("home");
  vm.runInContext(source("qa-session.js"), env.context);
  vm.runInContext(source("pages/home-knowledge.js"), env.context);
  const web = env.document.querySelector("#quickWebSearchMode");
  const field = env.document.querySelector("#quickQuestion");
  assert.equal(web.getAttribute("aria-pressed"), "false");
  web.emit("click");
  assert.equal(web.getAttribute("aria-pressed"), "true");
  assert.match(field.placeholder, /联网搜索已开启/);
  env.document.querySelector("#quickKnowledgeMode").emit("click");
  assert.equal(web.getAttribute("aria-pressed"), "true");
  env.document.querySelector("#quickGeneralMode").emit("click");
  assert.equal(web.getAttribute("aria-pressed"), "true");
  web.emit("click");
  assert.equal(web.getAttribute("aria-pressed"), "false");
  assert.doesNotMatch(field.placeholder, /联网搜索/);
});

test("child bridge forwards trimmed questions without putting them in the hash", () => {
  const env = bridge("home");
  env.window.BaigePage.navigate("qa", "对话", { question: "  绿色船舶研究  " });
  assert.equal(env.parentMessages.at(-1).question, "绿色船舶研究");
  assert.equal(env.location.hash, "");
  for (const question of [false, " ", "问".repeat(16001)]) {
    env.window.BaigePage.navigate("qa", "对话", { question });
    assert.equal(env.parentMessages.at(-1).question, undefined);
  }
  env.window.BaigePage.navigate("knowledge", "", { question: "不应发送" });
  assert.equal(env.parentMessages.at(-1).question, undefined);
});

test("QA bridge delivers question only from its parent and only on the conversation route", () => {
  const env = bridge("qa");
  const activations = [];
  env.window.BaigePage.onActivate(value => activations.push(plain(value)));
  const activate = (child, question, source = env.window.parent) => env.window.emit("message", {
    source, data: { type: "baige:activate", pageId: "qa", child, question },
  });
  activate("对话", "  跨页面问题  ", {});
  assert.equal(activations.length, 1);
  activate("对话", "  跨页面问题  ");
  assert.equal(activations.at(-1).question, "跨页面问题");
  activate("智能问数", "不可传到问数");
  assert.equal(activations.at(-1).question, undefined);
});

test("QA consumes an incoming question in general mode and keeps previous knowledge selection", () => {
  const env = environment("qa");
  let activate;
  env.window.BaigePage = { onDeactivate() {}, onActivate(callback) { activate = callback; } };
  vm.runInContext(source("qa-session.js"), env.context);
  const form = env.document.querySelector("#conversationForm");
  let submissions = 0;
  form.requestSubmit = () => { submissions++; form.emit("submit", { preventDefault() {} }); };
  vm.runInContext(source("pages/home.js"), env.context);
  const node = selector => env.document.querySelector(selector);
  node("#knowledgeMode").emit("click");
  node("#knowledgePickerResults").emit("change", {
    target: { value: "industry-ship", checked: true, matches() { return true; } },
  });
  node("#confirmKnowledgePicker").emit("click");
  assert.equal(node("#knowledgeMode").getAttribute("aria-pressed"), "true");
  activate({ child: "对话", question: "  首页带入的问题  " });
  assert.equal(node("#homePrompt").value, "");
  assert.equal(node("#sendQuestion").disabled, true);
  assert.equal(node("#generalMode").getAttribute("aria-pressed"), "true");
  assert.match(node("#conversationMessages").innerHTML, /首页带入的问题/);
  assert.equal(node("#conversationView").classList.contains("is-chatting"), true);
  assert.doesNotMatch(node("#conversationMessages").innerHTML, /演示回复/);
  while (env.timers.length) env.timers.shift()();
  assert.match(node("#conversationMessages").innerHTML, /演示回复/);
  assert.equal(submissions, 1);
  activate({ child: "对话" });
  assert.equal(submissions, 1);
  node("#knowledgeMode").emit("click");
  node("#confirmKnowledgePicker").emit("click");
  assert.equal(node("#knowledgeMode").getAttribute("aria-pressed"), "true");
  assert.match(node("#selectedSourceTags").innerHTML, /船舶行业知识库/);
  activate({ child: "对话", question: "按企业制度解答", knowledgeBaseIds: ["enterprise-policy", "department-project"] });
  assert.equal(node("#knowledgeMode").getAttribute("aria-pressed"), "true");
  assert.match(node("#selectedSourceTags").innerHTML, /企业制度知识库/);
  assert.match(node("#selectedSourceTags").innerHTML, /项目资料知识库/);
  assert.match(node("#conversationMessages").innerHTML, /按企业制度解答/);
});

test("knowledge question sources are delivered once with the queued question", () => {
  const app = application();
  app.send("home", "navigate", { id: "qa", child: "对话", question: "查询制度", knowledgeBaseIds: ["enterprise-policy", "industry-ship", "enterprise-policy"] });
  app.send("qa", "ready");
  assert.deepEqual(app.frame("qa").messages.at(-1).knowledgeBaseIds, ["enterprise-policy", "industry-ship"]);
  app.send("qa", "ready");
  assert.equal(app.frame("qa").messages.at(-1).knowledgeBaseIds, undefined);
  const invalid = application();
  invalid.send("home", "navigate", { id: "qa", child: "对话", question: "无效范围", knowledgeBaseIds: ["unknown-library"] });
  invalid.send("qa", "ready");
  assert.equal(invalid.frame("qa").messages.at(-1).question, undefined);
});

test("custom homepage settings is backend-only and redirects away from the client shell", () => {
  const app = application();
  app.clickNav("home-settings");
  assert.equal(app.location.href, "./admin.html#settings");
  assert.equal(app.frames.some((frame) => frame.src.includes("home-settings")), false);
});


test("history persists across reload while both panels start closed", () => {
  const storage = new Map();
  const load = () => {
    const env = environment("qa", storage);
    env.window.BaigePage = {onDeactivate() {}, onActivate() {}};
    vm.runInContext(source("qa-session.js"), env.context);
    vm.runInContext(source("pages/home.js"), env.context);
    return env;
  };
  const first = load();
  const node = selector => first.document.querySelector(selector);
  node("#homePrompt").value = "历史测试";
  node("#conversationForm").emit("submit", {preventDefault() {}});
  while (first.timers.length) first.timers.shift()();
  node("#historyToggle").emit("click");
  assert.equal(node("#historyPanel").hidden, false);
  assert.match(node("#historyList").innerHTML, /历史测试/);
  const second = load();
  assert.equal(second.document.querySelector("#historyPanel").hidden, true);
  assert.equal(second.document.querySelector("#referencesPanel").hidden, true);
  assert.match(second.document.querySelector("#historyList").innerHTML, /历史测试/);
  const saved = JSON.parse(storage.get("baige.qa.history.v1"));
  second.document.querySelector("#historyList").emit("click", {target:{closest(){return {dataset:{historyId:saved[0].id}};}}});
  assert.match(second.document.querySelector("#conversationMessages").innerHTML, /历史测试/);
});
