/* 分类归属配置：一份类型库 + 部门与类型的多选归属。
   类型库负责增删类型；部门「类型管理」从类型库多选，勾选即由本部门负责。
   文件管理、权限管理、上传向导与前台分类共用这份配置。 */
(() => {
  "use strict";

  const KEY = "baige.library.category-owner.v1";
  const DEPARTMENTS = ["经济研究中心", "动力研究院", "技术经济中心", "船级社规范所", "国际航运研究中心", "情报研究所"];
  // 初始类型库，首次进入沿用既有分工。
  const SEED = {
    智库成果: "经济研究中心",
    船舶标准: "船级社规范所",
    行业专利: "技术经济中心",
    三方研报: "经济研究中心",
    规则规范: "情报研究所",
    专业书籍: "情报研究所",
    期刊论文: "情报研究所",
    其他: "情报研究所",
  };
  // 平台指定人员（演示身份 id）。
  const PLATFORM_EDITORS = ["admin", "iam-admin"];
  const TYPE_MIN = 2;
  const TYPE_MAX = 12;

  const stamp = () => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };

  const clean = (value) => String(value == null ? "" : value).trim();

  function read() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { stored = null; }
    const seedTypes = Object.keys(SEED);
    let types;
    if (stored && Array.isArray(stored.types)) {
      // 新结构里类型库是权威来源，删除过的类型不会再回来。
      types = [];
      stored.types.forEach((name) => {
        const value = clean(name);
        if (value && !types.includes(value)) types.push(value);
      });
    } else {
      // 旧结构只有 owners：以种子为底，把自定义类型追加在后。
      types = seedTypes.slice();
      Object.keys((stored && stored.owners) || {}).forEach((name) => {
        if (!types.includes(name)) types.push(name);
      });
    }
    const owners = {};
    types.forEach((name) => {
      const value = stored && stored.owners ? stored.owners[name] : SEED[name];
      owners[name] = DEPARTMENTS.includes(value) ? value : "";
    });
    const version = stored && Number(stored.version) ? Number(stored.version) : 1;
    return {
      version,
      types,
      owners,
      changes: stored && Array.isArray(stored.changes) ? stored.changes : [],
      updatedAt: (stored && stored.updatedAt) || "",
      updatedBy: (stored && stored.updatedBy) || "",
    };
  }

  const types = () => read().types.slice();
  const categories = () => types();
  const all = () => ({ ...read().owners });
  const ownerFor = (name) => read().owners[name] || "";
  const categoriesFor = (dept) => types().filter((name) => ownerFor(name) === dept);
  const managers = () => DEPARTMENTS.filter((dept) => categoriesFor(dept).length).map((dept) => ({ dept, categories: categoriesFor(dept) }));
  const unassigned = () => types().filter((name) => !ownerFor(name));
  const snapshot = () => {
    const data = read();
    return { version: data.version, types: data.types.slice(), owners: { ...data.owners } };
  };
  const changes = (limit = 3) => read().changes.slice(-limit).reverse();
  const canConfigure = (actor) => {
    if (actor && typeof actor === "object") {
      if (actor.kind === "admin") return true;
      if (actor.kind && actor.kind !== "admin") return false;
      return PLATFORM_EDITORS.includes(String(actor.id || ""));
    }
    return PLATFORM_EDITORS.includes(String(actor || ""));
  };

  function guardVersion(data, expectedVersion) {
    if (expectedVersion != null && Number(expectedVersion) !== data.version) {
      const error = new Error("配置已被其他人员更新");
      error.code = "conflict";
      throw error;
    }
  }

  function guardName(data, value) {
    const length = Array.from(value).length;
    if (!value) {
      const error = new Error("请填写类型名称");
      error.field = "name";
      throw error;
    }
    if (length < TYPE_MIN || length > TYPE_MAX) {
      const error = new Error(`类型名称需 ${TYPE_MIN}–${TYPE_MAX} 个字`);
      error.field = "name";
      throw error;
    }
    if (data.types.includes(value)) {
      const error = new Error("该类型已存在");
      error.field = "name";
      throw error;
    }
  }

  function persist(data, detail) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* file:// 或隐私模式 */ }
    window.dispatchEvent(new CustomEvent("baige:library-category", { detail }));
  }

  function touch(data, options) {
    data.version += 1;
    data.updatedAt = stamp();
    data.updatedBy = options.by || "";
  }

  /* 类型库：新增一个类型，默认未分配，等某个部门勾选。 */
  function addType(name, options = {}) {
    const value = clean(name);
    const data = read();
    guardName(data, value);
    guardVersion(data, options.expectedVersion);
    data.types.push(value);
    data.owners[value] = "";
    touch(data, options);
    data.changes = [...data.changes, { action: "create", at: data.updatedAt, by: data.updatedBy, category: value, from: "", to: "" }].slice(-50);
    persist(data, { action: "create", category: value });
    return snapshot();
  }

  /* 类型库：删除一个类型，连同它的归属一起移除。 */
  function removeType(name, options = {}) {
    const value = clean(name);
    const data = read();
    if (!data.types.includes(value)) throw new Error("类型不存在");
    guardVersion(data, options.expectedVersion);
    const from = data.owners[value] || "";
    data.types = data.types.filter((item) => item !== value);
    delete data.owners[value];
    touch(data, options);
    data.changes = [...data.changes, { action: "delete", at: data.updatedAt, by: data.updatedBy, category: value, from, to: "" }].slice(-50);
    persist(data, { action: "delete", category: value, from });
    return snapshot();
  }

  /* 部门「类型管理」：一次提交多选结果。勾选的归本部门，取消勾选的转为未分配。 */
  function setDepartmentTypes(dept, list, options = {}) {
    if (!DEPARTMENTS.includes(dept)) throw new Error("未知部门");
    const data = read();
    guardVersion(data, options.expectedVersion);
    const selected = new Set((Array.isArray(list) ? list : []).filter((name) => data.types.includes(name)));
    const entries = [];
    data.types.forEach((name) => {
      const current = data.owners[name] || "";
      if (selected.has(name)) {
        if (current !== dept) {
          data.owners[name] = dept;
          entries.push({ action: "assign", category: name, from: current, to: dept });
        }
        return;
      }
      if (current === dept) {
        data.owners[name] = "";
        entries.push({ action: "unassign", category: name, from: dept, to: "" });
      }
    });
    if (!entries.length) return snapshot();
    touch(data, options);
    data.changes = [...data.changes, ...entries.map((entry) => ({ ...entry, at: data.updatedAt, by: data.updatedBy }))].slice(-50);
    persist(data, { dept, entries });
    return snapshot();
  }

  /* 单个类型直接改归属，供既有调用与测试使用。 */
  function setOwner(category, dept, options = {}) {
    const data = read();
    if (!data.types.includes(category)) throw new Error("未知类型");
    if (!DEPARTMENTS.includes(dept)) throw new Error("未知归属部门");
    guardVersion(data, options.expectedVersion);
    const from = data.owners[category] || "";
    if (from === dept) return snapshot();
    data.owners[category] = dept;
    touch(data, options);
    data.changes = [...data.changes, { action: "move", at: data.updatedAt, by: data.updatedBy, category, from, to: dept }].slice(-50);
    persist(data, { action: "move", category, from, to: dept });
    return snapshot();
  }

  function reset() {
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  }

  window.BaigeLibraryCategoryStore = Object.freeze({
    KEY, DEPARTMENTS, SEED, PLATFORM_EDITORS, TYPE_MIN, TYPE_MAX,
    types, categories, all, ownerFor, categoriesFor, managers, unassigned, snapshot, changes, canConfigure,
    addType, removeType, setDepartmentTypes, setOwner, reset,
  });
})();
