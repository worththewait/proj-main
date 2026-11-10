/* 智能工具 · 文献伴读：文献列表（上传 + 历史）与阅读页（原文 + 伴读面板）。
   文档内容、概要与问答回复均为演示数据，文献记录仅存在当前页面内存。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const fileList = window.BaigeSecretFileList;
  const PAGE_SIZE = 10;
  const MAX_SIZE = 100 * 1024 * 1024;
  const ACCEPT = /\.(pdf|doc|docx)$/i;
  const STATUS = {
    done: { code: "stored", canDelete: true, canRead: true },
    parsing: { code: "detecting", canDelete: false, canRead: false },
    warning: { code: "hit", canDelete: true, canRead: false },
    submitted: { code: "submitted", canDelete: true, canRead: false },
    approved: { code: "approved", canDelete: true, canRead: true },
    rejected: { code: "rejected", canDelete: true, canRead: false },
    failed: { code: "failed", canDelete: true, canRead: false },
  };

  /* 演示记录：文件名为线上工作区的历史条目，正文与状态用于展示不同分支。 */
  const SEED = [
    ["试点总结框架-数据需要10.13.docx", "14.8 KB", "doc", "done", "2026-11-10 16:08:48"],
    ["1.docx", "10.9 KB", "doc", "parsing", "2026-11-02 16:38:53"],
    ["冲水操船.docx", "21.8 KB", "doc", "done", "2026-11-02 15:36:11"],
    ["源代码缺陷检测报告(data-quest-web-release-v1.0.1).docx", "61.7 KB", "doc", "parsing", "2026-11-02 15:17:08"],
    ["CN113936282B一种面向军工科研生产数据的字符识别方法及系统2.pdf", "638.6 KB", "pdf", "done", "2026-11-02 09:58:05"],
    ["CN113936282B一种面向军工科研生产数据的字符识别方法及系统.pdf", "638.6 KB", "pdf", "done", "2026-10-30 13:56:34"],
    ["脱m版_公司船舶标准化宣贯大会工作方案333.docx", "40.5 KB", "doc", "done", "2026-10-29 16:23:17"],
    ["附件1：《用户需求说明书》 -统一认证.doc", "43.5 KB", "doc", "warning", "2026-10-22 12:24:06"],
    ["船舶院需求规格说明书930版本对客.docx", "23.6 MB", "doc", "failed", "2026-10-21 21:03:09"],
  ];

  const DOC_PAGES = [
    {
      title: "一、数据提取",
      blocks: [
        { h: "1 客户档案数据：" },
        { p: "具体要求：" },
        { list: ["每个客户补充信息的次数", "最好是可以给到每个客户的信息明细宽表（统计数据我自己算）"] },
        { h: "2 客户洞察", hl: true },
        { list: ["生成客户洞察的客户数量", "用户点击查看客户洞察的次数"], hl: [0] },
        { h: "3 客户跟进：客户跟进内容分析", hl: true },
        { list: ["点击查看客户跟进的次数"], hl: [0] },
        { h: "4 智能问答：" },
        { list: ["智能问答：各用户问答内容清单", "点赞点踩数量"] },
        { h: "5 销售策略及解决方案" },
        { list: ["每个客户销售策略的问答清单", "每个客户解决方案的问答清单", "点赞点踩数据"] },
      ],
    },
    {
      title: "二、指标口径与统计周期",
      blocks: [
        { p: "上述指标按自然月统计，客户档案类指标以客户主数据为准，问答类指标以会话日志为准。" },
        { h: "1 客户档案更新" },
        { list: ["补充频次 = 期内发生档案变更的客户数 ÷ 期初客户数", "明细宽表按客户编号与业务日期输出，支持导出核对"] },
        { h: "2 客户洞察与跟进" },
        { list: ["洞察查看量按去重用户计，同一用户同一天多次查看计 1 次", "跟进查看量区分列表页与详情页，分别留痕"] },
        { h: "3 智能问答" },
        { list: ["问答清单保留问题原文、命中知识条目与时间", "点赞点踩按问答对记录，支持按业务线汇总"] },
        { p: "统计结果用于单数据飞轮向大数据飞轮演进的数据积累阈值评估，阈值口径需与业务部门确认后固化。" },
      ],
    },
  ];

  const SUMMARY = "明确船舶业务客户管理与销售系统的数据提取需求，涵盖客户档案更新频次、明细宽表、客户洞察与跟进查看量、智能问答清单及反馈数据，以及销售策略与解决方案的问答记录。同时要求评估单数据飞轮向大数据飞轮演进的数据积累阈值，并预测大数据飞轮运行至何种阶段。";

  const TOC = [
    "本文档明确船舶行业客户管理系统的数据提取需求，涵盖客户档案、客户洞察、客户跟进、智能问答及销售策略与解决方案五大模块。需提取客户信息补充频次与明细宽表、洞察客户数量与查看次数、跟进内容查看次数、智能问答清单及点赞点踩数据，以及各客户销售策略与解决方案的问答清单和互动数据，旨在为业务运营分析与决策提供数据支撑。",
    "第二页补充指标口径与统计周期：档案类指标按客户主数据统计，问答类指标以会话日志为准；洞察与跟进查看量按去重用户计，问答清单保留问题原文与命中条目，统计结果用于数据飞轮演进阈值评估。",
  ];

  const MIND = [
    ["文档结构", [
      ["一、数据提取", ["客户档案数据", "客户洞察", "客户跟进", "智能问答", "销售策略及解决方案"]],
      ["二、指标口径与统计周期", ["客户档案更新", "洞察与跟进", "智能问答"]],
    ]],
  ];

  const TRANS = [
    ["英文", "2026-11-02 14:52:25", "本发明实施例提供一种面向军工科研生产数据的字符识别方法。", "A character recognition method for military research and production data."],
    ["英文", "2026-11-02 14:29:16", "一种面向军工科研生产数据的字符识别方法及系统", "A Character Recognition Method and System for Military Research and Production Data"],
    ["英文", "2026-11-02 11:26:41", "工作方案", "Work Plan"],
  ];

  const TABS = [
    ["read", "伴读"], ["mind", "思维导图"], ["trans", "翻译"], ["term", "专业术语"], ["qa", "问答"],
  ];

  const state = {
    records: [], built: false, view: "list", activeId: "", page: 1, query: "",
    tab: "read", docPage: 1, zoom: 1, targetLang: "英文", qa: [], dom: null,
    noticeTimer: 0, auditId: "",
  };

  const seedRecords = () => SEED.map(([name, sizeText, type, status, time], i) => ({
    id: `lt-${i}`, name, sizeText, type, status, time,
  }));

  const filtered = () => {
    const q = state.query.trim().toLowerCase();
    return q ? state.records.filter(rec => rec.name.toLowerCase().includes(q)) : state.records;
  };

  const nowText = () => {
    const d = new Date();
    const p = v => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };

  function toast(message) {
    const el = state.dom?.toast;
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* ---------- 列表页 ---------- */

  function listMarkup() {
    return `<section class="lt-page pr-intake" data-lt-dropzone aria-labelledby="ltTitle">
      <header class="pr-intake-head">
        <div><h1 id="ltTitle">文献伴读</h1><p>百舸文献伴读，读懂每一篇船舶科研文献。</p></div>
        <div class="wr-file-entry">
          <div class="pr-intake-actions">
            <button class="primary-button" type="button" data-lt-action="choose" aria-describedby="ltFileFormats">${icon("upload")}上传本地文件</button>
          </div>
          <p class="wr-file-formats" id="ltFileFormats">支持拖放 PDF、Word，单个文件不超过 100 MB。</p>
          <input type="file" accept=".pdf,.doc,.docx" data-lt-file hidden />
        </div>
      </header>
      <p class="lt-note" data-lt-note role="status"></p>
      <section aria-labelledby="ltHistoryTitle">
        <div class="lt-history-head">
          <h3 class="lt-history-title" id="ltHistoryTitle">文献伴读历史</h3>
          <span class="lt-count" data-lt-count></span>
          <input class="lt-search" type="search" data-lt-search placeholder="搜索文献名..." aria-label="搜索文献名" />
        </div>
        <div class="secret-file-table-wrap" data-lt-table tabindex="0" role="region" aria-label="文献列表"></div>
        <div class="lt-pager" data-lt-pager></div>
      </section>
    </section>`;
  }

  function rowMarkup(rec) {
    const meta = STATUS[rec.status];
    const action = (key, glyph, label) => `<button class="secret-file-icon${key === "delete" ? " is-danger" : ""}" type="button" data-lt-action="${key}" data-id="${escape(rec.id)}" ${key === "audit" ? `data-lt-tooltip="${label}"` : `title="${label}"`} aria-label="${label}：${escape(rec.name)}">${icon(glyph)}</button>`;
    return `<tr>
      <td><div class="lt-file"><span class="lt-badge ${rec.type === "pdf" ? "is-pdf" : ""}">${rec.type === "pdf" ? "PDF" : "DOC"}</span><span class="lt-file-info"><span class="lt-file-name" title="${escape(rec.name)}">${escape(rec.name)}</span><span class="lt-file-size">${escape(rec.sizeText)}</span></span></div></td>
      <td>${fileList.time(rec.time)}</td>
      <td>${fileList.status(meta.code, action("audit", "eye", "查看涉密详情"))}</td>
      <td><div class="secret-file-actions">${meta.canRead ? action("read", "book", "开始伴读") : ""}${meta.canRead && rec.file ? action("download", "download", "下载原文件") : ""}${meta.canDelete ? action("delete", "trash", "删除文献") : ""}</div></td>
    </tr>`;
  }

  function renderTable() {
    const d = state.dom;
    if (!d) return;
    const rows = filtered();
    d.count.textContent = `共 ${state.records.length} 篇`;
    d.table.innerHTML = `<table class="secret-file-table">
      ${fileList.head}
      <tbody>${rows.length ? rows.map(rowMarkup).join("") : '<tr><td colspan="4">没有匹配的文献</td></tr>'}</tbody>
    </table>`;
    const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(state.page, total);
    d.pager.innerHTML = `<button class="lt-page-btn is-active" type="button">${state.page}</button><span class="lt-page-size">${PAGE_SIZE} / 页</span>`;
  }

  function showList() {
    state.view = "list";
    state.activeId = "";
    const d = state.dom;
    d.list.hidden = false;
    d.reader.hidden = true;
    d.list.innerHTML = listMarkup();
    bindList();
    renderTable();
  }

  /* ---------- 阅读页 ---------- */

  function docMarkup() {
    const page = DOC_PAGES[state.docPage - 1];
    const blocks = page.blocks.map(block => {
      if (block.h) return `<h4 class="${block.hl ? "lt-hl" : ""}">${escape(block.h)}</h4>`;
      if (block.p) return `<p>${escape(block.p)}</p>`;
      return `<ul class="lt-doc-list">${block.list.map((item, i) => `<li class="${(block.hl || []).includes(i) ? "lt-hl" : ""}">${"①②③④⑤"[i] || "·"} ${escape(item)}</li>`).join("")}</ul>`;
    }).join("");
    return `${page.title ? `<h3>${escape(page.title)}</h3>` : ""}${blocks}
      <p class="lt-doc-page">第 ${state.docPage} 页 / 共 ${DOC_PAGES.length} 页</p>`;
  }

  function panelReadMarkup() {
    return `<div class="lt-soft"><h4>概要</h4><p>${escape(SUMMARY)}</p></div>
      <div class="lt-soft">
        <h4>按页导读</h4>
        ${DOC_PAGES.map((_, i) => `<button class="lt-toc-btn ${state.docPage === i + 1 ? "is-active" : ""}" type="button" data-lt-action="toc" data-page="${i + 1}">第${["一", "二"][i] || i + 1}页</button>`).join("")}
        <p>${escape(TOC[state.docPage - 1] || TOC[0])}</p>
      </div>`;
  }

  function panelMindMarkup() {
    const tree = MIND[0];
    return `<div class="lt-panel-head"><span class="lt-panel-title">${escape(tree[0])}</span><button class="lt-btn" type="button" data-lt-action="mind-full">⤢ 查看大图</button></div>
      <div class="lt-mind"><ul>${tree[1].map(([name, children]) => `<li><span class="lt-mind-dot"></span>${escape(name)}<ul>${children.map(child => `<li>${escape(child)}</li>`).join("")}</ul></li>`).join("")}</ul></div>`;
  }

  function panelTransMarkup() {
    return `<div class="lt-panel-head"><span class="lt-panel-title">翻译</span><span class="lt-lang-row">目标语言<select data-lt-lang>${["中文", "英文", "日文", "韩文", "俄文"].map(lang => `<option${lang === state.targetLang ? " selected" : ""}>${lang}</option>`).join("")}</select></span></div>
      <div class="lt-empty-state"><span class="lt-empty-icon">A中</span><strong>划词翻译</strong><p>在左侧文档中划选文字后，点击浮层「翻译」，即可获取专业译文与释义。</p></div>
      <div class="lt-panel-head" style="margin-top:14px"><span class="lt-panel-title">翻译历史</span><span class="lt-panel-note">最近记录</span></div>
      ${TRANS.map(([lang, time, src, dst]) => `<div class="lt-trans-item"><div class="lt-trans-meta"><span class="lt-trans-lang">${escape(lang)}</span><span class="lt-trans-time">${escape(time)}</span></div><p class="lt-trans-src">${escape(src)}</p><p class="lt-trans-dst">${escape(dst)}</p></div>`).join("")}`;
  }

  function panelTermMarkup() {
    return `<div class="lt-panel-head"><span class="lt-panel-title">专业术语</span><span class="lt-panel-note">来源：企业专业术语库</span></div>
      <div class="lt-empty-state"><span class="lt-empty-icon">A文</span><strong>查术语</strong><p>在左侧文档中划选词语后，点击浮层「查术语」，匹配即在此展示术语卡片。</p></div>`;
  }

  function panelQaMarkup() {
    return `<div class="lt-panel-head"><span class="lt-panel-title">问答</span><span class="lt-panel-note">基于当前文献</span></div>
      <div class="lt-qa"><div class="lt-qa-log">${state.qa.map(([role, text]) => `<div class="lt-qa-msg ${role === "user" ? "is-user" : "is-bot"}">${escape(text)}</div>`).join("")}</div>
      <form class="lt-qa-form" data-lt-qa-form><textarea class="lt-qa-input" rows="1" data-lt-qa-input placeholder="针对本文提问…" aria-label="提问内容"></textarea><button class="lt-qa-send" type="submit">发送</button></form></div>`;
  }

  function renderPanel() {
    const d = state.dom;
    if (!d) return;
    d.panel.innerHTML = state.tab === "read" ? panelReadMarkup()
      : state.tab === "mind" ? panelMindMarkup()
      : state.tab === "trans" ? panelTransMarkup()
      : state.tab === "term" ? panelTermMarkup()
      : panelQaMarkup();
  }

  function renderDoc() {
    if (!state.dom) return;
    state.dom.doc.innerHTML = `<div class="lt-doc-inner">${docMarkup()}</div>`;
    state.dom.docPageInput.value = String(state.docPage);
    state.dom.pageTotal.textContent = `/ ${DOC_PAGES.length}`;
  }

  function showReader(id) {
    const rec = state.records.find(item => item.id === id);
    if (!rec || !STATUS[rec.status].canRead) return;
    state.view = "reader";
    state.activeId = id;
    state.docPage = 1;
    state.tab = "read";
    state.zoom = 1;
    state.qa = [["bot", "你好，我已通读整篇文献。你可以就特定段落、专业术语或技术方案向我提问，我会结合原文给出精准解读。"]];
    const d = state.dom;
    d.list.hidden = true;
    d.reader.hidden = false;
    d.reader.innerHTML = `<div class="lt-reader">
      <header class="lt-reader-head">
        <button class="lt-back" type="button" data-lt-action="back">${icon("back")}<span>返回</span></button>
        <span class="lt-reader-file" title="${escape(rec.name)}">${escape(rec.name)}</span>
        <span class="lt-badge ${rec.type === "pdf" ? "is-pdf" : ""}">${rec.type === "pdf" ? "PDF" : "DOC"}</span>
      </header>
      <div class="lt-reader-tools">
        <button class="lt-tool-btn" type="button" data-lt-action="noop" aria-label="页面布局">${icon("panel")}</button>
        <button class="lt-tool-btn" type="button" data-lt-action="noop" aria-label="搜索">${icon("search")}</button>
        <button class="lt-tool-btn" type="button" data-lt-action="doc-prev" aria-label="上一页"><span class="lt-rot-up">${icon("chevron")}</span></button>
        <button class="lt-tool-btn" type="button" data-lt-action="doc-next" aria-label="下一页"><span class="lt-rot-down">${icon("chevron")}</span></button>
        <span class="lt-page-box"><input class="lt-page-input" type="text" value="1" data-lt-page-input aria-label="当前页码" /><span data-lt-page-total></span></span>
        <span class="lt-tools-gap"></span>
        <button class="lt-tool-btn" type="button" data-lt-action="zoom-out" aria-label="缩小"><span class="lt-zoom-glyph">−</span></button>
        <button class="lt-tool-btn" type="button" data-lt-action="zoom-in" aria-label="放大"><span class="lt-zoom-glyph">+</span></button>
        <select class="lt-zoom-select" data-lt-zoom aria-label="缩放比例">
          <option value="auto">自动缩放</option><option value="0.8">80%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option>
        </select>
        <span class="lt-tools-gap"></span>
        ${TABS.map(([key, label]) => `<button class="lt-tab ${state.tab === key ? "is-active" : ""}" type="button" data-lt-action="tab" data-tab="${key}">${label}</button>`).join("")}
      </div>
      <div class="lt-reader-body"><div class="lt-doc" data-lt-doc></div><aside class="lt-panel" data-lt-panel></aside></div>
    </div>`;
    d.doc = d.reader.querySelector("[data-lt-doc]");
    d.panel = d.reader.querySelector("[data-lt-panel]");
    d.docPageInput = d.reader.querySelector("[data-lt-page-input]");
    d.pageTotal = d.reader.querySelector("[data-lt-page-total]");
    renderDoc();
    renderPanel();
  }

  function build(target) {
    target.innerHTML = `<div class="lt-root"><div data-lt-list></div><div data-lt-reader hidden></div><div class="lt-toast" data-lt-toast role="status" hidden></div>
      <dialog class="lt-audit-dialog" data-lt-audit aria-labelledby="ltAuditTitle">
        <header><h2 id="ltAuditTitle">涉密核查详情</h2><button class="secret-file-icon" type="button" data-lt-action="audit-close" aria-label="关闭详情">${icon("close")}</button></header>
        <div data-lt-audit-content></div>
      </dialog></div>`;
    state.dom = {
      root: target,
      list: target.querySelector("[data-lt-list]"),
      reader: target.querySelector("[data-lt-reader]"),
      toast: target.querySelector("[data-lt-toast]"),
      audit: target.querySelector("[data-lt-audit]"),
      table: null, count: null, pager: null, doc: null, panel: null, docPageInput: null, pageTotal: null,
    };
  }

  function bindList() {
    const d = state.dom;
    d.table = d.list.querySelector("[data-lt-table]");
    d.count = d.list.querySelector("[data-lt-count]");
    d.pager = d.list.querySelector("[data-lt-pager]");
    d.note = d.list.querySelector("[data-lt-note]");
    d.file = d.list.querySelector("[data-lt-file]");
    const dz = d.list.querySelector("[data-lt-dropzone]");
    d.file.addEventListener("change", event => {
      handleFiles(event.target.files);
      event.target.value = "";
    });
    ["dragenter", "dragover"].forEach(type => dz.addEventListener(type, event => { event.preventDefault(); dz.classList.add("is-over"); }));
    dz.addEventListener("dragleave", event => { if (!dz.contains(event.relatedTarget)) dz.classList.remove("is-over"); });
    dz.addEventListener("drop", event => {
      event.preventDefault();
      dz.classList.remove("is-over");
      handleFiles(event.dataTransfer?.files);
    });
    const search = d.list.querySelector("[data-lt-search]");
    search.value = state.query;
    search.addEventListener("input", () => { state.query = search.value; renderTable(); });
  }

  function renderAudit(rec) {
    const messages = {
      parsing: "正在进行涉密核查。", done: "文献已通过核查，可以开始伴读。",
      warning: "发现疑似涉密内容，请提交人工审核。", submitted: "等待人工审核，可在此演示审核结果。",
      approved: "人工审核已通过，可以开始伴读。", rejected: "人工审核未通过，文献不可用。",
      failed: "文件读取失败，请检查格式后重新上传。",
    };
    state.dom.audit.querySelector("[data-lt-audit-content]").innerHTML = `<div class="lt-audit-copy"><strong>${escape(rec.name)}</strong>${fileList.status(STATUS[rec.status].code)}
      <p role="status">${messages[rec.status]}</p>${rec.keywords?.length ? `<p>命中关键词：${rec.keywords.map(escape).join("、")}</p>` : ""}</div>
      <footer><button class="secondary-button" type="button" data-lt-action="audit-close">关闭</button>
      ${rec.status === "warning" ? '<button class="primary-button" type="button" data-lt-action="audit-submit">提交人工审核</button>' : ""}
      ${rec.status === "submitted" ? '<button class="secondary-button" type="button" data-lt-action="audit-reject">模拟驳回</button><button class="primary-button" type="button" data-lt-action="audit-approve">模拟通过</button>' : ""}</footer>`;
  }

  async function handleFiles(list) {
    const file = list && list[0];
    if (!file) return;
    if (!ACCEPT.test(file.name)) { state.dom.note.textContent = "仅支持 PDF、Word（.doc / .docx）格式的文献。"; return; }
    if (file.size > MAX_SIZE) { state.dom.note.textContent = "文件大小超过 100MB，请压缩后重试。"; return; }
    state.dom.note.textContent = "";
    const rec = {
      id: `lt-local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      sizeText: file.size < 1024 * 1024 ? `${(file.size / 1024).toFixed(1)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`,
      type: /\.pdf$/i.test(file.name) ? "pdf" : "doc",
      status: "parsing",
      time: nowText(), file,
    };
    state.records.unshift(rec);
    state.page = 1;
    renderTable();
    toast(`已添加「${file.name}」，正在检测…`);
    const [result] = await Promise.all([window.BaigeTranslateAudit.inspect(file), new Promise(resolve => setTimeout(resolve, 2200))]);
    rec.keywords = result.keywords;
    rec.status = { passed: "done", hit: "warning", failed: "failed" }[result.auditStatus];
    if (rec.status === "failed") delete rec.file;
    if (state.view === "list") renderTable();
    if (state.dom.audit.open && state.auditId === rec.id) renderAudit(rec);
  }

  function render(target, onDirty = () => {}) {
    if (!state.built) { state.records = seedRecords(); state.built = true; }
    target.classList.add("lt-workspace", "file-intake-workspace");
    build(target);
    showList();
  }

  function resume() {
    if (state.view === "list") renderTable();
  }

  function deactivate() {
    clearTimeout(state.noticeTimer);
    if (state.dom?.audit.open) state.dom.audit.close();
    const el = state.dom?.toast;
    if (el) el.hidden = true;
  }

  /* ---------- 事件 ---------- */

  document.addEventListener("click", event => {
    const button = event.target.closest("[data-lt-action]");
    if (!button || !state.dom?.root?.contains(button)) return;
    const action = button.dataset.ltAction;
    if (action === "choose") { state.dom.file.click(); return; }
    if (action === "back") { showList(); return; }
    if (action === "read") { showReader(button.dataset.id); return; }
    if (action === "audit-close") { state.dom.audit.close(); return; }
    if (action === "audit" || action.startsWith("audit-")) {
      const rec = state.records.find(item => item.id === (button.dataset.id || state.auditId));
      if (!rec) return;
      if (action === "audit") {
        state.auditId = rec.id;
        renderAudit(rec);
        state.dom.audit.showModal();
        return;
      }
      if (action === "audit-submit" && rec.status === "warning") rec.status = "submitted";
      else if (action === "audit-approve" && rec.status === "submitted") rec.status = "approved";
      else if (action === "audit-reject" && rec.status === "submitted") {
        rec.status = "rejected";
        delete rec.file;
      } else return;
      renderTable();
      renderAudit(rec);
      return;
    }
    if (action === "download") {
      const rec = state.records.find(item => item.id === button.dataset.id);
      if (!rec?.file || !STATUS[rec.status].canRead) return;
      const url = URL.createObjectURL(rec.file);
      const link = document.createElement("a");
      link.href = url;
      link.download = rec.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }
    if (action === "delete") {
      const rec = state.records.find(item => item.id === button.dataset.id);
      if (!rec || !STATUS[rec.status].canDelete) return;
      if (!window.confirm(`确定删除「${rec.name}」的伴读记录吗？`)) return;
      state.records = state.records.filter(item => item.id !== rec.id);
      renderTable();
      toast("已删除该文献记录");
      return;
    }
    if (action === "tab") {
      state.tab = button.dataset.tab;
      state.dom.reader.querySelectorAll(".lt-tab").forEach(tab => tab.classList.toggle("is-active", tab.dataset.tab === state.tab));
      renderPanel();
      return;
    }
    if (action === "toc") {
      state.docPage = Number(button.dataset.page);
      renderDoc();
      renderPanel();
      return;
    }
    if (action === "doc-prev" || action === "doc-next") {
      const next = state.docPage + (action === "doc-next" ? 1 : -1);
      if (next < 1 || next > DOC_PAGES.length) { toast("已经到文档边界了"); return; }
      state.docPage = next;
      renderDoc();
      if (state.tab === "read") renderPanel();
      return;
    }
    if (action === "zoom-out" || action === "zoom-in") {
      state.zoom = Math.max(0.7, Math.min(1.6, state.zoom + (action === "zoom-in" ? 0.1 : -0.1)));
      if (state.dom.doc) state.dom.doc.style.zoom = String(state.zoom);
      return;
    }
    if (action === "mind-full") { toast("演示原型：大图视图待接入"); return; }
    if (action === "noop") { toast("演示原型：该控件用于展示阅读器形态"); }
  });

  document.addEventListener("change", event => {
    if (!state.dom?.root?.contains(event.target)) return;
    if (event.target.matches("[data-lt-zoom]")) {
      const value = event.target.value;
      state.zoom = value === "auto" ? 1 : Number(value) || 1;
      if (state.dom.doc) state.dom.doc.style.zoom = value === "auto" ? "" : String(state.zoom);
    }
    if (event.target.matches("[data-lt-lang]")) state.targetLang = event.target.value;
  });

  document.addEventListener("submit", event => {
    const form = event.target.closest("[data-lt-qa-form]");
    if (!form || !state.dom?.root?.contains(form)) return;
    event.preventDefault();
    const input = form.querySelector("[data-lt-qa-input]");
    const text = input.value.trim();
    if (!text) return;
    state.qa.push(["user", text]);
    const answer = /术语|定义|含义/.test(text)
      ? "文中涉及的术语按企业专业术语库口径解释；如需逐条对照，可在「专业术语」页签划选词语查看匹配卡片。"
      : /页|段落|哪一/.test(text)
        ? "相关表述集中在第二页「指标口径与统计周期」，其中明确了档案类与问答类指标各自的统计来源。"
        : "根据原文，本文档聚焦客户管理与销售系统的数据提取范围：客户档案、客户洞察、客户跟进、智能问答与销售策略及解决方案五类，并要求给出明细宽表与问答清单。";
    state.qa.push(["bot", answer]);
    renderPanel();
    const next = state.dom.panel.querySelector("[data-lt-qa-input]");
    next?.focus();
  });

  window.BaigeLiteratureTool = Object.freeze({
    render, resume, deactivate, seedRecords, STATUS, DOC_PAGES, PAGE_SIZE, MAX_SIZE,
    openReader: showReader, setTab: tab => { state.tab = tab; renderPanel(); },
  });
})();
