/* 智能工具的「思维导图生成」：左侧输入（自然语言 / 文档 / 大纲），右侧按 markmap 风格渲染。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const KEY = "baige.mindmap.v1";
  const documents = window.BaigeMindmapDocuments;
  const fileList = window.BaigeSecretFileList;
  const fileStatus = file => file.secretStatus === "passed" && file.auditedAt ? "approved" : file.secretStatus;

  const SAMPLE_TEXT = "围绕 8000TEU 集装箱船甲板机械选型开展技术梳理：请从总体目标、关键技术、分项要点、风险与对策、实施建议五个维度展开；重点关注电动液压起重机的选型对比、系泊绞车布置方案、导缆装置标准化，以及钢材采购周期与船坞档期带来的交付风险。";

  const OUTLINE_HINT = "设备维护计划\n检查项目\n  船体外板\n  动力系统\n工作安排\n  确认检修时间";

  /* 三套演示大纲，按行业话题循环；正式环境由模型按输入生成。 */
  const SAMPLES = [
`## 8000TEU甲板机械选型
### 总体目标
- 提升装卸效率
- 保障作业安全
- 控制建造成本
### 关键技术
- 电动液压起重机
- 系泊绞车布置
- 导缆装置标准化
- 结构强度校核
### 分项要点
- 起重机选型对比
- 绞车功率与布置
- 导缆器规格统一
- 甲板载荷匹配
### 风险与对策
- 钢材采购周期
- 船坞档期冲突
- 提前锁定资源
### 实施建议
- 明确技术规格
- 并行采购设计
- 关键节点跟踪
- 预留变更余量`,
`## 绿色船舶技术路线
### 动力方案
- LNG 双燃料
- 甲醇燃料
- 氨燃料预留
### 能效措施
- 线型优化
- 废热回收
- 空气润滑
### 排放合规
- EEDI 第三阶段
- CII 评级
- 欧盟碳配额
### 改造节奏
- 新造船先行
- 存量船分批
- 港口配套同步`,
`## 船厂数字化转型
### 设计环节
- 三维协同设计
- 数字样船
- 工艺仿真
### 建造环节
- 分段智能产线
- 焊接机器人
- 精度管理
### 管理环节
- 计划一体化
- 物资齐套
- 质量追溯
### 支撑条件
- 数据标准
- 网络与安全
- 人员能力`
  ];

  const createState = () => ({
    tab: "text",
    text: "",
    outline: "",
    doc: null,
    history: [],
    files: [
      { id: "f1", fileName: "甲板机械选型.md", text: SAMPLES[0], secretStatus: "passed", sample: true },
      { id: "f2", fileName: "绿色船舶技术路线.md", text: SAMPLES[1], secretStatus: "passed", sample: true },
    ],
    fileQuery: "",
    historyQuery: "",
    drawer: false,
    busy: false,
    selectedFile: "",
    fileError: "",
    inputError: "",
    uploading: false,
    pendingFile: "",
    auditFile: "",
    active: false,
    result: null,
    completed: { text: "", outline: "" },
    page: 1,
  });

  let state = createState();
  let dom = null;
  let notifyDirty = () => {};
  let auditTimer;
  let noticeTimer;

  const selectableFile = id => state.files.find(file => file.id === id && file.secretStatus === "passed");

  function syncDirty() {
    const editing = dom.dialog.open && dom.editor.value !== state.result?.outline;
    notifyDirty(editing || ["text", "outline"].some(tab => state[tab].trim() && state[tab] !== state.completed[tab]));
  }

  /* ---------------- 数据 ---------------- */
  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      return Array.isArray(data?.history) ? data.history : [];
    } catch { return []; }
  }

  function write() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, history: state.history.slice(0, 30) }));
      return true;
    } catch { return false; }
  }

  function clock(at) {
    const d = new Date(at);
    const p = (v) => String(v).padStart(2, "0");
    return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  /* ---------------- 大纲解析 ---------------- */
  function parseOutline(text) {
    const root = { name: "思维导图", children: [], depth: 0 };
    let current = root;
    for (const raw of String(text || "").split("\n")) {
      if (!raw.trim()) continue;
      const line = raw.replace(/\t/g, "  ");
      const indent = line.match(/^\s*/)[0].length;
      const body = line.trim();
      let name = "";
      let depth = 0;
      if (/^##\s+/.test(body) && !/^###/.test(body)) { name = body.replace(/^##\s+/, ""); depth = 0; }
      else if (/^###\s+/.test(body)) { name = body.replace(/^###\s+/, ""); depth = 1; }
      else if (/^#{4,}\s+/.test(body)) { name = body.replace(/^#{4,}\s+/, ""); depth = 2 + (body.match(/^#+/)[0].length - 4); }
      else {
        name = body.replace(/^([-*·]|\d+[.)、])\s*/, "");
        // 列表项固定比 ### 分支低一级：无缩进为二级，每 2 空格再深一层。
        depth = 2 + Math.floor(indent / 2);
      }
      if (!name) continue;
      if (depth === 0) { root.name = name; current = root; continue; }
      const node = { name, children: [], depth };
      let parent = current;
      while (parent !== root && parent.depth >= depth) parent = parent.parent;
      node.parent = parent;
      node.depth = parent.depth + 1;
      parent.children.push(node);
      current = node;
    }
    return root;
  }

  function outlineTitle(text) {
    const line = String(text || "").split("\n").map((l) => l.trim()).find((l) => /^##\s+/.test(l) && !/^###/.test(l));
    return line ? line.replace(/^##\s+/, "") : "未命名导图";
  }

  function normalizeOutline(text) {
    if (/^\s*#{1,}\s+\S/m.test(text)) {
      return /^\s*#\s+\S/.test(text) ? text.trim().replace(/^(#+)(?=\s+\S)/gm, "$1#") : text;
    }
    const [title = "", ...lines] = text.split(/\r?\n/u).filter(line => line.trim());
    return [`## ${title.trim()}`, ...lines.map(line => {
      const raw = line.replace(/\t/g, "  ");
      const depth = Math.min(5, Math.floor(raw.match(/^\s*/u)[0].length / 2));
      const label = raw.trim().replace(/^[-*·]\s+|^\d+[.)、]\s*/u, "");
      return `${"#".repeat(3 + depth)} ${label}`;
    })].join("\n");
  }

  function outlineFromFile(name, text) {
    const title = name.replace(/\.[^.]+$/, "");
    const body = text.trim();
    if (/^#\s+\S/.test(body)) return body.replace(/^(#+)(?=\s+\S)/gm, "$1#");
    if (/^##\s+\S/.test(body) && !/\n##\s+\S/.test(body)) return body;
    // Flat documents keep their source order and use short excerpts as nodes.
    const lines = body.split(/\n+|(?<=[。！？])/u).map(line => line.trim()).filter(Boolean);
    return [`## ${title}`, "### 正文摘录", ...lines.slice(0, 24).map(line => `- ${line.length > 64 ? line.slice(0, 63) + "…" : line}`)].join("\n");
  }

  function countNodes(node) {
    return 1 + node.children.reduce((sum, child) => sum + countNodes(child), 0);
  }

  /* ---------------- 布局与渲染 ---------------- */
  const PALETTE = [30, 143, 281, 358, 186, 210, 96];

  /* 十六进制色值：hsl() 的现代空格写法在导出为图片时不被识别，会整体变黑。 */
  function hslHex(h, s, l) {
    const sat = s / 100;
    const lig = l / 100;
    const k = (n) => (n + h / 30) % 12;
    const a = sat * Math.min(lig, 1 - lig);
    const f = (n) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const to = (x) => Math.round(255 * Math.max(0, Math.min(1, x))).toString(16).padStart(2, "0");
    return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
  }

  function toneFor(node) {
    let top = node;
    while (top.parent && top.parent.parent) top = top.parent;
    const base = PALETTE[(top.index || 0) % PALETTE.length];
    const shift = node.depth >= 3 ? (node.index || 0) * 9 % 24 - 12 : 0;
    return hslHex((base + shift + 360) % 360, 64, 45);
  }

  function indexTree(node) {
    node.children.forEach((child, i) => { child.index = i; indexTree(child); });
  }

  function layoutTree(root) {
    const ROW = 28;
    let cursor = 0;
    (function walk(node) {
      if (!node.children.length) {
        node.y = cursor;
        cursor += ROW;
        return;
      }
      node.children.forEach(walk);
      node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
    })(root);
    return cursor;
  }

  function buildSvg(doc, viewW, viewH) {
    const ctx = buildSvg.ctx || (buildSvg.ctx = document.createElement("canvas").getContext("2d"));
    ctx.font = '16px "PingFang SC", "Microsoft YaHei", system-ui, -apple-system, sans-serif';

    indexTree(doc);
    (function measure(node) {
      node.w = Math.ceil(ctx.measureText(node.name).width);
      node.children.forEach(measure);
    })(doc);

    // 列宽按每层最宽的文字算，避免根节点长标题与下一层叠在一起。
    const columnW = [];
    (function scan(node) {
      columnW[node.depth] = Math.max(columnW[node.depth] || 0, node.w);
      node.children.forEach(scan);
    })(doc);

    const PAD_L = 26;
    const PAD_T = 24;
    const GAP = 40;
    const ROW = 28;
    const xAt = [PAD_L];
    for (let d = 0; d < columnW.length; d++) xAt[d + 1] = xAt[d] + (columnW[d] || 0) + GAP;

    let cursor = 0;
    (function walk(node) {
      node.x = xAt[node.depth];
      if (!node.children.length) { node.y = cursor; cursor += ROW; return; }
      node.children.forEach(walk);
      node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2;
    })(doc);

    const nodes = [];
    (function collect(node) {
      node.cx = node.x + node.w + 8;
      node.cy = node.y - 5.5;
      nodes.push(node);
      node.children.forEach(collect);
    })(doc);

    const contentW = PAD_L * 2 + Math.max(...nodes.map((n) => n.x + n.w));
    const contentH = cursor + PAD_T * 2;
    const scale = Math.min(1, Math.max(1, viewW - 8) / contentW, Math.max(1, viewH - 8) / contentH);
    const w = contentW;
    const h = contentH;
    const offsetY = PAD_T;

    const links = [];
    const marks = [];
    for (const node of nodes) {
      const tone = toneFor(node);
      const y = node.y + offsetY;
      if (node.parent) {
        const sx = node.parent.x + node.parent.w + 8;
        const sy = node.parent.y + offsetY - 5.5;
        const tx = node.x - 8;
        const ty = y - 5.5;
        const dx = Math.max(24, (tx - sx) * 0.45);
        links.push(`<path d="M${sx} ${sy} C${sx + dx} ${sy} ${tx - dx} ${ty} ${tx} ${ty}" fill="none" stroke="${tone}" stroke-width="1.4"/>`);
        marks.push(`<circle cx="${tx}" cy="${ty}" r="3" fill="#fff" stroke="${tone}" stroke-width="1.4"/>`);
      }
      if (node.children.length) {
        marks.push(`<line x1="${node.x}" y1="${y + 5}" x2="${node.x + node.w}" y2="${y + 5}" stroke="${tone}" stroke-width="1.6" stroke-linecap="round"/>`);
        marks.push(`<circle cx="${node.x + node.w + 8}" cy="${y - 5.5}" r="3" fill="#fff" stroke="${tone}" stroke-width="1.4"/>`);
      }
      marks.push(`<text x="${node.x}" y="${y}" fill="#333" font-size="16" text-anchor="start">${escape(node.name)}</text>`);
    }

    return {
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * scale)}" height="${Math.ceil(h * scale)}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}" font-family='"PingFang SC","Microsoft YaHei",system-ui,sans-serif'>${links.join("")}${marks.join("")}</svg>`,
    };
  }

  /* ---------------- 渲染 ---------------- */
  function renderAll() {
    if (!dom) return;
    renderTabs();
    renderPanel();
    renderStage();
    renderDrawer();
    syncActions();
  }

  function renderTabs() {
    dom.tabs.querySelectorAll("[data-mm-tab]").forEach((btn) => {
      const active = btn.dataset.mmTab === state.tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
      btn.tabIndex = active ? 0 : -1;
      btn.disabled = state.busy;
    });
    dom.panel.setAttribute("aria-labelledby", `mm-tab-${state.tab}`);
  }

  function fileRow(file) {
    const id = escape(file.id);
    const name = escape(file.fileName);
    const code = fileStatus(file);
    const allowed = fileList.canView(code);
    const selected = file.id === state.selectedFile;
    const details = `<button class="secret-file-icon" type="button" data-mm-file-audit="${id}" title="涉密详情" aria-label="查看 ${name} 的涉密详情">${icon("eye")}</button>`;
    return `<tr class="mm-file${selected ? " is-active" : ""}">
      <td><button type="button" class="mm-file-choice" data-mm-file="${id}" aria-pressed="${selected}" title="${name}" ${state.busy || !allowed ? "disabled" : ""}><span class="mm-file-name">${name}</span></button>${file.sample ? '<span class="mm-file-example">示例文档</span>' : ""}</td>
      <td>${fileList.time(file.uploadedAt)}</td>
      <td>${fileList.status(code, details)}</td>
      <td><div class="secret-file-actions">
        ${allowed ? `<button class="secret-file-icon" type="button" data-mm-file-eye="${id}" title="查看文件" aria-label="查看 ${name}">${icon("file")}</button>
        <button class="secret-file-icon" type="button" data-mm-file-down="${id}" title="下载原文件" aria-label="下载 ${name}">${icon("download")}</button>` : ""}
        <button class="secret-file-icon is-danger" type="button" data-mm-file-del="${id}" title="删除文件" aria-label="删除 ${name}" ${state.busy ? "disabled" : ""}>${icon("trash")}</button>
      </div></td>
    </tr>`;
  }

  function renderPanel() {
    const list = state.files.filter(file => file.fileName.toLowerCase().includes(state.fileQuery.trim().toLowerCase()));
    const fieldAttr = `${state.busy ? " readonly" : ""} aria-describedby="mm-input-help mm-input-error" aria-invalid="${Boolean(state.inputError)}"`;
    const panels = {
      text: `
        <div class="mm-label"><label for="mm-text">你想梳理什么？</label></div>
        <textarea class="mm-input" id="mm-text" data-mm-text${fieldAttr} placeholder="例如：梳理甲板机械选型，包括关键技术、分项要点和交付风险。">${escape(state.text)}</textarea>
        <p class="mm-note" id="mm-input-help">写下主题和几个要点即可。当前使用本地示例演示。</p>`,
      files: `
        <div class="mm-files-head"><b>文档 <span class="mm-files-count">${state.files.length}</span></b>
          <button class="mm-upload" type="button" data-mm-upload ${state.uploading || state.busy ? "disabled" : ""}>${icon("upload")}${state.uploading ? "读取中…" : "上传文档"}</button></div>
        <p class="mm-note mm-file-help" id="mm-input-help">通过涉密核查后可选用。支持 TXT、MD、PDF、Word、Excel。</p>
        <p class="mm-input-error" role="status" ${state.fileError ? "" : "hidden"}>${escape(state.fileError)}</p>
        <label class="mm-search">${icon("search")}<input type="search" data-mm-file-search placeholder="搜索文件名" value="${escape(state.fileQuery)}" aria-label="搜索文件名" /></label>
        <div class="secret-file-table-wrap mm-file-list" role="region" aria-label="思维导图文档列表" tabindex="0">
          <table class="secret-file-table" aria-label="文档及涉密审查状态">${fileList.head}<tbody>
            ${list.length ? list.map(fileRow).join("") : `<tr><td colspan="4">${state.fileQuery ? "没有匹配的文件，请换个关键词。" : "上传文档后即可选择。"}</td></tr>`}
          </tbody></table>
        </div>`,
      outline: `
        <div class="mm-label"><label for="mm-outline">大纲内容</label></div>
        <textarea class="mm-outline" id="mm-outline" data-mm-outline${fieldAttr} spellcheck="false" placeholder="${escape(OUTLINE_HINT)}">${escape(state.outline)}</textarea>
        <p class="mm-note" id="mm-input-help">可以直接粘贴大纲，或点示例看排版。</p>`,
    };
    dom.panel.innerHTML = panels[state.tab] || "";
    dom.panel.dataset.mode = state.tab;
  }

  function renderStage() {
    const hasDoc = Boolean(state.doc) && !state.busy;
    dom.stageTitle.textContent = hasDoc ? state.result.title : "导图预览";
    dom.stageMeta.textContent = hasDoc ? `${countNodes(state.doc)} 个节点` : "";
    dom.resultTools.hidden = !hasDoc;
    dom.historyBtn.setAttribute("aria-expanded", String(state.drawer));
    dom.historyBtn.querySelector(".mm-history-count").textContent = state.history.length;

    if (state.busy) {
      dom.canvas.innerHTML = `<div class="mm-stream"><header role="status"><span class="mm-stream-dot" aria-hidden="true"></span>正在生成导图…</header><div data-mm-stream></div></div>`;
      return;
    }
    if (!hasDoc) {
      const copy = { text: "输入主题与要点，生成后可编辑大纲并导出图片。", files: "选择一份文档，生成后可调整导图中的节点。", outline: "填写大纲，按分支层级生成可编辑的导图。" };
      dom.canvas.innerHTML = `<div class="mm-empty"><span class="mm-preview-mark">${icon("branch")}</span><h3>导图将在这里显示</h3><p>${copy[state.tab]}</p></div>`;
      return;
    }
    const box = dom.canvas.getBoundingClientRect();
    const svg = buildSvg(state.doc, box.width || 760, box.height || 560);
    dom.canvas.innerHTML = `<div class="mm-map">${svg.html}</div>`;
    dom.canvas.querySelector(".mm-map").scrollLeft = 0;
  }

  function renderDrawer() {
    if (!state.drawer) {
      dom.mask.hidden = true;
      dom.drawer.hidden = true;
      return;
    }
    const q = state.historyQuery.trim();
    const list = state.history.filter((item) => item.title.includes(q) || item.prompt.includes(q));
    const PER = 6;
    const pages = Math.max(1, Math.ceil(list.length / PER));
    state.page = Math.min(state.page, pages);
    const slice = list.slice((state.page - 1) * PER, state.page * PER);

    dom.mask.hidden = false;
    dom.drawer.hidden = false;
    dom.drawerBody.innerHTML = slice.length
      ? `<ul class="mm-history">${slice.map((item) => `
        <li class="mm-history-item${state.result?.id === item.id ? " is-active" : ""}">
          <button type="button" class="mm-history-copy" data-mm-history="${escape(item.id)}" ${state.result?.id === item.id ? 'aria-current="true"' : ""}>
            <span class="mm-history-title" title="${escape(item.title)}">${escape(item.title)}</span>
            <span class="mm-history-meta">${escape(clock(item.at))} · ${item.nodes} 个节点</span>
          </button>
          <button class="mm-history-del" type="button" data-mm-history-del="${escape(item.id)}" title="删除记录" aria-label="删除 ${escape(item.title)}">${icon("trash")}</button>
        </li>`).join("")}</ul>`
      : `<div class="mm-drawer-empty"><span class="mm-empty-icon">${icon("branch")}</span><p>${q ? "没有匹配的记录" : "暂无历史记录，生成后会在此保存"}</p></div>`;

    dom.drawerFoot.innerHTML = pages > 1
      ? `${Array.from({ length: pages }, (_, i) => `<button class="mm-page-btn${state.page === i + 1 ? " is-current" : ""}" type="button" data-mm-page="${i + 1}">${i + 1}</button>`).join("")}`
      : "";
    dom.drawerFoot.hidden = pages <= 1;
  }

  /* ---------------- 生成 ---------------- */
  function pickSample(text) {
    const all = SAMPLES;
    if (/绿色|排放|燃料|LNG|甲醇|氨/.test(text)) return all[1];
    if (/数字化|船厂|产线|智能|管理/.test(text)) return all[2];
    return all[0];
  }

  /* 流式预览只显示层级与文字，不暴露 markdown 记号。 */
  function toStreamLine(line) {
    const raw = String(line);
    const indent = raw.match(/^\s*/)[0].replace(/\t/g, "  ").length;
    const body = raw.trim();
    if (/^##\s+/.test(body) && !/^###/.test(body)) return { depth: 0, text: body.replace(/^##\s+/, "") };
    if (/^###\s+/.test(body)) return { depth: 1, text: body.replace(/^###\s+/, "") };
    if (/^#{4,}\s+/.test(body)) return { depth: 2, text: body.replace(/^#{4,}\s+/, "") };
    return { depth: 2 + Math.floor(indent / 2), text: body.replace(/^([-*·]|\d+[.)、])\s*/, "") };
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function currentInput() {
    const file = selectableFile(state.selectedFile);
    if (state.tab === "files") return file && { tab: "files", prompt: file.fileName, source: outlineFromFile(file.fileName, file.text), fileApproved: true };
    const prompt = state[state.tab];
    if (!prompt.trim()) return null;
    return { tab: state.tab, prompt, source: state.tab === "outline" ? normalizeOutline(prompt) : pickSample(prompt) };
  }

  async function generate(input = currentInput(), markComplete = true) {
    if (state.busy) return;
    if (!input) {
      const error = { text: "请先输入主题与要点，或填入示例需求。", outline: "请先填写大纲，或填入示例大纲。", files: "请先选中一份文档。" };
      state.inputError = error[state.tab];
      syncActions();
      dom.panel.querySelector("textarea, [data-mm-file]")?.focus();
      return;
    }
    const { prompt, source, tab, fileApproved } = input;
    const session = state;

    state.busy = true;
    state.inputError = "";
    renderAll();

    const lines = source.split("\n").filter((l) => l.trim());
    const stream = dom.canvas.querySelector("[data-mm-stream]");
    const shown = [];
    for (const line of lines.slice(0, 32)) {
      if (state !== session) return;
      shown.push(toStreamLine(line));
      if (stream) {
        stream.innerHTML = shown.map((item, i) => `<span class="mm-stream-line is-${item.depth}${i === shown.length - 1 ? " is-last" : ""}" style="padding-left:${item.depth * 16}px">${item.depth > 1 ? '<i class="mm-stream-bullet" aria-hidden="true"></i>' : ""}${escape(item.text)}</span>`).join("") + '<span class="mm-stream-caret"></span>';
        stream.scrollTop = stream.scrollHeight;
      }
      await sleep(58);
    }
    await sleep(320);
    if (state !== session) return;

    state.busy = false;
    state.doc = parseOutline(source);
    if (markComplete && tab !== "files") state.completed[tab] = prompt;
    state.result = saveHistory({ prompt, source, tab, fileApproved }, source);
    renderAll();
    syncDirty();
  }

  function syncActions() {
    const hasInput = state.tab === "files" ? Boolean(selectableFile(state.selectedFile)) : Boolean(state[state.tab].trim());
    dom.run.disabled = state.busy || !hasInput;
    dom.clear.hidden = !hasInput;
    dom.clear.disabled = state.busy;
    dom.examples.hidden = state.tab === "files";
    dom.examples.querySelector("button").disabled = state.busy;
    dom.examples.querySelector("button").textContent = state.tab === "outline" ? "设备维护计划" : "甲板机械选型";
    dom.run.classList.toggle("is-busy", state.busy);
    dom.run.innerHTML = state.busy ? `${icon("refresh")}<span>生成中…</span>` : `生成思维导图${icon("arrow")}`;
    dom.clear.textContent = state.tab === "files" ? "取消选择" : "清空输入";
    dom.inputError.textContent = state.inputError;
    dom.inputError.hidden = !state.inputError;
    dom.panel.querySelector("textarea")?.setAttribute("aria-invalid", String(Boolean(state.inputError)));
  }

  function saveHistory(input, source, id = `m-${Date.now().toString(36)}`) {
    const title = outlineTitle(source);
    const record = { id, title, prompt: input.prompt.slice(0, 200), outline: source, nodes: countNodes(state.doc), at: Date.now(), tab: input.tab, source: input.source, fileApproved: input.fileApproved };
    state.history = [record, ...state.history.filter((item) => item.id !== id && item.title !== title)].slice(0, 30);
    if (!write()) hint("导图已生成，但浏览器存储不足，未能保存到历史记录。");
    return record;
  }

  /* ---------------- 导出 ---------------- */
  function exportImage() {
    const svgNode = dom.canvas.querySelector(".mm-map svg");
    if (!svgNode) return;
    const title = state.result.title;
    const { width, height } = svgNode.viewBox.baseVal;
    const svg = svgNode.cloneNode(true);
    svg.setAttribute("width", width);
    svg.setAttribute("height", height);
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) { hint("导出失败，请重试。"); return; }
        download(png, `${title || "思维导图"}.png`);
        hint("已导出 PNG。");
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); hint("导出失败，请重试。"); };
    img.src = url;
  }

  function download(blob, name) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  }

  function refreshFiles() {
    clearTimeout(auditTimer);
    try {
      state.files = [...documents.list(), ...state.files.filter(file => file.sample)];
      if (!selectableFile(state.selectedFile)) state.selectedFile = "";
      if (selectableFile(state.pendingFile)) {
        state.selectedFile = state.pendingFile;
        state.pendingFile = "";
      }
      const next = Math.min(...state.files.filter(file => file.secretStatus === "detecting").map(file => file.detectAt));
      if (state.active && Number.isFinite(next)) auditTimer = setTimeout(refreshFiles, Math.max(50, next - Date.now()));
      if (dom.auditDialog.open) renderAudit();
      if (dom.notice.open) renderNoticeStatus();
    } catch (error) {
      state.fileError = error.message || "文档状态无法读取，请重试。";
    }
    if (state.tab === "files") {
      const search = dom.panel.querySelector("[data-mm-file-search]");
      const focused = document.activeElement === search;
      const cursor = focused ? search.selectionStart : null;
      renderPanel();
      if (focused) {
        const nextSearch = dom.panel.querySelector("[data-mm-file-search]");
        nextSearch.focus({ preventScroll: true });
        nextSearch.setSelectionRange(cursor, cursor);
      }
      syncActions();
    }
  }

  function renderAudit() {
    const file = state.files.find(item => item.id === state.auditFile);
    if (!file) { dom.auditDialog.close(); return; }
    const { secretStatus: status } = file;
    const messages = {
      detecting: "正在核查，关闭窗口后仍可在文档列表查看进度。",
      hit: "发现疑似涉密内容，请提交人工审核。",
      submitted: "等待人工审核。可用下方按钮演示审核结果。",
      rejected: file.auditReason || "人工审核未通过，请核对文档保密范围。",
      failed: file.auditReason || "未能读取文件，请检查后重新上传。",
      passed: file.sample ? "系统示例文档，可直接选用。" : "已通过涉密核查，可选用此文档生成导图。",
    };
    dom.auditDialog.querySelector("[data-mm-audit-info]").textContent = file.fileName;
    dom.auditDialog.querySelector("[data-mm-audit-status]").textContent = fileList.label(fileStatus(file));
    dom.auditDialog.querySelector("[data-mm-audit-message]").textContent = messages[status] || "";
    dom.auditDialog.querySelector("[data-mm-audit-submit]").hidden = status !== "hit";
    dom.auditDialog.querySelector("[data-mm-audit-pass]").hidden = status !== "submitted";
    dom.auditDialog.querySelector("[data-mm-audit-reject]").hidden = status !== "submitted";
  }

  function renderNoticeStatus() {
    const file = state.files.find(item => item.id === dom.notice.dataset.fileId);
    const status = dom.notice.querySelector("[data-mm-notice-status]");
    status.textContent = file ? fileList.label(fileStatus(file)) : "待核查";
    status.dataset.status = file ? fileStatus(file) : "";
  }

  function showNotice(fileId) {
    clearTimeout(noticeTimer);
    dom.notice.dataset.fileId = fileId;
    renderNoticeStatus();
    const deadline = Date.now() + 5000;
    const update = () => {
      if (!dom.notice.open) return;
      const seconds = Math.ceil((deadline - Date.now()) / 1000);
      if (seconds <= 0) { dom.notice.close(); return; }
      dom.notice.querySelector("[data-mm-notice-timer]").textContent = `${seconds} 秒后自动关闭`;
      noticeTimer = setTimeout(update, 250);
    };
    if (!dom.notice.open) dom.notice.showModal();
    update();
  }

  async function upload(file) {
    if (!file || state.uploading) return;
    const session = state;
    state.uploading = true;
    state.fileError = "";
    renderPanel();
    syncActions();
    try {
      const saved = await documents.submit(file);
      if (state !== session) return;
      state.pendingFile = saved.secretStatus === "detecting" ? saved.id : "";
      state.fileQuery = "";
      state.inputError = "";
      refreshFiles();
      if (saved.secretStatus === "detecting" && state.active && state.tab === "files") showNotice(saved.id);
    } catch (error) {
      if (state === session) state.fileError = error.message || "读取文档失败，请重试。";
    } finally {
      if (state === session) {
        state.uploading = false;
        renderPanel();
        syncActions();
      }
    }
  }

  /* ---------------- 提示 ---------------- */
  function hint(text) {
    if (!dom) return;
    dom.toast.textContent = text;
    dom.toast.hidden = !text;
    clearTimeout(hint.timer);
    if (text) hint.timer = setTimeout(() => { if (dom) dom.toast.hidden = true; }, 2600);
  }

  /* ---------------- 结构 ---------------- */
  function shell() {
    return `
      <div class="mm-app">
        <section class="mm-rail">
          <header class="mm-head">
            <span class="mm-head-icon">${icon("branch")}</span>
            <div><h2>思维导图生成</h2><p>把主题、文档或大纲整理成分支导图</p></div>
          </header>
          <div class="mm-tabs" role="tablist" aria-label="输入方式">
            <button class="mm-tab" type="button" role="tab" id="mm-tab-text" aria-controls="mm-panel" data-mm-tab="text">描述主题</button>
            <button class="mm-tab" type="button" role="tab" id="mm-tab-files" aria-controls="mm-panel" data-mm-tab="files">上传文档</button>
            <button class="mm-tab" type="button" role="tab" id="mm-tab-outline" aria-controls="mm-panel" data-mm-tab="outline">输入大纲</button>
          </div>
          <div class="mm-panel" data-mm-panel id="mm-panel" role="tabpanel"></div>
          <p class="mm-input-error" id="mm-input-error" data-mm-input-error role="status" hidden></p>
          <div class="mm-actions">
            <button class="mm-run" type="button" data-mm-run></button>
            <button class="mm-clear" type="button" data-mm-clear>清空输入</button>
          </div>
          <div class="mm-examples" data-mm-examples><span>试个示例</span><button class="mm-btn mm-btn-ghost" type="button" data-mm-sample></button></div>
          <button class="mm-link mm-related" type="button" data-tool="流程图生成">打开流程图生成${icon("arrow")}</button>
          <input type="file" data-mm-upload-input accept="${window.BaigeProofreadFile?.accept || ".txt,.md"}" hidden />
        </section>
        <section class="mm-stage">
          <header class="mm-stage-head">
            <div class="mm-stage-heading" aria-live="polite"><h3 class="mm-stage-title" data-mm-stage-title></h3><span class="mm-stage-meta" data-mm-stage-meta></span></div>
            <div class="mm-tools">
              <div class="mm-result-tools" data-mm-result-tools hidden>
                <button class="mm-tool is-plain" type="button" data-mm-regen>${icon("refresh")}重新生成</button>
                <button class="mm-tool is-plain" type="button" data-mm-edit>${icon("pen")}编辑大纲</button>
                <button class="mm-tool" type="button" data-mm-export>${icon("download")}导出图片</button>
              </div>
              <button class="mm-tool is-plain" type="button" data-mm-history-btn aria-controls="mm-history-drawer">${icon("history")}历史记录 <span class="mm-history-count">0</span></button>
            </div>
          </header>
          <div class="mm-canvas" data-mm-canvas></div>
        </section>
      </div>

      <dialog class="mm-dialog" data-mm-dialog aria-labelledby="mmDialogTitle">
        <header class="mm-dialog-head">
          <h2 id="mmDialogTitle">编辑大纲</h2>
          <p>每 2 空格为一级层级；保存后导图立即更新</p>
          <button class="mm-dialog-close" type="button" data-mm-dialog-close aria-label="关闭">${icon("close")}</button>
        </header>
        <div class="mm-editor">
          <div class="mm-editor-gutter" data-mm-gutter aria-hidden="true">1</div>
          <textarea class="mm-editor-text" data-mm-editor spellcheck="false" aria-label="大纲源码" aria-describedby="mm-editor-note"></textarea>
        </div>
        <footer class="mm-dialog-foot">
          <span class="mm-dialog-note" id="mm-editor-note" role="status" data-mm-editor-note>保存后将同步更新历史记录。</span>
          <button class="mm-btn mm-btn-ghost" type="button" data-mm-dialog-cancel>取消</button>
          <button class="mm-btn mm-btn-primary" type="button" data-mm-dialog-save>保存</button>
        </footer>
      </dialog>

      <dialog class="mm-dialog" data-mm-file-dialog aria-labelledby="mmFileTitle">
        <header class="mm-dialog-head"><h2 id="mmFileTitle" data-mm-file-title></h2><button class="mm-dialog-close" type="button" data-mm-file-close aria-label="关闭预览">${icon("close")}</button></header>
        <pre class="mm-file-preview" data-mm-file-preview></pre>
      </dialog>

      <dialog class="mm-dialog mm-audit-dialog" data-mm-notice aria-labelledby="mmNoticeTitle">
        <header class="mm-dialog-head"><h2 id="mmNoticeTitle">文件录入须知</h2></header>
        <div class="mm-audit-body">
          <p>严禁上传国家秘密及其他涉密文件。文件提交后将进行涉密核查，发现可疑内容时，须经人工审核通过后才可使用。</p>
          <p class="mm-notice-status" role="status">文档状态 <strong class="secret-file-badge" data-mm-notice-status></strong></p>
        </div>
        <footer class="mm-dialog-foot mm-audit-actions">
          <span class="mm-dialog-note" role="timer" data-mm-notice-timer></span>
          <button class="mm-btn mm-btn-primary" type="button" data-mm-notice-close>关闭</button>
        </footer>
      </dialog>

      <dialog class="mm-dialog mm-audit-dialog" data-mm-audit-dialog aria-labelledby="mmAuditTitle">
        <header class="mm-dialog-head"><h2 id="mmAuditTitle">涉密核查详情</h2></header>
        <div class="mm-audit-body">
          <strong data-mm-audit-info></strong>
          <p role="status"><b data-mm-audit-status></b> · <span data-mm-audit-message></span></p>
        </div>
        <footer class="mm-dialog-foot mm-audit-actions">
          <button class="mm-btn mm-btn-ghost" type="button" data-mm-audit-close>关闭</button>
          <button class="mm-btn mm-btn-ghost" type="button" data-mm-audit-reject hidden>模拟驳回</button>
          <button class="mm-btn mm-btn-primary" type="button" data-mm-audit-pass hidden>模拟审核通过</button>
          <button class="mm-btn mm-btn-primary" type="button" data-mm-audit-submit hidden>提交人工审核</button>
        </footer>
      </dialog>

      <div class="mm-mask" data-mm-mask hidden></div>
      <aside class="mm-drawer" id="mm-history-drawer" data-mm-drawer hidden aria-label="历史记录">
        <header class="mm-drawer-head">
          <h2>历史记录</h2>
          <button class="mm-drawer-close" type="button" data-mm-drawer-close aria-label="关闭历史记录">${icon("close")}</button>
        </header>
        <label class="mm-drawer-search">${icon("search")}<input type="search" data-mm-history-search placeholder="搜索输入内容" aria-label="搜索历史记录" /></label>
        <div class="mm-drawer-body" data-mm-drawer-body></div>
        <footer class="mm-drawer-foot" data-mm-drawer-foot></footer>
      </aside>

      <p class="mm-toast" data-mm-toast role="status" hidden></p>`;
  }

  /* ---------------- 事件 ---------------- */
  function bind() {
    dom.tabs.addEventListener("click", (event) => {
      const tab = event.target.closest("[data-mm-tab]");
      if (!tab) return;
      state.tab = tab.dataset.mmTab;
      state.inputError = "";
      renderAll();
    });
    dom.tabs.addEventListener("keydown", (event) => {
      const tabs = [...dom.tabs.querySelectorAll("[data-mm-tab]")];
      const current = tabs.indexOf(event.target);
      const offset = { ArrowLeft: current - 1, ArrowRight: current + 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (current < 0 || offset === undefined) return;
      event.preventDefault();
      const next = tabs[(offset + tabs.length) % tabs.length];
      next.click();
      next.focus();
    });

    dom.run.addEventListener("click", () => generate());
    dom.regen.addEventListener("click", () => {
      const { tab, prompt, source, outline, fileApproved } = state.result;
      if (source && source !== outline && !window.confirm("重新生成会覆盖当前导图的大纲修改，继续吗？")) return;
      generate({ tab: tab || "outline", prompt, source: source || outline, fileApproved }, false);
    });
    dom.upload.addEventListener("change", () => {
      const file = dom.upload.files[0];
      dom.upload.value = "";
      upload(file);
    });

    dom.root.addEventListener("click", async (event) => {
      const t = event.target;
      if (t.closest("[data-mm-sample]")) {
        if (state.busy || state.tab === "files") return;
        if (state[state.tab].trim() && state[state.tab] !== state.completed[state.tab] && !window.confirm("用示例替换当前输入？")) return;
        state[state.tab] = state.tab === "text" ? SAMPLE_TEXT : OUTLINE_HINT;
        generate();
        return;
      }
      if (t.closest("[data-mm-clear]")) {
        if (state.tab === "files") state.selectedFile = state.pendingFile = "";
        else state[state.tab] = "";
        state.inputError = "";
        renderPanel();
        syncActions();
        syncDirty();
        dom.panel.querySelector("textarea, [data-mm-file]")?.focus();
        return;
      }
      if (t.closest("[data-mm-upload]")) { dom.upload.click(); return; }
      const selected = t.closest("[data-mm-file]");
      if (selected) {
        if (state.busy || !selectableFile(selected.dataset.mmFile)) return;
        state.selectedFile = selected.dataset.mmFile;
        state.pendingFile = "";
        state.inputError = "";
        for (const button of dom.panel.querySelectorAll("[data-mm-file]")) {
          const active = button === selected;
          button.setAttribute("aria-pressed", String(active));
          button.closest(".mm-file").classList.toggle("is-active", active);
        }
        syncActions();
        return;
      }
      const del = t.closest("[data-mm-file-del]");
      if (del) {
        const file = state.files.find(item => item.id === del.dataset.mmFileDel);
        if (!file || !window.confirm(`移除「${file.fileName}」？`)) return;
        const session = state;
        try {
          if (file.sample) state.files = state.files.filter(item => item.id !== file.id);
          else await documents.remove(file.id);
        } catch (error) { if (state === session) state.fileError = error.message || "移除失败，请重试。"; }
        if (state !== session) return;
        if (state.pendingFile === file.id) state.pendingFile = "";
        refreshFiles();
        dom.panel.querySelector("[data-mm-file], [data-mm-upload]")?.focus();
        return;
      }
      const audit = t.closest("[data-mm-file-audit]");
      if (audit) {
        state.auditFile = audit.dataset.mmFileAudit;
        renderAudit();
        dom.auditDialog.showModal();
        return;
      }
      const action = t.closest("[data-mm-audit-submit], [data-mm-audit-pass], [data-mm-audit-reject]");
      if (action) {
        const status = action.hasAttribute("data-mm-audit-submit") ? "submitted" : action.hasAttribute("data-mm-audit-pass") ? "passed" : "rejected";
        try {
          documents.audit(state.auditFile, status);
          refreshFiles();
          dom.auditDialog.querySelector("[data-mm-audit-close]").focus();
        } catch (error) {
          refreshFiles();
          if (dom.auditDialog.open) dom.auditDialog.querySelector("[data-mm-audit-message]").textContent = error.message;
        }
        return;
      }
      if (t.closest("[data-mm-audit-close]")) { dom.auditDialog.close(); return; }
      if (t.closest("[data-mm-notice-close]")) { dom.notice.close(); return; }
      const fileAction = t.closest("[data-mm-file-eye], [data-mm-file-down]");
      if (fileAction) {
        const file = selectableFile(fileAction.dataset.mmFileEye || fileAction.dataset.mmFileDown);
        if (!file) return;
        if (fileAction.hasAttribute("data-mm-file-down")) {
          const session = state;
          try {
            const blob = file.sample ? new Blob([file.text], { type: "text/markdown;charset=utf-8" }) : await documents.original(file.id);
            if (state === session && state.active) download(blob, file.fileName);
          } catch (error) { if (state === session) hint(error.message || "原文件不可用，请重新上传。"); }
        } else {
          dom.fileDialog.querySelector("[data-mm-file-title]").textContent = file.fileName;
          dom.fileDialog.querySelector("[data-mm-file-preview]").textContent = file.text;
          dom.fileDialog.showModal();
        }
        return;
      }
      if (t.closest("[data-mm-file-close]")) { dom.fileDialog.close(); return; }
      if (t.closest("[data-mm-edit]")) { openEditor(); return; }
      if (t.closest("[data-mm-export]")) { exportImage(); return; }
      if (t.closest("[data-mm-history-btn]")) { toggleDrawer(true); return; }
      if (t.closest("[data-mm-drawer-close]") || t.closest("[data-mm-mask]")) { toggleDrawer(false); return; }
      if (t.closest("[data-mm-dialog-close]") || t.closest("[data-mm-dialog-cancel]")) { closeEditor(); return; }
      if (t.closest("[data-mm-dialog-save]")) { saveEditor(); return; }
      const page = t.closest("[data-mm-page]");
      if (page) { state.page = Number(page.dataset.mmPage); renderDrawer(); return; }
      const record = t.closest("[data-mm-history]");
      if (record) {
        const item = state.history.find((x) => x.id === record.dataset.mmHistory);
        if (!item) return;
        if (item.tab === "files" && !item.fileApproved) { hint("此记录的文档未经过核查，请重新上传文档后生成。"); return; }
        if (state.busy) { hint("请等待当前导图生成完成。"); return; }
        state.doc = parseOutline(item.outline);
        state.result = item;
        toggleDrawer(false);
        renderStage();
        return;
      }
      const remove = t.closest("[data-mm-history-del]");
      if (remove) {
        state.history = state.history.filter((x) => x.id !== remove.dataset.mmHistoryDel);
        if (!write()) hint("浏览器存储更新失败，刷新后此记录可能恢复。");
        dom.historyBtn.querySelector(".mm-history-count").textContent = state.history.length;
        renderDrawer();
        dom.drawer.querySelector("[data-mm-history]")?.focus();
        return;
      }
    });

    dom.root.addEventListener("input", (event) => {
      const t = event.target;
      if (t.matches("[data-mm-text], [data-mm-outline]")) {
        state[state.tab] = t.value;
        state.inputError = "";
        syncActions();
      }
      if (t.matches("[data-mm-file-search]")) { state.fileQuery = t.value; renderPanel(); dom.panel.querySelector("[data-mm-file-search]")?.focus(); }
      if (t.matches("[data-mm-history-search]")) { state.historyQuery = t.value; state.page = 1; renderDrawer(); dom.drawer.querySelector("[data-mm-history-search]")?.focus(); }
      if (t.matches("[data-mm-editor]")) { syncGutter(); }
      syncDirty();
    });
    dom.root.addEventListener("change", syncDirty);
    dom.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.drawer) toggleDrawer(false);
    });

    dom.dialog.addEventListener("cancel", (event) => { event.preventDefault(); closeEditor(); });
    dom.dialog.addEventListener("close", syncDirty);
    dom.editor.addEventListener("scroll", () => { dom.gutter.scrollTop = dom.editor.scrollTop; });
  }

  function toggleDrawer(open) {
    state.drawer = open;
    dom.historyBtn.setAttribute("aria-expanded", String(open));
    if (open) state.page = 1;
    renderDrawer();
    if (open) dom.drawer.querySelector("[data-mm-history-search]").focus();
    else dom.historyBtn.focus();
  }

  function syncGutter() {
    const lines = dom.editor.value.split("\n").length;
    dom.gutter.textContent = Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1).join("\n");
  }

  function openEditor() {
    if (!state.doc) return;
    dom.editor.value = state.result.outline;
    dom.editor.removeAttribute("aria-invalid");
    dom.editorNote.textContent = "保存后将同步更新历史记录。";
    syncGutter();
    dom.dialog.showModal();
    dom.editor.focus();
    dom.editor.setSelectionRange(0, 0);
    dom.editor.scrollTop = 0;
    dom.gutter.scrollTop = 0;
  }

  function closeEditor() {
    if (dom.editor.value !== state.result.outline && !window.confirm("放弃这次大纲修改？")) return;
    dom.dialog.close();
  }

  function saveEditor() {
    const text = dom.editor.value;
    if (!text.trim()) {
      dom.editor.setAttribute("aria-invalid", "true");
      dom.editorNote.textContent = "请填写大纲后再保存。";
      dom.editor.focus();
      return;
    }
    const { tab, prompt, source, outline, id, fileApproved } = state.result;
    state.doc = parseOutline(text);
    state.result = saveHistory({ tab: tab || "outline", prompt, source: source || outline, fileApproved }, text, id);
    dom.dialog.close();
    renderStage();
  }

  /* ---------------- 对外 ---------------- */
  function render(root, onDirty) {
    clearTimeout(auditTimer);
    clearTimeout(noticeTimer);
    state = createState();
    root.innerHTML = shell();
    dom = {
      root,
      tabs: root.querySelector(".mm-tabs"),
      panel: root.querySelector("[data-mm-panel]"),
      canvas: root.querySelector("[data-mm-canvas]"),
      stageTitle: root.querySelector("[data-mm-stage-title]"),
      stageMeta: root.querySelector("[data-mm-stage-meta]"),
      run: root.querySelector("[data-mm-run]"),
      clear: root.querySelector("[data-mm-clear]"),
      examples: root.querySelector("[data-mm-examples]"),
      inputError: root.querySelector("[data-mm-input-error]"),
      upload: root.querySelector("[data-mm-upload-input]"),
      resultTools: root.querySelector("[data-mm-result-tools]"),
      regen: root.querySelector("[data-mm-regen]"),
      historyBtn: root.querySelector("[data-mm-history-btn]"),
      dialog: root.querySelector("[data-mm-dialog]"),
      fileDialog: root.querySelector("[data-mm-file-dialog]"),
      notice: root.querySelector("[data-mm-notice]"),
      auditDialog: root.querySelector("[data-mm-audit-dialog]"),
      editor: root.querySelector("[data-mm-editor]"),
      editorNote: root.querySelector("[data-mm-editor-note]"),
      gutter: root.querySelector("[data-mm-gutter]"),
      mask: root.querySelector("[data-mm-mask]"),
      drawer: root.querySelector("[data-mm-drawer]"),
      drawerBody: root.querySelector("[data-mm-drawer-body]"),
      drawerFoot: root.querySelector("[data-mm-drawer-foot]"),
      toast: root.querySelector("[data-mm-toast]"),
    };
    notifyDirty = typeof onDirty === "function" ? onDirty : () => {};
    state.history = read();
    bind();
    renderAll();
  }

  function resume() {
    if (!dom) return;
    state.active = true;
    refreshFiles();
    if (!state.busy) renderStage();
  }

  function deactivate() {
    if (!dom) return;
    state.active = false;
    clearTimeout(auditTimer);
    clearTimeout(noticeTimer);
    if (dom.notice.open) dom.notice.close();
    if (dom.auditDialog.open) dom.auditDialog.close();
    if (dom.fileDialog.open) dom.fileDialog.close();
    if (state.drawer) toggleDrawer(false);
  }

  window.addEventListener?.("storage", (event) => {
    if (state.active && (event.key === documents?.KEY || event.key === null)) refreshFiles();
  });

  window.BaigeMindmapTool = { render, resume, deactivate, parseOutline, outlineTitle, outlineFromFile, normalizeOutline };
})();
