const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8");

/* 用一个共享的内存 localStorage 装载「分类归属」与「文库」两个数据层。 */
function boot() {
  const memory = new Map();
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const listeners = new Map();
  const window = {
    dispatchEvent(event) { (listeners.get(event.type) || []).forEach((handler) => handler(event)); },
    addEventListener(type, handler) { listeners.set(type, [...(listeners.get(type) || []), handler]); },
    BaigeLibraryData: { categories: ["智库成果", "船舶标准", "行业专利", "三方研报", "规则规范", "专业书籍", "期刊论文", "其他"].map((name) => ({ name })), docs: [] },
  };
  const localStorage = {
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const context = vm.createContext({ window, localStorage, console, JSON, Math, Number, String, Object, Array, Date, Set, CustomEvent, setTimeout, clearTimeout });
  vm.runInContext(read("src/library-category-store.js"), context, { filename: "library-category-store.js" });
  vm.runInContext(read("src/library-store.js"), context, { filename: "library-store.js" });
  return { categories: window.BaigeLibraryCategoryStore, library: window.BaigeLibraryStore, memory };
}

test("后台「百舸文库」下并列新增分类归属入口", () => {
  const html = read("admin.html");
  assert.match(html, /百舸文库[\s\S]*data-admin-view="files"[\s\S]*data-admin-view="perm"[\s\S]*data-admin-view="category"/);
  assert.match(html, /data-admin-view="category"[\s\S]{0,140}分类归属/);
  const js = read("admin.js");
  assert.match(js, /category: \{ src: "pages\/library-category\.html\?embed=admin/);
  assert.match(js, /next === "category"\) src \+= `&actor=/);
});

test("页面是部门列表 + 全局类型管理 + 行内多选", () => {
  const html = read("pages/library-category.html");
  for (const token of ["分类归属", "部门", "负责类型", "操作", "类型管理", "新增类型", "未分配", "最近调整"]) {
    assert.ok(html.includes(token), token);
  }
  // 不再是按部门分组的分类表
  assert.doesNotMatch(html, /文档数量/);
  assert.doesNotMatch(html, /调整归属/);

  const page = read("src/pages/library-category.js");
  assert.match(page, /store\.DEPARTMENTS\.map/);
  assert.match(page, /data-manage/);
  assert.match(page, /store\.setDepartmentTypes/);
  assert.match(page, /store\.addType/);
  assert.match(page, /store\.removeType/);
  assert.match(page, /querySelectorAll\('input\[type="checkbox"\]:checked'\)/);
  assert.match(page, /暂不能删除/);
  assert.match(html, /src\/library-category-store\.js/);
  assert.match(html, /src\/library-store\.js/);
});

test("首次进入沿用现有分工，一个部门可负责多个类型", () => {
  const { categories, library } = boot();
  const owners = categories.all();
  assert.equal(owners["智库成果"], "经济研究中心");
  assert.equal(owners["三方研报"], "经济研究中心");
  assert.equal(owners["船舶标准"], "船级社规范所");
  assert.equal(owners["行业专利"], "技术经济中心");
  assert.equal(owners["其他"], "情报研究所");
  assert.equal(categories.types().length, 8);
  assert.deepEqual(Array.from(categories.categoriesFor("情报研究所")), ["规则规范", "专业书籍", "期刊论文", "其他"]);
  assert.deepEqual(Array.from(library.managerTypes("经济研究中心")), ["智库成果", "三方研报"]);
});

test("类型库可新增类型，新增后默认未分配", () => {
  const { categories, library } = boot();
  categories.addType("试验数据", { by: "平台管理员" });
  assert.ok(categories.types().includes("试验数据"));
  assert.equal(categories.types()[categories.types().length - 1], "试验数据", "新类型排在类型库末尾");
  assert.equal(categories.ownerFor("试验数据"), "", "新增类型默认未分配");
  assert.deepEqual(Array.from(categories.unassigned()), ["试验数据"]);
  assert.equal(library.managerTypes("动力研究院").includes("试验数据"), false, "未分配类型不进入上传向导");

  const last = categories.changes(1)[0];
  assert.equal(last.action, "create");
  assert.equal(last.category, "试验数据");
});

test("类型库可删除类型，已分配的类型一并移除归属", () => {
  const { categories } = boot();
  categories.addType("试验数据");
  categories.setDepartmentTypes("动力研究院", ["试验数据"]);
  assert.equal(categories.ownerFor("试验数据"), "动力研究院");

  categories.removeType("试验数据", { by: "平台管理员" });
  assert.equal(categories.types().includes("试验数据"), false);
  assert.equal(categories.all()["试验数据"], undefined, "归属记录随类型一起删除");
  assert.equal(categories.changes(1)[0].action, "delete");
});

test("部门类型管理多选：勾选归本部门，取消勾选转为未分配", () => {
  const { categories, library } = boot();
  // 经济研究中心原本负责智库成果、三方研报；改为只保留智库成果，并接收船舶标准
  const before = categories.snapshot().version;
  const after = categories.setDepartmentTypes("经济研究中心", ["智库成果", "船舶标准"], { by: "平台管理员", expectedVersion: before });

  assert.equal(after.owners["智库成果"], "经济研究中心");
  assert.equal(after.owners["三方研报"], "", "取消勾选的类型转为未分配");
  assert.equal(after.owners["船舶标准"], "经济研究中心", "勾选其他部门的类型时转移过来");
  assert.equal(after.version, before + 1);
  assert.deepEqual(Array.from(categories.categoriesFor("经济研究中心")), ["智库成果", "船舶标准"]);
  assert.equal(library.managerTypes("经济研究中心").includes("船舶标准"), true);
  assert.equal(library.managerTypes("船级社规范所").includes("船舶标准"), false, "原部门不再负责");
});

test("未分配类型沿用原部门管理已有文档", () => {
  const { categories, library } = boot();
  const [doc] = library.addDocs([{ title: "智库成果汇编", category: "智库成果", source: "upload" }]);
  assert.equal(library.getDoc(doc.id).ownerDept, "经济研究中心");

  categories.setDepartmentTypes("经济研究中心", ["三方研报"]);
  const after = library.getDoc(doc.id);
  assert.equal(categories.ownerFor("智库成果"), "", "类型已改为未分配");
  assert.equal(after.ownerDept, "经济研究中心", "已有文档仍由原部门管理");
  assert.equal(library.effectiveLevel(after, "经济研究中心"), 4);
});

test("新增类型校验名称长度与重名，且不写入配置", () => {
  const { categories } = boot();
  assert.throws(() => categories.addType("  "), /请填写类型名称/);
  assert.throws(() => categories.addType("数"), /2–12 个字/);
  assert.throws(() => categories.addType("一二三四五六七八九十十一十二"), /2–12 个字/);
  assert.throws(() => categories.addType("智库成果"), /该类型已存在/);
  assert.equal(categories.types().length, 8, "校验失败不写入类型库");
});

test("类型库与部门多选都受版本号保护", () => {
  const { categories } = boot();
  const stale = categories.snapshot().version;
  categories.addType("试验数据", { expectedVersion: stale });
  assert.throws(
    () => categories.addType("仿真数据", { expectedVersion: stale }),
    (error) => error.code === "conflict",
  );
  assert.throws(
    () => categories.setDepartmentTypes("动力研究院", ["试验数据"], { expectedVersion: stale }),
    (error) => error.code === "conflict",
  );
  assert.equal(categories.types().includes("仿真数据"), false);
});

test("归属交接后：新部门可下载，原部门失去下载，显式授权保留", () => {
  const { categories, library } = boot();
  const [doc] = library.addDocs([{ title: "交接验证报告", category: "三方研报", source: "upload", accessMode: "public" }]);
  assert.equal(library.effectiveLevel(doc, "经济研究中心"), 4, "原归属部门按归属获得 4 级");
  assert.equal(library.effectiveLevel(doc, "国际航运研究中心"), 3);

  // 另一部门被单独授予 4 级，交接后必须保留。
  library.setPermissions([doc.id], "动力研究院", 4);
  categories.setOwner("三方研报", "国际航运研究中心", { by: "平台管理员" });

  const after = library.getDoc(doc.id);
  assert.equal(library.effectiveLevel(after, "国际航运研究中心"), 4, "新部门接手全文与下载");
  assert.ok(library.effectiveLevel(after, "经济研究中心") < 4, "原部门下载权限收回");
  assert.equal(library.effectiveLevel(after, "动力研究院"), 4, "单独授予的权限不受交接影响");
});

test("有限公开文档交接后原部门只剩试读，新部门正常可读", () => {
  const { categories, library } = boot();
  const [doc] = library.addDocs([{ title: "有限公开研报", category: "智库成果", source: "crawl", accessMode: "limited" }]);
  categories.setOwner("智库成果", "国际航运研究中心", { by: "平台管理员" });

  const after = library.getDoc(doc.id);
  assert.equal(library.isTrialAccess(after, "经济研究中心"), true, "原部门按公开方式转为试读");
  assert.equal(library.isTrialAccess(after, "国际航运研究中心"), false, "新部门不再受限");
  assert.equal(library.effectiveLevel(after, "国际航运研究中心"), 4);
});

test("文件管理与权限管理的可见范围跟随归属", () => {
  const { categories, library } = boot();
  const before = {
    managed: library.managedDocs("经济研究中心").length,
    uploads: library.uploadsForDept("经济研究中心").length,
    total: library.managedDocs("国际航运研究中心").length,
  };
  library.addDocs([
    { title: "智库上传件", category: "智库成果", source: "upload" },
    { title: "智库爬虫件", category: "智库成果", source: "crawl" },
  ]);
  assert.equal(library.managedDocs("经济研究中心").length, before.managed + 2);
  assert.equal(library.uploadsForDept("经济研究中心").length, before.uploads + 1);

  categories.setOwner("智库成果", "国际航运研究中心", { by: "平台管理员" });
  assert.equal(library.managedDocs("经济研究中心").length < before.managed + 2, true, "原部门不再看到该类型");
  assert.equal(library.managedDocs("国际航运研究中心").length > before.total, true, "上传件与爬虫件一并接手");
  assert.equal(library.managerTypes("经济研究中心").includes("智库成果"), false);
  assert.equal(library.managerTypes("国际航运研究中心").includes("智库成果"), true);
});
