/* 智能工具 · 文本翻译：复刻线上语言栏、双栏输入输出、最近翻译与历史记录弹窗。
   翻译结果由本地演示词表生成，历史记录仅存在当前页面内存，刷新即丢失。 */
(() => {
  "use strict";

  const { icon, escapeHtml: escape } = window.BaigeUI;
  const LANGS = ["中文", "英文", "日文", "韩文", "俄文"];
  const PAGE_SIZE = 5;
  const RECENT_LIMIT = 10;
  const SWAP_MARK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h13 m-3-3 3 3-3 3 M20 16H7 m3-3-3 3 3 3"/></svg>';

  /* 演示词表：正式环境由翻译服务生成，这里只覆盖常见短句。 */
  const GLOSSARY = {
    英文: {
      "你是谁": "Who are you?", "你好": "Hello", "谢谢": "Thank you", "身份证": "ID card",
      "船舶": "Ship", "文档": "Document", "翻译": "Translate", "你好世界": "Hello world",
      "很高兴认识你": "Nice to meet you", "请稍等": "Please wait", "会议纪要": "Meeting minutes",
      "技术规范": "Technical specification", "智能船舶": "Intelligent ship", "数据标注": "Data annotation",
      "nihao": "hello", "111": "111", "123": "123", "啊啊": "Ahh",
      "可直接在文本框中使用键盘快捷键进行操作": "You can directly use keyboard shortcuts in the text box to perform operations.",
    },
    中文: {
      hello: "你好", hi: "你好", ship: "船舶", document: "文档", japan: "日本",
      "thank you": "谢谢", "who are you": "你是谁", "good morning": "早上好",
      "meeting minutes": "会议纪要", "data annotation": "数据标注",
    },
    日文: { "你好": "こんにちは", "谢谢": "ありがとう", "船舶": "船舶（せんぱく）", hello: "こんにちは" },
    韩文: { "你好": "안녕하세요", "谢谢": "감사합니다", "船舶": "선박", hello: "안녕하세요" },
    俄文: { "你好": "Здравствуйте", "谢谢": "Спасибо", "船舶": "Судно", hello: "Здравствуйте" },
  };

  /* 演示历史：前 10 条与线上最近翻译一致，其余为虚构的补充记录。 */
  const SEED = [
    ["中文", "英文", "你是谁", "Who are you?", "2026-11-10 11:14:57"],
    ["中文", "英文", "身份证", "ID card", "2026-11-04 18:07:05"],
    ["中文", "英文", "啊啊", "Ahh", "2026-11-04 17:49:25"],
    ["中文", "英文", "123", "123", "2026-11-02 17:46:19"],
    ["中文", "英文", "你好", "", "2026-10-28 17:00:09"],
    ["英文", "英文", "111", "", "2026-10-27 14:26:21"],
    ["中文", "英文", "nihao", "hello", "2026-10-19 16:43:05"],
    ["中文", "英文", "可直接在文本框中使用键盘快捷键进行操作", "You can directly use keyboard shortcuts in the text box to perform operations.", "2026-10-16 15:23:48"],
    ["", "中文", "japan", "日本", "2026-10-15 16:55:14"],
    ["", "英文", "日本", "Japan", "2026-10-15 16:54:26"],
  ];
  const FILLER = [
    ["中文", "英文", "船舶", "Ship", "2026-10-14 10:12:33"],
    ["中文", "英文", "会议纪要", "Meeting minutes", "2026-10-13 16:05:41"],
    ["英文", "中文", "good morning", "早上好", "2026-10-12 09:28:17"],
    ["中文", "英文", "技术规范", "Technical specification", "2026-10-11 15:44:02"],
    ["中文", "日文", "你好", "こんにちは", "2026-10-10 14:19:56"],
    ["中文", "英文", "智能船舶", "Intelligent ship", "2026-10-09 11:07:23"],
    ["英文", "中文", "ship", "船舶", "2026-10-08 17:33:48"],
    ["中文", "俄文", "谢谢", "Спасибо", "2026-10-07 10:51:09"],
    ["中文", "英文", "数据标注", "Data annotation", "2026-10-06 16:22:35"],
    ["中文", "韩文", "你好", "안녕하세요", "2026-10-05 13:48:14"],
    ["英文", "中文", "document", "文档", "2026-09-30 09:15:27"],
    ["中文", "英文", "请稍等", "Please wait", "2026-09-29 15:38:52"],
    ["中文", "英文", "很高兴认识你", "Nice to meet you", "2026-09-28 11:26:04"],
    ["英文", "中文", "who are you", "你是谁", "2026-09-27 14:07:39"],
    ["中文", "英文", "你好世界", "Hello world", "2026-09-26 10:43:21"],
    ["中文", "英文", "文档", "Document", "2026-09-25 16:58:47"],
    ["英文", "中文", "meeting minutes", "会议纪要", "2026-09-24 09:32:16"],
    ["中文", "英文", "翻译", "Translate", "2026-09-23 17:12:43"],
    ["中文", "日文", "谢谢", "ありがとう", "2026-09-22 11:49:58"],
    ["中文", "英文", "谢谢", "Thank you", "2026-09-21 14:36:29"],
    ["英文", "中文", "hello", "你好", "2026-09-20 10:21:05"],
    ["中文", "韩文", "船舶", "선박", "2026-09-19 15:54:37"],
    ["中文", "俄文", "船舶", "Судно", "2026-09-18 09:08:42"],
  ];

  const state = {
    records: [], recent: [], built: false, dom: null,
    from: "中文", to: "英文", page: 1, query: "", fromDate: "", toDate: "",
    toastTimer: 0, translateTimer: 0,
  };

  const seedRecords = () => [...SEED, ...FILLER].map(([from, to, source, result, time], i) => ({
    id: `tt-${i}`, from, to, source, result, time,
  }));

  const nowText = () => {
    const d = new Date();
    const p = v => String(v).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  };
  const direction = rec => `${rec.from || "—"} → ${rec.to}`;

  function build(target) {
    target.innerHTML = `
      <div class="tt-page">
        <section class="tt-card" aria-labelledby="ttInputTitle">
          <div class="tt-head">
            <span class="tt-head-text" id="ttInputTitle">支持中英日韩俄语言互译</span>
            <div class="tt-langs">
              <span class="tt-select"><select data-tt-from aria-label="源语言">${LANGS.map(l => `<option${l === state.from ? " selected" : ""}>${l}</option>`).join("")}</select>${icon("down")}</span>
              <button class="tt-swap" type="button" data-tt-action="swap" aria-label="交换源语言和目标语言">${SWAP_MARK}</button>
              <span class="tt-select"><select data-tt-to aria-label="目标语言">${LANGS.map(l => `<option${l === state.to ? " selected" : ""}>${l}</option>`).join("")}</select>${icon("down")}</span>
            </div>
          </div>
          <div class="tt-area">
            <section class="tt-panel" aria-labelledby="ttSourceTitle">
              <h3 class="tt-panel-head" id="ttSourceTitle">输入文本</h3>
              <div class="tt-panel-body"><textarea class="tt-textarea" data-tt-source placeholder="请输入需要翻译的文本..." aria-label="待翻译文本"></textarea></div>
            </section>
            <section class="tt-panel" aria-labelledby="ttResultTitle">
              <h3 class="tt-panel-head" id="ttResultTitle">翻译结果</h3>
              <div class="tt-panel-body">
                <textarea class="tt-textarea is-result" data-tt-result placeholder="翻译结果将显示在这里" aria-label="翻译结果" readonly></textarea>
                <p class="tt-result-note" data-tt-note hidden></p>
              </div>
            </section>
          </div>
          <p class="tt-tip">${icon("bulb")}<span>提示：可直接在文本框中使用键盘快捷键进行操作（Ctrl+C 复制 / Ctrl+V 粘贴）</span></p>
          <button class="tt-submit" type="button" data-tt-action="translate">${icon("translate")}<span data-tt-submit-label>开始翻译</span></button>
        </section>
        <section class="tt-card" aria-labelledby="ttRecentTitle">
          <div class="tt-history-head">
            <h2 class="tt-history-title" id="ttRecentTitle">最近翻译</h2>
            <button class="tt-history-link" type="button" data-tt-action="open-history">查看历史全部记录</button>
          </div>
          <div class="tt-history-list" data-tt-recent></div>
        </section>
        <dialog class="tt-dialog" data-tt-dialog aria-labelledby="ttDialogTitle">
          <header class="tt-dialog-head"><strong id="ttDialogTitle" tabindex="-1">翻译历史记录</strong><button class="tt-dialog-close" type="button" data-tt-action="close" aria-label="关闭历史记录">${icon("close")}</button></header>
          <div class="tt-filters">
            <input class="tt-search" type="search" data-tt-search placeholder="搜索翻译内容" aria-label="搜索翻译内容" />
            <input class="tt-date" type="date" data-tt-from-date aria-label="起始日期" />
            <input class="tt-date" type="date" data-tt-to-date aria-label="结束日期" />
            <button class="tt-filter-btn is-primary" type="button" data-tt-action="query">查询</button>
            <button class="tt-filter-btn" type="button" data-tt-action="reset">重置</button>
          </div>
          <div class="tt-dialog-body">
            <table class="tt-table">
              <colgroup><col style="width:18%" /><col style="width:30%" /><col style="width:30%" /><col style="width:22%" /></colgroup>
              <thead><tr><th scope="col">语言方向</th><th scope="col">原文</th><th scope="col">译文</th><th scope="col">时间</th></tr></thead>
              <tbody data-tt-body></tbody>
            </table>
          </div>
          <div class="tt-dialog-pager" data-tt-pager></div>
        </dialog>
      </div>`;
    state.dom = {
      root: target,
      from: target.querySelector("[data-tt-from]"),
      to: target.querySelector("[data-tt-to]"),
      source: target.querySelector("[data-tt-source]"),
      result: target.querySelector("[data-tt-result]"),
      note: target.querySelector("[data-tt-note]"),
      submit: target.querySelector("[data-tt-action='translate']"),
      submitLabel: target.querySelector("[data-tt-submit-label]"),
      recent: target.querySelector("[data-tt-recent]"),
      dialog: target.querySelector("[data-tt-dialog]"),
      title: target.querySelector("#ttDialogTitle"),
      search: target.querySelector("[data-tt-search]"),
      fromDate: target.querySelector("[data-tt-from-date]"),
      toDate: target.querySelector("[data-tt-to-date]"),
      body: target.querySelector("[data-tt-body]"),
      pager: target.querySelector("[data-tt-pager]"),
    };
  }

  function recentMarkup(rec) {
    return `<article class="tt-history-item">
      <div class="tt-history-meta"><span class="tt-history-lang">${escape(direction(rec))}</span><span class="tt-history-time">${escape(rec.time)}</span></div>
      <p class="tt-history-source">${escape(rec.source) || "&nbsp;"}</p>
      <p class="tt-history-result">${escape(rec.result) || "&nbsp;"}</p>
    </article>`;
  }

  function renderRecent() {
    if (!state.dom) return;
    state.recent = state.records.slice(0, RECENT_LIMIT);
    state.dom.recent.innerHTML = state.recent.length
      ? state.recent.map(recentMarkup).join("")
      : '<p class="tt-empty">暂无翻译记录</p>';
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.records.filter(rec => {
      if (q && !`${rec.source} ${rec.result}`.toLowerCase().includes(q)) return false;
      const day = rec.time.slice(0, 10);
      if (state.fromDate && day < state.fromDate) return false;
      if (state.toDate && day > state.toDate) return false;
      return true;
    });
  }

  function renderDialogTable() {
    if (!state.dom) return;
    const rows = filtered();
    const total = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    state.page = Math.min(Math.max(1, state.page), total);
    const start = (state.page - 1) * PAGE_SIZE;
    const pageRows = rows.slice(start, start + PAGE_SIZE);
    state.dom.body.innerHTML = pageRows.length ? pageRows.map(rec => `<tr>
      <td>${escape(direction(rec))}</td><td>${escape(rec.source)}</td><td>${escape(rec.result)}</td><td>${escape(rec.time)}</td>
    </tr>`).join("") : '<tr><td colspan="4" class="tt-empty">没有匹配的翻译记录</td></tr>';
    state.dom.pager.innerHTML = `<button class="tt-page-btn" type="button" data-tt-action="prev" ${state.page === 1 ? "disabled" : ""}>上一页</button><span class="tt-page-info">第 ${state.page} 页 / 共 ${total} 页</span><button class="tt-page-btn" type="button" data-tt-action="next" ${state.page === total ? "disabled" : ""}>下一页</button>`;
  }

  function toast(message) {
    let el = document.querySelector(".tt-toast");
    if (!el) { el = document.createElement("div"); el.className = "tt-toast"; el.setAttribute("role", "status"); document.body.append(el); }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function lookup(text, to) {
    const table = GLOSSARY[to];
    if (table && Object.hasOwn(table, text)) return { text: table[text], fallback: false };
    const hit = table && Object.keys(table).find(key => key.toLowerCase() === text.toLowerCase());
    if (hit) return { text: table[hit], fallback: false };
    return { text, fallback: true };
  }

  function translate() {
    const text = state.dom.source.value.trim();
    if (!text) { toast("请输入需要翻译的文本"); return; }
    const { text: output, fallback } = lookup(text, state.to);
    state.dom.submit.disabled = true;
    state.dom.submitLabel.textContent = "翻译中…";
    clearTimeout(state.translateTimer);
    state.translateTimer = setTimeout(() => {
      state.dom.submit.disabled = false;
      state.dom.submitLabel.textContent = "开始翻译";
      state.dom.result.value = output;
      state.dom.note.hidden = !fallback;
      state.dom.note.textContent = fallback ? "演示环境未收录该词条，正式环境由翻译服务生成译文。" : "";
      state.records.unshift({ id: `tt-local-${Date.now()}`, from: state.from, to: state.to, source: text, result: output, time: nowText() });
      renderRecent();
      if (state.dom.dialog.open) renderDialogTable();
    }, 420);
  }

  function bind(target) {
    const d = state.dom;
    d.from.addEventListener("change", () => { state.from = d.from.value; });
    d.to.addEventListener("change", () => { state.to = d.to.value; });
    d.dialog.addEventListener("click", event => { if (event.target === d.dialog) d.dialog.close(); });
    d.search.addEventListener("keydown", event => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      state.query = d.search.value;
      state.page = 1;
      renderDialogTable();
    });

    target.addEventListener("click", event => {
      const button = event.target.closest("[data-tt-action]");
      if (!button) return;
      const action = button.dataset.ttAction;
      if (action === "swap") {
        const from = state.from;
        state.from = state.to;
        state.to = from;
        d.from.value = state.from;
        d.to.value = state.to;
      } else if (action === "translate") translate();
      else if (action === "open-history") {
        state.page = 1;
        renderDialogTable();
        if (!d.dialog.open) d.dialog.showModal();
        d.title.focus({ preventScroll: true });
      } else if (action === "close") d.dialog.close();
      else if (action === "query") {
        state.query = d.search.value;
        state.fromDate = d.fromDate.value;
        state.toDate = d.toDate.value;
        state.page = 1;
        renderDialogTable();
      } else if (action === "reset") {
        d.search.value = "";
        d.fromDate.value = "";
        d.toDate.value = "";
        state.query = "";
        state.fromDate = "";
        state.toDate = "";
        state.page = 1;
        renderDialogTable();
      } else if (action === "prev") { state.page -= 1; renderDialogTable(); }
      else if (action === "next") { state.page += 1; renderDialogTable(); }
    });
  }

  function render(target, onDirty = () => {}) {
    if (!state.built) { state.records = seedRecords(); state.built = true; }
    target.classList.add("tt-workspace");
    build(target);
    bind(target);
    renderRecent();
  }

  function deactivate() {
    clearTimeout(state.toastTimer);
    clearTimeout(state.translateTimer);
    if (state.dom?.dialog?.open) state.dom.dialog.close();
    const el = document.querySelector(".tt-toast");
    if (el) el.hidden = true;
  }

  function resume() { if (state.dom) renderRecent(); }

  window.BaigeTextTranslateTool = Object.freeze({
    render, resume, deactivate, seedRecords, direction, LANGS, PAGE_SIZE, RECENT_LIMIT,
  });
})();
