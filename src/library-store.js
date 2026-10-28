(() => {
  "use strict";

  const DOC_KEY = "baige.library.docs.v3";
  const DEPT_KEY = "baige.library.dept.v1";
  const MANAGE_KEY = "baige.library.manage-dept.v1";
  const USER_KEY = "baige.library.user.v1";
  const DEPARTMENTS = ["经济研究中心", "动力研究院", "技术经济中心", "船级社规范所", "国际航运研究中心", "情报研究所"];
  // Four departments run 百舸文库; the other organization departments stay as authorization targets.
  const LIBRARY_MANAGERS = [
    { label: "经研中心", dept: "经济研究中心", types: ["智库成果", "三方研报"] },
    { label: "标准中心", dept: "船级社规范所", types: ["船舶标准"] },
    { label: "知产中心", dept: "技术经济中心", types: ["行业专利"] },
    { label: "数智中心", dept: "情报研究所", types: ["规则规范", "专业书籍", "期刊论文", "其他"] },
  ];
  const PEOPLE = [
    { id: "eco-1", name: "张海宁", dept: "经济研究中心" },
    { id: "eco-2", name: "李明远", dept: "经济研究中心" },
    { id: "eco-3", name: "王振国", dept: "经济研究中心" },
    { id: "power-1", name: "陈晓峰", dept: "动力研究院" },
    { id: "power-2", name: "刘洋", dept: "动力研究院" },
    { id: "power-3", name: "周慕云", dept: "动力研究院" },
    { id: "tech-1", name: "赵启明", dept: "技术经济中心" },
    { id: "tech-2", name: "孙倩", dept: "技术经济中心" },
    { id: "tech-3", name: "郑海", dept: "技术经济中心" },
    { id: "class-1", name: "徐立", dept: "船级社规范所" },
    { id: "class-2", name: "高远", dept: "船级社规范所" },
    { id: "class-3", name: "韩雪", dept: "船级社规范所" },
    { id: "intl-1", name: "E. Roberts", dept: "国际航运研究中心" },
    { id: "intl-2", name: "林嘉", dept: "国际航运研究中心" },
    { id: "intl-3", name: "宋宁", dept: "国际航运研究中心" },
    { id: "intel-1", name: "罗文", dept: "情报研究所" },
    { id: "intel-2", name: "蒋欣", dept: "情报研究所" },
    { id: "intel-3", name: "何静", dept: "情报研究所" },
  ];
  const FALLBACK_CATEGORIES = ["智库成果", "船舶标准", "行业专利", "三方研报", "规则规范", "专业书籍", "期刊论文", "其他"];
  const CATEGORIES = (window.BaigeLibraryData?.categories || []).map((item) => item.name);
  const TYPES = CATEGORIES.length ? CATEGORIES : FALLBACK_CATEGORIES;
  const PERMISSION_TITLES = [
    "2026年全球造船业市场展望", "IMO 2050碳减排目标评估", "液化天然气动力船舶推进技术",
    "船舶绿色化转型路径研究", "智能船舶系统集成测试规范", "海事数字化转型案例集",
    "船舶金融市场动态研究", "全球海运格局影响分析", "船用低速机排放测试规范",
    "绿色甲醇燃料供应体系", "船舶配套产业链调研报告", "人工智能辅助设计风险工具",
  ];
  const ORGS = ["中船集团经济研究中心", "中船动力研究院", "中国船级社", "艾瑞咨询", "国际海事研究机构", "中船重工技术经济中心"];
  const AUTHORS = ["张海宁", "李明远", "王振国", "陈晓峰", "刘洋", "E. Roberts", "课题组", "周慕云"];

  let cache = null;

  function readStorage(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch { /* file:// or private mode */ }
  }
  function blankPermissions() {
    return Object.fromEntries(DEPARTMENTS.map((dept) => [dept, 3]));
  }
  function limitedPermissions(ownerDept) {
    return Object.fromEntries(DEPARTMENTS.map((dept) => [dept, dept === ownerDept ? 3 : 0]));
  }
  function normalizePermissions(value) {
    return { ...blankPermissions(), ...(value && typeof value === "object" ? value : {}) };
  }
  function normalizeExpiry(value) {
    return Object.fromEntries(DEPARTMENTS.map((dept) => [dept, value && value[dept] ? String(value[dept]) : null]));
  }
  function normalizePersonMap(value) {
    return value && typeof value === "object" ? { ...value } : {};
  }
  function managerForCategory(category) {
    return LIBRARY_MANAGERS.find((manager) => manager.types.includes(category)) || LIBRARY_MANAGERS[LIBRARY_MANAGERS.length - 1];
  }
  function normalizeDoc(doc, id) {
    const category = TYPES.includes(doc.category) ? doc.category : "其他";
    const ownerDept = managerForCategory(category).dept;
    const previousOwner = DEPARTMENTS.includes(doc.ownerDept) ? doc.ownerDept : "";
    const accessMode = doc.accessMode === "limited" ? "limited" : "public";
    const permissions = doc.permissions
      ? normalizePermissions(doc.permissions)
      : accessMode === "limited" ? limitedPermissions(ownerDept) : blankPermissions();
    const permissionExpiry = normalizeExpiry(doc.permissionExpiry);
    // Re-home documents by their type and keep the responsible department's owner access.
    if (previousOwner !== ownerDept) {
      permissions[ownerDept] = Math.max(3, Number(permissions[ownerDept]) || 0);
      if (previousOwner) {
        if (accessMode === "limited" && Number(permissions[previousOwner]) === 3) permissions[previousOwner] = 0;
        if (Number(permissions[previousOwner]) === 0) permissionExpiry[previousOwner] = null;
      }
      permissionExpiry[ownerDept] = null;
    }
    return {
      id,
      title: String(doc.title || "").trim(),
      category,
      source: doc.source === "upload" ? "upload" : "crawl",
      sourceLabel: doc.source === "upload" ? "部门上传" : "爬虫公开",
      ownerDept,
      accessMode,
      org: doc.org || "船舶研究院",
      author: doc.author || "系统管理员",
      date: doc.date || "2026-01-01",
      docType: doc.docType || "报告",
      fileType: doc.fileType === "pdf" ? "pdf" : "doc",
      version: doc.version || "V1.0.0",
      strategy: doc.strategy || "通用解析策略",
      parseStatus: doc.parseStatus || "parsed",
      secretStatus: doc.secretStatus || "passed",
      hot: Number(doc.hot) || 0,
      abstract: doc.abstract || "",
      origin: doc.origin || "library",
      permissions,
      permissionExpiry,
      personPermissions: normalizePersonMap(doc.personPermissions),
      personPermissionExpiry: normalizePersonMap(doc.personPermissionExpiry),
    };
  }

  function buildSeed() {
    const docs = [];
    const seen = new Set();
    const add = (doc) => {
      const title = String(doc.title || "").trim();
      const key = title.toLowerCase();
      if (!title || seen.has(key)) return;
      seen.add(key);
      const ownerDept = doc.ownerDept || DEPARTMENTS[docs.length % DEPARTMENTS.length];
      const accessMode = doc.accessMode === "limited" ? "limited" : "public";
      docs.push(normalizeDoc({ ...doc, title, ownerDept, accessMode }, docs.length + 1));
    };

    (window.BaigeLibraryData?.docs || []).forEach((doc) => {
      const title = doc.t;
      add({
        title,
        category: doc.cat,
        source: "crawl",
        sourceLabel: "爬虫公开",
        accessMode: "public",
        org: doc.org,
        author: doc.author,
        date: doc.date,
        docType: doc.type || "报告",
        fileType: /pdf|报告|分析|研究|规范|标准|专利|综述|白皮书|手册|规则|指南/.test(title) ? "pdf" : "doc",
        hot: doc.hot,
        abstract: doc.abstract,
        origin: "library",
      });
    });

    for (let i = 0; i < 40; i += 1) {
      const isCrawl = i % 3 !== 0;
      const repeat = i >= PERMISSION_TITLES.length ? `（第${Math.floor(i / PERMISSION_TITLES.length) + 1}辑）` : "";
      add({
        title: PERMISSION_TITLES[i % PERMISSION_TITLES.length] + repeat,
        category: TYPES[i % TYPES.length],
        source: isCrawl ? "crawl" : "upload",
        sourceLabel: isCrawl ? "爬虫公开" : "部门上传",
        accessMode: i % 4 === 0 ? "limited" : "public",
        org: ORGS[i % ORGS.length],
        author: AUTHORS[i % AUTHORS.length],
        date: `2026-0${(i % 8) + 1}-0${(i % 9) + 1}`,
        docType: isCrawl ? "公开文档" : "部门文档",
        fileType: i % 2 ? "pdf" : "doc",
        hot: 0,
        abstract: `${isCrawl ? "爬虫平台公开" : "部门上传"}文档，主题为${TYPES[i % TYPES.length]}。`,
        origin: "permission",
      });
    }

    [
      { title: "测试文档_A.docx", category: "其他", source: "upload", fileType: "doc", org: "船舶研究院", author: "系统管理员", date: "2026-07-03" },
      { title: "船舶设计规范汇编.pdf", category: "船舶标准", source: "crawl", fileType: "pdf", org: "中国船级社", author: "系统管理员", date: "2026-07-03" },
      { title: "2026全球造船市场动态.pdf", category: "三方研报", source: "crawl", fileType: "pdf", org: "国际海事研究机构", author: "系统管理员", date: "2026-07-03" },
    ].forEach((item) => add({
      ...item,
      sourceLabel: item.source === "upload" ? "部门上传" : "爬虫公开",
      accessMode: "public",
      docType: "文件",
      hot: 0,
      abstract: "文件管理中的演示文档，已纳入统一文库数据。",
      origin: "file",
    }));

    return docs;
  }

  function validateStored(list) {
    return Array.isArray(list) && list.every((doc) => doc && typeof doc.title === "string" && doc.title.trim());
  }

  function effectiveLevel(doc, dept) {
    if (!doc || !dept) return 0;
    const level = Number(doc.permissions?.[dept] ?? 0);
    if (level <= 0) return 0;
    const expiry = doc.permissionExpiry?.[dept];
    if (expiry && Date.parse(expiry) <= Date.now()) return 0;
    return level;
  }

  function effectivePersonLevel(doc, personId) {
    if (!doc || !personId) return 0;
    const level = Number(doc.personPermissions?.[personId] ?? 0);
    if (level <= 0) return 0;
    const expiry = doc.personPermissionExpiry?.[personId];
    if (expiry && Date.parse(expiry) <= Date.now()) return 0;
    return level;
  }

  function effectiveAccessLevel(doc, dept, personId) {
    return Math.max(effectiveLevel(doc, dept), effectivePersonLevel(doc, personId));
  }

  function purgeExpired(save = true) {
    if (!cache) return 0;
    let changed = 0;
    const now = Date.now();
    cache.forEach((doc) => {
      DEPARTMENTS.forEach((dept) => {
        const expiry = doc.permissionExpiry?.[dept];
        if (!expiry || Number(doc.permissions?.[dept] || 0) <= 0) return;
        if (Date.parse(expiry) <= now) {
          doc.permissions[dept] = 0;
          doc.permissionExpiry[dept] = null;
          changed += 1;
        }
      });
      PEOPLE.forEach((person) => {
        const expiry = doc.personPermissionExpiry?.[person.id];
        if (!expiry || Number(doc.personPermissions?.[person.id] || 0) <= 0) return;
        if (Date.parse(expiry) <= now) {
          doc.personPermissions[person.id] = 0;
          doc.personPermissionExpiry[person.id] = null;
          changed += 1;
        }
      });
    });
    if (changed && save) persist();
    return changed;
  }

  function loadDocs() {
    if (cache) return cache;
    const raw = readStorage(DOC_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (validateStored(parsed)) {
          cache = parsed.map((doc, index) => normalizeDoc(doc, Number(doc.id) || index + 1));
          if (purgeExpired(false)) persist();
          return cache;
        }
      } catch { /* rebuild below */ }
    }
    cache = buildSeed();
    persist();
    return cache;
  }

  function persist() {
    if (!cache) return;
    writeStorage(DOC_KEY, JSON.stringify(cache));
    if (typeof window.dispatchEvent === "function" && typeof CustomEvent === "function") {
      window.dispatchEvent(new CustomEvent("baige:library-store", { detail: { docs: cache } }));
    }
  }

  function getCurrentDept() {
    const value = readStorage(DEPT_KEY);
    return DEPARTMENTS.includes(value) ? value : DEPARTMENTS[0];
  }
  function setCurrentDept(dept) {
    if (!DEPARTMENTS.includes(dept)) return;
    writeStorage(DEPT_KEY, dept);
    const current = readStorage(USER_KEY);
    if (!PEOPLE.some((person) => person.id === current && person.dept === dept)) {
      const first = PEOPLE.find((person) => person.dept === dept);
      if (first) writeStorage(USER_KEY, first.id);
    }
  }
  function peopleForDept(dept) {
    return PEOPLE.filter((person) => person.dept === dept);
  }
  function managerTypes(dept) {
    const manager = LIBRARY_MANAGERS.find((item) => item.dept === dept);
    return manager ? manager.types.slice() : [];
  }
  function managerLabel(dept) {
    const manager = LIBRARY_MANAGERS.find((item) => item.dept === dept);
    return manager ? manager.label : dept;
  }
  function getManageDept() {
    const stored = readStorage(MANAGE_KEY);
    if (LIBRARY_MANAGERS.some((manager) => manager.dept === stored)) return stored;
    const current = getCurrentDept();
    if (LIBRARY_MANAGERS.some((manager) => manager.dept === current)) return current;
    return LIBRARY_MANAGERS[0].dept;
  }
  function setManageDept(dept) {
    if (!LIBRARY_MANAGERS.some((manager) => manager.dept === dept)) return;
    writeStorage(MANAGE_KEY, dept);
  }
  // Department uploads are only visible to, and manageable by, their owning department.
  function uploadsForDept(dept) {
    if (!DEPARTMENTS.includes(dept)) return [];
    return loadDocs().filter((doc) => doc.source === "upload" && doc.ownerDept === dept);
  }
  // Permission management also covers crawled documents of the department's types.
  function managedDocs(dept) {
    const manager = LIBRARY_MANAGERS.find((item) => item.dept === dept);
    if (!manager) return [];
    return loadDocs().filter((doc) => doc.ownerDept === dept && manager.types.includes(doc.category));
  }
  function canManageDoc(id, dept) {
    const manager = LIBRARY_MANAGERS.find((item) => item.dept === dept);
    if (!manager) return false;
    const doc = loadDocs().find((item) => Number(item.id) === Number(id));
    return Boolean(doc && doc.source === "upload" && doc.ownerDept === dept && manager.types.includes(doc.category));
  }
  function getCurrentUser() {
    const dept = getCurrentDept();
    const current = readStorage(USER_KEY);
    const person = PEOPLE.find((item) => item.id === current && item.dept === dept);
    return person ? person.id : (PEOPLE.find((item) => item.dept === dept)?.id || "");
  }
  function setCurrentUser(id) {
    const person = PEOPLE.find((item) => item.id === id);
    if (!person) return;
    writeStorage(USER_KEY, id);
    writeStorage(DEPT_KEY, person.dept);
  }

  function addDocs(items) {
    const docs = loadDocs();
    let nextId = docs.reduce((max, doc) => Math.max(max, Number(doc.id) || 0), 0) + 1;
    const created = items.map((item) => {
      const title = String(item.title || item.name || "未命名文档").trim();
      const ownerDept = DEPARTMENTS.includes(item.ownerDept) ? item.ownerDept : getCurrentDept();
      const accessMode = item.accessMode === "limited" ? "limited" : "public";
      return normalizeDoc({
        ...item,
        title,
        ownerDept,
        accessMode,
        date: item.date || "2026-08-12",
        source: item.source || "upload",
        category: item.category || "其他",
        docType: item.docType || "文件",
        origin: item.origin || "upload",
        permissions: item.permissions || (accessMode === "limited" ? limitedPermissions(ownerDept) : blankPermissions()),
      }, nextId++);
    });
    docs.unshift(...created);
    persist();
    return created;
  }

  function updateDoc(id, patch) {
    const doc = loadDocs().find((item) => Number(item.id) === Number(id));
    if (!doc) return null;
    Object.assign(doc, patch);
    if (patch && patch.permissions) doc.permissions = normalizePermissions(patch.permissions);
    if (patch && patch.permissionExpiry) doc.permissionExpiry = normalizeExpiry(patch.permissionExpiry);
    if (patch && patch.personPermissions) doc.personPermissions = normalizePersonMap(patch.personPermissions);
    if (patch && patch.personPermissionExpiry) doc.personPermissionExpiry = normalizePersonMap(patch.personPermissionExpiry);
    persist();
    return doc;
  }

  function setPermissions(ids, dept, level, expiresAt = null) {
    const set = new Set((ids || []).map(Number));
    const value = Math.max(0, Math.min(4, Number(level) || 0));
    const expiry = value > 0 && expiresAt && !Number.isNaN(Date.parse(expiresAt)) ? new Date(expiresAt).toISOString() : null;
    let count = 0;
    loadDocs().forEach((doc) => {
      if (!set.has(Number(doc.id))) return;
      doc.permissions = { ...normalizePermissions(doc.permissions), [dept]: value };
      doc.permissionExpiry = { ...normalizeExpiry(doc.permissionExpiry), [dept]: expiry };
      count += 1;
    });
    persist();
    return count;
  }

  function setPersonPermissions(ids, personId, level, expiresAt = null) {
    const set = new Set((ids || []).map(Number));
    const value = Math.max(0, Math.min(4, Number(level) || 0));
    const expiry = value > 0 && expiresAt && !Number.isNaN(Date.parse(expiresAt)) ? new Date(expiresAt).toISOString() : null;
    let count = 0;
    loadDocs().forEach((doc) => {
      if (!set.has(Number(doc.id))) return;
      doc.personPermissions = { ...normalizePersonMap(doc.personPermissions), [personId]: value };
      doc.personPermissionExpiry = { ...normalizePersonMap(doc.personPermissionExpiry), [personId]: expiry };
      count += 1;
    });
    persist();
    return count;
  }

  function removeDocs(ids) {
    const set = new Set((ids || []).map(Number));
    const docs = loadDocs();
    const kept = docs.filter((doc) => !set.has(Number(doc.id)));
    const removed = docs.length - kept.length;
    if (removed) {
      cache = kept;
      persist();
    }
    return removed;
  }

  function reset() {
    cache = buildSeed();
    persist();
    return cache;
  }

  window.BaigeLibraryStore = Object.freeze({
    categories: TYPES,
    departments: DEPARTMENTS.slice(),
    managers: LIBRARY_MANAGERS.map(({ label, dept, types }) => ({ label, dept, types: types.slice() })),
    people: PEOPLE.map((person) => ({ ...person })),
    peopleForDept,
    managerForCategory,
    managerTypes,
    managerLabel,
    getManageDept,
    setManageDept,
    uploadsForDept,
    managedDocs,
    canManageDoc,
    loadDocs,
    getDoc: (id) => loadDocs().find((doc) => Number(doc.id) === Number(id)) || null,
    addDocs,
    updateDoc,
    setPermissions,
    setPersonPermissions,
    removeDocs,
    getCurrentDept,
    setCurrentDept,
    getCurrentUser,
    setCurrentUser,
    effectiveLevel,
    effectivePersonLevel,
    effectiveAccessLevel,
    purgeExpired,
    reset,
  });
})();
