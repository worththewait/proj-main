(() => {
  "use strict";
  const { knowledgeBases } = window.BaigeData;
  const { icon, escapeHtml } = window.BaigeUI;
  const session = new window.BaigeQuestionSession(knowledgeBases);
  const form = document.querySelector("#conversationForm");
  const messages = document.querySelector("#conversationMessages");
  const conversation = document.querySelector("#conversationView");
  const field = document.querySelector("#homePrompt");
  const feedback = document.querySelector("#conversationFeedback");
  const send = document.querySelector("#sendQuestion");
  const jumpToLatest = document.querySelector("#jumpToLatest");
  const historyKey = "baige.qa.history.v1";
  let conversations = [];
  try {
    const saved = JSON.parse(window.localStorage.getItem(historyKey));
    if (Array.isArray(saved)) conversations = saved.filter(item => item && typeof item.id === "string" && Array.isArray(item.messages)).map(item => ({
      ...item, title: String(item.title || "未命名会话"),
      messages: item.messages.filter(message => message && ["user", "assistant"].includes(message.role)).map(message => ({
        ...message, text: String(message.text || ""),
        ...(message.pending ? {pending: false, interrupted: true} : {})
      }))
    }));
  } catch {}
  let current = null;
  let chat = [];
  let generation = null;
  let followLatest = true;
  let missingHistoryScope = false;
  const historyPanel = document.querySelector("#historyPanel");
  const referencesPanel = document.querySelector("#referencesPanel");
  const historyToggle = document.querySelector("#historyToggle");
  const referencesToggle = document.querySelector("#referencesToggle");
  const panelTriggers = new Map();
  function setPanel(panel, toggle, open, trigger = toggle, restoreFocus = true) {
    if (open) {
      const other = panel === historyPanel ? referencesPanel : historyPanel;
      const otherToggle = panel === historyPanel ? referencesToggle : historyToggle;
      if (!other.hidden) {
        if (other === referencesPanel) collapseSource();
        setPanel(other, otherToggle, false, otherToggle, false);
      }
    }
    const wasOpen = !panel.hidden;
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      panelTriggers.set(panel, trigger);
      const target = panel === historyPanel ? document.querySelector("#historySearch") : panel.querySelector("h2");
      if (panel !== historyPanel) target?.setAttribute("tabindex", "-1");
      target?.focus({preventScroll: true});
    } else if (wasOpen && restoreFocus) {
      const target = panelTriggers.get(panel) || toggle;
      if (target?.isConnected && !target.hidden && target.focus) target.focus({preventScroll: true});
      else field.focus({preventScroll: true});
    }
    keepLatestVisible();
  }
  function persistHistory() {
    try { window.localStorage.setItem(historyKey, JSON.stringify(conversations)); } catch {}
  }
  function saveHistory() {
    persistHistory();
    const query = document.querySelector("#historySearch").value.trim().toLowerCase();
    const matches = conversations.filter(item => (item.title + " " + item.messages.map(message => message.text).join(" ")).toLowerCase().includes(query));
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const week = new Date(today); week.setDate(week.getDate() - 7);
    const timestamp = item => { const idTime = /^\d{13}(?=-|$)/.exec(item.id)?.[0]; const value = Number(item.updatedAt || item.createdAt || idTime); return Number.isFinite(value) && value > 0 && Number.isFinite(new Date(value).getTime()) ? value : 0; };
    const groups = new Map();
    [...matches].sort((a,b) => timestamp(b) - timestamp(a)).forEach(item => {
      const date = timestamp(item);
      const label = date >= +today ? "今天" : date >= +yesterday ? "昨天" : date >= +week ? "近 7 天" : "更早";
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(item);
    });
    document.querySelector("#historyList").innerHTML = groups.size ? [...groups].map(([label, items]) => `<section class="qa-history-group"><h3>${label}</h3>${items.map(item => {
      const date = timestamp(item);
      const time = date && Number.isFinite(new Date(date).getTime()) ? new Date(date).toLocaleTimeString("zh-CN", {hour:"2-digit", minute:"2-digit", hour12:false}) : "";
      return `<button type="button" class="qa-history-item" data-history-id="${escapeHtml(item.id)}" ${current?.id === item.id ? 'aria-current="true"' : ""}>${icon("chat")}<span class="qa-history-copy"><strong>${escapeHtml(item.title)}</strong><span class="qa-history-meta"><small>${item.mode === "knowledge" ? "知识问答" : "通用问答"}</small><time>${escapeHtml(time)}</time></span></span></button>`;
    }).join("")}</section>`).join("") : `<p class="qa-panel-empty">${query ? "没有找到相关会话" : "暂无历史对话"}</p>`;
  }
  setPanel(historyPanel, historyToggle, false, historyToggle, false);
  setPanel(referencesPanel, referencesToggle, false, referencesToggle, false);
  document.querySelector("#historySearch").addEventListener("input", saveHistory);
  historyToggle.addEventListener("click", () => setPanel(historyPanel, historyToggle, historyPanel.hidden));
  referencesToggle.addEventListener("click", () => setPanel(referencesPanel, referencesToggle, referencesPanel.hidden));
  document.querySelector("#historyExample").addEventListener("click", () => { document.querySelector("#showCitationExample").click(); setPanel(historyPanel, historyToggle, false, historyToggle, false); });
  document.querySelector("#historyClose").addEventListener("click", () => setPanel(historyPanel, historyToggle, false));
  document.querySelector("#referencesClose").addEventListener("click", () => { collapseSource(); setPanel(referencesPanel, referencesToggle, false); });
  document.querySelector("#newConversation").addEventListener("click", () => {
    cancelGeneration(); closePicker(false); clearSource();
    current = null; chat = []; conversation.classList.remove("is-chatting"); messages.innerHTML = "";
    missingHistoryScope = false;
    setPanel(historyPanel, historyToggle, false, historyToggle, false);
    field.value = ""; feedback.textContent = ""; resizePrompt(); renderMode(); updateSend();
    followLatest = true; jumpToLatest.hidden = true; saveHistory(); field.focus();
  });
  document.querySelector("#historyList").addEventListener("click", event => {
    const button = event.target.closest("[data-history-id]");
    const selected = button && conversations.find(item => item.id === button.dataset.historyId);
    if (!selected) return;
    cancelGeneration(); closePicker(false); clearSource();
    current = selected; chat = selected.messages; conversation.classList.add("is-chatting"); renderChat();
    session.mode = selected.mode === "knowledge" ? "knowledge" : "general";
    session.selectedIds = new Set(Array.isArray(selected.knowledgeBaseIds) ? selected.knowledgeBaseIds.filter(id => knowledgeBases.some(item => item.id === id)) : []);
    session.cancelSelection();
    missingHistoryScope = session.mode === "knowledge" && !session.selected.length;
    webSearch = selected.webSearch === true;
    renderWebSearch(); renderMode();
    field.value = ""; resizePrompt(); updateSend();
    feedback.textContent = missingHistoryScope ? "此历史未记录知识库范围，请重新选择资料。" : "";
    followLatest = true; scrollToLatest();
    setPanel(historyPanel, historyToggle, false, historyToggle, false); saveHistory(); field.focus();
  });
  const demoReply = "这是一条演示回复。感谢你的提问，实际智能问答能力正在接入中。";
  function replyStatus(item) {
    return item.pending ? "演示生成中" : item.stopped ? "演示回复 · 已停止" : item.interrupted ? "演示回复 · 已中断" : item.example ? "示例回答 · 非真实检索" : "演示回复";
  }
  function renderExample(item) {
    const data = window.BaigeConversationData;
    const paragraphs = Array.isArray(item.paragraphs) ? item.paragraphs : [];
    const citations = (Array.isArray(item.citationIds) ? item.citationIds : []).map(id => data?.citation(id)).filter(Boolean);
    return paragraphs.map(paragraph => {
      const citation = data?.citation(paragraph.citationId);
      const index = citation ? data.citations.indexOf(citation) : -1;
      return `<h3>${escapeHtml(paragraph.title || "")}</h3><p>${escapeHtml(paragraph.text || "")}${index >= 0 ? ` <button type="button" class="qa-citation-number" data-example-citation="${index}">${citation.number}</button>` : ""}</p>`;
    }).join("") + (citations.length ? `<div class="qa-citation-heading"><strong>参考资料 ${citations.length}</strong><small>点击核对原文</small></div><div class="qa-citation-list">${citations.map(citation => {
      const doc = data.document(citation.documentId);
      return doc ? `<button type="button" class="qa-citation-card" data-example-citation="${data.citations.indexOf(citation)}"><strong>${escapeHtml(doc.title)}</strong><small>${escapeHtml(doc.libraryName)} · 第 ${citation.page} 页</small></button>` : "";
    }).join("")}</div>` : "");
  }
  function renderChat() {
    messages.innerHTML = chat.map((item, index) => `<article class="qa-chat-message qa-chat-${item.role === "user" ? "user" : "assistant"}" data-message-index="${index}"><div class="qa-chat-author">${item.role === "user" ? "" : `<span class="qa-chat-avatar" aria-hidden="true">${icon("chat")}</span>`}<span class="qa-chat-label">${item.role === "user" ? "我" : "百舸问答"}</span>${item.role === "user" ? "" : `<span class="qa-chat-status">${replyStatus(item)}</span>`}</div>${item.example ? `<div class="qa-chat-text">${renderExample(item)}</div>` : `<p class="qa-chat-text">${escapeHtml(item.text)}</p>`}</article>`).join("");
    keepLatestVisible();
  }
  function updateSend() {
    const generating = Boolean(generation);
    send.disabled = !generating && !field.value.trim();
    send.setAttribute("type", generating ? "button" : "submit");
    send.setAttribute("aria-label", generating ? "停止生成" : "发送问题");
    send.setAttribute("title", generating ? "停止生成" : "发送问题（Enter）");
    send.classList.toggle("is-generating", generating);
    send.innerHTML = generating ? '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" /></svg>' : icon("send");
  }
  function scrollToLatest() {
    messages.scrollTop = messages.scrollHeight;
    jumpToLatest.hidden = true;
  }
  function keepLatestVisible() {
    // Reading scrollHeight here includes the latest composer/panel layout.
    if (followLatest) scrollToLatest();
  }
  messages.addEventListener("scroll", () => {
    followLatest = messages.scrollHeight - messages.clientHeight - messages.scrollTop <= 64;
    jumpToLatest.hidden = followLatest || !chat.length;
  });
  jumpToLatest.addEventListener("click", () => { followLatest = true; scrollToLatest(); messages.focus({preventScroll: true}); });
  function updateReply(task) {
    if (task.text) task.text.textContent = task.item.text;
    if (task.status) task.status.textContent = replyStatus(task.item);
    keepLatestVisible();
  }
  function cancelGeneration(reason = "interrupted") {
    if (!generation) return;
    const task = generation;
    generation = null;
    window.clearTimeout(task.timer);
    task.item.pending = false;
    task.item[reason] = true;
    updateReply(task); updateSend(); saveHistory();
  }
  send.addEventListener("click", event => {
    if (!generation) return;
    event.preventDefault();
    cancelGeneration("stopped");
    field.focus();
  });
  function typeReply(item) {
    const chars = Array.from(demoReply);
    let position = 0;
    const root = messages.querySelector(`[data-message-index="${chat.indexOf(item)}"]`);
    const task = {item, conversationId: current.id, text: root?.querySelector(".qa-chat-text"), status: root?.querySelector(".qa-chat-status"), timer: null};
    generation = task; updateSend();
    function step() {
      if (generation !== task || current?.id !== task.conversationId) return;
      item.text += chars[position++];
      if (position === chars.length) { item.pending = false; generation = null; updateSend(); }
      updateReply(task); persistHistory();
      if (position < chars.length) task.timer = window.setTimeout(step, 35);
    }
    task.timer = window.setTimeout(step, 35);
  }
  function resizePrompt() {
    field.style.height = "";
    field.style.overflowY = "";
    if (!field.value) return keepLatestVisible();
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 144)}px`;
    field.style.overflowY = field.scrollHeight > 144 ? "auto" : "hidden";
    keepLatestVisible();
  }
  const suggestions = [
    ["如何快速梳理一份研究报告的核心观点？", "船舶行业的绿色发展有哪些研究方向？", "怎样为一项研究任务搭建分析框架？"],
    ["如何比较两种技术方案？", "怎样整理一份行业研究资料清单？", "如何制定项目工作计划？"]
  ];
  let suggestionIndex = 0;
  function renderSuggestions() {
    document.querySelector("#suggestedQuestions").innerHTML = suggestions[suggestionIndex].map((text, index) => `<button type="button" data-suggestion="${index}">${escapeHtml(text)}</button>`).join("");
  }
  document.querySelector("#refreshQuestions").addEventListener("click", () => { suggestionIndex = (suggestionIndex + 1) % suggestions.length; renderSuggestions(); });
  document.querySelector("#suggestedQuestions").addEventListener("click", event => {
    const button = event.target.closest("[data-suggestion]"); if (!button) return;
    field.value = suggestions[suggestionIndex][Number(button.dataset.suggestion)]; resizePrompt(); updateSend(); field.focus();
  });
  let sourceDoc = 0, sourcePage = 2, sourceZoom = 100;
  function collapseSource() {
    referencesPanel.classList.remove("is-expanded");
    document.querySelector("#sourceExpand").setAttribute("aria-label", "展开阅读");
  }
  function clearSource() {
    collapseSource();
    setPanel(referencesPanel, referencesToggle, false, referencesToggle, false);
    sourceDoc = 0; sourcePage = 2; sourceZoom = 100;
    document.querySelector("#referencesContent").innerHTML = "<p>演示对话暂无实际引用文档。可通过引用示例查看原文交互。</p>";
    document.querySelector("#sourceControls").hidden = true;
    document.querySelector("#sourcePaper").innerHTML = "";
  }
  function renderSource() {
    const doc = window.BaigeConversationData.documents[sourceDoc], page = doc.pages[sourcePage - 1];
    document.querySelector("#sourceControls").hidden = false;
    document.querySelector("#referencesContent").innerHTML = `<strong>${escapeHtml(doc.title)}</strong><p>示例原文 · 用于展示引用交互，非真实检索结果</p>`;
    document.querySelector("#sourcePage").textContent = `${sourcePage} / ${doc.pages.length}`;
    document.querySelector("#sourceZoom").textContent = `${sourceZoom}%`;
    document.querySelector("#sourcePrevious").disabled = sourcePage === 1;
    document.querySelector("#sourceNext").disabled = sourcePage === doc.pages.length;
    document.querySelector("#sourcePaper").innerHTML = `<div style="font-size:${sourceZoom}%"><h3>${escapeHtml(page.title)}</h3>${page.sections.map(section => `<section class="${(sourceDoc === 0 && sourcePage === 2 && section.id === "dimensions") || (sourceDoc === 1 && sourcePage === 1 && section.id === "traceability") ? "is-cited" : ""}"><h4>${escapeHtml(section.title)}</h4><p>${escapeHtml(section.text)}</p></section>`).join("")}</div>`;
  }
  document.querySelector("#sourceExpand").addEventListener("click", () => {
    const expanded = referencesPanel.classList.toggle("is-expanded");
    document.querySelector("#sourceExpand").setAttribute("aria-label", expanded ? "退出展开阅读" : "展开阅读");
  });
  document.querySelector("#sourcePrevious").addEventListener("click", () => { sourcePage = Math.max(1, sourcePage - 1); renderSource(); });
  document.querySelector("#sourceNext").addEventListener("click", () => { sourcePage = Math.min(window.BaigeConversationData.documents[sourceDoc].pages.length, sourcePage + 1); renderSource(); });
  document.querySelector("#sourceZoomOut").addEventListener("click", () => { sourceZoom = Math.max(80, sourceZoom - 10); renderSource(); });
  document.querySelector("#sourceZoomIn").addEventListener("click", () => { sourceZoom = Math.min(150, sourceZoom + 10); renderSource(); });
  document.querySelector("#showCitationExample").addEventListener("click", () => {
    cancelGeneration(); closePicker(false); clearSource();
    const example = window.BaigeConversationData.exampleSession();
    const answer = example.messages[0];
    chat = [{role: "user", text: answer.question}, {role: "assistant", text: answer.paragraphs.map(item => `${item.title}\n${item.text}`).join("\n\n"), example: true, paragraphs: answer.paragraphs, citationIds: answer.citationIds}];
    session.mode = "knowledge";
    session.selectedIds = new Set(example.selected.filter(id => knowledgeBases.some(item => item.id === id)));
    session.cancelSelection(); missingHistoryScope = false;
    current = {id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: example.title, example: true, createdAt: Date.now(), updatedAt: Date.now(), messages: chat};
    conversations.unshift(current); persistSettings();
    conversation.classList.add("is-chatting");
    followLatest = true; renderChat(); renderMode();
    setPanel(historyPanel, historyToggle, false, historyToggle, false);
    field.value = ""; feedback.textContent = ""; resizePrompt(); updateSend(); field.focus();
  });
  messages.addEventListener("click", event => {
    const citation = event.target.closest("[data-example-citation]");
    if (!citation) return;
    sourceDoc = Number(citation.dataset?.exampleCitation) === 1 ? 1 : 0; sourcePage = sourceDoc === 0 ? 2 : 1; sourceZoom = 100;
    renderSource(); setPanel(historyPanel, historyToggle, false, historyToggle, false); setPanel(referencesPanel, referencesToggle, true, citation);
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || picker.open || event.defaultPrevented) return;
    if (referencesPanel.classList.contains("is-expanded")) collapseSource();
    else if (!referencesPanel.hidden) setPanel(referencesPanel, referencesToggle, false);
    else if (!historyPanel.hidden) setPanel(historyPanel, historyToggle, false);
  });
  renderSuggestions();

  const webSearchMode = document.querySelector("#webSearchMode");
  let webSearch = false;
  function renderWebSearch() {
    webSearchMode.classList.toggle("is-active", webSearch);
    webSearchMode.setAttribute("aria-pressed", String(webSearch));
  }
  function persistSettings() {
    if (current) {
      current.mode = session.mode;
      current.knowledgeBaseIds = session.selected.map(item => item.id);
      current.webSearch = webSearch;
    }
    saveHistory();
  }
  webSearchMode.addEventListener("click", () => {
    webSearch = !webSearch;
    renderWebSearch(); persistSettings();
    feedback.textContent = webSearch ? "联网搜索已开启（演示），未接入真实搜索。" : "联网搜索已关闭。";
    field.focus();
  });
  const generalMode = document.querySelector("#generalMode");
  const knowledgeMode = document.querySelector("#knowledgeMode");
  const sources = document.querySelector("#selectedSources");
  const picker = document.querySelector("#knowledgePicker");
  const search = document.querySelector("#knowledgeSearch");
  const scopesRoot = document.querySelector("#knowledgePickerScopes");
  const results = document.querySelector("#knowledgePickerResults");
  const confirm = document.querySelector("#confirmKnowledgePicker");
  const scopes = ["行业", "企业", "部门"];
  let activeScope = scopes[0];
  let pickerTrigger = null;
  let restorePickerFocus = true;

  function renderMode() {
    const knowledge = session.mode === "knowledge";
    generalMode.classList.toggle("is-active", !knowledge);
    generalMode.setAttribute("aria-pressed", String(!knowledge));
    knowledgeMode.classList.toggle("is-active", knowledge);
    knowledgeMode.setAttribute("aria-pressed", String(knowledge));
    document.querySelector("#knowledgeModeLabel").textContent = knowledge ? session.selected.length ? `知识问答 · ${session.selected.length}` : "知识问答 · 待选范围" : "知识问答";
    sources.hidden = !knowledge;
    const selected = session.selected;
    document.querySelector("#selectedSourceTags").innerHTML = selected.slice(0, 3).map(item => `<span class="qa-source-tag" title="${escapeHtml(item.name)}">${icon("book")}<span>${escapeHtml(item.name)}</span></span>`).join("") +
      (selected.length > 3 ? `<span class="qa-source-more" title="${escapeHtml(selected.slice(3).map(item => item.name).join("、"))}">另 ${selected.length - 3} 个</span>` : "") +
      (knowledge && !selected.length ? `<span class="qa-source-more">${missingHistoryScope ? "此历史未记录知识库范围，请重新选择" : "请选择知识库作为问答范围"}</span>` : "");
    field.placeholder = knowledge ? "围绕已选知识库提问，Enter 发送，Shift + Enter 换行" : "请输入你的问题，Enter 发送，Shift + Enter 换行";
    keepLatestVisible();
  }

  function renderSelectionCount() {
    document.querySelector("#knowledgeSelectionCount").textContent = `已选 ${session.draftIds.size} 个知识库`;
    confirm.disabled = session.draftIds.size === 0;
  }

  function renderPicker() {
    scopesRoot.innerHTML = scopes.map(scope => `<button class="category-tab${scope === activeScope ? " is-active" : ""}" type="button" data-knowledge-scope="${scope}" aria-pressed="${scope === activeScope}">${scope}</button>`).join("");
    const matches = session.findKnowledge(activeScope, search.value);
    results.innerHTML = matches.length ? `<h3>${activeScope}知识库</h3><div class="qa-knowledge-list">${matches.map(item => `<label class="qa-knowledge-option"><input type="checkbox" value="${escapeHtml(item.id)}" ${session.draftIds.has(item.id) ? "checked" : ""} />${icon("folder")}<span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></span></label>`).join("")}</div>` :
      `<div class="qa-picker-empty">${icon("search")}<h3>没有找到匹配的知识库</h3><p>试试其他名称，或切换知识库分类。</p><button class="qa-text-action" type="button" data-reset-knowledge-search>清空搜索</button></div>`;
    results.scrollTop = 0;
    document.querySelector("#knowledgeResultCount").textContent = `${activeScope}分类下找到 ${matches.length} 个知识库`;
    renderSelectionCount();
  }

  function openPicker(trigger) {
    if (picker.open) return;
    session.beginSelection();
    pickerTrigger = trigger;
    restorePickerFocus = true;
    search.value = "";
    activeScope = session.selected[0]?.scope || scopes[0];
    renderPicker();
    knowledgeMode.setAttribute("aria-expanded", "true");
    picker.showModal();
    search.focus();
  }

  function closePicker(restoreFocus = true) {
    if (!picker.open) return;
    restorePickerFocus = restoreFocus;
    session.cancelSelection();
    picker.close();
  }

  generalMode.addEventListener("click", () => {
    session.useGeneral();
    missingHistoryScope = false; persistSettings();
    feedback.textContent = "";
    renderMode();
    field.focus();
  });
  knowledgeMode.addEventListener("click", () => openPicker(knowledgeMode));
  document.querySelector("#changeKnowledge").addEventListener("click", event => openPicker(event.currentTarget));
  document.querySelector("#cancelKnowledgePicker").addEventListener("click", () => closePicker());
  document.querySelector("#closeKnowledgePicker").addEventListener("click", () => closePicker());
  picker.addEventListener("cancel", () => { session.cancelSelection(); restorePickerFocus = true; });
  picker.addEventListener("close", () => {
    if (picker.open) return;
    knowledgeMode.setAttribute("aria-expanded", "false");
    if (restorePickerFocus && pickerTrigger?.isConnected) pickerTrigger.focus({ preventScroll: true });
    pickerTrigger = null;
  });
  scopesRoot.addEventListener("click", event => {
    const button = event.target.closest("[data-knowledge-scope]");
    if (!button) return;
    activeScope = button.dataset.knowledgeScope;
    renderPicker();
    scopesRoot.querySelector(`[data-knowledge-scope="${activeScope}"]`).focus({ preventScroll: true });
  });
  search.addEventListener("input", renderPicker);
  results.addEventListener("change", event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    session.select(event.target.value, event.target.checked);
    renderSelectionCount();
  });
  results.addEventListener("click", event => {
    if (!event.target.closest("[data-reset-knowledge-search]")) return;
    search.value = "";
    renderPicker();
    search.focus();
  });
  confirm.addEventListener("click", () => {
    if (!session.confirmSelection()) return;
    missingHistoryScope = false; persistSettings();
    feedback.textContent = "";
    renderMode();
    restorePickerFocus = false;
    picker.close();
    field.focus();
  });
  field.addEventListener("input", () => {
    resizePrompt(); updateSend();
    feedback.textContent = "";
  });
  field.addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (generation) return;
    const request = session.prepareQuestion(field.value);
    if (request.status === "empty") {
      feedback.textContent = "请先输入问题或任务描述。";
      return field.focus();
    }
    if (request.status === "knowledge-required") return openPicker(knowledgeMode);
    conversation.classList.add("is-chatting");
    if (!current) { current = {id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: request.question.slice(0, 40), mode:request.mode, createdAt:Date.now(), messages: chat}; conversations.unshift(current); }
    current.updatedAt = Date.now();
    persistSettings();
    chat.push({role: "user", text: request.question});
    const reply = {role: "assistant", text: "", pending:true};
    chat.push(reply);
    followLatest = true; renderChat();
    typeReply(reply);
    saveHistory();
    field.value = "";
    resizePrompt(); updateSend();
    feedback.textContent = "";
    field.focus();

  });
  window.BaigePage.onDeactivate(() => {
    cancelGeneration(); closePicker(false); clearSource();
    setPanel(historyPanel, historyToggle, false, historyToggle, false);
  });
  window.BaigePage.onActivate(({ child, question, knowledgeBaseIds }) => {
    const conversation = document.querySelector("#conversationView");
    const pending = document.querySelector("#qaPending");
    if (child === "智能问数") { cancelGeneration(); closePicker(false); clearSource(); }
    conversation.hidden = child === "智能问数";
    pending.hidden = !conversation.hidden;
    if (child === "对话" && typeof question === "string") {
      const text = question.trim();
      if (!text || text.length > 16000) return;
      if (knowledgeBaseIds !== undefined && (!Array.isArray(knowledgeBaseIds) || !knowledgeBaseIds.length || knowledgeBaseIds.some(id => !knowledgeBases.some(item => item.id === id)))) return;
      cancelGeneration();
      closePicker(false);
      if (knowledgeBaseIds !== undefined) {
        session.beginSelection();
        session.draftIds.clear();
        knowledgeBaseIds.forEach(id => session.select(id, true));
        session.confirmSelection();
      } else session.useGeneral();
      missingHistoryScope = false;
      renderMode();
      field.value = text;
      resizePrompt(); updateSend();
      feedback.textContent = "";
      field.focus();
      form.requestSubmit();
    }
  });
  renderMode(); renderWebSearch(); updateSend();
  saveHistory();
})();
