(() => {
  "use strict";
  const { knowledgeBases } = window.BaigeData;
  const { icon, escapeHtml } = window.BaigeUI;
  const session = new window.BaigeQuestionSession(knowledgeBases);
  const form = document.querySelector("#conversationForm");
  const field = document.querySelector("#homePrompt");
  const feedback = document.querySelector("#conversationFeedback");
  const send = document.querySelector("#sendQuestion");
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
    feedback.textContent = request.mode === "knowledge" ?
      `已选择 ${request.knowledgeBaseNames.join("、")}。知识问答能力正在集成，暂未发送内容。` :
      "通用问答能力正在集成，暂未发送内容。";
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
})();
