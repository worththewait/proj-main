(() => {
  "use strict";

  const store = window.BaigeWritingStore;
  if (!store) return;
  const { escapeHtml: escape } = window.BaigeUI;
  const root = document.querySelector("#writingApp");
  const chapterDialog = document.querySelector("#chapterDialog");
  const uploadDialog = document.querySelector("#uploadDialog");
  const composeDialog = document.querySelector("#composeDialog");
  const toastEl = document.querySelector("#writingToast");

  let view = "templates";
  let templateTab = "personal";
  let activeTemplate = null;
  let outline = [];
  let currentDoc = null;
  let composeState = { scenario: "", sources: { personal: true, enterprise: true, web: true }, extras: { conclusion: false, summary: false, references: false }, uploads: new Set() };
  let uploadPending = [];
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
  function statusLabel(status) { return { passed: "已通过", rejected: "涉密可疑", detecting: "检测中" }[status] || status; }
  function statusHtml(status) { return `<span class="wr-status ${escape(status)}">${statusLabel(status)}</span>`; }

  function renderTemplates() {
    view = "templates";
    const templates = store.templates().filter((item) => item.scope === templateTab);
    root.innerHTML = `<header class="wr-head"><div><h1>欢迎使用 <em>智能专业写作</em></h1><p>选择模板开始写作，或从大纲搭建专业内容框架。</p></div></header>
      <section class="wr-templates"><div class="wr-tabs" role="tablist" aria-label="模板范围"><button class="wr-tab ${templateTab === "personal" ? "is-active" : ""}" type="button" data-template-tab="personal" role="tab" aria-selected="${templateTab === "personal"}">个人模板</button><button class="wr-tab ${templateTab === "public" ? "is-active" : ""}" type="button" data-template-tab="public" role="tab" aria-selected="${templateTab === "public"}">公共模板</button></div>
      <div class="wr-template-grid">${templates.length ? templates.map((template) => `<article class="wr-template-card"><h3>${html(template.name)}</h3><span class="wr-template-mode">${html(template.mode)}</span><p>${html(template.description)}</p><div class="wr-template-actions"><button class="wr-btn" type="button" data-template-outline="${html(template.id)}">大纲预览</button><button class="wr-btn is-primary" type="button" data-template-use="${html(template.id)}">使用模板</button></div></article>`).join("") : '<div class="wr-template-empty">暂无模板</div>'}</div></section>`;
  }

  function setOutlineFromTemplate(template) {
    activeTemplate = template;
    outline = template.outline.map(function cloneNode(node) {
      return { ...node, id: `${node.id}-${Math.random().toString(36).slice(2, 6)}`, children: (node.children || []).map(cloneNode) };
    });
    view = "outline";
    rightTab = "thought";
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
    return nodes.map((node, index) => {
      const label = node.type === "nonchapter" ? "" : (prefix ? `${prefix}.${index + 1}` : String(index + 1));
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

  function openUploadDialog() {
    uploadPending = [];
    renderUploadDialog();
    uploadDialog.showModal();
  }
  function renderUploadDialog() {
    const uploads = store.uploads();
    const room = Math.max(0, 5 - uploads.length);
    uploadDialog.innerHTML = `<header class="wr-dialog-head"><h2 id="uploadDialogTitle">上传</h2><button class="wr-dialog-close" type="button" data-wr-close>×</button></header>
      <div class="wr-dialog-body"><div class="wr-hint">支持 pdf、doc、docx、ppt、pptx 格式，单个文件不超过 200MB，最多只能上传 5 个文件。上传后自动进行涉密检测，只有检测通过的文档可作为写作参考。</div>
      <div class="wr-upload-actions"><label class="wr-btn">选择文件<input id="wrFileInput" type="file" multiple accept=".pdf,.doc,.docx,.ppt,.pptx" hidden /></label><button class="wr-btn is-primary" id="wrStartUpload" type="button" ${room ? "" : "disabled"}>开始上传</button></div>
      <p class="wr-field-feedback" id="wrUploadFeedback"></p>
      <div id="wrPendingFiles" class="wr-upload-list"></div>
      <table class="wr-upload-table"><thead><tr><th>文件名</th><th>大小</th><th>状态</th><th>检测结果</th></tr></thead><tbody>${uploads.length ? uploads.map((item) => `<tr><td>${html(item.name)}</td><td>${fileSize(item.size)}</td><td>${statusHtml(item.status)}</td><td>${html(item.message || "")}</td></tr>`).join("") : '<tr><td colspan="4"><div class="wr-upload-empty">暂无上传文档</div></td></tr>'}</tbody></table></div>
      <footer class="wr-dialog-foot"><button class="wr-btn" type="button" data-wr-close>关闭</button><button class="wr-btn is-primary" type="button" id="wrUploadConfirm">确认</button></footer>`;
    const input = uploadDialog.querySelector("#wrFileInput");
    input.addEventListener("change", () => {
      const files = Array.from(input.files || []);
      const allowed = /\.(pdf|doc|docx|ppt|pptx)$/i;
      const invalid = files.find((file) => !allowed.test(file.name) || file.size > 200 * 1024 * 1024);
      if (invalid) {
        uploadDialog.querySelector("#wrUploadFeedback").textContent = `${invalid.name} 格式或大小不符合要求。`;
        return;
      }
      uploadPending = files.slice(0, room);
      renderPending();
      input.value = "";
    });
    uploadDialog.querySelector("#wrStartUpload").addEventListener("click", () => {
      if (!uploadPending.length) { uploadDialog.querySelector("#wrUploadFeedback").textContent = "请先选择文件。"; return; }
      store.addUploads(uploadPending);
      uploadPending = [];
      uploadDialog.querySelector("#wrUploadFeedback").textContent = "";
      renderUploadDialog();
    });
    uploadDialog.querySelector("#wrUploadConfirm").addEventListener("click", () => {
      uploadDialog.close();
      if (composeDialog.open) renderComposeUploads();
    });
  }
  function renderPending() {
    const box = uploadDialog.querySelector("#wrPendingFiles");
    if (!box) return;
    box.innerHTML = uploadPending.map((file) => `<div class="wr-upload-row"><span class="wr-upload-name">${html(file.name)}</span><span class="wr-upload-meta">${fileSize(file.size)}</span><span class="wr-status detecting">待上传</span></div>`).join("");
  }

  function selectableUploads() { return store.uploads().filter((item) => item.status === "passed"); }
  function openComposeDialog() {
    composeState = { scenario: "", sources: { personal: true, enterprise: true, web: true }, extras: { conclusion: false, summary: false, references: false }, uploads: new Set() };
    renderComposeDialog();
    composeDialog.showModal();
    composeDialog.querySelector("#wrScenario")?.focus();
  }
  function renderComposeDialog() {
    composeDialog.innerHTML = `<header class="wr-dialog-head"><h2 id="composeDialogTitle">新建写作</h2><button class="wr-dialog-close" type="button" data-wr-close>×</button></header>
      <div class="wr-dialog-body"><label class="wr-field"><span>写作场景 <em>*</em></span><input class="wr-input" id="wrScenario" maxlength="100" placeholder="请输入写作场景" value="${html(composeState.scenario)}" /></label>
      <div class="wr-field"><span>写作参考文档 <small style="font-weight:400;color:#8b97a8">配置将应用至全部章节</small></span><div class="wr-source-toggles"><button class="wr-source-toggle ${composeState.sources.personal ? "is-active" : ""}" type="button" data-wr-source="personal">个人知识库</button><button class="wr-source-toggle ${composeState.sources.enterprise ? "is-active" : ""}" type="button" data-wr-source="enterprise">企业知识库</button><button class="wr-source-toggle ${composeState.sources.web ? "is-active" : ""}" type="button" data-wr-source="web">联网搜索</button><button class="wr-source-toggle" type="button" id="wrOpenUpload">上传文档</button></div><p class="wr-hint">上传文档需通过涉密检测：只有“已通过”的文档才可勾选，涉密可疑文档将禁用。</p><div class="wr-upload-list" id="wrComposeUploads"></div></div>
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
    composeDialog.querySelector("#wrOpenUpload").addEventListener("click", openUploadDialog);
    composeDialog.querySelector("#wrComposeSubmit").addEventListener("click", generateDocument);
    renderComposeUploads();
  }
  function renderComposeUploads() {
    const box = composeDialog.querySelector("#wrComposeUploads");
    if (!box) return;
    const uploads = store.uploads();
    box.innerHTML = uploads.length ? uploads.map((item) => `<label class="wr-upload-row ${item.status === "passed" ? "" : "is-disabled"}"><input type="checkbox" data-wr-upload="${html(item.id)}" ${composeState.uploads.has(item.id) && item.status === "passed" ? "checked" : ""} ${item.status === "passed" ? "" : "disabled"} /><span class="wr-upload-name">${html(item.name)}</span>${statusHtml(item.status)}<span class="wr-upload-meta">${html(item.message || "")}</span></label>`).join("") : '<div class="wr-upload-empty">尚未上传文档</div>';
    box.querySelectorAll("[data-wr-upload]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked) composeState.uploads.add(input.dataset.wrUpload); else composeState.uploads.delete(input.dataset.wrUpload);
    }));
  }

  function docBlocks() {
    const blocks = [];
    const numbered = numberNodes(outline);
    function visit(nodes, depth = 0) {
      nodes.forEach(({ node, label, children }) => {
        if (node.generate !== false) blocks.push({ type: "heading", level: Math.min(3, depth + 2), label, title: node.title, requirements: node.requirements });
        children.forEach((child) => visit([child], depth + 1));
      });
    }
    visit(numbered);
    if (composeState.extras.conclusion) blocks.push({ type: "heading", level: 2, label: "结论", title: "结论", requirements: "归纳全文核心判断，形成明确结论。" });
    if (composeState.extras.summary) blocks.push({ type: "heading", level: 2, label: "总结", title: "全文总结", requirements: "概括全文主要内容、方法与价值。" });
    return blocks;
  }
  function generateDocument() {
    const scenario = composeState.scenario.trim();
    if (!scenario) {
      composeDialog.querySelector("#wrComposeFeedback").textContent = "请填写写作场景。";
      return;
    }
    const selectedUploads = store.uploads().filter((item) => composeState.uploads.has(item.id) && item.status === "passed");
    const blocks = docBlocks();
    const title = scenario;
    const document = {
      title,
      template: activeTemplate?.name || "",
      scenario,
      sources: composeState.sources,
      extras: composeState.extras,
      uploads: selectedUploads.map((item) => item.name),
      blocks,
      outline: outline.map((node) => ({ ...node })),
    };
    currentDoc = document;
    store.saveDocument(document);
    composeDialog.close();
    view = "workspace";
    rightTab = "thought";
    render();
    toast("写作文档已生成（原型演示）");
  }

  function workspaceHtml() {
    const sources = [];
    if (currentDoc.sources.personal) sources.push("个人知识库");
    if (currentDoc.sources.enterprise) sources.push("企业知识库");
    if (currentDoc.sources.web) sources.push("联网搜索");
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

  function render() {
    if (view === "templates") renderTemplates();
    else if (view === "outline") renderOutline();
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
    const use = event.target.closest("[data-template-use]");
    if (use) { const template = store.template(use.dataset.templateUse); if (template) setOutlineFromTemplate(template); return; }
    const preview = event.target.closest("[data-template-outline]");
    if (preview) { const template = store.template(preview.dataset.templateOutline); if (template) setOutlineFromTemplate(template); return; }
    const back = event.target.closest("[data-writing-back]");
    if (back) { view = "templates"; currentDoc = null; activeTemplate = null; outline = []; render(); return; }
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

  for (const dialog of [chapterDialog, uploadDialog, composeDialog]) {
    dialog.addEventListener("click", (event) => {
      if (event.target.closest("[data-wr-close]")) { dialog.close(); return; }
      if (dialog === chapterDialog && event.target.closest("#wrChapterSave")) saveChapter();
    });
  }
  store.subscribe(() => {
    if (uploadDialog.open) {
      const feedback = uploadDialog.querySelector("#wrUploadFeedback")?.textContent || "";
      renderUploadDialog();
      const next = uploadDialog.querySelector("#wrUploadFeedback");
      if (next && feedback) next.textContent = feedback;
    }
    if (composeDialog.open) renderComposeUploads();
  });

  render();
})();
