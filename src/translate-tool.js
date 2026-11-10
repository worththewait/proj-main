/* 智能工具 · 文档翻译：复刻线上「翻译文档上传 + 文档翻译历史」工作区。
   上传、翻译状态与预览全部在当前页面内存演示，刷新或关闭即丢失。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const PAGE_SIZE = 5;
  const MAX_SIZE = 100 * 1024 * 1024;
  const ACCEPT = /\.(pdf|doc|docx)$/i;
  const STATUS = Object.freeze({
    done: { label: "翻译成功", tone: "is-done", ready: true },
    failed: { label: "翻译失败", tone: "is-failed", ready: false },
    error: { label: "处理失败", tone: "is-failed", ready: false },
    running: { label: "翻译中", tone: "is-running", ready: false },
  });

  /* 演示数据：文件名与状态参照线上工作区，均为虚构示例，不代表真实业务记录。 */
  const SEED = [
    ["机密秘密.pdf", 33454, "done", "2026-11-09 14:15:56"],
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
    records: [], page: 1, built: false, dom: null,
    toastTimer: 0, translateTimer: 0, zoom: 100, onDirty: () => {},
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
  const seedRecords = () => SEED.map(([name, size, status, time], i) => ({
    id: `dt-${i}`, name, size, from: "中文", to: "英文", status, time, local: false,
  }));

  function build(target) {
    target.innerHTML = `
      <div class="dt-page">
        <section class="dt-card" aria-labelledby="dtUploadTitle">
          <h2 class="dt-card-title" id="dtUploadTitle">翻译文档上传</h2>
          <div class="dt-dropzone" data-dt-dropzone>
            <span class="dt-dropzone-icon">${icon("upload")}</span>
            <p class="dt-dropzone-title">拖放文档到此处，或点击选择文件</p>
            <p class="dt-dropzone-hint">支持 PDF、Word，最大文件大小 100MB</p>
            <button class="dt-primary" type="button" data-dt-action="choose">选择文件</button>
            <input class="dt-sr-only" type="file" accept=".pdf,.doc,.docx" data-dt-file aria-label="选择待翻译文档" />
          </div>
          <p class="dt-upload-note" data-dt-note role="status"></p>
        </section>
        <section class="dt-card" aria-labelledby="dtHistoryTitle">
          <h2 class="dt-card-title" id="dtHistoryTitle">文档翻译历史</h2>
          <div class="dt-table-scroll">
            <table class="dt-table">
              <colgroup><col style="width:32%" /><col style="width:12%" /><col style="width:12%" /><col style="width:13%" /><col style="width:18%" /><col style="width:13%" /></colgroup>
              <thead><tr><th scope="col">文件名</th><th scope="col">源语言</th><th scope="col">目标语言</th><th scope="col">状态</th><th scope="col">时间</th><th scope="col">操作</th></tr></thead>
              <tbody data-dt-body></tbody>
            </table>
          </div>
          <div class="dt-pager" data-dt-pager></div>
        </section>
        <dialog class="dt-dialog" data-dt-dialog aria-labelledby="dtDialogTitle">
          <header class="dt-dialog-head"><strong id="dtDialogTitle" data-dt-title tabindex="-1"></strong><button class="dt-dialog-close" type="button" data-dt-action="close" aria-label="关闭预览">${icon("close")}</button></header>
          <dl class="dt-facts" data-dt-facts></dl>
          <div class="dt-viewer-bar">
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-info" aria-label="文档目录">${icon("menu")}</button>
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-info" aria-label="上一页">${icon("back")}</button>
            <span class="dt-viewer-page"><input class="dt-viewer-input" type="text" value="1" aria-label="当前页码" readonly /> / 1</span>
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-info" aria-label="下一页">${icon("chevron")}</button>
            <span class="dt-spacer"></span>
            <button class="dt-tool-btn" type="button" data-dt-action="zoom-out" aria-label="缩小">${icon("panel")}</button>
            <span class="dt-viewer-zoom" data-dt-zoom>100%</span>
            <button class="dt-tool-btn" type="button" data-dt-action="zoom-in" aria-label="放大">${icon("expand")}</button>
            <span class="dt-spacer"></span>
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-info" aria-label="打印">${icon("file")}</button>
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-download" aria-label="下载">${icon("download")}</button>
            <button class="dt-tool-btn" type="button" data-dt-action="viewer-info" aria-label="搜索">${icon("search")}</button>
          </div>
          <div class="dt-viewer-stage"><article class="dt-paper" data-dt-paper></article></div>
        </dialog>
      </div>`;
    state.dom = {
      root: target,
      dropzone: target.querySelector("[data-dt-dropzone]"),
      file: target.querySelector("[data-dt-file]"),
      note: target.querySelector("[data-dt-note]"),
      body: target.querySelector("[data-dt-body]"),
      pager: target.querySelector("[data-dt-pager]"),
      dialog: target.querySelector("[data-dt-dialog]"),
      title: target.querySelector("[data-dt-title]"),
      facts: target.querySelector("[data-dt-facts]"),
      paper: target.querySelector("[data-dt-paper]"),
      zoom: target.querySelector("[data-dt-zoom]"),
    };
  }

  function rowMarkup(rec) {
    const meta = STATUS[rec.status] || STATUS.error;
    const size = formatSize(rec.size);
    return `<tr>
      <td><div class="dt-file"><span class="dt-file-badge">${icon("file")}</span><span class="dt-file-copy"><span class="dt-file-name" title="${escape(rec.name)}">${escape(rec.name)}</span>${size ? `<span class="dt-file-size">${escape(size)}</span>` : ""}</span></div></td>
      <td>${escape(rec.from)}</td><td>${escape(rec.to)}</td>
      <td><span class="dt-status ${meta.tone}">${meta.label}</span></td>
      <td>${escape(rec.time)}</td>
      <td><div class="dt-actions"><button class="dt-mini" type="button" data-dt-action="download" data-id="${escape(rec.id)}" ${meta.ready ? "" : "disabled"}>下载</button><button class="dt-mini" type="button" data-dt-action="view" data-id="${escape(rec.id)}" ${meta.ready ? "" : "disabled"}>查看</button></div></td>
    </tr>`;
  }

  function renderTable() {
    if (!state.dom) return;
    const total = Math.max(1, Math.ceil(state.records.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), total);
    const start = (state.page - 1) * PAGE_SIZE;
    const rows = state.records.slice(start, start + PAGE_SIZE);
    state.dom.body.innerHTML = rows.length ? rows.map(rowMarkup).join("")
      : `<tr><td colspan="6" class="dt-empty">暂无翻译记录</td></tr>`;
  }

  function renderPager() {
    if (!state.dom) return;
    const total = Math.max(1, Math.ceil(state.records.length / PAGE_SIZE));
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
    const title = rec.name.replace(/\.[^.]+$/, "");
    return `<h3>${escape(title)}</h3>
      <p>本页为演示预览，用于展示译文查阅的界面形态。正式环境将在此呈现按原文档版式排布的翻译结果。</p>
      <div class="dt-placeholder" style="width:88%"></div>
      <div class="dt-placeholder" style="width:96%"></div>
      <div class="dt-placeholder" style="width:72%"></div>
      <p>翻译方向：${escape(rec.from)} → ${escape(rec.to)}</p>
      <div class="dt-placeholder" style="width:90%"></div>
      <div class="dt-placeholder" style="width:64%"></div>`;
  }

  function openPreview(id) {
    const rec = state.records.find(item => item.id === id);
    if (!rec || !STATUS[rec.status]?.ready) return;
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

  function handleFiles(list) {
    const file = list && list[0];
    if (!file) return;
    if (!isAllowed(file.name)) { note("仅支持 PDF、Word（.doc / .docx）格式的文档。"); return; }
    if (file.size > MAX_SIZE) { note("文件大小超过 100MB，请压缩后重试。"); return; }
    note("");
    const rec = {
      id: `dt-local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: file.name, size: file.size, from: "中文", to: "英文",
      status: "running", time: nowText(), local: true,
    };
    state.records.unshift(rec);
    state.page = 1;
    renderTable();
    renderPager();
    toast(`已添加「${file.name}」，正在翻译…`);
    clearTimeout(state.translateTimer);
    state.translateTimer = setTimeout(() => {
      rec.status = "done";
      renderTable();
      toast(`「${file.name}」翻译完成`);
    }, 1600);
  }

  function bind(target) {
    const d = state.dom;
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

    target.addEventListener("click", event => {
      const button = event.target.closest("[data-dt-action]");
      if (!button) return;
      const action = button.dataset.dtAction;
      if (action === "choose") d.file.click();
      else if (action === "close") d.dialog.close();
      else if (action === "view") openPreview(button.dataset.id);
      else if (action === "download" || action === "viewer-download") toast("演示原型暂不提供文件下载。");
      else if (action === "prev") { state.page -= 1; renderTable(); renderPager(); }
      else if (action === "next") { state.page += 1; renderTable(); renderPager(); }
      else if (action === "viewer-info") toast("演示文件仅 1 页，工具栏用于展示查阅形态。");
      else if (action === "zoom-in" || action === "zoom-out") {
        state.zoom = Math.max(50, Math.min(200, state.zoom + (action === "zoom-in" ? 25 : -25)));
        d.zoom.textContent = `${state.zoom}%`;
        d.paper.style.zoom = String(state.zoom / 100);
      }
    });
  }

  function render(target, onDirty = () => {}) {
    state.onDirty = onDirty;
    if (!state.built) { state.records = seedRecords(); state.built = true; }
    target.classList.add("dt-workspace");
    build(target);
    bind(target);
    renderTable();
    renderPager();
  }

  function deactivate() {
    clearTimeout(state.toastTimer);
    if (state.dom?.dialog?.open) state.dom.dialog.close();
    const el = document.querySelector(".dt-toast");
    if (el) el.hidden = true;
  }

  function resume() { if (state.dom) { renderTable(); renderPager(); } }

  window.BaigeDocTranslateTool = Object.freeze({
    render, resume, deactivate, formatSize, isAllowed, seedRecords, STATUS, PAGE_SIZE, MAX_SIZE,
  });
})();
