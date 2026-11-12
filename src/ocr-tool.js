/* OCR识别：左侧文件列表、中间文档预览、右侧结构化解析结果。
   解析内容为演示数据，文件与记录只存在当前页面内存。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const MAX_SIZE = 100 * 1024 * 1024;
  const ACCEPT = /\.(pdf|doc|docx|xls|xlsx|png|jpe?g)$/i;
  const TABS = [
    { id: "markdown", label: "Markdown" },
    { id: "json", label: "JSON" },
    { id: "content", label: "内容" },
    { id: "table", label: "表格" },
    { id: "chart", label: "图表" },
    { id: "formula", label: "公式" },
    { id: "image", label: "图片" },
    { id: "header", label: "页眉页脚" },
  ];

  /* 演示数据：文件名、状态与解析结构均为虚构示例。 */
  const SEED = [
    {
      id: "f1", name: "思维导图 - 百舸门户.pdf", size: 348160, status: "done", time: "2026-10-20 15:42:08",
      title: "思维导图", pages: 1,
      paragraphs: [
        "总体目标：重点关注电动液压起重机的选型对比、系泊绞车与锚机的协同配置。",
        "分项要点：（待补充）围绕 8000TEU 集装箱船甲板机械选型展开。",
        "关键技术：由后端抽取（演示占位）。",
        "风险与对策：由后端抽取（演示占位）。",
        "实施建议：由后端抽取（演示占位）。",
      ],
      table: { head: ["节点", "说明"], rows: [["总体目标", "电动液压起重机选型对比"], ["分项要点", "甲板机械选型"], ["风险与对策", "（演示占位）"]] },
      formulas: ["T = 2π√(L/g)"],
      header: ["页眉：百舸数智平台", "页脚：第 1 页 / 共 1 页"],
      images: 1,
    },
    {
      id: "f2", name: "LangChain工具开发实践指南.pdf", size: 1048576, status: "done", time: "2026-10-19 10:16:44",
      title: "LangChain 工具开发实践指南", pages: 18,
      paragraphs: [
        "本文梳理工具（Tool）的注册、参数声明与调用链路，并给出可复用的封装约定。",
        "工具描述需包含用途、入参含义与返回结构，便于模型判断调用时机。",
        "调用失败时应返回结构化错误，避免模型重复调用同一工具。",
      ],
      table: { head: ["字段", "类型", "说明"], rows: [["name", "string", "工具名"], ["description", "string", "用途说明"], ["args", "object", "入参定义"]] },
      formulas: [],
      header: ["页眉：技术文档", "页脚：第 1 页 / 共 18 页"],
      images: 3,
    },
    {
      id: "f3", name: "术语模版_水印下载_修复后.pdf", size: 512000, status: "done", time: "2026-10-18 09:30:12",
      title: "船舶专业术语表（节选）", pages: 6,
      paragraphs: [
        "收录甲板机械、推进系统、船体结构三个方向的常用术语与英文对照。",
        "术语条目按中文拼音排序，英文对照保留行业惯用写法。",
      ],
      table: { head: ["中文", "英文"], rows: [["系泊绞车", "mooring winch"], ["锚机", "windlass"], ["舱口盖", "hatch cover"]] },
      formulas: [],
      header: ["页眉：企业专业术语库", "页脚：第 2 页 / 共 6 页"],
      images: 0,
    },
    {
      id: "f4", name: "SY_T 7045-2016 离心泵和回转泵轴封系统.pdf", size: 2097152, status: "failed", time: "2026-10-17 16:22:31",
      title: "", pages: 0, paragraphs: [], table: null, formulas: [], header: [], images: 0,
    },
    { id: "f5", name: "机密秘密.pdf", size: 33454, status: "failed", time: "2026-10-16 14:15:56", title: "", pages: 0, paragraphs: [], table: null, formulas: [], header: [], images: 0 },
    { id: "f6", name: "试点总结框架-数据需要10.13.docx", size: 41984, status: "failed", time: "2026-10-15 11:02:18", title: "", pages: 0, paragraphs: [], table: null, formulas: [], header: [], images: 0 },
    {
      id: "f7", name: "小作文.pdf", size: 83702, status: "done", time: "2026-10-14 19:33:56",
      title: "小作文", pages: 2,
      paragraphs: ["船舶工业的数字化转型，核心是把设计、建造、试验三段数据打通。", "先统一编码与口径，再谈模型训练与智能应用。"],
      table: null, formulas: [], header: ["页眉：无", "页脚：第 1 页 / 共 2 页"], images: 0,
    },
    { id: "f8", name: "《智能船舶规范》（2025）.pdf", size: 262144, status: "failed", time: "2026-10-13 18:04:31", title: "", pages: 0, paragraphs: [], table: null, formulas: [], header: [], images: 0 },
    {
      id: "f9", name: "CN113936282B一种面向军工科研生产数据的字符识别方法及系统.pdf", size: 471040, status: "done", time: "2026-10-12 09:41:07",
      title: "一种面向军工科研生产数据的字符识别方法及系统", pages: 12,
      paragraphs: ["本发明公开一种字符识别方法，针对低质量扫描件先做倾斜校正与二值化，再送入识别网络。", "在军工科研生产场景下，对表格与编号类字段做结构化后处理，提升字段级准确率。"],
      table: { head: ["步骤", "处理"], rows: [["S1", "图像预处理"], ["S2", "区域检测"], ["S3", "字符识别与后处理"]] },
      formulas: [], header: ["页眉：专利文献", "页脚：第 1 页 / 共 12 页"], images: 2,
    },
  ];

  /* 上传按钮使用「文件 + 向上箭头」，与右上角下载图标的托盘箭头区分开。 */
  const UPLOAD_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h7l5 5v13H6Z"/><path d="M13 3v5h5"/><path d="M12 17v-5 m-2.5 2.5 2.5-2.5 2.5 2.5"/></svg>';

  const state = {
    records: [],
    keyword: "",
    selected: null,
    tab: "markdown",
    render: true,
    built: false,
    active: false,
    dom: null,
    onDirty: () => {},
    timer: 0,
  };

  const formatSize = bytes => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const isAllowed = name => ACCEPT.test(name);
  const ready = record => record && record.status === "done";

  function seedRecords() {
    return SEED.map(item => ({ ...item }));
  }

  function visibleRecords() {
    const keyword = state.keyword.trim();
    return keyword ? state.records.filter(item => item.name.includes(keyword)) : state.records;
  }

  function fileIcon(record) {
    const kind = /\.(png|jpe?g)$/i.test(record.name) ? "is-image" : /\.(xls|xlsx)$/i.test(record.name) ? "is-sheet" : "is-pdf";
    return `<span class="oc-file-icon ${kind}" aria-hidden="true">${kind === "is-image" ? icon("eye") : kind === "is-sheet" ? icon("panel") : icon("file")}</span>`;
  }

  function markup() {
    return `<div class="oc-page">
      <header class="oc-head">
        <h2>OCR解析工具</h2>
        <button class="oc-download" type="button" data-oc-action="download">${icon("download")}<span>下载</span></button>
      </header>
      <div class="oc-body">
        <aside class="oc-files" aria-label="文件列表">
          <div class="oc-search">
            <input class="oc-search-input" type="search" placeholder="搜索文件..." data-oc-search aria-label="搜索文件" autocomplete="off">
            <button class="oc-search-reset" type="button" data-oc-action="reset-search" aria-label="重置搜索">${icon("refresh")}</button>
          </div>
          <button class="oc-upload" type="button" data-oc-action="upload">${UPLOAD_ICON}<span>上传文件</span></button>
          <div class="oc-list" data-oc-list role="list"></div>
        </aside>
        <section class="oc-preview" data-oc-preview aria-label="文档预览"></section>
        <section class="oc-result" data-oc-result aria-label="解析结果"></section>
      </div>
      <input class="oc-file-input" type="file" hidden multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg">
    </div>`;
  }

  function emptyPreview() {
    return `<div class="oc-drop" data-oc-drop>
      <span class="oc-drop-icon" aria-hidden="true">${icon("folder")}<i>+</i></span>
      <strong>点击上传文件，拖拽文件到此处</strong>
      <p>支持的文件格式：PDF、Excel、Docx、Doc、图片</p>
      <p>大小不超过100M</p>
    </div>`;
  }

  function previewOf(record) {
    if (!record) return emptyPreview();
    if (!ready(record)) {
      return `<div class="oc-drop is-failed"><span class="oc-drop-icon" aria-hidden="true">${icon("file")}</span>
        <strong>解析失败</strong><p>该文件未能解析，请重新上传或更换文件。</p></div>`;
    }
    const lines = (record.paragraphs || []).map(text => `<p>${escape(text)}</p>`).join("");
    return `<div class="oc-doc">
      <div class="oc-doc-bar">
        <span class="oc-doc-pager">1 / ${record.pages || 1}</span>
        <span class="oc-doc-zoom">
          <button type="button" data-oc-action="zoom-out" aria-label="缩小">−</button>
          <button type="button" data-oc-action="zoom-in" aria-label="放大">+</button>
        </span>
      </div>
      <div class="oc-doc-page"><h3>${escape(record.title)}</h3>${lines}<p class="oc-doc-note">${escape(record.name)}</p></div>
    </div>`;
  }

  function markdownOf(record) {
    const lines = [`# ${record.title}`, "", `> 来源：${record.name}　解析时间：${record.time}`, ""];
    (record.paragraphs || []).forEach(text => lines.push(`${text}`, ""));
    if (record.table) {
      lines.push(`| ${record.table.head.join(" | ")} |`, `| ${record.table.head.map(() => "---").join(" | ")} |`);
      record.table.rows.forEach(row => lines.push(`| ${row.join(" | ")} |`));
      lines.push("");
    }
    lines.push(`（共 ${record.pages} 页）`);
    return lines.join("\n");
  }

  function renderMarkdown(record) {
    const body = (record.paragraphs || []).map(text => `<p>${escape(text)}</p>`).join("");
    const table = record.table
      ? `<table class="oc-md-table"><thead><tr>${record.table.head.map(cell => `<th>${escape(cell)}</th>`).join("")}</tr></thead>
         <tbody>${record.table.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`
      : "";
    return `<div class="oc-md">
      <p class="oc-md-meta">${escape(record.time)}</p>
      <h3>${escape(record.title)}</h3>
      ${body}${table}
      <p class="oc-md-src">${escape(record.name)}</p>
      <p class="oc-md-page">1/${record.pages || 1}</p>
    </div>`;
  }

  function resultBody(record) {
    if (!record) return `<div class="oc-empty"><span aria-hidden="true">${icon("file")}</span><p>请先选择文件</p></div>`;
    if (!ready(record)) return `<div class="oc-empty"><span aria-hidden="true">${icon("file")}</span><p>该文件解析失败，暂无结果</p></div>`;

    if (state.tab === "markdown") {
      return state.render ? renderMarkdown(record) : `<pre class="oc-raw">${escape(markdownOf(record))}</pre>`;
    }
    if (state.tab === "json") {
      const json = { title: record.title, source: record.name, parsedAt: record.time, pages: record.pages, paragraphs: record.paragraphs, table: record.table, formulas: record.formulas, header: record.header, images: record.images };
      return `<pre class="oc-raw">${escape(JSON.stringify(json, null, 2))}</pre>`;
    }
    if (state.tab === "content") {
      return `<div class="oc-block"><h4>正文段落（${record.paragraphs.length}）</h4>
        ${record.paragraphs.map((text, index) => `<p class="oc-line"><em>${index + 1}</em>${escape(text)}</p>`).join("")}</div>`;
    }
    if (state.tab === "table") {
      if (!record.table) return `<div class="oc-empty"><span aria-hidden="true">${icon("panel")}</span><p>未识别到表格</p></div>`;
      return `<div class="oc-block"><h4>识别到 1 个表格</h4>
        <table class="oc-md-table"><thead><tr>${record.table.head.map(cell => `<th>${escape(cell)}</th>`).join("")}</tr></thead>
        <tbody>${record.table.rows.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    if (state.tab === "chart") {
      return `<div class="oc-empty"><span aria-hidden="true">${icon("chart")}</span><p>本文档未识别到图表</p></div>`;
    }
    if (state.tab === "formula") {
      if (!record.formulas.length) return `<div class="oc-empty"><span aria-hidden="true">${icon("code")}</span><p>本文档未识别到公式</p></div>`;
      return `<div class="oc-block"><h4>识别到 ${record.formulas.length} 个公式</h4>
        ${record.formulas.map(item => `<p class="oc-formula">${escape(item)}</p>`).join("")}</div>`;
    }
    if (state.tab === "image") {
      if (!record.images) return `<div class="oc-empty"><span aria-hidden="true">${icon("eye")}</span><p>本文档未识别到图片</p></div>`;
      return `<div class="oc-block"><h4>识别到 ${record.images} 张图片</h4>
        <div class="oc-thumbs">${Array.from({ length: record.images }, (_, index) => `<span class="oc-thumb" aria-hidden="true"></span>`).join("")}</div></div>`;
    }
    return `<div class="oc-block"><h4>页眉页脚</h4>
      ${record.header.map(text => `<p class="oc-line">${escape(text)}</p>`).join("")}</div>`;
  }

  function resultMarkup(record) {
    const tabs = TABS.map(tab => `<button class="oc-tab${tab.id === state.tab ? " is-active" : ""}" type="button" role="tab" aria-selected="${tab.id === state.tab}" data-oc-tab="${tab.id}">${tab.label}</button>`).join("");
    const bar = `<div class="oc-result-bar">
        <label class="oc-toggle"><input type="checkbox" data-oc-render ${state.render ? "checked" : ""}><span>Markdown渲染</span></label>
      </div>`;
    return `<div class="oc-tabs" role="tablist" aria-label="解析结果视图">${tabs}</div>
      ${bar}
      <div class="oc-result-body" data-oc-body>${resultBody(record)}</div>
      <footer class="oc-result-foot">
        <button class="oc-ghost" type="button" data-oc-action="save">${icon("check")}<span>保存</span></button>
        <button class="oc-ghost" type="button" data-oc-action="copy">${icon("file")}<span>复制</span></button>
      </footer>`;
  }

  function renderList() {
    const list = state.dom.list;
    if (!list) return;
    const records = visibleRecords();
    list.innerHTML = records.length
      ? records.map(record => `<button class="oc-file${record.id === state.selected ? " is-active" : ""}" type="button" role="listitem" data-oc-file="${record.id}">
          ${fileIcon(record)}
          <span class="oc-file-copy"><span class="oc-file-name" title="${escape(record.name)}">${escape(record.name)}</span>
          <span class="oc-file-state ${record.status === "done" ? "is-done" : record.status === "failed" ? "is-failed" : "is-running"}">${record.status === "done" ? "解析完成" : record.status === "failed" ? "解析失败" : "解析中"}</span></span>
        </button>`).join("")
      : `<p class="oc-list-empty">没有匹配的文件</p>`;
  }

  function renderPanels() {
    const record = state.records.find(item => item.id === state.selected) || null;
    state.dom.preview.innerHTML = previewOf(record);
    state.dom.result.innerHTML = resultMarkup(record);
  }

  function selectRecord(id) {
    state.selected = id;
    renderList();
    renderPanels();
  }

  function toast(message) {
    let el = document.querySelector(".oc-toast");
    if (!el) {
      el = document.createElement("div");
      el.className = "oc-toast";
      el.setAttribute("role", "status");
      el.hidden = true;
      document.body.append(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(state.timer);
    state.timer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function addFiles(files) {
    [...files].forEach(file => {
      if (!isAllowed(file.name)) { toast(`不支持的文件格式：${file.name}`); return; }
      if (file.size > MAX_SIZE) { toast(`文件超过 100MB：${file.name}`); return; }
      const record = { id: `u${Date.now()}${Math.random().toString(16).slice(2, 6)}`, name: file.name, size: file.size, file, status: "running", time: new Date().toISOString().slice(0, 19).replace("T", " "), title: file.name.replace(/\.[^.]+$/, ""), pages: 1, paragraphs: ["（演示环境）文件已上传，解析结果由本地示例内容生成。"], table: null, formulas: [], header: [], images: 0 };
      state.records.unshift(record);
      state.selected = record.id;
      renderList();
      renderPanels();
      setTimeout(() => {
        record.status = "done";
        renderList();
        if (state.selected === record.id) renderPanels();
        state.onDirty(true);
        toast("解析完成");
      }, 1200);
    });
  }

  /* 下载源文件：上传的文件直接回传原文件；演示记录没有源文件，给出说明。 */
  function downloadSource(record) {
    if (!record) { toast("请先选择文件"); return; }
    if (!record.file) { toast("该记录为演示数据，上传文件后可下载原文件"); return; }
    const url = URL.createObjectURL(record.file);
    const link = document.createElement("a");
    link.href = url;
    link.download = record.name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(`正在下载 ${record.name}`);
  }

  function build(root) {
    root.classList.add("oc-workspace");
    root.innerHTML = markup();
    const dom = {
      page: root.querySelector(".oc-page"),
      list: root.querySelector("[data-oc-list]"),
      preview: root.querySelector("[data-oc-preview]"),
      result: root.querySelector("[data-oc-result]"),
      search: root.querySelector("[data-oc-search]"),
      input: root.querySelector(".oc-file-input"),
    };
    state.dom = dom;

    dom.page.addEventListener("click", event => {
      const record = state.records.find(item => item.id === state.selected) || null;
      const action = event.target.closest("[data-oc-action]")?.dataset.ocAction;
      const tab = event.target.closest("[data-oc-tab]")?.dataset.ocTab;
      const file = event.target.closest("[data-oc-file]")?.dataset.ocFile;
      if (file) { selectRecord(file); return; }
      if (tab) {
        state.tab = tab;
        renderPanels();
        // 标签较多时把当前项滚进可视区
        dom.result.querySelector(".oc-tab.is-active")?.scrollIntoView({ inline: "nearest", block: "nearest" });
        return;
      }
      if (!action) return;
      if (action === "upload") dom.input.click();
      if (action === "reset-search") { state.keyword = ""; dom.search.value = ""; renderList(); }
      if (action === "download") downloadSource(record);
      if (action === "save") toast("已保存到个人空间（演示）");
      if (action === "copy") {
        if (!record || !ready(record)) { toast("请先选择已解析的文件"); return; }
        const text = state.tab === "markdown" ? markdownOf(record) : JSON.stringify(record, null, 2);
        navigator.clipboard?.writeText(text).then(() => toast("已复制解析结果"), () => toast("复制失败，请手动选择内容"));
      }
      if (action === "zoom-in" || action === "zoom-out") toast("演示原型：缩放待接入");
    });

    dom.search.addEventListener("input", () => { state.keyword = dom.search.value; renderList(); });
    dom.input.addEventListener("change", () => { addFiles(dom.input.files); dom.input.value = ""; });

    dom.page.addEventListener("change", event => {
      if (event.target.matches("[data-oc-render]")) { state.render = event.target.checked; renderPanels(); }
    });

    dom.preview.addEventListener("click", event => {
      if (event.target.closest("[data-oc-drop]")) dom.input.click();
    });

    ["dragenter", "dragover"].forEach(type => dom.preview.addEventListener(type, event => { event.preventDefault(); dom.preview.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach(type => dom.preview.addEventListener(type, event => { event.preventDefault(); dom.preview.classList.remove("is-over"); }));
    dom.preview.addEventListener("drop", event => { if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files); });
  }

  function render(target, onDirty = () => {}) {
    state.onDirty = onDirty;
    if (!state.built) { state.records = seedRecords(); state.built = true; }
    if (!state.dom || !document.contains(state.dom.page)) build(target);
    else if (state.dom.page.parentElement !== target) { target.replaceChildren(state.dom.page); }
    state.active = true;
    renderList();
    renderPanels();
  }

  function resume() { state.active = true; if (state.dom) { renderList(); renderPanels(); } }

  function deactivate() {
    state.active = false;
    const el = document.querySelector(".oc-toast");
    if (el) el.hidden = true;
  }

  window.BaigeOcrTool = Object.freeze({
    render, resume, deactivate, seedRecords, TABS, MAX_SIZE, isAllowed, formatSize,
  });
})();
