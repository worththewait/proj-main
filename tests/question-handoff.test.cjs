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

function element(ownerDocument) {
  const classes = new Set();
  const attributes = new Map();
  const children = new Map();
  return events({
    value: "", hidden: false, disabled: false, open: false, isConnected: true,
    innerHTML: "", textContent: "", dataset: {}, style: {},
    scrollTop: 0, scrollHeight: 600, clientHeight: 600,
    classList: {
      contains(name) { return classes.has(name); },
      add(name) { classes.add(name); },
      remove(name) { classes.delete(name); },
      toggle(name, force = !classes.has(name)) { force ? classes.add(name) : classes.delete(name); return force; },
    },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    removeAttribute(name) { attributes.delete(name); },
    querySelector(selector) {
      if (!children.has(selector)) children.set(selector, element(ownerDocument));
      return children.get(selector);
    },
    querySelectorAll() { return []; },
    focus() { if (ownerDocument) ownerDocument.activeElement = this; },
    scrollTo(options) { this.scrollTop = options.top; },
    showModal() { this.open = true; },
    close() { this.open = false; this.emit("close"); },
  });
}

function environment(pageId = "home", savedStorage = new Map()) {
  const nodes = new Map();
  const document = events({
    body: { dataset: { page: pageId } },
    activeElement: null,
    createElement() { return element(document); },
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, element(document));
      return nodes.get(selector);
    },
  });
  const window = events({ BaigeUI: { hydrate() {}, icon() { return ""; }, escapeHtml(value) { return String(value); } } });
  window.localStorage = { getItem: key => savedStorage.get(key) ?? null, setItem: (key, value) => savedStorage.set(key, value) };
  const location = { hash: "", href: "file:///prototype/index.html" };
  const timers = [];
  window.setTimeout = fn => { timers.push(fn); return fn; };
  window.clearTimeout = timer => {
    const index = timers.indexOf(timer);
    if (index !== -1) timers.splice(index, 1);
  };
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
  function clickChild(parent, child) {
    env.document.querySelector("#navigation").emit("click", {
      target: { closest(selector) { return selector === "[data-child]" ? { dataset: { parent, child } } : null; } },
    });
  }
  send("home", "ready");
  return { ...env, frames, frame, send, clickNav, clickChild };
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
  app.clickChild("qa", "对话");
  app.send("qa", "ready");
  app.clickNav("home");
  app.send("home", "navigate", { id: "qa", child: "对话", question: "归纳船舶标准" });
  const qa = app.frame("qa");
  assert.equal(qa.messages.filter(message => message.question).length, 1);
  app.send("qa", "ready");
  app.window.emit("hashchange");
  app.clickNav("home");
  app.clickChild("qa", "对话");
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
  app.clickChild("qa", "对话");
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
  assert.equal(node("#sendQuestion").disabled, false, "生成期间仍可点击停止");
  assert.match(node("#sendQuestion").getAttribute("aria-label"), /停止/);
  assert.equal(node("#generalMode").getAttribute("aria-pressed"), "true");
  assert.match(node("#conversationMessages").innerHTML, /首页带入的问题/);
  assert.equal(node("#conversationView").classList.contains("is-chatting"), true);
  assert.doesNotMatch(node("#conversationMessages").innerHTML, /演示回复/);
  while (env.timers.length) env.timers.shift()();
  const completed = JSON.parse(env.window.localStorage.getItem("baige.qa.history.v1"));
  assert.match(completed[0].messages.at(-1).text, /演示回复/);
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

test('suggestions fill the composer and example citations open the source reader', () => {
  const env = environment('qa');
  env.window.BaigePage = {onDeactivate() {}, onActivate() {}};
  vm.runInContext(source('qa-session.js'), env.context);
  vm.runInContext(source('conversation-data.js'), env.context);
  vm.runInContext(source('pages/home.js'), env.context);
  const node = selector => env.document.querySelector(selector);
  node('#suggestedQuestions').emit('click', {target:{closest(){return {dataset:{suggestion:'0'}};}}});
  assert.match(node('#homePrompt').value, /研究报告/);
  assert.equal(node('#sendQuestion').disabled, false);
  node('#showCitationExample').emit('click');
  node('#conversationMessages').emit('click', {target:{closest(){return {};}}});
  assert.equal(node('#referencesPanel').hidden, false);
  assert.match(node('#referencesContent').innerHTML, /示例原文/);
  assert.equal(node('#sourcePage').textContent, '2 / 3');
  node('#sourceNext').emit('click');
  assert.equal(node('#sourcePage').textContent, '3 / 3');
  node('#conversationMessages').emit('click', {target:{closest(){return {dataset:{exampleCitation:'1'}};}}});
  assert.match(node('#referencesContent').innerHTML, /研究资料核对清单/);
  assert.equal(node('#sourcePage').textContent, '1 / 2');
});

test('web search demo toggles independently of question mode', () => {
  const env = environment('qa');
  env.window.BaigePage = {onDeactivate() {}, onActivate() {}};
  vm.runInContext(source('qa-session.js'), env.context);
  vm.runInContext(source('pages/home.js'), env.context);
  const node = selector => env.document.querySelector(selector);
  node('#webSearchMode').emit('click');
  assert.equal(node('#webSearchMode').getAttribute('aria-pressed'), 'true');
  assert.equal(node('#generalMode').getAttribute('aria-pressed'), 'true');
  assert.match(node('#conversationFeedback').textContent, /演示/);
  node('#webSearchMode').emit('click');
  assert.equal(node('#webSearchMode').getAttribute('aria-pressed'), 'false');
});

test('history groups by local date and keeps legacy sessions searchable', () => {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const previous = new Date(today); previous.setDate(previous.getDate() - 3);
  const old = new Date(today); old.setDate(old.getDate() - 20);
  const sessions = [
    {id:'a', title:'今天问题', createdAt:+today, messages:[{role:'user', text:'船舶'}]},
    {id:'b', title:'近期问题', createdAt:+previous, mode:'knowledge', messages:[{role:'user', text:'标准'}]},
    {id:'legacy', title:'早期问题', messages:[{role:'user', text:'旧内容'}]},
    {id:'c', title:'更早问题', createdAt:+old, messages:[{role:'user', text:'旧问题'}]},
  ];
  const env = environment('qa', new Map([['baige.qa.history.v1',JSON.stringify(sessions)]]));
  env.window.BaigePage = {onDeactivate(){},onActivate(){}};
  vm.runInContext(source('qa-session.js'), env.context);
  vm.runInContext(source('pages/home.js'), env.context);
  const result = env.document.querySelector('#historyList').innerHTML;
  assert.match(result, /今天/); assert.match(result, /近 7 天/); assert.match(result, /更早/);
  assert.match(result, /知识问答/); assert.match(result, /早期问题/);
  env.document.querySelector('#historySearch').value = '标准';
  env.document.querySelector('#historySearch').emit('input');
  assert.match(env.document.querySelector('#historyList').innerHTML, /近期问题/);
  assert.doesNotMatch(env.document.querySelector('#historyList').innerHTML, /今天问题/);
});

const qaHistoryKey = "baige.qa.history.v1";
const completeDemoReply = "这是一条演示回复。感谢你的提问，实际智能问答能力正在接入中。";

function qaConversation(storage = new Map()) {
  const env = environment("qa", storage);
  let deactivate = () => {};
  let activate = () => {};
  env.window.BaigePage = {
    onDeactivate(callback) { deactivate = callback; },
    onActivate(callback) { activate = callback; },
  };
  vm.runInContext(source("qa-session.js"), env.context);
  vm.runInContext(source("conversation-data.js"), env.context);
  const node = selector => env.document.querySelector(selector);
  node("#conversationForm").requestSubmit = () => node("#conversationForm").emit("submit", { preventDefault() {} });
  vm.runInContext(source("pages/home.js"), env.context);
  return {
    ...env, node, storage,
    deactivate() { deactivate(); },
    activate(payload) { activate(payload); },
    saved() { return JSON.parse(storage.get(qaHistoryKey) || "[]"); },
    submit(text) {
      node("#homePrompt").value = text;
      node("#homePrompt").emit("input");
      node("#conversationForm").requestSubmit();
    },
    openHistory(id) {
      node("#historyList").emit("click", { target: { closest() { return { dataset: { historyId: id } }; } } });
    },
    tick(count = 1) { for (let i = 0; i < count && env.timers.length; i++) env.timers.shift()(); },
    finishTimers() {
      let remaining = 2000;
      while (env.timers.length && remaining-- > 0) env.timers.shift()();
      assert.ok(remaining > 0, "定时任务应能结束");
    },
  };
}

test("a second form submission cannot start another reply or consume the next draft", () => {
  const qa = qaConversation();
  qa.submit("第一个问题");
  qa.submit("尚未发送的第二个问题");
  qa.finishTimers();
  const messages = qa.saved()[0].messages;
  assert.deepEqual(messages.filter(message => message.role === "user").map(message => message.text), ["第一个问题"]);
  assert.equal(messages.filter(message => message.role === "assistant").length, 1);
  assert.equal(qa.node("#homePrompt").value, "尚未发送的第二个问题");
});

test("stopping a reply preserves only generated text and prevents later timer updates", () => {
  const qa = qaConversation();
  qa.submit("请慢慢说明");
  qa.tick(4);
  qa.node("#sendQuestion").focus();
  qa.node("#sendQuestion").emit("click", { preventDefault() {} });
  const stopped = qa.saved()[0].messages.at(-1);
  assert.ok(stopped.text.length > 0 && stopped.text.length < completeDemoReply.length, "停止后保存实际已生成的部分内容");
  assert.equal(Boolean(stopped.pending), false);
  qa.finishTimers();
  assert.equal(qa.saved()[0].messages.at(-1).text, stopped.text);
  assert.equal(qa.node("#sendQuestion").disabled, true, "输入为空时恢复发送按钮禁用态");
  assert.equal(qa.document.activeElement, qa.node("#homePrompt"), "停止后可立即继续输入");
});

for (const action of ["新建", "切换历史", "离开页面"]) {
  test(`${action} cancels generation without completing the old reply in the background`, () => {
    const oldSession = { id: "older", title: "较早的会话", mode: "general", messages: [{ role: "user", text: "旧问题" }, { role: "assistant", text: "旧答案" }] };
    const qa = qaConversation(new Map([[qaHistoryKey, JSON.stringify([oldSession])]]));
    qa.submit("正在生成的问题");
    qa.tick(3);
    if (action === "新建") qa.node("#newConversation").emit("click");
    if (action === "切换历史") qa.openHistory("older");
    if (action === "离开页面") qa.deactivate();
    qa.finishTimers();
    const interrupted = qa.saved().find(item => item.title === "正在生成的问题").messages.at(-1);
    assert.ok(interrupted.text.length > 0 && interrupted.text.length < completeDemoReply.length, "离开原会话后不在后台补全文");
    assert.equal(Boolean(interrupted.pending), false);
    if (action === "新建") assert.equal(qa.node("#conversationMessages").innerHTML, "");
    if (action === "切换历史") assert.match(qa.node("#conversationMessages").innerHTML, /旧答案/);
  });
}

test("reloading an unfinished reply restores its actual partial text instead of fabricating a full answer", () => {
  const storage = new Map();
  const first = qaConversation(storage);
  first.submit("刷新时尚未完成");
  first.tick(3);
  const second = qaConversation(storage);
  const saved = second.saved()[0];
  second.openHistory(saved.id);
  const reply = second.saved()[0].messages.at(-1);
  assert.ok(reply.text.length > 0 && reply.text.length < completeDemoReply.length);
  assert.equal(Boolean(reply.pending), false);
  assert.match(second.node("#conversationMessages").innerHTML, /中断|停止|未完成/, "刷新后应说明回复没有正常完成");
});

test("scrolling up pauses following and returning to latest resumes it in the message pane", () => {
  const qa = qaConversation();
  qa.submit("生成一段便于回看历史的回复");
  const messages = qa.node("#conversationMessages");
  const outer = qa.node("#contentScroll");
  Object.assign(messages, { scrollHeight: 1200, clientHeight: 300, scrollTop: 900 });
  Object.assign(outer, { scrollHeight: 1800, clientHeight: 600, scrollTop: 222 });
  qa.tick();
  messages.scrollTop = 100;
  messages.emit("scroll");
  qa.tick();
  assert.equal(messages.scrollTop, 100, "上翻阅读时不夺取消息区位置");
  assert.equal(outer.scrollTop, 222, "回复更新只滚动消息区");
  assert.equal(qa.node("#jumpToLatest").hidden, false);
  qa.node("#jumpToLatest").focus();
  qa.node("#jumpToLatest").emit("click");
  assert.ok(messages.scrollTop >= 900);
  assert.equal(qa.node("#jumpToLatest").hidden, true);
  assert.equal(qa.document.activeElement, messages, "回到最新后焦点留在消息区继续阅读");
  messages.scrollHeight = 1300;
  qa.tick();
  assert.ok(messages.scrollTop >= 1000, "点击回到最新后继续跟随新内容");
});

test("a knowledge conversation restores its selected sources and web search after reload", () => {
  const storage = new Map();
  const first = qaConversation(storage);
  first.node("#knowledgeMode").emit("click");
  for (const id of ["industry-ship", "enterprise-policy"]) {
    first.node("#knowledgePickerResults").emit("change", { target: { value: id, checked: true, matches() { return true; } } });
  }
  first.node("#confirmKnowledgePicker").emit("click");
  first.node("#webSearchMode").emit("click");
  first.submit("按这些资料回答");
  first.finishTimers();
  const second = qaConversation(storage);
  second.openHistory(second.saved()[0].id);
  assert.equal(second.node("#knowledgeMode").getAttribute("aria-pressed"), "true");
  assert.match(second.node("#selectedSourceTags").innerHTML, /船舶行业知识库/);
  assert.match(second.node("#selectedSourceTags").innerHTML, /企业制度知识库/);
  assert.equal(second.node("#webSearchMode").getAttribute("aria-pressed"), "true");
  second.submit("继续核对");
  second.finishTimers();
  assert.deepEqual(second.saved()[0].knowledgeBaseIds, ["industry-ship", "enterprise-policy"]);
});

test("legacy knowledge history without source IDs requests a scope instead of silently sending in general mode", () => {
  const legacy = { id: "legacy-knowledge", title: "旧知识会话", mode: "knowledge", messages: [{ role: "user", text: "原问题" }, { role: "assistant", text: "原答案" }] };
  const qa = qaConversation(new Map([[qaHistoryKey, JSON.stringify([legacy])]]));
  qa.openHistory(legacy.id);
  assert.match(qa.node("#conversationFeedback").textContent, /知识库|范围/);
  qa.submit("继续追问");
  assert.equal(qa.node("#knowledgePicker").open, true);
  assert.equal(qa.saved()[0].messages.length, 2);
  assert.equal(qa.node("#homePrompt").value, "继续追问");
});

test("example answers and citations survive a followup and history reload", () => {
  const storage = new Map();
  const first = qaConversation(storage);
  first.node("#showCitationExample").emit("click");
  first.submit("请继续说明如何核对");
  first.finishTimers();
  assert.match(first.node("#conversationMessages").innerHTML, /先对齐目标，再比较差异/);
  assert.match(first.node("#conversationMessages").innerHTML, /data-example-citation/);
  const second = qaConversation(storage);
  second.openHistory(second.saved()[0].id);
  assert.match(second.node("#conversationMessages").innerHTML, /先对齐目标，再比较差异/);
  assert.match(second.node("#conversationMessages").innerHTML, /data-example-citation/);
  second.node("#conversationMessages").emit("click", { target: { closest() { return { dataset: { exampleCitation: "1" } }; } } });
  assert.equal(second.node("#referencesPanel").hidden, false);
  assert.match(second.node("#referencesContent").innerHTML, /研究资料核对清单/);
});

test("switching histories closes the previous conversation's source reader", () => {
  const other = { id: "other", title: "无引用的会话", mode: "general", messages: [{ role: "user", text: "另一个问题" }] };
  const qa = qaConversation(new Map([[qaHistoryKey, JSON.stringify([other])]]));
  qa.node("#showCitationExample").emit("click");
  qa.node("#conversationMessages").emit("click", { target: { closest() { return { dataset: { exampleCitation: "0" } }; } } });
  qa.node("#sourceExpand").emit("click");
  qa.openHistory(other.id);
  assert.equal(qa.node("#referencesPanel").hidden, true);
  assert.equal(qa.node("#referencesPanel").classList.contains("is-expanded"), false);
});

test("closing side panels returns keyboard focus to their triggers", () => {
  const qa = qaConversation();
  const historyToggle = qa.node("#historyToggle");
  historyToggle.focus();
  historyToggle.emit("click");
  assert.equal(qa.document.activeElement, qa.node("#historySearch"));
  qa.node("#historyClose").focus();
  qa.node("#historyClose").emit("click");
  assert.equal(qa.document.activeElement, historyToggle);
  qa.node("#showCitationExample").emit("click");
  const citation = qa.document.createElement("button");
  citation.dataset.exampleCitation = "0";
  citation.closest = () => citation;
  citation.focus();
  qa.node("#conversationMessages").emit("click", { target: citation });
  qa.node("#referencesClose").focus();
  qa.node("#referencesClose").emit("click");
  assert.equal(qa.document.activeElement, citation);
});

test("IME confirmation and Shift Enter do not send while an ordinary Enter does", () => {
  const qa = qaConversation();
  const field = qa.node("#homePrompt");
  field.value = "中文输入";
  for (const properties of [{ isComposing: true }, { keyCode: 229 }, { shiftKey: true }]) {
    field.emit("keydown", { key: "Enter", preventDefault() {}, ...properties });
  }
  assert.equal(qa.saved().length, 0);
  field.emit("keydown", { key: "Enter", keyCode: 13, isComposing: false, shiftKey: false, preventDefault() {} });
  assert.equal(qa.saved().length, 1);
  assert.equal(qa.saved()[0].messages[0].text, "中文输入");
});

test("choosing a history conversation focuses the composer for a followup", () => {
  const saved = { id: "continue-here", title: "继续这个会话", messages: [{role: "user", text: "原问题"}] };
  const qa = qaConversation(new Map([[qaHistoryKey, JSON.stringify([saved])]]));
  qa.node("#historyToggle").emit("click");
  qa.openHistory(saved.id);
  assert.equal(qa.node("#historyPanel").hidden, true);
  assert.equal(qa.document.activeElement, qa.node("#homePrompt"));
});

test("composer layout changes keep the latest reply visible only while following", () => {
  const qa = qaConversation();
  const messages = qa.node("#conversationMessages");
  Object.assign(messages, {scrollHeight: 1000, clientHeight: 400});
  let top = 0;
  Object.defineProperty(messages, "scrollTop", {
    get() { return top; },
    set(value) { top = Math.min(value, messages.scrollHeight - messages.clientHeight); },
  });
  let sourcesHidden = true;
  Object.defineProperty(qa.node("#selectedSources"), "hidden", {
    get() { return sourcesHidden; },
    set(value) { sourcesHidden = value; messages.clientHeight = value ? 400 : 342; },
  });
  qa.node("#showCitationExample").emit("click");
  assert.equal(messages.scrollTop, 658, "知识范围显示后应补上新增的58px滚动距离");

  const field = qa.node("#homePrompt");
  let height = "";
  Object.defineProperty(field.style, "height", {
    get() { return height; },
    set(value) {
      height = value;
      if (value.endsWith("px")) messages.clientHeight = 220;
    },
  });
  field.scrollHeight = 200;
  field.value = "准备一段多行追问";
  field.emit("input");
  assert.equal(field.style.height, "144px");
  assert.equal(messages.scrollTop, 780, "输入框变高后仍能看到最新消息");

  messages.scrollTop = 20;
  messages.emit("scroll");
  qa.node("#generalMode").emit("click");
  field.emit("input");
  assert.equal(messages.scrollTop, 20, "用户上翻时模式和高度变化不应强制贴底");
});

test("opening history collapses the source panel while retaining its current document", () => {
  const qa = qaConversation();
  qa.node("#showCitationExample").emit("click");
  qa.node("#conversationMessages").emit("click", {target: {closest() { return {dataset: {exampleCitation: "0"}}; }}});
  qa.node("#sourceNext").emit("click");
  qa.node("#sourceExpand").emit("click");
  const paper = qa.node("#sourcePaper").innerHTML;
  qa.node("#historyToggle").emit("click");
  assert.equal(qa.node("#historyPanel").hidden, false);
  assert.equal(qa.node("#referencesPanel").hidden, true);
  assert.equal(qa.node("#referencesPanel").classList.contains("is-expanded"), false);
  assert.equal(qa.node("#sourcePaper").innerHTML, paper);
  qa.node("#historyClose").emit("click");
  qa.node("#referencesToggle").emit("click");
  assert.equal(qa.node("#referencesPanel").hidden, false);
  assert.equal(qa.node("#sourcePaper").innerHTML, paper);
  assert.equal(qa.node("#sourcePage").textContent, "3 / 3");
});
