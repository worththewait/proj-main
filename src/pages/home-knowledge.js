(() => {
  "use strict";
  const { knowledgeBases } = window.BaigeData;
  const { icon, escapeHtml } = window.BaigeUI;
  const session = new window.BaigeQuestionSession(knowledgeBases);
  const general = document.querySelector("#quickGeneralMode");
  const knowledge = document.querySelector("#quickKnowledgeMode");
  const picker = document.querySelector("#quickKnowledgePicker");
  const scopes = document.querySelector("#quickKnowledgeScopes");
  const search = document.querySelector("#quickKnowledgeSearch");
  const results = document.querySelector("#quickKnowledgeResults");
  const count = document.querySelector("#quickKnowledgeCount");
  const confirm = document.querySelector("#quickKnowledgeConfirm");
  const field = document.querySelector("#quickQuestion");
  let generalPrompt = field.placeholder || "输入您的问题，百舸为您解答";
  const sourceRow = document.querySelector("#quickSelectedSources");
  let scope = "行业";
  let trigger = knowledge;
  let restorePickerFocus = true;
  function renderMode() {
    const active = session.mode === "knowledge";
    general.classList.toggle("is-active", !active);
    general.setAttribute("aria-pressed", String(!active));
    knowledge.classList.toggle("is-active", active);
    knowledge.setAttribute("aria-pressed", String(active));
    document.querySelector("#quickKnowledgeLabel").textContent = active ? `知识库问答 · ${session.selected.length}` : "知识库问答";
    sourceRow.hidden = !active;
    document.querySelector("#quickSelectedTags").innerHTML = session.selected.map(item => `<span class="qa-source-tag">${icon("book")}<span>${escapeHtml(item.name)}</span></span>`).join("");
    field.placeholder = active ? "围绕已选知识库提问，发送后进入知识库问答…" : generalPrompt;
  }
  function renderCount() {
    count.textContent = `已选 ${session.draftIds.size} 个知识库`;
    confirm.disabled = !session.draftIds.size;
  }
  function renderPicker() {
    scopes.innerHTML = ["行业", "企业", "部门"].map(name => `<button class="category-tab${name === scope ? " is-active" : ""}" type="button" data-quick-scope="${name}" aria-pressed="${name === scope}">${name}</button>`).join("");
    const entries = session.findKnowledge(scope, search.value);
    results.innerHTML = entries.length ? `<h3>${scope}知识库</h3><div class="qa-knowledge-list">${entries.map(item => `<label class="qa-knowledge-option"><input type="checkbox" value="${escapeHtml(item.id)}"${session.draftIds.has(item.id) ? " checked" : ""}>${icon("folder")}<span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.description)}</small></span></label>`).join("")}</div>` : '<div class="qa-picker-empty"><h3>没有找到匹配的知识库</h3><p>试试其他名称，或切换知识库分类。</p></div>';
    results.scrollTop = 0;
    renderCount();
  }
  function openPicker(element) {
    if (picker.open) return;
    trigger = element;
    restorePickerFocus = true;
    session.beginSelection();
    scope = session.selected[0]?.scope || "行业";
    search.value = "";
    renderPicker();
    knowledge.setAttribute("aria-expanded", "true");
    picker.showModal();
    search.focus();
  }
  function closePicker() {
    session.cancelSelection();
    picker.close();
  }
  knowledge.addEventListener("click", () => openPicker(knowledge));
  document.querySelector("#quickChangeKnowledge").addEventListener("click", event => openPicker(event.currentTarget));
  general.addEventListener("click", () => { session.useGeneral(); renderMode(); field.focus(); });
  document.querySelector("#quickKnowledgeClose").addEventListener("click", closePicker);
  document.querySelector("#quickKnowledgeCancel").addEventListener("click", closePicker);
  picker.addEventListener("cancel", () => session.cancelSelection());
  picker.addEventListener("close", () => {
    if (picker.open) return;
    knowledge.setAttribute("aria-expanded", "false");
    if (restorePickerFocus && trigger.isConnected) trigger.focus({ preventScroll: true });
  });
  scopes.addEventListener("click", event => {
    const button = event.target.closest("[data-quick-scope]");
    if (!button) return;
    scope = button.dataset.quickScope;
    renderPicker();
    [...scopes.querySelectorAll("button")].find(item => item.dataset.quickScope === scope)?.focus({ preventScroll: true });
  });
  search.addEventListener("input", renderPicker);
  results.addEventListener("change", event => {
    if (!event.target.matches('input[type="checkbox"]')) return;
    session.select(event.target.value, event.target.checked);
    renderCount();
  });
  confirm.addEventListener("click", () => {
    if (!session.confirmSelection()) return;
    renderMode();
    restorePickerFocus = false;
    picker.close();
    field.focus();
  });
  window.BaigeHomeKnowledge = Object.freeze({
    setPrompt(value) { generalPrompt = value; renderMode(); },
    getQuestionOptions() { return session.mode === "knowledge" ? { knowledgeBaseIds: session.selected.map(item => item.id) } : {}; },
    dismiss() { if (picker.open) { restorePickerFocus = false; closePicker(); } },
  });
  renderMode();
})();
