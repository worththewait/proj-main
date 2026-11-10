/* 文档翻译的上传核查、翻译状态和预览在当前页面内存演示。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const fileList = window.BaigeSecretFileList;
  const audit = window.BaigeTranslateAudit;
  const PAGE_SIZE = 5;
  const MAX_SIZE = 100 * 1024 * 1024;
  const ACCEPT = /\.(pdf|doc|docx)$/i;
  const FILTERS = { all: "全部文件", audit: "涉密核查", running: "处理中", done: "已完成", failed: "处理失败" };
  const STATUS = Object.freeze({
    done: { label: "翻译成功", tone: "is-done", ready: true },
    failed: { label: "翻译失败", tone: "is-failed", ready: false },
    error: { label: "翻译失败", tone: "is-failed", ready: false },
    running: { label: "翻译中", tone: "is-running", ready: false },
    queued: { label: "待解析", tone: "is-queued", ready: false },
    parsing: { label: "解析中", tone: "is-running", ready: false },
    parseFailed: { label: "解析失败", tone: "is-failed", ready: false },
    blocked: { label: "未翻译", tone: "is-queued", ready: false },
  });

  /* 演示数据：文件名与状态参照线上工作区，均为虚构示例，不代表真实业务记录。 */
  const SEED = [
    ["机密秘密.pdf", 33454, "queued", "2026-11-09 14:15:56"],
    ["小作文2.pdf", 83702, "done", "2026-10-27 19:33:56"],
    ["小作文.docx", 0, "failed", "2026-10-27 19:27:19"],
    ["小作文.docx", 0, "failed", "2026-10-27 18:43:49"],
    ["小作文.docx", 0, "error", "2026-10-27 17:36:01"],
    ["小作文.docx", 0, "error", "2026-10-27 17:15:11"],
    ["建宁银行AI大模型平台及场景建设采购项目-服务方案.pdf", 184320, "error", "2026-10-21 14:54:45"],
    ["《智能船舶规范》(2025).pdf", 262144, "failed", "2026-10-13 18:04:31"],
    ["小作文2.pdf", 83702, "done", "2026-10-11 19:33:56"],
    ["船舶动力系统技术综述.pdf", 156672, "done", "2026-10-09 10:22:08"],
    ["绿色燃料应用评估报告.docx", 48640, "done", "2026-09-28 16:40:12"],
    ["甲板机械选型对比.docx", 35840, "failed", "2026-09-28 15:07:44"],
    ["海试大纲（初稿）.pdf", 220160, "error", "2026-09-24 09:18:31"],
    ["船体结构强度校核说明.pdf", 174080, "done", "2026-09-20 11:36:02"],
    ["系泊绞车布置方案.docx", 41984, "done", "2026-09-17 14:52:19"],
    ["国际海事法规汇编（节选）.pdf", 389120, "failed", "2026-09-12 08:44:50"],
    ["智能航行系统接口说明.pdf", 98304, "done", "2026-09-08 17:21:33"],
  ];

  /* 补足到 6 页，保持线上「共 6 页」的演示规模。 */
  const FILLER = [
    ["舱室噪声控制研究报告.pdf", 145408, "done"],
    ["压载水处理装置选型.docx", 55296, "failed"],
    ["船用电缆敷设规范.pdf", 204800, "done"],
    ["年度科研项目总结.docx", 67584, "error"],
    ["LNG 双燃料供气系统说明.pdf", 233472, "done"],
    ["推进系统能效分析.pdf", 118784, "failed"],
    ["船坞建造节点计划.docx", 38912, "done"],
    ["供应链采购清单.docx", 0, "error"],
    ["舾装件标准化目录.pdf", 176128, "done"],
    ["航行数据记录规程.docx", 43008, "failed"],
  ];
  FILLER.forEach(([name, size, status], i) => {
    const day = String(8 - Math.floor(i / 3)).padStart(2, "0");
    const hour = String(9 + i % 9).padStart(2, "0");
    SEED.push([name, size, status, `2026-09-${day} ${hour}:12:0${i % 6}`]);
  });

  const state = {
    records: [], page: 1, filter: "all", query: "", built: false, active: false, dom: null,
    toastTimer: 0, zoom: 100, auditId: "",
  };

  const isAllowed = name => ACCEPT.test(String(name || ""));
  const formatSize = bytes => {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(2)} KB`;
    return `${(n / 1024 / 1024).toFixed(2)} MB`;
  };
  const nowText = () => {
    const d = new Date();
    const p = v => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const seedRecords = () => SEED.map(([name, size, status, time], i) => {
    const keywords = window.BaigeProofreadTool?.scanSecret(name, "") || [];
    return { id: `dt-${i}`, name, size, from: "中文", to: "英文", status: keywords.length ? "queued" : status, time, local: false,
      auditStatus: keywords.length ? "hit" : "passed", keywords };
  });

  function build(target) {
    target.innerHTML = `
      <section class="dt-page pr-intake" data-dt-dropzone aria-labelledby="dtTitle">
        <header class="pr-intake-head">
          <div><h1 id="dtTitle">文档翻译</h1><p>上传文件，通过涉密审查后自动解析并翻译。翻译完成后可查看结果。</p></div>
          <div class="wr-file-entry">
            <div class="pr-intake-actions">
              <button class="primary-button" type="button" data-dt-action="choose" aria-describedby="dtFileFormats">${icon("upload")}上传本地文件</button>
            </div>
            <p class="wr-file-formats" id="dtFileFormats">支持拖放 PDF、Word，单个文件不超过 100 MB。</p>
            <input type="file" accept=".pdf,.doc,.docx" data-dt-file hidden />
          </div>
        </header>
        <p class="dt-upload-note" data-dt-note role="status"></p>
        <section class="pr-material-table wr-file-list" aria-label="文档翻译记录">
          <div class="wr-file-toolbar">
            <div class="wr-file-filters" role="group" aria-label="按文件状态筛选">
              ${Object.entries(FILTERS).map(([filter, label]) => `<button type="button" data-dt-filter="${filter}" aria-pressed="${state.filter === filter}">${label}<span data-dt-filter-count>0</span></button>`).join("")}
            </div>
            <form class="wr-file-search" data-dt-search-form role="search" aria-label="搜索翻译文件">
              <label class="search-field wr-file-search-input">${icon("search")}<input type="search" data-dt-search aria-label="搜索文件名" placeholder="搜索文件名" value="${escape(state.query)}" /></label>
              <button type="submit" class="secondary-button">搜索</button>
            </form>
          </div>
          <p class="sr-only" data-dt-count aria-live="polite"></p>
          <div class="secret-file-table-wrap" tabindex="0" role="region" aria-label="文档翻译记录">
            <table class="secret-file-table dt-table">
              ${fileList.header("源语言", "目标语言", "翻译状态")}
              <tbody data-dt-body></tbody>
            </table>
          </div>
          <nav class="dt-pager" data-dt-pager aria-label="翻译记录分页"></nav>
        </section>
        <dialog class="dt-dialog dt-audit-dialog" data-dt-audit aria-labelledby="dtAuditTitle">
          <header class="dt-dialog-head"><strong id="dtAuditTitle">涉密核查详情</strong><button class="dt-dialog-close" type="button" data-dt-action="audit-close" aria-label="关闭详情">${icon("close")}</button></header>
          <div class="dt-audit-copy" data-dt-audit-copy></div>
          <footer class="dt-audit-actions" data-dt-audit-actions></footer>
        </dialog>
        <dialog class="dt-dialog" data-dt-dialog aria-labelledby="dtDialogTitle">
          <header class="dt-dialog-head"><strong id="dtDialogTitle" data-dt-title tabindex="-1"></strong><button class="dt-dialog-close" type="button" data-dt-action="close" aria-label="关闭预览">${icon("close")}</button></header>
          <dl class="dt-facts" data-dt-facts></dl>
          <div class="dt-viewer-bar">
            <span class="dt-viewer-page">第 1 页 / 共 1 页</span>
            <span class="dt-spacer"></span>
            <button class="dt-tool-btn" type="button" data-dt-action="zoom-out" aria-label="缩小">${icon("panel")}</button>
            <span class="dt-viewer-zoom" data-dt-zoom>100%</span>
            <button class="dt-tool-btn" type="button" data-dt-action="zoom-in" aria-label="放大">${icon("expand")}</button>
            <span class="dt-spacer"></span>
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-download" aria-label="下载译文" title="下载译文">${icon("download")}</button>
          </div>
          <div class="dt-viewer-stage"><article class="dt-paper" data-dt-paper></article></div>
        </dialog>
      </section>`;
    state.dom = {
      root: target,
      dropzone: target.querySelector("[data-dt-dropzone]"),
      file: target.querySelector("[data-dt-file]"),
      note: target.querySelector("[data-dt-note]"),
      body: target.querySelector("[data-dt-body]"),
      count: target.querySelector("[data-dt-count]"),
      filters: target.querySelectorAll("[data-dt-filter]"),
      searchForm: target.querySelector("[data-dt-search-form]"),
      search: target.querySelector("[data-dt-search]"),
      pager: target.querySelector("[data-dt-pager]"),
      audit: target.querySelector("[data-dt-audit]"),
      auditCopy: target.querySelector("[data-dt-audit-copy]"),
      auditActions: target.querySelector("[data-dt-audit-actions]"),
      dialog: target.querySelector("[data-dt-dialog]"),
      title: target.querySelector("[data-dt-title]"),
      facts: target.querySelector("[data-dt-facts]"),
      paper: target.querySelector("[data-dt-paper]"),
      zoom: target.querySelector("[data-dt-zoom]"),
    };
  }

  const resultReady = rec => Boolean(rec && fileList.canView(rec.auditStatus) && STATUS[rec.status]?.ready);

  function rowAction(rec, action, glyph, label) {
    return `<button class="secret-file-icon${action === "delete" ? " is-danger" : ""}" type="button" data-dt-action="${action}" data-id="${escape(rec.id)}" aria-label="${label} ${escape(rec.name)}" title="${label}">${icon(glyph)}</button>`;
  }

  function rowMarkup(rec) {
    const meta = STATUS[rec.status] || STATUS.error;
    const size = formatSize(rec.size);
    const ready = resultReady(rec);
    const finished = fileList.canView(rec.auditStatus) && ["done", "failed", "error"].includes(rec.status);
    const progress = ["parsing", "running", "parseFailed"].includes(rec.status) ? meta.label : "";
    return `<tr>
      <td><div class="dt-file-copy"><span class="dt-file-name" title="${escape(rec.name)}">${escape(rec.name)}</span>${size ? `<span class="dt-file-size">${escape(size)}</span>` : ""}</div></td>
      <td>${fileList.time(rec.time)}</td>
      <td>${fileList.status(rec.auditStatus, rowAction(rec, "audit", "eye", "查看涉密详情"))}${progress ? `<span class="dt-progress dt-status ${meta.tone}">${progress}</span>` : ""}</td>
      <td>${escape(rec.from)}</td><td>${escape(rec.to)}</td>
      <td>${finished ? `<span class="dt-status ${meta.tone}">${meta.label}</span>` : '<span class="dt-status-empty" aria-label="暂无翻译结果">—</span>'}</td>
      <td><div class="secret-file-actions">${ready ? rowAction(rec, "view", "file", "查看结果") + rowAction(rec, "download", "download", "下载译文") : ""}${rowAction(rec, "delete", "trash", "删除记录")}</div></td>
    </tr>`;
  }

  function category(rec) {
    if (!fileList.canView(rec.auditStatus)) return "audit";
    if (rec.status === "error" || rec.status === "parseFailed") return "failed";
    return rec.status === "parsing" ? "running" : rec.status;
  }

  function matchingRecords() {
    return state.records.filter(rec => (state.filter === "all" || category(rec) === state.filter)
      && rec.name.toLowerCase().includes(state.query));
  }

  function renderTable() {
    if (!state.dom) return;
    const matches = matchingRecords();
    const total = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), total);
    const start = (state.page - 1) * PAGE_SIZE;
    const rows = matches.slice(start, start + PAGE_SIZE);
    state.dom.body.innerHTML = rows.length ? rows.map(rowMarkup).join("")
      : `<tr><td colspan="7">${state.query ? "没有找到匹配的文件。" : "暂无符合条件的翻译记录。"}</td></tr>`;
    state.dom.count.textContent = `共 ${matches.length} 条`;
    for (const button of state.dom.filters) {
      const filter = button.dataset.dtFilter;
      button.setAttribute("aria-pressed", String(state.filter === filter));
      button.querySelector("[data-dt-filter-count]").textContent = filter === "all"
        ? state.records.length : state.records.filter(rec => category(rec) === filter).length;
    }
  }

  function renderPager() {
    if (!state.dom) return;
    const total = Math.max(1, Math.ceil(matchingRecords().length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), total);
    state.dom.pager.innerHTML = `<button class="dt-mini" type="button" data-dt-action="prev" ${state.page === 1 ? "disabled" : ""}>上一页</button><span class="dt-page-info">第 ${state.page} 页 / 共 ${total} 页</span><button class="dt-mini" type="button" data-dt-action="next" ${state.page === total ? "disabled" : ""}>下一页</button>`;
  }

  function note(message) { if (state.dom) state.dom.note.textContent = message; }

  function toast(message) {
    let el = document.querySelector(".dt-toast");
    if (!el) { el = document.createElement("div"); el.className = "dt-toast"; el.setAttribute("role", "status"); document.body.append(el); }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  function paperMarkup(rec) {
    return `<p class="dt-paper-label">示例译文 · ${escape(rec.from)} → ${escape(rec.to)}</p>
      <div lang="en"><h3>Vessel inspection summary</h3>
      <p>The inspection team reviewed the vessel’s maintenance records and verified the condition of its deck equipment. The findings were recorded for follow-up.</p>
      <p>The maintenance team will confirm the schedule and report back after the next inspection.</p></div>`;
  }

  function openPreview(id) {
    const rec = state.records.find(item => item.id === id);
    if (!resultReady(rec)) return;
    const d = state.dom;
    d.title.textContent = rec.name;
    const size = formatSize(rec.size);
    d.facts.innerHTML = [
      ["文件名称", rec.name],
      ...(size ? [["文件大小", size]] : []),
      ["翻译方向", `${rec.from} → ${rec.to}`],
      ["上传时间", rec.time],
    ].map(([key, value]) => `<div><dt>${escape(key)}</dt><dd>${escape(value)}</dd></div>`).join("");
    d.paper.innerHTML = paperMarkup(rec);
    state.zoom = 100;
    d.zoom.textContent = "100%";
    d.paper.style.zoom = "1";
    if (!d.dialog.open) d.dialog.showModal();
    d.title.focus({ preventScroll: true });
  }

  function renderAudit() {
    const d = state.dom;
    const rec = state.records.find(item => item.id === state.auditId);
    if (!rec) return;
    const descriptions = {
      detecting: "正在审查文件。审查通过后会自动解析，再开始翻译。",
      hit: "检测到疑似涉密内容，可提交人工审核。审核通过前无法查看或下载译文。",
      submitted: "等待人工审核。可用下方按钮演示审核结果。",
      passed: rec.local ? "自动核查已通过。" : "这是演示记录，文件核查状态为已通过。",
      approved: rec.local ? "已通过人工审核。" : "已通过人工审核。此演示记录没有原文件，如需翻译请重新上传。",
      rejected: "人工审核未通过，无法查看或下载译文。",
      failed: rec.auditReason || "无法读取文件，请检查后重新上传。",
    };
    d.auditCopy.innerHTML = `<p class="dt-audit-file">${escape(rec.name)}</p><div class="dt-audit-status">${fileList.status(rec.auditStatus)}</div>
      <p role="status">${escape(descriptions[rec.auditStatus])}</p>
      ${rec.keywords.length ? `<p>命中关键词：${rec.keywords.map(escape).join("、")}</p>` : ""}`;
    d.auditActions.innerHTML = `<button class="dt-mini" type="button" data-dt-action="audit-close">关闭</button>
      ${rec.auditStatus === "hit" ? '<button class="dt-primary" type="button" data-dt-action="audit-submit">提交人工审核</button>' : ""}
      ${rec.auditStatus === "submitted" ? '<button class="dt-mini" type="button" data-dt-action="audit-reject">模拟驳回</button><button class="dt-primary" type="button" data-dt-action="audit-pass">模拟审核通过</button>' : ""}`;
  }

  function updateRecord(rec) {
    renderTable();
    renderPager();
    if (state.dom.audit.open && state.auditId === rec.id) renderAudit();
  }

  function startProcessing(rec) {
    if (rec.status !== "queued" || !fileList.canView(rec.auditStatus)) return;
    if (!rec.file) {
      rec.status = "blocked";
      return;
    }
    rec.status = "parsing";
    setTimeout(() => {
      if (!state.records.includes(rec)) return;
      try {
        audit.parse(rec.file, rec.auditStatus);
        rec.status = "running";
      } catch {
        rec.status = "parseFailed";
      }
      delete rec.file;
      updateRecord(rec);
      if (rec.status !== "running") return;
      setTimeout(() => {
        if (!state.records.includes(rec)) return;
        rec.status = "done";
        updateRecord(rec);
        if (state.active) toast(`「${rec.name}」演示翻译完成，可以查看结果。`);
      }, 1600);
    }, 1000);
  }

  async function handleFiles(list) {
    const file = list && list[0];
    if (!file) return;
    if (!isAllowed(file.name)) { note("仅支持 PDF、Word（.doc / .docx）格式的文档。"); return; }
    if (file.size > MAX_SIZE) { note("文件大小超过 100MB，请压缩后重试。"); return; }
    note("");
    const rec = {
      id: `dt-local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name, size: file.size, from: "中文", to: "英文",
      status: "queued", auditStatus: "detecting", keywords: [], time: nowText(), local: true, file,
    };
    state.records.unshift(rec);
    state.page = 1;
    state.filter = "all";
    state.query = state.dom.search.value = "";
    renderTable();
    renderPager();
    if (state.active) toast(`「${file.name}」已加入列表，正在核查。`);
    const [result] = await Promise.all([audit.inspect(file), new Promise(resolve => setTimeout(resolve, 2600))]);
    if (!state.records.includes(rec)) return;
    Object.assign(rec, result);
    if (rec.auditStatus === "failed") {
      rec.status = "blocked";
      delete rec.file;
    }
    startProcessing(rec);
    updateRecord(rec);
  }

  function bind(target) {
    const d = state.dom;
    d.searchForm.addEventListener("submit", event => {
      event.preventDefault();
      state.query = d.search.value.trim().toLowerCase();
      state.page = 1;
      renderTable();
      renderPager();
    });
    d.file.addEventListener("change", event => {
      handleFiles(event.target.files);
      event.target.value = "";
    });
    ["dragenter", "dragover"].forEach(type => d.dropzone.addEventListener(type, event => {
      event.preventDefault();
      d.dropzone.classList.add("is-over");
    }));
    d.dropzone.addEventListener("dragleave", event => {
      if (!d.dropzone.contains(event.relatedTarget)) d.dropzone.classList.remove("is-over");
    });
    d.dropzone.addEventListener("drop", event => {
      event.preventDefault();
      d.dropzone.classList.remove("is-over");
      handleFiles(event.dataTransfer?.files);
    });
    d.dialog.addEventListener("click", event => { if (event.target === d.dialog) d.dialog.close(); });
    d.audit.addEventListener("click", event => { if (event.target === d.audit) d.audit.close(); });

    target.addEventListener("click", event => {
      const filter = event.target.closest("[data-dt-filter]");
      if (filter) {
        state.filter = filter.dataset.dtFilter;
        state.page = 1;
        renderTable();
        renderPager();
        return;
      }
      const button = event.target.closest("[data-dt-action]");
      if (!button) return;
      const action = button.dataset.dtAction;
      if (action === "choose") d.file.click();
      else if (action === "close") d.dialog.close();
      else if (action === "view") openPreview(button.dataset.id);
      else if (action === "viewer-download" || (action === "download" && resultReady(state.records.find(item => item.id === button.dataset.id)))) toast("当前为演示预览，暂无可下载的译文文件。");
      else if (action === "delete") {
        const rec = state.records.find(item => item.id === button.dataset.id);
        if (!rec || !window.confirm(`删除「${rec.name}」的翻译记录？`)) return;
        state.records = state.records.filter(item => item !== rec);
        renderTable();
        renderPager();
        (d.body.querySelector("[data-dt-action=delete]") || d.dropzone.querySelector("[data-dt-action=choose]")).focus();
      } else if (action === "audit") {
        state.auditId = button.dataset.id;
        renderAudit();
        if (!d.audit.open) d.audit.showModal();
      } else if (action === "audit-close") d.audit.close();
      else if (action === "audit-submit" || action === "audit-pass" || action === "audit-reject") {
        const rec = state.records.find(item => item.id === state.auditId);
        const next = { "audit-submit": "submitted", "audit-pass": "approved", "audit-reject": "rejected" }[action];
        if (!rec || !audit.transition(rec.auditStatus, next)) return;
        rec.auditStatus = next;
        if (next === "rejected") {
          if (rec.status === "queued") rec.status = "blocked";
          delete rec.file;
        }
        startProcessing(rec);
        updateRecord(rec);
        d.auditActions.querySelector("[data-dt-action=audit-close]").focus();
      }
      else if (action === "prev") { state.page -= 1; renderTable(); renderPager(); }
      else if (action === "next") { state.page += 1; renderTable(); renderPager(); }
      else if (action === "zoom-in" || action === "zoom-out") {
        state.zoom = Math.max(50, Math.min(200, state.zoom + (action === "zoom-in" ? 25 : -25)));
        d.zoom.textContent = `${state.zoom}%`;
        d.paper.style.zoom = String(state.zoom / 100);
      }
    });
  }

  function render(target) {
    state.active = true;
    if (!state.built) { state.records = seedRecords(); state.built = true; }
    target.classList.add("dt-workspace", "file-intake-workspace");
    build(target);
    bind(target);
    renderTable();
    renderPager();
  }

  function deactivate() {
    state.active = false;
    clearTimeout(state.toastTimer);
    if (state.dom?.dialog?.open) state.dom.dialog.close();
    if (state.dom?.audit?.open) state.dom.audit.close();
    const el = document.querySelector(".dt-toast");
    if (el) el.hidden = true;
  }

  function resume() { state.active = true; if (state.dom) { renderTable(); renderPager(); } }

  window.BaigeDocTranslateTool = Object.freeze({
    render, resume, deactivate, formatSize, isAllowed, seedRecords, STATUS, PAGE_SIZE, MAX_SIZE,
  });
})();
