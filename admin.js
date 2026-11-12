(() => {
  "use strict";

  const INTERFACE_SRC = "pages/interface-admin.html?embed=admin&v=20261109-diagram-tools";
  const views = {
    files: { src: "pages/library-admin.html?embed=admin&view=files&v=20261109-library-original", title: "文件管理" },
    perm: { src: "pages/library-admin.html?embed=admin&view=perm&v=20261109-library-original", title: "权限管理" },
    notices: { src: "pages/notice-admin.html?embed=admin&v=20261029-notice", title: "通知公告" },
    "portal-news": { src: "pages/portal-news-admin.html?embed=admin&v=20261111-news-admin", title: "动态发布" },
    consult: { src: "pages/consult-admin.html?embed=admin&v=20261111-consult", title: "留言咨询" },
    interface: { src: INTERFACE_SRC, title: "界面管理" },
    access: { src: "pages/permission-review.html?embed=admin&v=20261104-no-stats", title: "权限审核" },
  };
  // 旧的 #features / #settings 仍可用，落到界面管理的对应页签。
  const legacyViews = {
    features: { src: `${INTERFACE_SRC}&view=features`, title: "界面管理" },
    settings: { src: `${INTERFACE_SRC}&view=settings`, title: "界面管理" },
  };
  if (window.BaigeUI) window.BaigeUI.hydrate();
  const nav = document.querySelector("#adminNav");
  const frame = document.querySelector("#adminFrame");
  const buttons = [...nav.querySelectorAll("[data-admin-view]")];
  let current = "";

  const known = (value) => Object.hasOwn(views, value) || Object.hasOwn(legacyViews, value);

  function viewFromHash() {
    const value = decodeURIComponent(location.hash.replace(/^#/, ""));
    return known(value) ? value : "files";
  }

  function render(view, updateHistory) {
    const next = known(view) ? view : "files";
    const entry = views[next] || legacyViews[next];
    const navKey = Object.hasOwn(views, next) ? next : "interface";
    if (!entry) return;
    current = next;
    document.title = `${entry.title} · 后台系统 · 百舸数智平台`;
    frame.title = entry.title;
    frame.src = entry.src;
    buttons.forEach((button) => {
      const active = button.dataset.adminView === navKey;
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
