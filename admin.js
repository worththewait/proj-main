(() => {
  "use strict";

  const views = {
    files: { src: "pages/library-admin.html?embed=admin&view=files&v=20261028-dept-switcher", title: "文件管理" },
    perm: { src: "pages/library-admin.html?embed=admin&view=perm&v=20261028-dept-switcher", title: "权限管理" },
    settings: { src: "pages/home-settings.html?embed=admin&v=20261028-dept-scope", title: "自定义界面" },
  };
  if (window.BaigeUI) window.BaigeUI.hydrate();
  const nav = document.querySelector("#adminNav");
  const frame = document.querySelector("#adminFrame");
  const buttons = [...nav.querySelectorAll("[data-admin-view]")];
  let current = "";

  function viewFromHash() {
    const value = decodeURIComponent(location.hash.replace(/^#/, ""));
    return Object.hasOwn(views, value) ? value : "files";
  }

  function render(view, updateHistory) {
    const next = Object.hasOwn(views, view) ? view : "files";
    if (!views[next]) return;
    current = next;
    document.title = `${views[next].title} · 后台系统 · 百舸数智平台`;
    frame.title = views[next].title;
    frame.src = views[next].src;
    buttons.forEach((button) => {
      const active = button.dataset.adminView === next;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (updateHistory && location.hash !== `#${next}`) history.pushState(null, "", `#${next}`);
  }

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-view]");
    if (!button) return;
    render(button.dataset.adminView, true);
    button.focus();
  });

  window.addEventListener("hashchange", () => render(viewFromHash(), false));
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object" || message.type !== "baige:navigate") return;
    if (message.id === "home" || message.id === "home-settings") {
      location.href = `./index.html${message.id === "home" ? "#home" : "#home"}`;
    }
  });

  render(viewFromHash(), false);
})();
