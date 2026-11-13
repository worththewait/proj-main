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
    users: { src: "pages/user-admin.html?embed=admin&v=20261113-user-roles", title: "用户管理" },
    roles: { src: "pages/role-admin.html?embed=admin&v=20261113-role-editor", title: "角色管理" },
    "role-approval": { src: "pages/role-approval.html?embed=admin&v=20261113-account-preview", title: "角色授权审核" },
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
  const actorSelect = document.querySelector("#iamActor");
  const iam = window.BaigeIamStore;
  const buttons = [...nav.querySelectorAll("[data-admin-view]")];

  const known = (value) => Object.hasOwn(views, value) || Object.hasOwn(legacyViews, value);

  function viewFromHash() {
    try {
      const value = decodeURIComponent(location.hash.replace(/^#/, ""));
      return known(value) ? value : "files";
    } catch { return "files"; }
  }

  function render(view, updateHistory, requestId = "") {
    const reviewer = iam.actor().kind === "reviewer";
    const next = reviewer ? "role-approval" : known(view) ? view : "files";
    const entry = views[next] || legacyViews[next];
    const navKey = Object.hasOwn(views, next) ? next : "interface";
    actorSelect.value = iam.actor().id;
    document.title = `${entry.title} · 后台系统 · 百舸数智平台`;
    frame.title = entry.title;
    frame.src = next === "role-approval" && requestId ? `${entry.src}&request=${encodeURIComponent(requestId)}` : entry.src;
    buttons.forEach((button) => {
      const active = button.dataset.adminView === navKey;
      button.hidden = reviewer && button.dataset.adminView !== "role-approval";
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    nav.querySelectorAll(".nav-section-label").forEach(label => {
      label.hidden = reviewer && label.textContent.trim() !== "权限";
    });
    if (updateHistory && location.hash !== `#${next}`) history.pushState(null, "", `#${next}`);
  }

  actorSelect.replaceChildren(...iam.actors.map(actor => new Option(actor.name, actor.id)));
  actorSelect.addEventListener("change", () => {
    iam.setActor(actorSelect.value);
    render("role-approval", true);
  });

  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-admin-view]");
    if (!button) return;
    render(button.dataset.adminView, true);
    button.focus();
  });

  window.addEventListener("hashchange", () => render(viewFromHash(), false));
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== frame.contentWindow || !message || typeof message !== "object") return;
    if (message.type === "baige:iam-request" && typeof message.requestId === "string") {
      render("role-approval", true, message.requestId);
      return;
    }
    if (message.type !== "baige:navigate") return;
    if (message.id === "home" || message.id === "home-settings") {
      location.href = `./index.html${message.id === "home" ? "#home" : "#home"}`;
    }
  });

  render(viewFromHash(), false, new URLSearchParams(location.search).get("request") || "");
})();
