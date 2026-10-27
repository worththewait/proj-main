(() => {
  "use strict";
  const pageId = document.body.dataset.page;
  const embedded = window.parent !== window;
  const { findNavItem, tools } = window.BaigeData;
  let activate = () => {};
  const deactivationListeners = new Set();
  let homeSettings = () => {};

  function validChild(id, child) {
    if (typeof child !== "string") return "";
    const allowed = id === "smart-tools" ? tools.some((tool) => tool.name === child) : findNavItem(id)?.children?.includes(child);
    return allowed ? child : "";
  }
  function readChild() {
    try { return validChild(pageId, decodeURIComponent(location.hash.slice(1))); }
    catch { return ""; }
  }
  function validQuestion(id, child, question) {
    if (id !== "qa" || child !== "对话" || typeof question !== "string") return "";
    const text = question.trim();
    return text.length <= 16000 ? text : "";
  }
  function validSources(ids) {
    if (ids === undefined) return [];
    const known = window.BaigeData.knowledgeBases;
    if (!Array.isArray(ids) || !ids.length || ids.length > 32 || ids.some(id => !known.some(item => item.id === id))) return null;
    return [...new Set(ids)];
  }
  function show(child, focusSearch = false, question = "", knowledgeBaseIds, openHomeSettings = false) {
    child = validChild(pageId, child);
    question = validQuestion(pageId, child, question);
    const sources = validSources(knowledgeBaseIds);
    if (sources === null) question = "";
    document.title = `${child || findNavItem(pageId).label} · 百舸数智平台`;
    activate({ child, focusSearch, ...(question ? { question, ...(sources.length ? { knowledgeBaseIds: sources } : {}) } : {}) });
    if (pageId === "home" && openHomeSettings === true) homeSettings();
  }

  function navigate(id, child = "", { focusSearch = false, question = "", knowledgeBaseIds } = {}) {
    if (!findNavItem(id)) return;
    child = validChild(id, child);
    question = validQuestion(id, child, question);
    const sources = validSources(knowledgeBaseIds);
    if (sources === null) question = "";
    // Tool-tab closing needs synchronous activation of its neighbouring tab.
    // Embedded questions are delivered once by the parent after activation.
    if (id === pageId) show(child, focusSearch, embedded ? "" : question, sources?.length ? sources : undefined);
    if (embedded) {
      window.parent.postMessage({ type: "baige:navigate", pageId, id, child, focusSearch, ...(question ? { question, ...(sources.length ? { knowledgeBaseIds: sources } : {}) } : {}) }, "*");
    } else if (id === pageId) {
      const hash = child ? `#${encodeURIComponent(child)}` : "";
      if (location.hash !== hash) location.hash = hash;
    } else {
      location.href = `../index.html#${id}${child ? `/${encodeURIComponent(child)}` : ""}`;
    }
  }

  window.addEventListener("message", (event) => {
    if (!embedded || event.source !== window.parent) return;
    const message = event.data;
    if (!message || message.pageId !== pageId) return;
    if (message.type === "baige:activate") show(message.child, message.focusSearch === true, message.question, message.knowledgeBaseIds, message.openHomeSettings);
    else if (message.type === "baige:deactivate") for (const callback of deactivationListeners) callback();
  });
  window.addEventListener("hashchange", () => { if (!embedded) show(readChild()); });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route], [data-shortcut]");
    if (button) navigate(button.dataset.route || button.dataset.shortcut, button.dataset.child || "");
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); navigate("smart-tools", "", { focusSearch: true });
    }
  });
  window.BaigeUI.hydrate();
  window.BaigePage = Object.freeze({
    pageId, navigate,
    onHomeSettings(callback) { homeSettings = callback; },
    homeSettingsClosed() {
      if (!embedded || pageId !== "home") return false;
      window.parent.postMessage({ type: "baige:home-settings-closed", pageId }, "*");
      return true;
    },
    onDeactivate(callback) { deactivationListeners.add(callback); },
    onActivate(callback) {
      activate = callback;
      show(readChild());
      if (embedded) window.parent.postMessage({ type: "baige:ready", pageId }, "*");
    },
  });
})();
