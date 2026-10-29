(() => {
  "use strict";
  const { knowledgeBases } = window.BaigeData;
  const { icon, escapeHtml } = window.BaigeUI;
  const session = new window.BaigeQuestionSession(knowledgeBases);
  const form = document.querySelector("#conversationForm");
  const messages = document.querySelector("#conversationMessages");
  const scroll = document.querySelector("#contentScroll");
  const conversation = document.querySelector("#conversationView");
  const historyKey = "baige.qa.history.v1";
  let conversations = [];
  try { const saved = JSON.parse(window.localStorage.getItem(historyKey)); if (Array.isArray(saved)) conversations = saved.filter(item => item && typeof item.id === "string" && Array.isArray(item.messages)); } catch {}
  let current = null;
  let chat = [];
  const historyPanel = document.querySelector("#historyPanel");
  const referencesPanel = document.querySelector("#referencesPanel");
  const historyToggle = document.querySelector("#historyToggle");
  const referencesToggle = document.querySelector("#referencesToggle");
  function setPanel(panel, toggle, open) { panel.hidden = !open; toggle.setAttribute("aria-expanded", String(open)); }
  function saveHistory() {
    try { window.localStorage.setItem(historyKey, JSON.stringify(conversations.map(item => ({...item, messages:item.messages.map(message => message.pending ? {...message, text:demoReply, pending:false} : message)})))); } catch {}
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
  setPanel(historyPanel, historyToggle, false);
  setPanel(referencesPanel, referencesToggle, false);
  document.querySelector("#historySearch").addEventListener("input", saveHistory);
  historyToggle.addEventListener("click", () => setPanel(historyPanel, historyToggle, historyPanel.hidden));
  referencesToggle.addEventListener("click", () => setPanel(referencesPanel, referencesToggle, referencesPanel.hidden));
  document.querySelector("#historyExample").addEventListener("click", () => { document.querySelector("#showCitationExample").click(); setPanel(historyPanel, historyToggle, false); });
  document.querySelector("#historyClose").addEventListener("click", () => setPanel(historyPanel, historyToggle, false));
  document.querySelector("#referencesClose").addEventListener("click", () => { referencesPanel.classList.remove("is-expanded"); setPanel(referencesPanel, referencesToggle, false); });
  document.querySelector("#newConversation").addEventListener("click", () => {
    current = null; chat = []; conversation.classList.remove("is-chatting"); messages.innerHTML = "";
    setPanel(historyPanel, historyToggle, false); setPanel(referencesPanel, referencesToggle, false); field.value = ""; send.disabled = true; field.focus();
  });
  document.querySelector("#historyList").addEventListener("click", event => {
    const button = event.target.closest("[data-history-id]");
    const selected = button && conversations.find(item => item.id === button.dataset.historyId);
    if (!selected) return;
    current = selected; chat = selected.messages; conversation.classList.add("is-chatting"); renderChat();
    setPanel(historyPanel, historyToggle, false);
  });
  const demoReply = "这是一条演示回复。感谢你的提问，实际智能问答能力正在接入中。";
  function renderChat() {
    messages.innerHTML = chat.map(item => `<div class="qa-chat-message qa-chat-${item.role}"><span class="qa-chat-label">${item.role === "user" ? "我" : "百舸问答"}</span><p>${escapeHtml(item.text)}</p>${item.attachments?.length ? `<small>${escapeHtml(item.attachments.join("、"))}</small>` : ""}</div>`).join("");
    scroll.scrollTop = scroll.scrollHeight;
  }
  function typeReply(item) {
    const chars = Array.from(demoReply);
    let position = 0;
    function step() {
      item.text += chars[position++];
      if (chat.includes(item)) renderChat();
      if (position === chars.length) { item.pending = false; saveHistory(); }
      if (position < chars.length) window.setTimeout(step, 35);
    }
    window.setTimeout(step, 35);
  }
  const field = document.querySelector("#homePrompt");
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
    field.value = suggestions[suggestionIndex][Number(button.dataset.suggestion)]; send.disabled = false; field.focus();
  });
  let sourceDoc = 0, sourcePage = 2, sourceZoom = 100;
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
    conversation.classList.add("is-chatting");
    current = null; chat = [{role:"user", text:"如何比较两种技术方案，并保留判断依据？"}];
    renderChat();
    messages.innerHTML += `<div class="qa-example-answer"><div class="qa-example-author">${icon("chat")}<strong>百舸</strong><small>示例回答</small></div><h3>先对齐目标，再比较差异</h3><p>先统一使用场景、任务目标与必要约束，再把两种方案放到相同的评价维度中。这样整理出的差异才便于核对。 <button type="button" class="qa-citation-number" data-example-citation="0">1</button></p><h3>让结论可以回到资料中核查</h3><p>为关键判断保留资料来源、页码和对应段落，把资料事实、分析判断和待确认事项分开记录。 <button type="button" class="qa-citation-number" data-example-citation="1">2</button></p><div class="qa-citation-heading"><strong>参考资料 2</strong><small>点击核对原文</small></div><div class="qa-citation-list"><button type="button" class="qa-citation-card" data-example-citation="0"><strong>技术方案评价指南</strong><small>船舶行业资料 · 第 2 页</small></button><button type="button" class="qa-citation-card" data-example-citation="1"><strong>研究资料核对清单</strong><small>标准规范资料 · 第 1 页</small></button></div></div>`;
  });
  messages.addEventListener("click", event => {
    const citation = event.target.closest("[data-example-citation]");
    if (!citation) return;
    sourceDoc = Number(citation.dataset?.exampleCitation) === 1 ? 1 : 0; sourcePage = sourceDoc === 0 ? 2 : 1; renderSource(); setPanel(historyPanel, historyToggle, false); setPanel(referencesPanel, referencesToggle, true);
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") { if (referencesPanel.classList.contains("is-expanded")) referencesPanel.classList.remove("is-expanded"); else { setPanel(historyPanel, historyToggle, false); setPanel(referencesPanel, referencesToggle, false); } } });
  renderSuggestions();

  const feedback = document.querySelector("#conversationFeedback");
  const send = document.querySelector("#sendQuestion");
  const webSearchMode = document.querySelector("#webSearchMode");
  let webSearch = false;
  webSearchMode.addEventListener("click", () => {
    webSearch = !webSearch;
    webSearchMode.classList.toggle("is-active", webSearch);
    webSearchMode.setAttribute("aria-pressed", String(webSearch));
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
    document.querySelector("#knowledgeModeLabel").textContent = knowledge ? `知识问答 · ${session.selected.length}` : "知识问答";
    sources.hidden = !knowledge;
    const selected = session.selected;
    document.querySelector("#selectedSourceTags").innerHTML = selected.slice(0, 3).map(item => `<span class="qa-source-tag" title="${escapeHtml(item.name)}">${icon("book")}<span>${escapeHtml(item.name)}</span></span>`).join("") +
      (selected.length > 3 ? `<span class="qa-source-more" title="${escapeHtml(selected.slice(3).map(item => item.name).join("、"))}">另 ${selected.length - 3} 个</span>` : "");
    field.placeholder = knowledge ? "围绕已选知识库提问，Enter 发送，Shift + Enter 换行" : "请输入你的问题，Enter 发送，Shift + Enter 换行";
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
    feedback.textContent = "";
    renderMode();
    restorePickerFocus = false;
    picker.close();
    field.focus();
  });
  let attachmentNames = [];
  const attachmentInput = document.querySelector("#attachmentInput");
  const attachmentRoot = document.querySelector("#conversationAttachments");
  document.querySelector("#addAttachment").addEventListener("click", () => attachmentInput.click());
  attachmentInput.addEventListener("change", () => {
    attachmentNames = Array.from(attachmentInput.files || [], file => file.name);
    attachmentRoot.hidden = !attachmentNames.length;
    attachmentRoot.innerHTML = attachmentNames.map(name => `<span>${escapeHtml(name)}</span>`).join("");
    feedback.textContent = "仅显示文件名，演示中不会上传文件。";
  });
  field.addEventListener("input", () => {
    send.disabled = !field.value.trim();
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
    const request = session.prepareQuestion(field.value);
    if (request.status === "empty") {
      feedback.textContent = "请先输入问题或任务描述。";
      return field.focus();
    }
    if (request.status === "knowledge-required") return openPicker(knowledgeMode);
    conversation.classList.add("is-chatting");
    if (!current) { current = {id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, title: request.question.slice(0, 40), mode:request.mode, createdAt:Date.now(), messages: chat}; conversations.unshift(current); }
    current.updatedAt = Date.now();
    chat.push({role: "user", text: request.question, attachments: [...attachmentNames]});
    attachmentNames = []; attachmentInput.value = ""; attachmentRoot.innerHTML = ""; attachmentRoot.hidden = true;
    const reply = {role: "assistant", text: "", pending:true};
    chat.push(reply);
    renderChat();
    typeReply(reply);
    saveHistory();
    field.value = "";
    send.disabled = true;
    feedback.textContent = "";
    field.focus();

  });
  window.BaigePage.onDeactivate(() => closePicker(false));
  window.BaigePage.onActivate(({ child, question, knowledgeBaseIds }) => {
    const conversation = document.querySelector("#conversationView");
    const pending = document.querySelector("#qaPending");
    if (child === "智能问数") closePicker(false);
    conversation.hidden = child === "智能问数";
    pending.hidden = !conversation.hidden;
    if (child === "对话" && typeof question === "string") {
      const text = question.trim();
      if (!text || text.length > 16000) return;
      closePicker(false);
      if (knowledgeBaseIds !== undefined) {
        if (!Array.isArray(knowledgeBaseIds) || !knowledgeBaseIds.length || knowledgeBaseIds.some(id => !knowledgeBases.some(item => item.id === id))) return;
        session.beginSelection();
        session.draftIds.clear();
        knowledgeBaseIds.forEach(id => session.select(id, true));
        session.confirmSelection();
      } else session.useGeneral();
      renderMode();
      field.value = text;
      send.disabled = false;
      feedback.textContent = "";
      field.focus();
      form.requestSubmit();
    }
  });
  renderMode();
  saveHistory();
})();
