(() => {
  "use strict";
  const { knowledgeScopes } = window.BaigeData;
  const { escapeHtml } = window.BaigeUI;
  const root = document.querySelector("#knowledgeScopes");
  root.innerHTML = knowledgeScopes.map((scope) => `<button class="category-tab ${scope === "全部" ? "is-active" : ""}" data-knowledge="${escapeHtml(scope)}" aria-pressed="${scope === "全部"}">${escapeHtml(scope)}</button>`).join("");
  root.addEventListener("click", (event) => {
    const button = event.target.closest("[data-knowledge]");
    if (!button) return;
    root.querySelectorAll("button").forEach((item) => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", active);
    });
    document.querySelector("#knowledgeTitle").textContent = button.dataset.knowledge === "全部" ? "全部知识库" : button.dataset.knowledge;
  });
  window.BaigePage.onActivate(() => {});
})();
