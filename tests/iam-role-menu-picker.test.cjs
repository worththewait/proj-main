const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function mount({ selected = [], disabled = false } = {}) {
  const controls = new Map();
  const events = {};
  const target = {
    addEventListener(type, callback) { events[type] = callback; },
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, {
        events: {},
        addEventListener(type, callback) { this.events[type] = callback; },
        setAttribute() {},
        querySelectorAll() { return []; },
      });
      return controls.get(selector);
    },
    querySelectorAll() { return []; },
  };
  const groups = [
    { id: "home", label: "客户端", items: [{ key: "home", label: "首页", alwaysAvailable: true }] },
    { id: "research", label: "知识与研究", items: [
      { key: "qa:对话", label: "对话", parentId: "qa", parentLabel: "百舸问答", legacyKey: "qa" },
      { key: "qa:智能问数", label: "智能问数", parentId: "qa", parentLabel: "百舸问答" },
    ] },
    { id: "tools", label: "工具与平台", items: [
      { key: "smart-tools:OCR识别", label: "OCR识别", parentId: "smart-tools", parentLabel: "智能工具", legacyKey: "tools" },
      { key: "smart-tools:文档翻译", label: "文档翻译", parentId: "smart-tools", parentLabel: "智能工具", legacyKey: "tools" },
    ] },
    { id: "backend", label: "后台", items: [
      { key: "review", label: "权限审核", protected: true },
    ] },
  ];
  const window = {
    BaigeUI: { escapeHtml: String, icon: () => "" },
    BaigeIamStore: { isPrivilegedMenu: key => key === "review" },
  };
  const context = vm.createContext({ window });
  const run = file => vm.runInContext(fs.readFileSync(path.join(__dirname, "..", file), "utf8"), context);
  run("src/data.js");
  run("src/iam-menu-catalog.js");
  window.BaigeIamMenuCatalog = {
    ...window.BaigeIamMenuCatalog,
    groups: () => groups,
    expand: keys => keys.flatMap(key => {
      const children = groups.flatMap(group => group.items).filter(item => item.legacyKey === key);
      return children.length ? children.map(item => item.key) : [key];
    }),
  };
  run("src/pages/iam-role-menu-picker.js");
  const picker = window.BaigeIamRoleMenuPicker.mount(target, { selected, disabled });
  const keys = () => [...picker.keys()];
  const click = (action, branch) => events.click({ target: {
    closest: () => ({ dataset: { roleMenuAction: action, roleMenuBranch: branch } }),
  } });
  const check = (key, checked, branch = false) => events.change({ target: {
    dataset: branch ? { roleMenuGroup: key } : { roleMenuKey: key },
    checked,
  } });
  const search = (value) => {
    const input = target.querySelector("[data-role-menu-search]");
    input.value = value;
    input.events.input();
  };
  return { keys, click, check, search, target };
}

test("retains broad legacy coverage until only some descendants are checked", () => {
  const picker = mount({ selected: ["qa", "tools", "review", "retired-menu"] });
  assert.deepEqual(picker.keys().sort(), ["qa", "retired-menu", "review", "tools"]);
  picker.check("smart-tools:OCR识别", false);
  assert.deepEqual(picker.keys().sort(), ["qa", "retired-menu", "review", "smart-tools:文档翻译"]);
  picker.check("qa:智能问数", true);
  assert.ok(picker.keys().includes("qa:智能问数"));
  picker.check("smart-tools:OCR识别", true);
  assert.ok(picker.keys().includes("tools"));
});

test("leaves an untouched role's mixed legacy and explicit storage keys intact", () => {
  const selected = ["smart-tools:OCR识别", "tools", "review"];
  const picker = mount({ selected });
  assert.deepEqual(picker.keys(), selected);
  picker.check("qa:智能问数", true);
  picker.check("qa:智能问数", false);
  assert.deepEqual(picker.keys(), selected);
});

test("bulk selection edits visible permissions and keeps locked grants", () => {
  const picker = mount({ selected: ["review", "retired-menu"] });
  picker.click("select-all");
  assert.deepEqual(picker.keys().sort(), [
    "qa:对话", "qa:智能问数", "retired-menu", "review", "smart-tools:OCR识别", "smart-tools:文档翻译",
  ]);
  picker.click("clear");
  assert.deepEqual(picker.keys().sort(), ["retired-menu", "review"]);
  picker.check("review", false);
  assert.deepEqual(picker.keys().sort(), ["retired-menu", "review"]);
});

test("a read-only editor cannot modify any grants", () => {
  const picker = mount({ selected: ["qa"], disabled: true });
  picker.click("select-all");
  picker.check("qa:对话", false);
  assert.deepEqual(picker.keys(), ["qa"]);
});

test("the default home entry is shown checked without submitting it as a grant", () => {
  const picker = mount();
  assert.match(picker.target.querySelector("[data-role-menu-tree]").innerHTML, /data-role-menu-key="home"[^>]* checked disabled/);
  picker.click("select-all");
  assert.ok(!picker.keys().includes("home"));
});

test("unlinking parent controls leaves each child independently selectable", () => {
  const picker = mount();
  picker.check("research/qa", true, true);
  assert.deepEqual(picker.keys(), ["qa:对话", "qa:智能问数"]);
  picker.click("link");
  picker.check("research/qa", false, true);
  assert.deepEqual(picker.keys(), ["qa:对话", "qa:智能问数"]);
  picker.check("qa:智能问数", false);
  assert.deepEqual(picker.keys(), ["qa:对话"]);
});

test("bulk select in search only grants matching menus", () => {
  const picker = mount({ selected: ["qa"] });
  picker.search("OCR");
  picker.check("tools/smart-tools", true, true);
  assert.deepEqual(picker.keys().sort(), ["qa", "smart-tools:OCR识别"]);
  picker.check("tools/smart-tools", false, true);
  picker.click("select-all");
  assert.deepEqual(picker.keys().sort(), ["qa", "smart-tools:OCR识别"]);
  picker.click("clear");
  assert.deepEqual(picker.keys(), []);
});
