(() => {
  "use strict";

  const store = window.BaigeWritingStore;
  if (!store) return;
  const { escapeHtml: escape, icon } = window.BaigeUI;
  const root = document.querySelector("#writingApp");
  const chapterDialog = document.querySelector("#chapterDialog");
  const secretDetailDialog = document.querySelector("#secretDetailDialog");
  const composeDialog = document.querySelector("#composeDialog");
  const toastEl = document.querySelector("#writingToast");
  const MATERIAL_FILTERS = { all: "全部文件", ready: "可选用", audit: "涉密核查" };
  const AUDIT_ACTIONS = { detecting: "查看核查", hit: "提交审核", submitted: "查看审核", rejected: "查看原因" };

  let view = "templates";
  let materialFilter = "all";
  let materialQuery = "";
  let templateTab = "personal";
  let activeTemplate = null;
  let outline = [];
  let currentDoc = null;
  let composeState = { scenario: "", sources: { personal: true, enterprise: true, web: true }, extras: { conclusion: false, summary: false, references: false }, uploads: new Set() };
  let wizardStep = 1;
  let wizardState = { title: "", knowledge: false, uploads: new Set(), extras: { conclusion: false, summary: false, references: false } };
  let chapterEdit = null;
  let toastTimer = null;
  let rightTab = "thought";

  function toast(text) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
  }
  function html(value) { return escape(value ?? ""); }
  function fileSize(bytes) {
    if (!bytes) return "0 KB";
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  function statusLabel(status) { return { passed: "已通过", hit: "涉密可疑", submitted: "审核中", rejected: "已驳回", detecting: "检测中" }[status] || status; }
  function parseLabel(status) { return { unparsed: "未解析", parsing: "解析中", parsed: "已解析", failed: "解析失败" }[status] || "未解析"; }
  function parseHtml(status) { return `<span class="wr-tag parse-${escape(status || "unparsed")}">${parseLabel(status)}</span>`; }
  function secretTagHtml(status) { return `<span class="wr-tag secret-${escape(status)}">${statusLabel(status)}</span>`; }
  const filePicker = document.createElement("input");
  filePicker.type = "file";
  filePicker.multiple = true;
  filePicker.accept = ".pdf,.doc,.docx,.ppt,.pptx";
  filePicker.hidden = true;
  document.body.append(filePicker);
  filePicker.addEventListener("change", () => {
    const files = Array.from(filePicker.files || []);
    filePicker.value = "";
    if (view !== "materials" || !files.length) return;
    const allowed = /\.(pdf|doc|docx|ppt|pptx)$/i;
    const invalid = files.find((file) => !allowed.test(file.name) || file.size > 200 * 1024 * 1024);
    if (invalid) { toast(`${invalid.name} 格式或大小不符合要求。`); return; }
    const count = store.addUploads(files);
    if (!count) { toast("最多只能上传 5 个文件。"); return; }
    resetMaterialFilters();
    toast(count < files.length ? `已上传 ${count} 个文件，其余文件超过数量上限。` : `已上传 ${count} 个文件，正在检测涉密内容`);
  });
  function openFilePicker() {
    if (view !== "materials") return;
    if (store.uploads().length >= 5) { toast("最多只能上传 5 个文件。"); return; }
    filePicker.click();
  }

  function renderTemplates() {
    view = "templates";
    const templates = store.templates().filter((item) => item.scope === templateTab);
    root.innerHTML = `<header class="wr-head wr-materials-head"><div><h1>欢迎使用 <em>智能专业写作</em></h1><p>选择模板开始写作，或从大纲搭建专业内容框架。</p></div><div class="wr-head-actions"><button class="wr-btn" type="button" data-wr-manage-materials>素材管理</button></div></header>
      <section class="wr-templates"><div class="wr-tabs" role="tablist" aria-label="模板范围"><button class="wr-tab ${templateTab === "personal" ? "is-active" : ""}" type="button" data-template-tab="personal" role="tab" aria-selected="${templateTab === "personal"}">个人模板</button><button class="wr-tab ${templateTab === "public" ? "is-active" : ""}" type="button" data-template-tab="public" role="tab" aria-selected="${templateTab === "public"}">公共模板</button></div>
      <div class="wr-template-grid">${templates.length ? templates.map((template) => `<article class="wr-template-card"><h3>${html(template.name)}</h3><span class="wr-template-mode">${html(template.mode)}</span><p>${html(template.description)}</p><div class="wr-template-actions"><button class="wr-btn" type="button" data-template-outline="${html(template.id)}">大纲预览</button><button class="wr-btn is-primary" type="button" data-template-use="${html(template.id)}">使用模板</button></div></article>`).join("") : '<div class="wr-template-empty">暂无模板</div>'}</div></section>`;
  }

  function cloneOutline(source) {
    return source.map(function cloneNode(node) {
      return { ...node, id: `${node.id}-${Math.random().toString(36).slice(2, 6)}`, children: (node.children || []).map(cloneNode) };
    });
  }
  function setOutlineFromTemplate(template) {
    activeTemplate = template;
    outline = cloneOutline(template.outline);
    view = "outline";
    rightTab = "thought";
    render();
  }
  function openPublicWizard(template) {
    activeTemplate = template;
    outline = cloneOutline(template.outline);
    wizardStep = 1;
    wizardState = { title: "", knowledge: false, uploads: new Set(), extras: { conclusion: false, summary: false, references: false } };
    view = "wizard";
    render();
  }

  function numberNodes(nodes, prefix = "") {
    let chapterIndex = 0;
    return nodes.map((node) => {
      let label = "";
      if (node.type !== "nonchapter") {
        chapterIndex += 1;
        label = prefix ? `${prefix}.${chapterIndex}` : String(chapterIndex);
      }
      return { node, label, children: numberNodes(node.children || [], label || prefix) };
    });
  }
  function flatten(nodes, level = 0) {
    return nodes.flatMap((node) => [{ node, level }, ...flatten(node.children || [], level + 1)]);
  }
  function findNode(nodes, id, parent = null) {
    for (const node of nodes) {
      if (node.id === id) return { node, parent, list: nodes };
      const found = findNode(node.children || [], id, node);
      if (found) return found;
    }
    return null;
  }
  function outlineHtml(nodes, prefix = "", depth = 0) {
    let chapterIndex = 0;
    return nodes.map((node) => {
      if (node.type !== "nonchapter") chapterIndex += 1;
      const label = node.type === "nonchapter" ? "" : (prefix ? `${prefix}.${chapterIndex}` : String(chapterIndex));
      const childPrefix = label || prefix;
      return `<div class="wr-outline-node" data-depth="${depth + 1}"><div class="wr-outline-row"><span class="wr-outline-grip" aria-hidden="true">⋮⋮</span><div class="wr-outline-copy"><strong>${label ? `${html(label)}. ` : ""}${html(node.title)}</strong><small>${html(node.requirements || "暂未填写写作要求")}</small></div><div class="wr-outline-actions"><button class="wr-icon-btn" type="button" data-outline-add="${html(node.id)}" title="新增子章节" aria-label="在${html(node.title)}下新增子章节">＋</button><button class="wr-icon-btn" type="button" data-outline-edit="${html(node.id)}" title="编辑章节信息" aria-label="编辑${html(node.title)}">⚙</button><button class="wr-icon-btn is-danger" type="button" data-outline-delete="${html(node.id)}" title="删除章节" aria-label="删除${html(node.title)}">🗑</button></div></div>${node.children?.length ? `<div class="wr-outline-children">${outlineHtml(node.children, childPrefix, depth + 1)}</div>` : ""}</div>`;
    }).join("");
  }
  function renderOutline() {
    view = "outline";
    root.innerHTML = `<div class="wr-outline-page"><header class="wr-head wr-outline-head"><div class="wr-outline-title"><span class="wr-icon-mark"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 4h16v16H4z" opacity=".2"/><path d="M5 3h14v3H5zM5 8h9v2H5zM5 12h14v2H5zM5 16h11v2H5z"/></svg></span><div><h1>大纲编辑</h1><p>${html(activeTemplate?.name || "未命名模板")} · 调整章节结构与写作要求</p></div></div><div class="wr-head-actions"><button class="wr-btn" type="button" data-writing-back>返回模板</button><button class="wr-btn is-primary" type="button" data-writing-start>开始写作</button></div></header>
      <div class="wr-outline-toolbar"><span class="wr-outline-hint">支持章节层级、写作要求和生成开关；点击＋新增子章节，点击⚙编辑。</span><span class="wr-outline-hint">${flatten(outline).length} 个章节节点</span></div>
      <div class="wr-outline-tree">${outline.length ? outlineHtml(outline) : '<div class="wr-template-empty">还没有章节，请新增章节。</div>'}<button class="wr-outline-add" type="button" data-outline-add-root>＋ 新增章节</button></div></div>`;
  }

  function openChapterDialog(nodeId = "", parentId = "") {
    const found = nodeId ? findNode(outline, nodeId) : null;
    const node = found?.node || { id: "", title: "新章节", type: "chapter", generate: true, requirements: "", children: [] };
    chapterEdit = { nodeId, parentId, isNew: !found };
    chapterDialog.innerHTML = `<header class="wr-dialog-head"><h2 id="chapterDialogTitle">${found ? "编辑章节信息" : "新增章节"}</h2><button class="wr-dialog-close" type="button" data-wr-close>×</button></header>
      <div class="wr-dialog-body"><label class="wr-field"><span>标题 <em>*</em></span><input class="wr-input" id="wrChapterTitle" maxlength="80" value="${html(node.title)}" /></label>
      <div class="wr-field"><span>章节类型</span><div class="wr-radio-row"><label><input type="radio" name="wrChapterType" value="chapter" ${node.type !== "nonchapter" ? "checked" : ""} />章节</label><label><input type="radio" name="wrChapterType" value="nonchapter" ${node.type === "nonchapter" ? "checked" : ""} />非章节</label></div></div>
      <div class="wr-toggle-row"><span>是否需要生成</span><label class="wr-switch"><input type="checkbox" id="wrChapterGenerate" ${node.generate !== false ? "checked" : ""} /><i></i></label></div>
      <label class="wr-field"><span>写作要求</span><textarea class="wr-textarea" id="wrChapterRequirements" maxlength="1000" placeholder="说明本章节需要写什么、引用哪些数据、达到什么目标">${html(node.requirements || "")}</textarea></label><p class="wr-field-feedback" id="wrChapterFeedback" role="status"></p></div>
      <footer class="wr-dialog-foot"><button class="wr-btn" type="button" data-wr-close>取消</button><button class="wr-btn is-primary" type="button" id="wrChapterSave">确定</button></footer>`;
    chapterDialog.showModal();
    chapterDialog.querySelector("#wrChapterTitle")?.focus();
  }
  function saveChapter() {
    if (!chapterEdit) return;
    const title = chapterDialog.querySelector("#wrChapterTitle").value.trim();
    if (!title) {
      chapterDialog.querySelector("#wrChapterFeedback").textContent = "请填写章节标题。";
      return;
    }
    const data = {
      title,
      type: chapterDialog.querySelector('input[name="wrChapterType"]:checked')?.value === "nonchapter" ? "nonchapter" : "chapter",
      generate: chapterDialog.querySelector("#wrChapterGenerate").checked,
      requirements: chapterDialog.querySelector("#wrChapterRequirements").value.trim(),
    };
    if (chapterEdit.isNew) {
      const parent = chapterEdit.parentId ? findNode(outline, chapterEdit.parentId)?.node : null;
      const newItem = { id: `n-${Date.now().toString(36)}`, children: [], ...data };
      if (parent) parent.children.push(newItem);
      else outline.push(newItem);
    } else {
      const found = findNode(outline, chapterEdit.nodeId);
      if (found) Object.assign(found.node, data);
    }
    chapterDialog.close();
    chapterEdit = null;
    renderOutline();
  }

  function renderMaterials() {
    materialFilter = "all";
    materialQuery = "";
    root.innerHTML = `<header class="wr-head wr-materials-head">
        <div><h1 tabindex="-1">素材管理</h1><p>通过涉密核查的文件可供个人模板和公共模板选用。</p></div>
        <div class="wr-file-entry">
          <div class="wr-head-actions">
            <button class="wr-btn" type="button" data-writing-back>返回模板</button>
            <button class="wr-btn is-primary" type="button" data-wr-material-upload aria-describedby="wrMaterialFormats">${icon("upload")}上传文件</button>
          </div>
          <p class="wr-file-formats" id="wrMaterialFormats">支持 PDF、Word、PPT</p>
        </div>
      </header>
      <section class="wr-file-list" aria-label="写作素材文件">
        <div class="wr-file-toolbar">
          <div class="wr-file-filters" role="group" aria-label="按文件状态筛选">
            ${Object.entries(MATERIAL_FILTERS).map(([filter, label]) => `
              <button type="button" data-wr-file-filter="${filter}" aria-pressed="${filter === "all"}">${label}<span data-file-count>0</span></button>
            `).join("")}
          </div>
          <form class="wr-file-search" data-wr-file-search-form role="search" aria-label="搜索写作素材">
            <label class="search-field wr-file-search-input">${icon("search")}<input type="search" data-wr-file-search aria-label="搜索文件名" placeholder="搜索文件名" /></label>
            <button class="secondary-button" type="submit">搜索</button>
          </form>
        </div>
        <p class="sr-only" data-wr-file-summary aria-live="polite"></p>
        <div data-wr-material-table></div>
      </section>`;
    renderMaterialTable();
    root.querySelector("h1")?.focus();
  }

  function resetMaterialFilters() {
    materialFilter = "all";
    materialQuery = "";
    root.querySelector("[data-wr-file-search]").value = "";
    renderMaterialTable();
  }

  function renderMaterialTable() {
    const uploads = store.uploads().reverse();
    const ready = uploads.filter(item => item.status === "passed").length;
    const counts = { all: uploads.length, ready, audit: uploads.length - ready };
    const query = materialQuery;
    const filtered = uploads.filter(item => {
      const category = item.status === "passed" ? "ready" : "audit";
      return (materialFilter === "all" || materialFilter === category) && item.name.toLowerCase().includes(query);
    });
    for (const button of root.querySelectorAll("[data-wr-file-filter]")) {
      const filter = button.dataset.wrFileFilter;
      button.setAttribute("aria-pressed", String(filter === materialFilter));
      button.querySelector("[data-file-count]").textContent = counts[filter];
    }
    const summary = root.querySelector("[data-wr-file-summary]");
    const message = `显示 ${filtered.length} 个文件`;
    if (summary.textContent !== message) summary.textContent = message;
    const empty = query ? "没有找到匹配的文件。" : materialFilter !== "all"
      ? "这个分类暂时没有文件。" : "还没有写作素材。点击「上传文件」添加。";
    root.querySelector("[data-wr-material-table]").innerHTML = filtered.length ? uploadTableHtml(filtered) : `
      <div class="wr-file-empty"><p>${empty}</p>
        ${query || materialFilter !== "all" ? '<button type="button" class="wr-file-reset" data-wr-file-filter-reset>清除筛选</button>' : ""}
      </div>`;
  }
  function uploadTableHtml(uploads) {
    const rows = uploads.map((item) => {
      const passed = item.status === "passed";
      const id = html(item.id);
      const name = html(item.name);
      const eye = `<button class="wr-eye" type="button" data-wr-secret="${html(item.id)}" title="查看涉密检测详情" aria-label="查看${html(item.name)}的涉密检测详情">${icon("eye")}</button>`;
      const next = passed
        ? `<button class="wr-file-action-label" type="button" data-wr-file-action="preview" data-wr-file-id="${id}">预览文档</button>`
        : `<button class="wr-file-action-label" type="button" data-wr-secret="${id}">${AUDIT_ACTIONS[item.status] || "查看核查"}</button>`;
      const actions = `<div class="wr-file-actions">${next}<button class="is-danger" type="button" data-wr-file-action="delete" data-wr-file-id="${id}" title="删除文件" aria-label="删除${name}">${icon("trash")}</button></div>`;
      return `<tr class="${passed ? "" : "is-locked"}"><td><div class="wr-file-name"><span title="${name}">${name}</span></div></td><td>${html(item.createdAt || "-")}</td><td>${parseHtml(item.parseStatus)}</td><td><div class="wr-secret-cell">${secretTagHtml(item.status)}${eye}</div></td><td>${html(item.updatedAt || "-")}</td><td>${actions}</td></tr>`;
    }).join("");
    return `<div class="wr-file-table-wrap" tabindex="0" role="region" aria-label="素材文件列表"><table class="wr-file-table is-material"><thead><tr><th>文件名</th><th>创建时间</th><th>解析状态</th><th>涉密审查状态</th><th>最近更新</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function materialPickerHtml(attribute, selected) {
    const files = store.selectableUploads();
    if (!files.length) return '<p class="wr-material-empty">暂无可选文件。可返回模板列表，在「素材管理」上传文件并查看审核进度。</p>';
    return `<ul class="wr-material-choices">${files.map((file) => `<li><label class="wr-material-choice"><input type="checkbox" ${attribute}="${html(file.id)}" ${selected.has(file.id) ? "checked" : ""} /><span class="wr-material-choice-name">${html(file.name)}</span><span class="wr-material-choice-size">${fileSize(file.size)}</span></label></li>`).join("")}</ul>`;
  }
  function selectedMaterials(selected) {
    return store.selectableUploads().filter((item) => selected.has(item.id));
  }
  function secretTimeline(item) {
    const rows = [`<div class="wr-tl-item"><div class="wr-tl-dot">⬆</div><div><strong>用户发起上传</strong><small>${html(item.createdAt || "-")}</small></div></div>`];
    rows.push(`<div class="wr-tl-item"><div class="wr-tl-dot">🔍</div><div><strong>系统涉密检测</strong><small>${html(item.updatedAt || "-")}</small><p>${html(item.message || "正在检测涉密内容")}</p></div></div>`);
    if (item.status === "hit") rows.push(`<div class="wr-tl-item"><div class="wr-tl-dot">⏳</div><div><strong>涉密可疑，等待处理</strong><small>当前</small><p>可选择取消上传，或继续上传并提交管理员审核</p></div></div>`);
    if (item.status === "submitted") rows.push(`<div class="wr-tl-item"><div class="wr-tl-dot">⏳</div><div><strong>已提交管理员审核</strong><small>${html(item.updatedAt || "-")}</small><p>审核通过后方可作为写作参考</p></div></div>`);
    if (item.status === "rejected") rows.push(`<div class="wr-tl-item"><div class="wr-tl-dot is-danger">❌</div><div><strong>管理员审核驳回</strong><small>${html(item.updatedAt || "-")}</small><p>文档未入库，不可作为写作参考</p></div></div>`);
    if (item.status === "passed") rows.push(`<div class="wr-tl-item"><div class="wr-tl-dot is-success">✓</div><div><strong>涉密检测通过</strong><small>${html(item.updatedAt || "-")}</small><p>文档可作为写作参考</p></div></div>`);
    return `<div class="wr-timeline">${rows.join("")}</div>`;
  }
  function openSecretDetail(id) {
    const item = store.upload(id);
    if (!item) return;
    const danger = ["hit", "submitted", "rejected"].includes(item.status);
    const kws = (item.keywords || []).map((keyword) => `<span class="wr-kw">${html(keyword)}</span>`).join("");
    const footer = item.status === "hit"
      ? `<button class="wr-btn" type="button" data-wr-secret-cancel="${html(item.id)}">取消上传</button><button class="wr-btn is-primary" type="button" data-wr-secret-submit="${html(item.id)}">继续上传并提交审批</button>`
      : item.status === "rejected"
        ? `<button class="wr-btn" type="button" data-wr-secret-close>关闭</button><button class="wr-btn is-primary" type="button" data-wr-secret-reupload>重新上传</button>`
        : '<button class="wr-btn" type="button" data-wr-secret-close>关闭</button>';
    secretDetailDialog.innerHTML = `<header class="wr-dialog-head"><h2 id="secretDetailTitle">涉密检测详情 — ${statusLabel(item.status)}</h2><button class="wr-dialog-close" type="button" data-wr-secret-close>×</button></header><div class="wr-dialog-body">${danger ? `<div class="wr-secret-alert"><span>⚠</span><div><strong>检测到涉密内容</strong><p>${html(item.message || "系统检测到该文件包含敏感关键词。")}</p>${kws ? `<div class="wr-kw-row"><b>命中关键词</b>${kws}</div>` : ""}</div></div>` : ""}<div class="wr-file-meta"><div><span>文件名</span><strong>${html(item.name)}</strong></div><div><span>创建时间</span><strong>${html(item.createdAt || "-")}</strong></div><div><span>解析状态</span><strong>${parseLabel(item.parseStatus)}</strong></div><div><span>涉密审查状态</span><strong>${statusLabel(item.status)}</strong></div><div><span>最近更新</span><strong>${html(item.updatedAt || "-")}</strong></div></div><div class="wr-section-title" style="margin-top:20px"><span>流转记录</span></div>${secretTimeline(item)}</div><footer class="wr-dialog-foot">${footer}</footer>`;
    secretDetailDialog.showModal();
  }
  function openComposeDialog() {
    composeState = { scenario: "", sources: { personal: true, enterprise: true, web: true }, extras: { conclusion: false, summary: false, references: false }, uploads: new Set() };
    renderComposeDialog();
    composeDialog.showModal();
    composeDialog.querySelector("#wrScenario")?.focus();
  }
  function renderComposeDialog() {
    composeDialog.innerHTML = `<header class="wr-dialog-head"><h2 id="composeDialogTitle">新建写作</h2><button class="wr-dialog-close" type="button" data-wr-close>×</button></header>
      <div class="wr-dialog-body"><label class="wr-field"><span>写作场景 <em>*</em></span><input class="wr-input" id="wrScenario" maxlength="100" placeholder="请输入写作场景" value="${html(composeState.scenario)}" /></label>
      <div class="wr-field"><span>写作参考文档 <small style="font-weight:400;color:#8b97a8">配置将应用至全部章节</small></span><div class="wr-source-toggles"><button class="wr-source-toggle ${composeState.sources.personal ? "is-active" : ""}" type="button" data-wr-source="personal">个人知识库</button><button class="wr-source-toggle ${composeState.sources.enterprise ? "is-active" : ""}" type="button" data-wr-source="enterprise">企业知识库</button><button class="wr-source-toggle ${composeState.sources.web ? "is-active" : ""}" type="button" data-wr-source="web">联网搜索</button></div><p class="wr-hint">可从素材管理中选择已通过涉密审核的文件。</p><div class="wr-upload-list" id="wrComposeUploads"></div></div>
      <div class="wr-toggle-row"><span>生成绪论</span><label class="wr-switch"><input type="checkbox" data-wr-extra="conclusion" ${composeState.extras.conclusion ? "checked" : ""} /><i></i></label></div>
      <div class="wr-toggle-row"><span>全文总结</span><label class="wr-switch"><input type="checkbox" data-wr-extra="summary" ${composeState.extras.summary ? "checked" : ""} /><i></i></label></div>
      <div class="wr-toggle-row"><span>参考文献</span><label class="wr-switch"><input type="checkbox" data-wr-extra="references" ${composeState.extras.references ? "checked" : ""} /><i></i></label></div>
      <p class="wr-field-feedback" id="wrComposeFeedback" role="status"></p></div>
      <footer class="wr-dialog-foot"><button class="wr-btn" type="button" data-wr-close>取消</button><button class="wr-btn is-primary" type="button" id="wrComposeSubmit">确认</button></footer>`;
    composeDialog.querySelector("#wrScenario").addEventListener("input", (event) => { composeState.scenario = event.target.value; });
    composeDialog.querySelectorAll("[data-wr-source]").forEach((button) => button.addEventListener("click", () => {
      const key = button.dataset.wrSource;
      composeState.sources[key] = !composeState.sources[key];
      button.classList.toggle("is-active", composeState.sources[key]);
    }));
    composeDialog.querySelectorAll("[data-wr-extra]").forEach((input) => input.addEventListener("change", () => { composeState.extras[input.dataset.wrExtra] = input.checked; }));
    composeDialog.querySelector("#wrComposeSubmit").addEventListener("click", generateDocument);
    renderComposeUploads();
  }
  function renderComposeUploads() {
    const box = composeDialog.querySelector("#wrComposeUploads");
    if (!box) return;
    box.innerHTML = materialPickerHtml("data-wr-upload", composeState.uploads);
    box.querySelectorAll("[data-wr-upload]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) composeState.uploads.add(input.dataset.wrUpload); else composeState.uploads.delete(input.dataset.wrUpload);
    }));
  }

  function docBlocks(extras = composeState.extras) {
    const blocks = [];
    const numbered = numberNodes(outline);
    function visit(nodes, depth = 0) {
      nodes.forEach(({ node, label, children }) => {
        if (node.generate !== false) blocks.push({ type: "heading", level: Math.min(3, depth + 2), label, title: node.title, requirements: node.requirements });
        children.forEach((child) => visit([child], depth + 1));
      });
    }
    visit(numbered);
    if (extras.conclusion) blocks.push({ type: "heading", level: 2, label: "结论", title: "结论", requirements: "归纳全文核心判断，形成明确结论。" });
    if (extras.summary) blocks.push({ type: "heading", level: 2, label: "总结", title: "全文总结", requirements: "概括全文主要内容、方法与价值。" });
    return blocks;
  }
  function createDocument({ title, scenario, sources, extras, uploadNames }) {
    const blocks = docBlocks(extras);
    const document = {
      title,
      template: activeTemplate?.name || "",
      scenario,
      sources,
      extras,
      uploads: uploadNames,
      blocks,
      outline: outline.map((node) => ({ ...node })),
    };
    currentDoc = document;
    store.saveDocument(document);
    view = "workspace";
    rightTab = "thought";
    render();
    toast("写作文档已生成（原型演示）");
  }
  function generateDocument() {
    const scenario = composeState.scenario.trim();
    if (!scenario) {
      composeDialog.querySelector("#wrComposeFeedback").textContent = "请填写写作场景。";
      return;
    }
    const selectedUploads = selectedMaterials(composeState.uploads);
    composeDialog.close();
    createDocument({
      title: scenario,
      scenario,
      sources: composeState.sources,
      extras: composeState.extras,
      uploadNames: selectedUploads.map((item) => item.name),
    });
  }

  function workspaceHtml() {
    const sources = [];
    if (currentDoc.sources.personal) sources.push("个人知识库");
    if (currentDoc.sources.enterprise) sources.push("企业知识库");
    if (currentDoc.sources.web) sources.push("联网搜索");
    if (currentDoc.sources.knowledge) sources.push("知识库");
    currentDoc.uploads.forEach((name) => sources.push(name));
    const numbered = numberNodes(currentDoc.outline || []);
    const mini = [];
    function flattenMini(nodes, level = 0) {
      nodes.forEach(({ node, label, children }) => {
        mini.push(`<div class="wr-mini-node" style="--level:${level}" data-scroll-node="${html(node.id)}"><strong>${label ? `${html(label)}. ` : ""}${html(node.title)}</strong><small>${html(node.requirements || "")}</small></div>`);
        flattenMini(children, level + 1);
      });
    }
    flattenMini(numbered);
    const blocks = (currentDoc.blocks || []).map((block) => `<h${block.level}>${block.label && block.label !== block.title ? `${html(block.label)}. ` : ""}${html(block.title)}</h${block.level}><p>${html(block.requirements || "本节按照既定写作要求展开，结合参考资料组织专业表达。")} 本节内容为原型模拟生成，可在正式接入写作模型后替换为真实生成结果。</p>`).join("");
    const refs = currentDoc.uploads.length || sources.length ? `<div class="wr-doc-refs"><strong>参考资料</strong><br>${[currentDoc.uploads.length ? `上传文档：${currentDoc.uploads.map(html).join("、")}` : "", sources.filter((name) => !currentDoc.uploads.includes(name)).length ? `知识来源：${sources.filter((name) => !currentDoc.uploads.includes(name)).join("、")}` : ""].filter(Boolean).join("<br>")}</div>` : "";
    return `<header class="wr-head"><div><h1>${html(currentDoc.title)}</h1><p>${html(currentDoc.template || "百舸写作")} · 原型模拟生成</p></div><div class="wr-head-actions"><button class="wr-btn" type="button" data-writing-back>返回模板</button><button class="wr-btn" type="button" data-writing-edit>编辑大纲</button><button class="wr-btn is-primary" type="button" data-writing-export>导出</button></div></header>
      <div class="wr-workspace"><aside class="wr-side wr-side--left"><div class="wr-side-title">文档大纲 <small>${flatten(currentDoc.outline || []).length} 节</small></div><div class="wr-mini-outline">${mini.join("")}</div></aside><article class="wr-doc"><h1>${html(currentDoc.title)}</h1><div class="wr-doc-meta">${html(currentDoc.scenario)} · ${new Date().toLocaleDateString("zh-CN")}</div>${blocks}${refs}</article><aside class="wr-side wr-side--right"><div class="wr-tool-tabs"><button class="wr-tool-tab ${rightTab === "thought" ? "is-active" : ""}" type="button" data-wr-right="thought">写作思路</button><button class="wr-tool-tab ${rightTab === "ai" ? "is-active" : ""}" type="button" data-wr-right="ai">AI工具</button></div>${rightTab === "thought" ? `<div class="wr-thought"><div class="wr-thought-card"><b>写作场景</b><p>${html(currentDoc.scenario)}</p></div><div class="wr-thought-card"><b>参考来源</b><p>${html(sources.join("、") || "未选择参考资料")}</p></div><div class="wr-thought-card"><b>结构提示</b><p>${html(currentDoc.extras.conclusion ? "包含结论；" : "")}${html(currentDoc.extras.summary ? "包含全文总结；" : "")}${html(currentDoc.extras.references ? "包含参考文献。" : "按大纲逐章展开。")}</p></div></div>` : `<div class="wr-tool-empty">AI 工具暂未接入<br><br><div class="wr-ai-actions"><button type="button" data-wr-ai>AI 优化</button><button type="button" data-wr-ai>扩展本节</button><button type="button" data-wr-ai>润色全文</button></div></div>`}</aside></div>`;
  }


  function wizardOutlineHtml(nodes, prefix = "", depth = 0) {
    let chapterIndex = 0;
    return nodes.map((node) => {
      if (node.type !== "nonchapter") chapterIndex += 1;
      const label = node.type === "nonchapter" ? "" : (prefix ? `${prefix}.${chapterIndex}` : String(chapterIndex));
      return `<div class="wr-wizard-outline-node" data-depth="${depth}"><div class="wr-wizard-outline-row"><strong>${label ? `${html(label)}. ` : ""}${html(node.title)}</strong><span>默认分类 <button type="button" class="wr-link">展开更多</button></span></div><p>${html(node.requirements || "")}</p>${node.children?.length ? wizardOutlineHtml(node.children, label || prefix, depth + 1) : ""}</div>`;
    }).join("");
  }
  function wizardUploadsHtml() {
    return materialPickerHtml("data-wr-wizard-upload", wizardState.uploads);
  }
  function stepMarkup() {
    const steps = [[1, "输入文章标题"], [2, "选择素材"], [3, "选择工具"]];
    return steps.map(([number, label], index) => `<div class="wr-step ${wizardStep === number ? "is-current" : ""} ${wizardStep > number ? "is-done" : ""}"><span class="wr-step-index">${wizardStep > number ? "✓" : number}</span><strong>${label}</strong>${index < steps.length - 1 ? '<i class="wr-step-arrow" aria-hidden="true"></i>' : ""}</div>`).join("");
  }
  function wizardStepContent() {
    if (wizardStep === 1) {
      return `<div class="wr-wizard-content"><label class="wr-field"><span>文章标题 <em>*</em></span><input class="wr-input" id="wrWizardTitle" maxlength="100" placeholder="请输入文章标题" value="${html(wizardState.title)}" /></label><p class="wr-field-feedback" id="wrWizardFeedback" role="status"></p></div><div class="wr-wizard-actions"><button class="wr-btn is-primary" type="button" data-wr-wizard-next>下一步</button></div>`;
    }
    if (wizardStep === 2) {
      return `<div class="wr-wizard-content"><label class="wr-material-choice"><input type="checkbox" data-wr-wizard-knowledge ${wizardState.knowledge ? "checked" : ""} />使用知识库作为参考</label><div class="wr-section-title" style="margin-top:22px"><span>写作素材</span></div><p class="wr-hint">可从素材管理中选择已通过涉密审核的文件。</p><div class="wr-upload-list" id="wrWizardUploads">${wizardUploadsHtml()}</div><p class="wr-field-feedback" id="wrWizardFeedback" role="status"></p></div><div class="wr-wizard-actions"><button class="wr-btn" type="button" data-wr-wizard-prev>上一步</button><button class="wr-btn is-primary" type="button" data-wr-wizard-next>下一步</button></div>`;
    }
    return `<div class="wr-wizard-content"><div class="wr-section-title"><span>选择工具</span></div><div class="wr-toggle-row"><span>生成绪论</span><label class="wr-switch"><input type="checkbox" data-wr-wizard-extra="conclusion" ${wizardState.extras.conclusion ? "checked" : ""} /><i></i></label></div><div class="wr-toggle-row"><span>全文总结</span><label class="wr-switch"><input type="checkbox" data-wr-wizard-extra="summary" ${wizardState.extras.summary ? "checked" : ""} /><i></i></label></div><div class="wr-toggle-row"><span>参考文献</span><label class="wr-switch"><input type="checkbox" data-wr-wizard-extra="references" ${wizardState.extras.references ? "checked" : ""} /><i></i></label></div><p class="wr-field-feedback" id="wrWizardFeedback" role="status"></p></div><div class="wr-wizard-actions"><button class="wr-btn" type="button" data-wr-wizard-prev>上一步</button><button class="wr-btn is-primary" type="button" data-wr-wizard-finish>开始写作</button></div>`;
  }
  function renderWizard() {
    view = "wizard";
    const template = activeTemplate;
    root.innerHTML = `<div class="wr-wizard"><aside class="wr-wizard-side"><div class="wr-wizard-side-head"><span>文档大纲</span><button class="wr-link" type="button" data-wr-history>历史记录</button></div><div class="wr-wizard-outline">${wizardOutlineHtml(outline)}</div><button class="wr-outline-add" type="button" data-wr-edit-outline>编辑大纲</button></aside><section class="wr-wizard-main"><header class="wr-wizard-head"><div><h1>【${html(template?.name || "写作模板")}】</h1><p>${html(template?.description || "按模板引导完成写作配置")}</p></div><button class="wr-btn" type="button" data-writing-back>返回模板</button></header><div class="wr-steps">${stepMarkup()}</div>${wizardStepContent()}</section></div>`;
  }
  function openHistoryDialog() {
    let dialog = document.querySelector("#writingHistoryDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "writingHistoryDialog";
      dialog.className = "writing-dialog";
      document.body.append(dialog);
      dialog.addEventListener("click", (event) => { if (event.target.closest("[data-wr-close]")) dialog.close(); });
    }
    const docs = store.read().documents || [];
    dialog.innerHTML = `<header class="wr-dialog-head"><h2>写作历史</h2><button class="wr-dialog-close" type="button" data-wr-close>×</button></header><div class="wr-dialog-body"><div class="wr-history-list">${docs.length ? docs.map((doc) => `<div class="wr-history-row"><div><strong>${html(doc.title)}</strong><small>${html(doc.createdAt)} · ${html(doc.template || "写作")}</small></div><span>${(doc.blocks || []).length} 节</span></div>`).join("") : '<div class="wr-upload-empty">暂无历史写作文档</div>'}</div></div><footer class="wr-dialog-foot"><button class="wr-btn" type="button" data-wr-close>关闭</button></footer>`;
    dialog.showModal();
  }

  function render() {
    if (view === "templates") renderTemplates();
    else if (view === "materials") renderMaterials();
    else if (view === "outline") renderOutline();
    else if (view === "wizard") renderWizard();
    else if (view === "workspace") root.innerHTML = workspaceHtml();
  }

  function exportDocument() {
    if (!currentDoc) return;
    const text = `${currentDoc.title}\n\n${currentDoc.blocks.map((block) => `${block.label ? block.label + " " : ""}${block.title}\n${block.requirements || ""}`).join("\n\n")}`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentDoc.title}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    toast("文档已导出");
  }

  root.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-template-tab]");
    if (tab) { templateTab = tab.dataset.templateTab; renderTemplates(); return; }
    if (event.target.closest("[data-wr-manage-materials]")) { view = "materials"; render(); return; }
    if (event.target.closest("[data-wr-material-upload]")) { openFilePicker(); return; }
    const fileFilter = event.target.closest("[data-wr-file-filter]");
    if (fileFilter) { materialFilter = fileFilter.dataset.wrFileFilter; renderMaterialTable(); return; }
    if (event.target.closest("[data-wr-file-filter-reset]")) {
      resetMaterialFilters();
      root.querySelector("[data-wr-file-search]").focus();
      return;
    }
    if (event.target.closest("[data-wr-wizard-next]")) {
      if (wizardStep === 1) {
        const title = root.querySelector("#wrWizardTitle")?.value.trim() || "";
        if (!title) { const feedback = root.querySelector("#wrWizardFeedback"); if (feedback) feedback.textContent = "请输入文章标题。"; return; }
        wizardState.title = title;
      }
      if (wizardStep === 2 && !wizardState.knowledge && !selectedMaterials(wizardState.uploads).length) {
        const feedback = root.querySelector("#wrWizardFeedback");
        if (feedback) feedback.textContent = "请选择知识库或至少一个写作素材文件。";
        return;
      }
      wizardStep = Math.min(3, wizardStep + 1);
      renderWizard();
      return;
    }
    if (event.target.closest("[data-wr-wizard-prev]")) { wizardStep = Math.max(1, wizardStep - 1); renderWizard(); return; }
    if (event.target.closest("[data-wr-wizard-finish]")) {
      const title = (root.querySelector("#wrWizardTitle")?.value || wizardState.title).trim();
      if (!title) { wizardStep = 1; renderWizard(); const feedback = root.querySelector("#wrWizardFeedback"); if (feedback) feedback.textContent = "请输入文章标题。"; return; }
      const selectedUploads = selectedMaterials(wizardState.uploads);
      if (!wizardState.knowledge && !selectedUploads.length) {
        wizardStep = 2;
        renderWizard();
        root.querySelector("#wrWizardFeedback").textContent = "请选择知识库或至少一个写作素材文件。";
        return;
      }
      createDocument({ title, scenario: title, sources: { knowledge: wizardState.knowledge }, extras: wizardState.extras, uploadNames: selectedUploads.map((item) => item.name) });
      return;
    }
    if (event.target.closest("[data-wr-history]")) { openHistoryDialog(); return; }
    if (event.target.closest("[data-wr-edit-outline]")) { view = "outline"; render(); return; }
    const use = event.target.closest("[data-template-use]");
    if (use) {
      const template = store.template(use.dataset.templateUse);
      if (template) {
        if (template.scope === "public") openPublicWizard(template);
        else setOutlineFromTemplate(template);
      }
      return;
    }
    const preview = event.target.closest("[data-template-outline]");
    if (preview) { const template = store.template(preview.dataset.templateOutline); if (template) setOutlineFromTemplate(template); return; }
    const back = event.target.closest("[data-writing-back]");
    if (back) {
      const fromMaterials = view === "materials";
      view = "templates"; currentDoc = null; activeTemplate = null; outline = []; render();
      if (fromMaterials) root.querySelector("[data-wr-manage-materials]")?.focus();
      return;
    }
    const add = event.target.closest("[data-outline-add]");
    if (add) { openChapterDialog("", add.dataset.outlineAdd); return; }
    if (event.target.closest("[data-outline-add-root]")) { openChapterDialog("", ""); return; }
    const edit = event.target.closest("[data-outline-edit]");
    if (edit) { openChapterDialog(edit.dataset.outlineEdit); return; }
    const del = event.target.closest("[data-outline-delete]");
    if (del) {
      if (!window.confirm("删除该章节及其子章节？")) return;
      const found = findNode(outline, del.dataset.outlineDelete);
      if (found) { found.list.splice(found.list.indexOf(found.node), 1); renderOutline(); }
      return;
    }
    if (event.target.closest("[data-writing-start]")) { openComposeDialog(); return; }
    if (event.target.closest("[data-writing-edit]")) { view = "outline"; render(); return; }
    if (event.target.closest("[data-writing-export]")) { exportDocument(); return; }
    const right = event.target.closest("[data-wr-right]");
    if (right) { rightTab = right.dataset.wrRight; render(); return; }
    if (event.target.closest("[data-wr-ai]")) { toast("AI 工具为原型占位，暂未接入模型"); return; }
    const scroll = event.target.closest("[data-scroll-node]");
    if (scroll) {
      const nodes = root.querySelectorAll("[data-scroll-node]");
      nodes.forEach((node) => node.classList.remove("is-active"));
      scroll.classList.add("is-active");
      return;
    }
  });

  for (const dialog of [chapterDialog, composeDialog]) {
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-wr-close]")) { dialog.close(); return; }
      if (dialog === chapterDialog && event.target.closest("#wrChapterSave")) saveChapter();
    });
  }

  document.addEventListener("click", (event) => {
    if (view !== "materials") return;
    const eye = event.target.closest("[data-wr-secret]");
    if (eye) { openSecretDetail(eye.dataset.wrSecret); return; }
    const action = event.target.closest("[data-wr-file-action]");
    if (action) {
      const id = action.dataset.wrFileId;
      const item = store.upload(id);
      if (!item) return;
      if (action.dataset.wrFileAction === "delete") {
        if (!window.confirm(`删除《${item.name}》？`)) return;
        store.removeUpload(id);
        composeState.uploads.delete(id);
        wizardState.uploads.delete(id);
        toast(`已删除《${item.name}》`);
        return;
      }
      if (action.dataset.wrFileAction === "preview") { toast("文档预览待接入文件服务"); return; }
    }
    if (event.target.closest("[data-wr-secret-close]")) { secretDetailDialog.close(); return; }
    const submit = event.target.closest("[data-wr-secret-submit]");
    if (submit) {
      const item = store.upload(submit.dataset.wrSecretSubmit);
      store.submitUpload(submit.dataset.wrSecretSubmit);
      secretDetailDialog.close();
      toast(`《${item?.name || "文件"}》已提交管理员审核`);
      return;
    }
    const cancel = event.target.closest("[data-wr-secret-cancel]");
    if (cancel) {
      const item = store.upload(cancel.dataset.wrSecretCancel);
      store.removeUpload(cancel.dataset.wrSecretCancel);
      composeState.uploads.delete(cancel.dataset.wrSecretCancel);
      wizardState.uploads.delete(cancel.dataset.wrSecretCancel);
      secretDetailDialog.close();
      toast(`《${item?.name || "文件"}》已取消上传`);
      return;
    }
    if (event.target.closest("[data-wr-secret-reupload]")) {
      secretDetailDialog.close();
      openFilePicker();
      return;
    }
  });
  store.subscribe(() => {
    if (view === "materials") renderMaterialTable();
    if (composeDialog.open) renderComposeUploads();
    const wizardUploads = root.querySelector("#wrWizardUploads");
    if (wizardUploads) wizardUploads.innerHTML = wizardUploadsHtml();
  });

  root.addEventListener("input", (event) => {
    if (event.target.id === "wrWizardTitle") wizardState.title = event.target.value;
    if (event.target.matches("[data-wr-file-search]") && !event.target.value && materialQuery) {
      materialQuery = "";
      renderMaterialTable();
    }
  });
  root.addEventListener("submit", (event) => {
    if (!event.target.matches("[data-wr-file-search-form]")) return;
    event.preventDefault();
    materialQuery = event.target.querySelector("[data-wr-file-search]").value.trim().toLowerCase();
    renderMaterialTable();
  });
  root.addEventListener("change", (event) => {
    if (event.target.matches("[data-wr-wizard-knowledge]")) wizardState.knowledge = event.target.checked;
    const upload = event.target.closest("[data-wr-wizard-upload]");
    if (upload) {
      if (upload.checked) wizardState.uploads.add(upload.dataset.wrWizardUpload); else wizardState.uploads.delete(upload.dataset.wrWizardUpload);
    }
    const extra = event.target.closest("[data-wr-wizard-extra]");
    if (extra) wizardState.extras[extra.dataset.wrWizardExtra] = extra.checked;
  });

  render();
})();
