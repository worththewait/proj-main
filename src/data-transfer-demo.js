(() => {
  "use strict";

  const owners = {
    research: "经济研究中心",
    standards: "船级社规范所",
    patents: "技术经济中心",
    intelligence: "情报研究所",
    cimtec: "中国船舶综合经济技术研究院",
    "eco-1": "张海宁",
  };
  const people = new Map([
    ["eco-1", { name: "张海宁", department: owners.research }],
    ["class-1", { name: "徐立", department: owners.standards }],
    ["intel-1", { name: "罗文", department: owners.intelligence }],
  ]);
  const catalogKinds = [
    { id: "department", label: "部门知识库", ownerIcon: "users" },
    { id: "enterprise", label: "企业知识库", ownerIcon: "globe" },
    { id: "personal", label: "个人知识库", ownerIcon: "user" },
    { id: "library", label: "百舸文库", ownerIcon: "users" },
  ];
  const kinds = new Set(catalogKinds.map(({ id }) => id));
  const departmentKeys = new Set(["research", "standards", "patents", "intelligence"]);
  const ownerTypes = { department: "部门", enterprise: "企业", personal: "用户", library: "管理部门" };
  const file = (name, text) => ({ name, text });
  const grant = (personKey, name, department) => ({ personKey, name, department });

  const items = [
    {
      id: "research-market", name: "船舶市场研究库", kind: "department", owner: owners.research, ownerKey: "research",
      files: [file("船舶市场观察.txt", "演示资料：船舶市场研究框架和资料目录。"), file("航运指数说明.txt", "演示资料：航运指数口径和数据来源说明。"), file("船队更新调研.txt", "演示资料：船队更新访谈提纲。")],
      grants: [grant("class-1", "徐立", owners.standards), grant("intel-1", "罗文", owners.intelligence), grant("ship-4", "周然", "航运研究部")],
    },
    {
      id: "research-international", name: "国际航运专题库", kind: "department", owner: owners.research, ownerKey: "research",
      files: [file("国际航运观察.txt", "演示资料：国际航运专题的资料索引。"), file("航运指数说明.txt", "演示资料：航运指数口径和数据来源说明。")],
    },
    {
      id: "research-green", name: "绿色造船专题库", kind: "department", owner: owners.research, ownerKey: "research",
      files: [
        file("绿色造船访谈纪要.txt", "演示资料：绿色造船主题访谈纪要。"),
        file("甲醇与氨燃料新造船订单观察.txt", "演示资料：按燃料和船型记录订单，区分已签署合同与意向订单。"),
      ],
    },
    {
      id: "standards-safety", name: "船舶规范与标准库", kind: "department", owner: owners.standards, ownerKey: "standards",
      files: [
        file("船舶替代燃料管系审图检查表.txt", "演示资料：汇总燃料供给管路、应急切断和泄漏监测的审图检查点。"),
        file("船舶电池舱通风设计要点.txt", "演示资料：整理机械通风与气体探测设备的布置和核对事项。"),
        file("无人机辅助船体检验记录模板.txt", "演示资料：记录拍摄位置、检验范围和图像编号。"),
      ],
      grants: [grant("eco-1", "张海宁", owners.research), grant("qa-6", "顾悦", "质量技术部")],
    },
    {
      id: "standards-alt-fuel", name: "低闪点燃料船舶专题库", kind: "department", owner: owners.standards, ownerKey: "standards",
      files: [
        file("甲醇燃料加注接口检验清单.txt", "演示资料：列出接口标记、惰化程序和紧急脱离装置的检查项目。"),
        file("船用氨燃料泄漏报警联动核对表.txt", "演示资料：记录报警、通风、隔离和人工确认的联动关系。"),
      ],
    },
    {
      id: "old-ship-project", name: "船型项目资料库", kind: "department", owner: "船型项目组", ownerKey: "ship-project",
      files: [file("船型项目目录.txt", "演示资料：船型项目往期资料目录。")],
    },
    {
      id: "cimtec-rules", name: "企业制度库", kind: "enterprise", owner: owners.cimtec, ownerKey: "cimtec",
      files: [
        file("制度资料清单.txt", "演示资料：企业制度资料的分类清单。"),
        file("科研项目成果归档指南.txt", "演示资料：归档范围包括验收材料、项目摘要和成果登记表。"),
      ],
    },
    {
      id: "zhang-notes", name: "个人工作资料", kind: "personal", owner: owners["eco-1"], ownerKey: "eco-1",
      files: [
        file("调研提纲.txt", "演示资料：行业调研的个人提纲。"),
        file("散货船更新需求访谈笔记.txt", "演示资料：访谈拟追问船龄结构、环保改造成本和融资安排。"),
      ],
    },
    {
      id: "zhou-notes", name: "个人航运笔记", kind: "personal", owner: "周然", ownerKey: "ship-4",
      files: [file("航运阅读笔记.txt", "演示资料：航运主题的个人阅读笔记。")],
    },
    {
      id: "library-market-outlook", name: "2026年全球造船业市场展望", kind: "library", owner: owners.research, ownerKey: "research", accessMode: "public",
      files: [file("2026年全球造船业市场展望.txt", "演示资料：梳理主要船型的订单、交付和在手订单趋势。")],
    },
    {
      id: "library-fleet-renewal", name: "重点船型船队更新与新造船需求分析", kind: "library", owner: owners.research, ownerKey: "research", accessMode: "limited",
      files: [file("重点船型船队更新与新造船需求分析.txt", "演示资料：对照船龄、拆解和替代燃料的应用情况，归纳更新需求。")],
    },
    {
      id: "library-standards", name: "绿色船舶标准摘要", kind: "library", owner: owners.standards, ownerKey: "standards", accessMode: "limited",
      files: [file("绿色船舶标准摘要.txt", "演示资料：绿色船舶标准的主要主题与术语。")],
    },
    {
      id: "library-shore-power", name: "船舶高压岸电系统接口标准对照", kind: "library", owner: owners.standards, ownerKey: "standards", accessMode: "public",
      files: [file("船舶高压岸电系统接口标准对照.txt", "演示资料：对照高压岸电接口、电压等级、控制联锁和试验项目。")],
    },
    {
      id: "library-methanol-patents", name: "甲醇双燃料发动机技术专利导航", kind: "library", owner: owners.patents, ownerKey: "patents", accessMode: "limited",
      files: [file("甲醇双燃料发动机技术专利导航.txt", "演示资料：以燃料供给、喷射机构和控制方案为主题整理专利检索结果。")],
    },
    {
      id: "library-mooring-patents", name: "自动系泊系统专利技术综述", kind: "library", owner: owners.patents, ownerKey: "patents", accessMode: "public",
      files: [file("自动系泊系统专利技术综述.txt", "演示资料：梳理真空吸附、自动导引和安全联锁等技术路线。")],
    },
    {
      id: "library-imo-emissions", name: "IMO船舶温室气体减排规则导读", kind: "library", owner: owners.intelligence, ownerKey: "intelligence", accessMode: "public",
      files: [file("IMO船舶温室气体减排规则导读.txt", "演示资料：区分能效指标、燃油消耗数据收集与后续减排措施。")],
    },
    {
      id: "library-port-operations", name: "港口到泊预测与船岸数据协同研究", kind: "library", owner: owners.intelligence, ownerKey: "intelligence", accessMode: "limited",
      files: [file("港口到泊预测与船岸数据协同研究.txt", "演示资料：整理到港预测、泊位计划与船岸数据交换场景。")],
    },
  ];

  const permissionExamples = [
    {
      id: "demo-grants-short",
      name: "权限演示库（3 人未匹配）",
      files: [file("航运资料目录.txt", "演示资料：用于查看 3 名未匹配人员的显示效果。")],
      grants: ["林行远", "沈嘉禾", "陈立舟"].map((name, index) =>
        grant(`demo-grants-short-${index + 1}`, name, "航运研究部")),
    },
    {
      id: "demo-grants-long",
      name: "权限演示库（18 人未匹配）",
      files: [file("船舶调研目录.txt", "演示资料：用于查看 18 名未匹配人员的折叠与展开效果。")],
      grants: [
        "程文海", "高岚", "许海明", "孔云", "韩静", "吕悦", "孙琪", "严浦", "宋红",
        "沈北", "乔夕", "孙青", "陶锦", "夏至", "葛芳", "陈锐", "刘方", "冯闻",
      ].map((name, index) => grant(`demo-grants-long-${index + 1}`, name, index < 9 ? "航运研究部" : "船舶工程部")),
    },
  ].map((entry) => ({ ...entry, kind: "department", owner: owners.research, ownerKey: "research" }));

  const destinations = [
    ...permissionExamples.map(({ id, name, kind, ownerKey }) => ({
      id: `target-${id}`, name, kind, ownerKey, files: [], grants: [],
    })),
    { id: "target-market", kind: "department", ownerKey: "research", name: "船舶市场研究库", files: ["船舶市场观察.txt"], grants: ["class-1"] },
    { id: "target-shipping", kind: "department", ownerKey: "research", name: "航运研究资料库", files: [], grants: [] },
    { id: "target-environment", kind: "department", ownerKey: "research", name: "绿色船舶资料库", files: [], grants: [] },
    { id: "target-standards", kind: "department", ownerKey: "standards", name: "船舶规范与标准库", files: ["船舶替代燃料管系审图检查表.txt"], grants: [] },
    { id: "target-alternative-fuel", kind: "department", ownerKey: "standards", name: "替代燃料安全技术库", files: ["甲醇燃料加注接口检验清单.txt"], grants: [] },
    { id: "target-rules", kind: "enterprise", ownerKey: "cimtec", name: "企业制度库", files: [], grants: [] },
    { id: "library-research", kind: "library", ownerKey: "research", name: owners.research, files: ["船舶市场观察.txt", "2026年全球造船业市场展望.txt"], grants: [] },
    { id: "library-standards", kind: "library", ownerKey: "standards", name: owners.standards, files: ["船舶标准参考索引.txt"], grants: [] },
    { id: "library-patents", kind: "library", ownerKey: "patents", name: owners.patents, files: ["自动系泊系统专利技术综述.txt"], grants: [] },
    { id: "library-intelligence", kind: "library", ownerKey: "intelligence", name: owners.intelligence, files: [], grants: [] },
  ];

  const isRecord = value => value !== null && typeof value === "object" && !Array.isArray(value);
  const hasText = value => typeof value === "string" && value.trim().length > 0;
  const nameKey = value => value.trim().normalize("NFC");
  const storageKey = "baige.transfer.demo.targets.v1";
  const plannedChanges = new WeakMap();
  let sessionTargets = [];

  function hasOwner({ kind, ownerKey }) {
    if (kind === "personal") return people.has(ownerKey);
    if (kind === "enterprise") return ownerKey === "cimtec";
    return departmentKeys.has(ownerKey);
  }

  function readImportedTargets() {
    try {
      const raw = window.localStorage?.getItem(storageKey);
      if (raw == null) return sessionTargets;
      const entries = JSON.parse(raw);
      return Array.isArray(entries) ? entries.filter(entry => isRecord(entry)
        && hasText(entry.id) && hasText(entry.name) && kinds.has(entry.kind) && hasOwner(entry)
        && Array.isArray(entry.files) && entry.files.every(hasText) && Array.isArray(entry.grants)) : [];
    } catch {
      return sessionTargets;
    }
  }

  function createPackage(ids, fileSelections = new Map()) {
    const selected = new Set(ids);
    const selectedItems = items.filter(item => selected.has(item.id)).flatMap(({ files, grants, ...item }) => {
      const indices = fileSelections.get(item.id);
      const selectedFiles = indices ? files.filter((_, index) => indices.has(index)) : files;
      if (indices && !selectedFiles.length) return [];
      const included = { ...item, files: selectedFiles };
      if (item.kind === "department" && grants) included.grants = grants;
      return [included];
    });
    return JSON.parse(JSON.stringify({ version: 1, items: selectedItems }));
  }

  function parsePackage(text) {
    let bundle;
    try {
      bundle = JSON.parse(text);
    } catch {
      throw new Error("摆渡包不是有效的 JSON 文件。");
    }
    if (!isRecord(bundle) || bundle.version !== 1) throw new Error("不支持此摆渡包版本，请重新导出。");
    if (!Array.isArray(bundle.items) || !bundle.items.length) throw new Error("摆渡包没有可导入的内容。");

    const seen = new Set();
    bundle.items.forEach((item, index) => {
      const row = `第 ${index + 1} 项`;
      if (!isRecord(item) || !hasText(item.id) || !hasText(item.name) || !kinds.has(item.kind)
        || !hasText(item.owner) || !hasText(item.ownerKey)) throw new Error(`${row}的名称、编号、类型或归属信息不完整。`);
      if (seen.has(item.id)) throw new Error(`${row}的编号重复。`);
      seen.add(item.id);

      if (!Array.isArray(item.files) || !item.files.every(entry => isRecord(entry) && hasText(entry.name) && typeof entry.text === "string")) {
        throw new Error(`${row}的文件清单不完整。`);
      }
      if (item.grants !== undefined && (!Array.isArray(item.grants) || !item.grants.every(entry => isRecord(entry)
        && hasText(entry.personKey) && hasText(entry.name) && hasText(entry.department)))) {
        throw new Error(`${row}的人员授权信息不完整。`);
      }
      if ((item.accessMode !== undefined || item.kind === "library") && !["public", "limited"].includes(item.accessMode)) {
        throw new Error(`${row}的文库公开方式无效。`);
      }
    });
    return bundle;
  }

  function planImport(bundle, choices = {}) {
    const activeTargets = new Map([...destinations, ...readImportedTargets()].map(target => [target.id, target]));
    const plannedTargets = new Map([...activeTargets.values()].map(target => [target.id, {
      files: new Set(target.files.map(nameKey)),
      grants: new Set(target.grants),
    }]));

    return bundle.items.map(item => {
      const candidates = [...activeTargets.values()].filter(target => target.kind === item.kind && target.ownerKey === item.ownerKey);
      const targets = candidates.filter(target => target.kind === "department" || target.kind === "enterprise")
        .map(({ id, name }) => ({ id, name }));
      const ownerFound = hasOwner(item);
      const sameName = candidates.find(target => nameKey(target.name) === nameKey(item.name));
      const isDepartment = item.kind === "department";
      const canCreate = isDepartment && ownerFound && !sameName;
      const row = {
        item, targetId: "", targetName: "", targetOwnerKey: "", targetOwner: "", targets, state: "pending", reason: canCreate
          ? "未找到同名部门库，请选择已有库或新建。" : "未找到同名企业库，请选择已有库。",
        files: item.files.map(({ name }) => ({ name, duplicate: false })),
        missing: [], grantsAdded: [], newLibrary: false, existingLibrary: false, canCreate,
      };
      const choice = Object.hasOwn(choices, item.id) ? choices[item.id] : "";
      if (choice === "skip") return { ...row, state: "skipped", reason: "跳过此项。" };

      if (!ownerFound) {
        return { ...row, state: "blocked", reason: `内网找不到对应的${ownerTypes[item.kind]}，无法确定导入位置。` };
      }

      let automaticTarget = sameName;
      let automaticReason = "已匹配同归属的同名库。";
      if (item.kind === "library") {
        automaticTarget = candidates[0] || { id: `library-${item.ownerKey}`, name: owners[item.ownerKey] };
        automaticReason = "已匹配文库管理部门，沿用源端公开方式。";
      } else if (item.kind === "personal") {
        automaticTarget = { id: `personal-${item.ownerKey}`, name: `${people.get(item.ownerKey).name}的个人文档` };
        automaticReason = "已匹配内网账号，文件仅归该用户。";
      }
      const chosenTarget = candidates.find(target => targets.some(option => option.id === choice && option.id === target.id));
      let target = chosenTarget || automaticTarget;

      if (choice === "new" && canCreate) {
        const id = JSON.stringify([item.kind, item.ownerKey, nameKey(item.name)]);
        target = { id, name: item.name };
        row.newLibrary = !plannedTargets.has(id);
        row.state = "selected";
        row.reason = row.newLibrary ? "将在原归属下新建此库。" : "并入本次导入中新建的同名库。";
      } else if (chosenTarget) {
        row.state = "selected";
        row.reason = "已选择内网的目标库。";
      } else if (automaticTarget) {
        row.state = "matched";
        row.reason = automaticReason;
      }

      let planned;
      if (target) {
        row.targetId = target.id;
        row.targetName = target.name;
        row.targetOwnerKey = item.ownerKey;
        row.targetOwner = item.kind === "personal" ? people.get(item.ownerKey).name : owners[item.ownerKey];
        row.existingLibrary = isDepartment && candidates.some(candidate => candidate.id === target.id);
        if (!plannedTargets.has(target.id)) plannedTargets.set(target.id, { files: new Set(), grants: new Set() });
        planned = plannedTargets.get(target.id);
        for (const entry of row.files) {
          entry.duplicate = planned.files.has(nameKey(entry.name));
          planned.files.add(nameKey(entry.name));
        }
        plannedChanges.set(row, {
          id: target.id, name: target.name, kind: item.kind, ownerKey: item.ownerKey,
          files: row.files.map(entry => entry.name), grants: [],
        });
      }

      if (!isDepartment) return row;
      const peopleSeen = new Set();
      for (const entry of item.grants || []) {
        if (peopleSeen.has(entry.personKey)) continue;
        peopleSeen.add(entry.personKey);
        const person = people.get(entry.personKey);
        if (!person) row.missing.push({ name: entry.name, department: entry.department });
        else if (planned) {
          plannedChanges.get(row).grants.push(entry.personKey);
          if (!planned.grants.has(entry.personKey)) row.grantsAdded.push({ ...person });
          planned.grants.add(entry.personKey);
        }
      }
      return row;
    });
  }

  function applyImport(rows) {
    const counts = { files: 0, grants: 0, newLibraries: 0 };
    const importedTargets = new Map(readImportedTargets().map(target => [target.id, target]));
    const activeTargets = new Map([...destinations, ...importedTargets.values()].map(target => [target.id, target]));

    for (const row of rows) {
      const change = plannedChanges.get(row);
      if (!change) continue;
      const existing = activeTargets.get(change.id);
      const files = new Map((existing?.files || []).map(name => [nameKey(name), name]));
      const grants = new Set(existing?.grants);
      let changed = false;

      for (const name of change.files) {
        const key = nameKey(name);
        if (files.has(key)) continue;
        files.set(key, name);
        counts.files++;
        changed = true;
      }
      for (const key of change.grants) {
        if (grants.has(key)) continue;
        grants.add(key);
        counts.grants++;
        changed = true;
      }
      if (!existing && change.kind === "department") {
        counts.newLibraries++;
        changed = true;
      }
      if (!changed) continue;

      const updated = { ...change, files: [...files.values()], grants: [...grants] };
      activeTargets.set(updated.id, updated);
      importedTargets.set(updated.id, updated);
    }

    if (counts.files || counts.grants || counts.newLibraries) {
      const records = [...importedTargets.values()];
      window.localStorage?.setItem(storageKey, JSON.stringify(records));
      sessionTargets = records;
    }
    return counts;
  }

  const examplePackage = createPackage(items.map(item => item.id));
  examplePackage.items.unshift(...permissionExamples);
  window.BaigeTransferDemo = Object.freeze({ catalogKinds, items, examplePackage, createPackage, parsePackage, planImport, applyImport });
})();
