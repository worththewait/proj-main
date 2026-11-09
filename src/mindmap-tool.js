/* 智能工具的「思维导图生成」：左侧输入（自然语言 / 文档 / 大纲），右侧按 markmap 风格渲染。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const KEY = "baige.mindmap.v1";

  const SAMPLE_TEXT = "围绕 8000TEU 集装箱船甲板机械选型开展技术梳理：请从总体目标、关键技术、分项要点、风险与对策、实施建议五个维度展开；重点关注电动液压起重机的选型对比、系泊绞车布置方案、导缆装置标准化，以及钢材采购周期与船坞档期带来的交付风险。";

  const OUTLINE_HINT = "## 导图名称\n### 一级分支\n- 二级节点\n  - 三级节点\n\n第一行为导图名称；每 2 空格或 1 Tab 为一级层级，可用 -、*、· 或编号作为条目前缀";

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

  const state = {
    tab: "text",
    text: "",
    outline: "",
    doc: null,
    history: [],
    files: [
      { id: "f1", name: "小作文2.pdf", status: "已入库" },
      { id: "f2", name: "测试报告 (1).docx", status: "已入库" },
    ],
    fileQuery: "",
    historyQuery: "",
    drawer: false,
    busy: false,
    editing: false,
    draft: "",
    page: 1,
  };

  let dom = null;
  let notifyDirty = () => {};
  let streamTimer = 0;

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
    const scale = Math.min(1, (viewW - 8) / contentW, (viewH - 8) / contentH);
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

    const inner = links.join("") + marks.join("");
    const body = scale < 1
      ? `<g transform="translate(2,2) scale(${scale.toFixed(4)})">${inner}</g>`
      : inner;
    return {
      w: Math.ceil(w * (scale < 1 ? scale : 1)),
      h: Math.ceil(h * (scale < 1 ? scale : 1)),
      html: `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(w * (scale < 1 ? scale : 1))}" height="${Math.ceil(h * (scale < 1 ? scale : 1))}" viewBox="0 0 ${Math.ceil(w)} ${Math.ceil(h)}" font-family='"PingFang SC","Microsoft YaHei",system-ui,sans-serif'>${body}</svg>`,
    };
  }

  /* ---------------- 渲染 ---------------- */
  function renderAll() {
    if (!dom) return;
    renderTabs();
    renderPanel();
    renderStage();
    renderDrawer();
  }

  function renderTabs() {
    dom.tabs.querySelectorAll("[data-mm-tab]").forEach((btn) => {
      const active = btn.dataset.mmTab === state.tab;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });
  }

  function renderPanel() {
    const list = state.files.filter((f) => f.name.includes(state.fileQuery.trim()));
    const panels = {
      text: `
        <div class="mm-label"><b>主题与要点</b><button class="mm-link" type="button" data-mm-sample>填入示例需求</button></div>
        <textarea class="mm-input" data-mm-text placeholder="请描述思维导图主题与要点，如：围绕集装箱船甲板机械选型，梳理关键技术、分项要点与风险对策" aria-label="主题与要点">${escape(state.text)}</textarea>`,
      files: `
        <div class="mm-files-head"><b>文件列表（${state.files.length}）</b><span class="mm-files-count">可用 ${state.files.length} · 处理中 0</span>
          <button class="mm-upload" type="button" data-mm-upload>${icon("upload")}上传文档</button></div>
        <label class="mm-search">${icon("search")}<input type="search" data-mm-file-search placeholder="搜索文件名" value="${escape(state.fileQuery)}" aria-label="搜索文件名" /></label>
        <ul class="mm-file-list">${list.length ? list.map((file) => `
          <li class="mm-file" data-mm-file="${escape(file.id)}">
            <span class="mm-file-name" title="${escape(file.name)}">${escape(file.name)}</span>
            <span class="mm-file-tag">${escape(file.status)}</span>
            <span class="mm-file-ops">
              <button type="button" data-mm-file-eye="${escape(file.id)}" title="查看文件" aria-label="查看 ${escape(file.name)}">${icon("eye")}</button>
              <button type="button" data-mm-file-down="${escape(file.id)}" title="下载" aria-label="下载 ${escape(file.name)}">${icon("download")}</button>
              <button class="is-danger" type="button" data-mm-file-del="${escape(file.id)}" title="删除" aria-label="删除 ${escape(file.name)}">${icon("trash")}</button>
            </span>
          </li>`).join("") : '<li class="mm-note">没有匹配的文件。</li>'}</ul>
        <p class="mm-note">共 ${state.files.length} 个文件<br />仅处理完成的文档可选中；生成时按所选文档内容出图。</p>`,
      outline: `
        <div class="mm-label"><b>大纲内容</b></div>
        <textarea class="mm-outline" data-mm-outline spellcheck="false" aria-label="大纲内容" placeholder="${escape(OUTLINE_HINT)}">${escape(state.outline)}</textarea>`,
    };
    dom.panel.innerHTML = panels[state.tab] || "";
  }

  function renderStage() {
    const hasDoc = Boolean(state.doc);
    dom.stageTitle.innerHTML = `${icon("branch")}<span>${state.tab === "files" && !hasDoc ? "生成列表" : "导图预览"}</span>`;
    dom.edit.disabled = !hasDoc;
    dom.regen.disabled = !hasDoc || state.busy;
    dom.export.disabled = !hasDoc;
    dom.historyBtn.textContent = `历史记录 ${state.history.length}`;

    if (state.busy) {
      dom.canvas.innerHTML = `<div class="mm-stream" role="status"><header><span class="mm-stream-dot" aria-hidden="true"></span>思考中…</header><div data-mm-stream></div></div>`;
      return;
    }
    if (!hasDoc) {
      const copy = state.tab === "files" ? "选择左侧文档后查看生成任务" : "暂无导图，请在左侧生成或从生成列表预览";
      dom.canvas.innerHTML = `<div class="mm-empty"><span class="mm-empty-icon">${icon("branch")}</span><p>${copy}</p></div>`;
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
        <li class="mm-history-item${state.docTitle === item.title ? " is-active" : ""}" data-mm-history="${escape(item.id)}" role="button" tabindex="0">
          <span class="mm-history-copy">
            <span class="mm-history-title" title="${escape(item.title)}">${escape(item.title)}</span>
            <span class="mm-history-meta">${escape(clock(item.at))} · ${item.nodes} 个节点</span>
          </span>
          <button class="mm-history-del" type="button" data-mm-history-del="${escape(item.id)}" title="删除记录" aria-label="删除 ${escape(item.title)}">${icon("trash")}</button>
        </li>`).join("")}</ul>`
      : `<div class="mm-drawer-empty"><span class="mm-empty-icon">${icon("branch")}</span><p>${q ? "没有匹配的记录" : "暂无历史记录，生成后会在此保存"}</p></div>`;

    dom.drawerFoot.innerHTML = pages > 1
      ? `${Array.from({ length: pages }, (_, i) => `<button class="mm-page-btn${state.page === i + 1 ? " is-current" : ""}" type="button" data-mm-page="${i + 1}">${i + 1}</button>`).join("")}`
      : `<button class="mm-page-btn is-current" type="button" disabled>1</button>`;
    dom.drawerFoot.hidden = false;
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

  async function generate() {
    if (state.busy) return;
    const prompt = state.tab === "outline" ? state.outline : state.text;
    if (!prompt.trim()) { hint(state.tab === "outline" ? "请先输入大纲内容。" : "请先输入主题与要点。"); return; }

    state.busy = true;
    state.doc = null;
    syncRunButton();
    renderStage();

    const source = state.tab === "outline" ? state.outline : pickSample(prompt);
    const lines = source.split("\n").filter((l) => l.trim());
    const stream = dom.canvas.querySelector("[data-mm-stream]");
    const shown = [];
    for (const line of lines) {
      if (!state.busy) return;
      shown.push(toStreamLine(line));
      if (stream) {
        stream.innerHTML = shown.map((item, i) => `<span class="mm-stream-line is-${item.depth}${i === shown.length - 1 ? " is-last" : ""}" style="padding-left:${item.depth * 16}px">${item.depth > 1 ? '<i class="mm-stream-bullet" aria-hidden="true"></i>' : ""}${escape(item.text)}</span>`).join("") + '<span class="mm-stream-caret"></span>';
        stream.scrollTop = stream.scrollHeight;
      }
      await sleep(58);
    }
    await sleep(320);

    state.busy = false;
    syncRunButton();
    state.outline = source;
    state.doc = parseOutline(source);
    state.docTitle = outlineTitle(source);
    saveHistory(prompt, source, countNodes(state.doc));
    renderAll();
    notifyDirty(false);
  }

  function syncRunButton() {
    if (!dom) return;
    dom.run.disabled = state.busy;
    dom.run.classList.toggle("is-busy", state.busy);
    dom.run.innerHTML = state.busy ? `${icon("refresh")}<span>生成中…</span>` : "生成思维导图";
  }

  function saveHistory(prompt, source, nodes) {
    const title = outlineTitle(source);
    const record = { id: `m-${Date.now().toString(36)}`, title, prompt: prompt.slice(0, 200), outline: source, nodes, at: Date.now() };
    state.history = [record, ...state.history.filter((item) => item.title !== title)].slice(0, 30);
    write();
  }

  /* ---------------- 导出 ---------------- */
  function exportImage() {
    const svgNode = dom.canvas.querySelector(".mm-map svg");
    if (!svgNode) return;
    const source = new XMLSerializer().serializeToString(svgNode);
    const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const scale = 2;
      const canvas = document.createElement("canvas");
      canvas.width = svgNode.width.baseVal.value * scale;
      canvas.height = svgNode.height.baseVal.value * scale;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((png) => {
        if (!png) { hint("导出失败，请重试。"); return; }
        const link = document.createElement("a");
        link.href = URL.createObjectURL(png);
        link.download = `${state.docTitle || "思维导图"}.png`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 2000);
        hint("已导出 PNG。");
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(url); hint("导出失败，请重试。"); };
    img.src = url;
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
            <div><h2>思维导图生成</h2><p>自然语言 / 文档 / 大纲</p></div>
          </header>
          <div class="mm-tabs" role="tablist" aria-label="输入方式">
            <button class="mm-tab is-active" type="button" role="tab" aria-selected="true" data-mm-tab="text">自然语言</button>
            <button class="mm-tab" type="button" role="tab" aria-selected="false" data-mm-tab="files">文档上传</button>
            <button class="mm-tab" type="button" role="tab" aria-selected="false" data-mm-tab="outline">输入大纲</button>
          </div>
          <div class="mm-panel" data-mm-panel></div>
          <div class="mm-actions">
            <button class="mm-run" type="button" data-mm-run>生成思维导图</button>
            <button class="mm-run-alt" type="button" data-mm-flow>生成流程图</button>
            <button class="mm-clear" type="button" data-mm-clear>清空</button>
          </div>
        </section>
        <section class="mm-stage">
          <header class="mm-stage-head">
            <span class="mm-stage-title" data-mm-stage-title></span>
            <div class="mm-tools">
              <button class="mm-tool is-plain" type="button" data-mm-edit disabled>编辑大纲</button>
              <button class="mm-tool is-plain" type="button" data-mm-regen disabled>重新生成</button>
              <button class="mm-tool" type="button" data-mm-export disabled>导出图片</button>
              <button class="mm-tool is-plain" type="button" data-mm-history-btn>历史记录 0</button>
            </div>
          </header>
          <div class="mm-canvas" data-mm-canvas></div>
        </section>
      </div>

      <dialog class="mm-dialog" data-mm-dialog aria-labelledby="mmDialogTitle">
        <header class="mm-dialog-head">
          <h2 id="mmDialogTitle">编辑大纲</h2>
          <p>每 2 空格为一级层级；保存后导图立即更新</p>
          <button class="mm-dialog-close" type="button" data-mm-dialog-close aria-label="关闭">×</button>
        </header>
        <div class="mm-editor">
          <div class="mm-editor-gutter" data-mm-gutter aria-hidden="true">1</div>
          <textarea class="mm-editor-text" data-mm-editor spellcheck="false" aria-label="大纲源码"></textarea>
        </div>
        <footer class="mm-dialog-foot">
          <span class="mm-dialog-note">未保存的修改在关闭后丢弃</span>
          <button class="mm-btn mm-btn-ghost" type="button" data-mm-dialog-cancel>取消</button>
          <button class="mm-btn mm-btn-primary" type="button" data-mm-dialog-save>保存</button>
        </footer>
      </dialog>

      <div class="mm-mask" data-mm-mask hidden></div>
      <aside class="mm-drawer" data-mm-drawer hidden aria-label="历史记录">
        <header class="mm-drawer-head">
          <h2>历史记录</h2>
          <button class="mm-drawer-close" type="button" data-mm-drawer-close aria-label="关闭">×</button>
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
      renderAll();
      if (state.tab === "files" && !state.doc) renderStage();
    });

    dom.run.addEventListener("click", generate);
    dom.regen.addEventListener("click", generate);

    dom.root.addEventListener("click", (event) => {
      const t = event.target;
      if (t.closest("[data-mm-sample]")) {
        state.text = SAMPLE_TEXT;
        const field = dom.panel.querySelector("[data-mm-text]");
        if (field) field.value = SAMPLE_TEXT;
        return;
      }
      if (t.closest("[data-mm-flow]")) { hint("流程图生成待接入。"); return; }
      if (t.closest("[data-mm-clear]")) {
        state.text = "";
        state.outline = "";
        state.doc = null;
        state.docTitle = "";
        renderAll();
        hint("已清空。");
        return;
      }
      if (t.closest("[data-mm-upload]")) { hint("文档上传待接入文件服务。"); return; }
      const del = t.closest("[data-mm-file-del]");
      if (del) {
        state.files = state.files.filter((f) => f.id !== del.dataset.mmFileDel);
        renderPanel();
        return;
      }
      if (t.closest("[data-mm-file-eye]") || t.closest("[data-mm-file-down]")) { hint("文件预览与下载待接入文件服务。"); return; }
      if (t.closest("[data-mm-edit]")) { openEditor(); return; }
      if (t.closest("[data-mm-export]")) { exportImage(); return; }
      if (t.closest("[data-mm-history-btn]")) { state.drawer = true; state.page = 1; renderDrawer(); return; }
      if (t.closest("[data-mm-drawer-close]") || t.closest("[data-mm-mask]")) { state.drawer = false; renderDrawer(); return; }
      if (t.closest("[data-mm-dialog-close]") || t.closest("[data-mm-dialog-cancel]")) { closeEditor(); return; }
      if (t.closest("[data-mm-dialog-save]")) { saveEditor(); return; }
      const page = t.closest("[data-mm-page]");
      if (page) { state.page = Number(page.dataset.mmPage); renderDrawer(); return; }
      const record = t.closest("[data-mm-history]");
      if (record) {
        const item = state.history.find((x) => x.id === record.dataset.mmHistory);
        if (!item) return;
        state.outline = item.outline;
        state.doc = parseOutline(item.outline);
        state.docTitle = item.title;
        state.drawer = false;
        renderAll();
        return;
      }
      const remove = t.closest("[data-mm-history-del]");
      if (remove) {
        state.history = state.history.filter((x) => x.id !== remove.dataset.mmHistoryDel);
        write();
        renderDrawer();
        return;
      }
    });

    dom.root.addEventListener("input", (event) => {
      const t = event.target;
      if (t.matches("[data-mm-text]")) { state.text = t.value; notifyDirty(Boolean(t.value.trim())); }
      if (t.matches("[data-mm-outline]")) { state.outline = t.value; notifyDirty(Boolean(t.value.trim())); }
      if (t.matches("[data-mm-file-search]")) { state.fileQuery = t.value; renderPanel(); dom.panel.querySelector("[data-mm-file-search]")?.focus(); }
      if (t.matches("[data-mm-history-search]")) { state.historyQuery = t.value; state.page = 1; renderDrawer(); dom.drawer.querySelector("[data-mm-history-search]")?.focus(); }
      if (t.matches("[data-mm-editor]")) { syncGutter(); }
    });

    dom.dialog.addEventListener("cancel", () => { state.editing = false; });
    dom.editor.addEventListener("scroll", () => { dom.gutter.scrollTop = dom.editor.scrollTop; });
  }

  function syncGutter() {
    const lines = dom.editor.value.split("\n").length;
    dom.gutter.textContent = Array.from({ length: Math.max(lines, 1) }, (_, i) => i + 1).join("\n");
  }

  function openEditor() {
    if (!state.doc) return;
    dom.editor.value = state.outline;
    syncGutter();
    dom.dialog.showModal();
    dom.editor.focus();
    dom.editor.setSelectionRange(0, 0);
    dom.editor.scrollTop = 0;
    dom.gutter.scrollTop = 0;
  }

  function closeEditor() {
    dom.dialog.close();
  }

  function saveEditor() {
    const text = dom.editor.value;
    if (!text.trim()) { hint("大纲不能为空。"); return; }
    state.outline = text;
    state.doc = parseOutline(text);
    state.docTitle = outlineTitle(text);
    dom.dialog.close();
    renderAll();
    hint("大纲已更新。");
  }

  /* ---------------- 对外 ---------------- */
  function render(root, onDirty) {
    root.innerHTML = shell();
    dom = {
      root,
      tabs: root.querySelector(".mm-tabs"),
      panel: root.querySelector("[data-mm-panel]"),
      canvas: root.querySelector("[data-mm-canvas]"),
      stageTitle: root.querySelector("[data-mm-stage-title]"),
      run: root.querySelector("[data-mm-run]"),
      regen: root.querySelector("[data-mm-regen]"),
      edit: root.querySelector("[data-mm-edit]"),
      export: root.querySelector("[data-mm-export]"),
      historyBtn: root.querySelector("[data-mm-history-btn]"),
      dialog: root.querySelector("[data-mm-dialog]"),
      editor: root.querySelector("[data-mm-editor]"),
      gutter: root.querySelector("[data-mm-gutter]"),
      mask: root.querySelector("[data-mm-mask]"),
      drawer: root.querySelector("[data-mm-drawer]"),
      drawerBody: root.querySelector("[data-mm-drawer-body]"),
      drawerFoot: root.querySelector("[data-mm-drawer-foot]"),
      toast: root.querySelector("[data-mm-toast]"),
    };
    notifyDirty = typeof onDirty === "function" ? onDirty : () => {};
    state.history = read();
    state.doc = null;
    state.busy = false;
    bind();
    renderAll();
    if (state.text) notifyDirty(true);
  }

  function resume() {
    if (!dom) return;
    renderAll();
  }

  function deactivate() {
    clearTimeout(streamTimer);
  }

  window.BaigeMindmapTool = { render, resume, deactivate, parseOutline, outlineTitle };
})();
