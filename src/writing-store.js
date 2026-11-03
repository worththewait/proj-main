(() => {
  "use strict";

  const KEY = "baige.writing.v1";
  const listeners = new Set();
  const now = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  function node(title, requirements, children = []) {
    return { id: uid("n"), title, type: "chapter", generate: true, requirements, children };
  }
  function seedTemplates() {
    return [
      {
        id: "tpl-propaganda",
        name: "宣贯会工作方案",
        mode: "简洁模式",
        scope: "personal",
        description: "会议宣贯、政策解读与落地方案",
        outline: [node("会议宣贯工作的背景与战略意义", "本章节需明确本次宣贯会的政治站位，结合行业发展现状、上级政策部署等背景。", [
          node("政策出台的时代背景与必然性", "从行业发展需求、上级战略部署两个维度展开，梳理政策出台的现实动因。", [
            node("行业发展的现实需求", "结合本行业近三年的发展数据，分析当前存在的短板与政策适配的必要性。"),
          ]),
          node("本次会议的政治站位与核心目标", "明确会议的政治定位，紧扣上级部署要求。"),
        ]), node("政策精神的精准解读", "按照“宏观指导原则—具体条款细则”的递进逻辑展开。", [
          node("宏观指导原则的阐释", "解读政策的总体方向与价值导向。"),
          node("具体条款细则的拆解", "形成可落地的操作要求。"),
        ]), node("分阶段落地实施路径", "明确责任分工、时间节点和验收标准。")],
      },
      {
        id: "tpl-story",
        name: "故事编写",
        mode: "专业模式",
        scope: "personal",
        description: "围绕人物、冲突与转折组织叙事",
        outline: [node("故事背景与人物设定", "交代时代背景、主要人物及其目标。"), node("核心冲突与情节推进", "围绕目标设置阻力，形成清晰的起承转合。", [
          node("关键转折", "设计改变人物选择的关键事件。"), node("高潮与解决", "让冲突在合理情境中收束。"),
        ])],
      },
      {
        id: "tpl-tech-report",
        name: "科技报告模板",
        mode: "专业模式",
        scope: "public",
        description: "技术总结报告使用，覆盖背景、目标、指标与技术方案",
        outline: [
          { ...node("引言", "说明报告背景、编写目的和适用范围，正文格式统一。"), type: "nonchapter" },
          node("研究背景和目标", "围绕研究任务，说明背景、目标和研究内容。", [
            node("研究背景", "梳理行业需求、上级部署和现实问题。"),
            node("研究目标", "明确总体目标、阶段目标和预期成果。"),
            node("研究内容", "说明主要研究任务、技术路线和边界。"),
          ]),
          node("技术要求和指标完成情况", "对照任务书要求，逐项说明技术指标完成情况。"),
          node("技术总体方案", "描述总体技术路线、系统组成和关键实现。"),
        ],
      },
      {
        id: "tpl-report",
        name: "专题研究报告",
        mode: "专业模式",
        scope: "public",
        description: "研究背景、现状、问题与建议",
        outline: [node("研究背景与目的", "说明研究缘起、范围和预期价值。"), node("现状与问题分析", "基于资料梳理现状和主要问题。"), node("对策建议", "形成可执行、可评估的建议。")],
      },
      {
        id: "tpl-summary",
        name: "年度工作总结",
        mode: "简洁模式",
        scope: "public",
        description: "年度工作回顾、亮点与下一步计划",
        outline: [node("年度工作回顾", "按重点任务梳理完成情况。"), node("主要成效与亮点", "用事实和数据说明成果。"), node("下一步工作计划", "明确下一年度重点方向。")],
      },
    ];
  }
  function seedUploads() {
    return [
      { id: "up-seed-1", name: "船舶设计规范汇编.pdf", size: 1258291, type: "pdf", source: "本地上传", category: "写作素材", version: "V1.0.0", status: "passed", parseStatus: "parsed", keywords: [], message: "未命中涉密内容，检测通过", createdAt: "2026-11-02 10:12:30", updatedAt: "2026-11-02 10:13:05" },
      { id: "up-seed-2", name: "核心算法设计文档.docx", size: 734003, type: "docx", source: "本地上传", category: "写作素材", version: "V1.0.0", status: "hit", parseStatus: "unparsed", keywords: ["秘密", "涉密"], message: "命中涉密关键词：秘密、涉密", createdAt: "2026-11-02 10:15:08", updatedAt: "2026-11-02 10:15:20" },
    ];
  }
  function normalizeUpload(item) {
    const type = item.type || /\.([^.]+)$/.exec(item.name || "")?.[1]?.toLowerCase() || "file";
    const status = ["detecting", "passed", "hit", "submitted", "rejected"].includes(item.status) ? item.status : "detecting";
    const parseStatus = ["unparsed", "parsing", "parsed", "failed"].includes(item.parseStatus)
      ? item.parseStatus
      : status === "passed" ? "parsed" : "unparsed";
    return {
      id: item.id || uid("up"),
      name: item.name || "未命名文件",
      size: Number(item.size) || 0,
      type,
      source: item.source || "本地上传",
      category: item.category || "写作素材",
      version: item.version || "V1.0.0",
      status,
      parseStatus,
      keywords: Array.isArray(item.keywords) ? item.keywords : [],
      message: item.message || (status === "passed" ? "未命中涉密内容，检测通过" : status === "hit" ? "命中涉密关键词" : "正在检测涉密内容"),
      createdAt: item.createdAt || now(),
      updatedAt: item.updatedAt || item.createdAt || now(),
    };
  }
  function defaults() {
    return { version: 1, templates: seedTemplates(), uploads: seedUploads(), documents: [] };
  }
  function read() {
    try {
      const raw = window.localStorage.getItem(KEY);
      if (!raw) {
        const value = defaults();
        write(value);
        return value;
      }
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.templates)) return defaults();
      if (!Array.isArray(parsed.uploads)) parsed.uploads = seedUploads();
      parsed.uploads = parsed.uploads.map(normalizeUpload);
      if (!Array.isArray(parsed.documents)) parsed.documents = [];
      return parsed;
    } catch { return defaults(); }
  }
  function write(value) {
    try { window.localStorage.setItem(KEY, JSON.stringify(value)); } catch { /* file:// */ }
    listeners.forEach((callback) => { try { callback(clone(value)); } catch { /* noop */ } });
    if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("baige:writing-store", { detail: { value } }));
    }
  }
  function templates() { return clone(read().templates); }
  function template(id) { return clone(read().templates.find((item) => item.id === id) || null); }
  function uploads() { return clone(read().uploads); }
  function addUploads(files) {
    const value = read();
    const room = Math.max(0, 5 - value.uploads.length);
    const accepted = Array.from(files || []).slice(0, room).map((file) => normalizeUpload({
      id: uid("up"),
      name: file.name,
      size: Number(file.size) || 0,
      type: /\.([^.]+)$/.exec(file.name)?.[1]?.toLowerCase() || "file",
      source: "本地上传",
      category: "写作素材",
      version: "V1.0.0",
      status: "detecting",
      parseStatus: "unparsed",
      keywords: [],
      message: "正在检测涉密内容",
      createdAt: now(),
      updatedAt: now(),
    }));
    value.uploads.push(...accepted);
    write(value);
    accepted.forEach((item) => {
      const sensitive = /机密|秘密|涉密|内部|敏感/.test(item.name);
      const keywords = sensitive ? ["秘密", "涉密"].filter((word) => item.name.includes(word) || word === "涉密") : [];
      window.setTimeout(() => {
        const current = read();
        const target = current.uploads.find((entry) => entry.id === item.id);
        if (!target) return;
        target.updatedAt = now();
        if (sensitive) {
          target.status = "hit";
          target.parseStatus = "unparsed";
          target.keywords = keywords;
          target.message = `命中涉密关键词：${keywords.join("、")}`;
        } else {
          target.status = "passed";
          target.parseStatus = "parsing";
          target.keywords = [];
          target.message = "未命中涉密内容，检测通过，正在解析";
        }
        write(current);
        if (!sensitive) {
          window.setTimeout(() => {
            const latest = read();
            const parsed = latest.uploads.find((entry) => entry.id === item.id);
            if (!parsed || parsed.status !== "passed") return;
            parsed.parseStatus = "parsed";
            parsed.updatedAt = now();
            parsed.message = "检测通过，解析完成";
            write(latest);
          }, 1200);
        }
      }, 900);
    });
    return accepted.length;
  }
  function reviewUpload(id, status, message = "") {
    const value = read();
    const item = value.uploads.find((entry) => entry.id === id);
    if (!item) return false;
    item.status = ["detecting", "passed", "hit", "submitted", "rejected"].includes(status) ? status : "detecting";
    item.updatedAt = now();
    if (item.status === "passed") {
      item.parseStatus = "parsing";
      item.message = message || "未命中涉密内容，检测通过";
    } else if (item.status === "hit") {
      item.parseStatus = "unparsed";
      item.message = message || "命中涉密关键词";
    } else if (item.status === "submitted") {
      item.parseStatus = "unparsed";
      item.message = message || "已提交管理员审核";
    } else if (item.status === "rejected") {
      item.parseStatus = "unparsed";
      item.message = message || "管理员审核驳回";
    } else {
      item.message = message || "正在检测涉密内容";
    }
    write(value);
    return true;
  }
  function submitUpload(id) {
    return reviewUpload(id, "submitted");
  }
  function removeUpload(id) {
    const value = read();
    const before = value.uploads.length;
    value.uploads = value.uploads.filter((item) => item.id !== id);
    write(value);
    return value.uploads.length !== before;
  }
  function upload(id) { return clone(read().uploads.find((item) => item.id === id) || null); }
  function selectableUploads() { return uploads().filter((item) => item.status === "passed"); }
  function saveDocument(document) {
    const value = read();
    const record = { id: uid("doc"), createdAt: now(), ...document };
    value.documents.unshift(record);
    write(value);
    return clone(record);
  }
  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
  function reset() {
    try { window.localStorage.removeItem(KEY); } catch { /* noop */ }
    const value = defaults();
    write(value);
    return clone(value);
  }

  window.BaigeWritingStore = Object.freeze({ KEY, templates, template, uploads, upload, addUploads, reviewUpload, submitUpload, removeUpload, selectableUploads, saveDocument, subscribe, read, reset });
})();
