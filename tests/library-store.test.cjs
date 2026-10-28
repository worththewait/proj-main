const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStore() {
  const storage = new Map();
  const window = {
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = {
    window,
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
    CustomEvent: class {
      constructor(type, options) { this.type = type; this.detail = options?.detail; }
    },
    console,
  };
  window.localStorage = context.localStorage;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/library-data.js"), "utf8"), context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../src/library-store.js"), "utf8"), context);
  return { store: window.BaigeLibraryStore, storage };
}

test("library store merges home, permission and file seed data", () => {
  const { store } = createStore();
  const docs = Array.from(store.loadDocs());
  assert.equal(docs.length, 67);
  assert.equal(store.departments.length, 6);
  assert.equal(store.people.length, 18);
  assert.equal(store.peopleForDept("经济研究中心").length, 3);
  assert.equal(store.categories.length, 8);
  assert.equal(new Set(docs.map((doc) => doc.title)).size, 67);
  assert.deepEqual(
    docs.reduce((counts, doc) => {
      counts[doc.origin] = (counts[doc.origin] || 0) + 1;
      return counts;
    }, {}),
    { library: 24, permission: 40, file: 3 },
  );
  const limited = docs.filter((doc) => doc.accessMode === "limited");
  assert.equal(limited.length, 10);
  for (const doc of docs) {
    assert.ok(store.departments.includes(doc.ownerDept));
    assert.ok(["public", "limited"].includes(doc.accessMode));
    assert.ok(doc.title && doc.category && doc.fileType);
    if (doc.accessMode === "public") {
      for (const dept of store.departments) assert.equal(doc.permissions[dept], 3);
    } else {
      assert.equal(doc.permissions[doc.ownerDept], 3);
      for (const dept of store.departments) {
        if (dept !== doc.ownerDept) assert.equal(doc.permissions[dept], 0);
      }
    }
  }
});

test("four library managers own document categories by responsibility", () => {
  const { store } = createStore();
  assert.deepEqual(Array.from(store.managers.map((manager) => manager.label)), ["经研中心", "标准中心", "知产中心", "数智中心"]);
  assert.deepEqual(Array.from(store.managers.map((manager) => manager.dept)), ["经济研究中心", "船级社规范所", "技术经济中心", "情报研究所"]);
  assert.deepEqual(Array.from(store.managerTypes("经济研究中心")), ["智库成果", "三方研报"]);
  assert.deepEqual(Array.from(store.managerTypes("船级社规范所")), ["船舶标准"]);
  assert.deepEqual(Array.from(store.managerTypes("技术经济中心")), ["行业专利"]);
  assert.deepEqual(Array.from(store.managerTypes("情报研究所")), ["规则规范", "专业书籍", "期刊论文", "其他"]);
  assert.equal(store.managerForCategory("船舶标准").dept, "船级社规范所");
  assert.equal(store.managerForCategory("其他").dept, "情报研究所");
  assert.equal(store.managerLabel("技术经济中心"), "知产中心");

  const counts = {};
  for (const manager of store.managers) counts[manager.dept] = store.uploadsForDept(manager.dept).length;
  assert.deepEqual(counts, { "经济研究中心": 4, "船级社规范所": 2, "技术经济中心": 1, "情报研究所": 8 });
  for (const doc of store.loadDocs()) {
    assert.equal(doc.ownerDept, store.managerForCategory(doc.category).dept);
  }

  assert.equal(store.getManageDept(), "经济研究中心");
  store.setManageDept("船级社规范所");
  assert.equal(store.getManageDept(), "船级社规范所");
  store.setManageDept("动力研究院");
  assert.equal(store.getManageDept(), "船级社规范所", "non-manager departments are not selectable");
});

test("department management scope only includes uploads owned by that department", () => {
  const { store } = createStore();
  const dept = "经济研究中心";
  const docs = Array.from(store.uploadsForDept(dept));
  assert.ok(docs.length > 0);
  for (const doc of docs) {
    assert.equal(doc.source, "upload");
    assert.equal(doc.ownerDept, dept);
    assert.equal(store.canManageDoc(doc.id, dept), true);
  }
  const crawl = Array.from(store.loadDocs()).find((doc) => doc.source === "crawl" && doc.ownerDept === dept);
  assert.ok(crawl, "the same department can still own crawled documents");
  assert.equal(store.canManageDoc(crawl.id, dept), false);

  const foreign = Array.from(store.loadDocs()).find((doc) => doc.source === "upload" && doc.ownerDept !== dept);
  assert.ok(foreign);
  assert.equal(store.canManageDoc(foreign.id, dept), false);
  assert.deepEqual(Array.from(store.uploadsForDept("不存在的部门")), []);

  store.setCurrentDept("动力研究院");
  assert.equal(store.getCurrentDept(), "动力研究院");
  assert.deepEqual(Array.from(store.uploadsForDept(store.getCurrentDept())), []);
  store.setCurrentDept(dept);
  assert.equal(store.getCurrentDept(), dept);
});

test("library store mutations are shared by permission, file and home views", () => {
  const { store } = createStore();
  const before = store.loadDocs().length;
  const created = store.addDocs([{
    title: "联动测试文档.pdf",
    category: "其他",
    source: "upload",
    fileType: "pdf",
    docType: "文件",
    abstract: "测试上传文档",
  }]);
  assert.equal(store.loadDocs().length, before + 1);
  assert.equal(created[0].permissions["经济研究中心"], 3);

  store.setPermissions([created[0].id], "经济研究中心", 3, "2020-01-01T00:00:00.000Z");
  assert.equal(store.getDoc(created[0].id).permissions["经济研究中心"], 3);
  assert.equal(store.effectiveLevel(store.getDoc(created[0].id), "经济研究中心"), 0);
  assert.equal(store.purgeExpired(), 1);
  assert.equal(store.getDoc(created[0].id).permissions["经济研究中心"], 0);

  store.setPermissions([created[0].id], "经济研究中心", 4);
  assert.equal(store.effectiveLevel(store.getDoc(created[0].id), "经济研究中心"), 4);

  store.updateDoc(created[0].id, { secretStatus: "hit", parseStatus: "unparsed" });
  assert.equal(store.getDoc(created[0].id).secretStatus, "hit");

  store.setPersonPermissions([created[0].id], "power-1", 4);
  assert.equal(store.effectivePersonLevel(store.getDoc(created[0].id), "power-1"), 4);
  assert.equal(store.effectiveAccessLevel(store.getDoc(created[0].id), "动力研究院", "power-1"), 4);
  store.setPersonPermissions([created[0].id], "power-1", 4, "2020-01-01T00:00:00.000Z");
  assert.equal(store.effectivePersonLevel(store.getDoc(created[0].id), "power-1"), 0);
  assert.equal(store.purgeExpired(), 1);

  assert.equal(store.removeDocs([created[0].id]), 1);
  assert.equal(store.getDoc(created[0].id), null);

  store.removeDocs(store.loadDocs().map((doc) => doc.id));
  assert.equal(store.loadDocs().length, 0);
  assert.equal(store.loadDocs().length, 0, "an explicitly emptied store must not reseed");
});
