(() => {
  "use strict";
  const { navigation, tools, findNavItem } = window.BaigeData;
  const { icon, escapeHtml } = window.BaigeUI;
  const policy = window.BaigePermissions;
  const navRoot = document.querySelector("#navigation");
  const host = document.querySelector("#pageHost");
  const shell = document.querySelector(".app-shell");
  // Collapsible groups start collapsed; a route deep link expands only its own parent.
  const state = { activeId: "home", activeChild: "", expanded: new Set() };
  // Keep each document mounted so its inputs and tool tabs survive menu changes.
  const pages = new Map();
  const discoverableGroups = new Set(["qa", "frontier"]);

  function renderNavigation() {
    const sections = new Set();
    navRoot.innerHTML = navigation.filter((item) => !item.adminOnly && (policy.canOpen(item.id) || discoverableGroups.has(item.id))).map((item) => {
      const active = state.activeId === item.id;
      const expanded = state.expanded.has(item.id);
      // datasets exposes detail routes without showing eight items in the sidebar.
      const hasSubnav = Boolean(item.children?.length) && item.subnav !== false;
      const section = item.id === "home" ? "" : ["qa", "knowledge", "writing", "library", "intel", "analysis"].includes(item.id) ? "知识与研究" : "工具与平台";
      const sectionLabel = sections.has(section) ? "" : section;
      sections.add(section);
      return `${sectionLabel ? `<div class="nav-section-label">${sectionLabel}</div>` : ""}<div class="nav-group">
        <button class="nav-item ${active ? "is-active" : ""}" data-nav="${item.id}" title="${item.label}" ${hasSubnav ? `aria-expanded="${expanded}" aria-controls="sub-${item.id}"` : ""} ${active && (!state.activeChild || !hasSubnav) ? 'aria-current="page"' : ""}>
        ${icon(item.icon)}<span class="nav-label">${item.label}</span>${hasSubnav ? `<span class="nav-chevron ${expanded ? "is-open" : ""}">${icon("chevron")}</span>` : ""}</button>
        ${hasSubnav ? `<div class="subnav" id="sub-${item.id}" ${expanded ? "" : "hidden"}>${item.children.filter((child) => discoverableGroups.has(item.id) || policy.canOpen(item.id, child)).map((child) => {
          const locked = !policy.canOpen(item.id, child);
          return `<button class="subnav-item ${active && state.activeChild === child ? "is-active" : ""}" ${active && state.activeChild === child ? 'aria-current="page"' : ""} data-parent="${item.id}" data-child="${escapeHtml(child)}"><span>${escapeHtml(child)}</span>${locked ? '<span class="subnav-access">需申请</span>' : ""}</button>`;
        }).join("")}</div>` : ""}</div>`;
    }).join("");
  }

  function normalizeRoute(id, child = "") {
    const item = findNavItem(id);
    if (!item) return null;
    const allowed = id === "smart-tools" ? tools.some((tool) => tool.name === child) : item.children?.includes(child);
    return { id, child: typeof child === "string" && allowed ? child : "" };
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

  function activateFrame(page) {
    if (!page.ready) return;
    page.element.contentWindow.postMessage({
      type: "baige:activate", pageId: state.activeId,
      child: state.activeChild, focusSearch: page.focusSearch,
      ...(page.question ? { question: page.question } : {}),
      ...(page.question && page.knowledgeBaseIds.length ? { knowledgeBaseIds: page.knowledgeBaseIds } : {}),
      ...(page.openHomeSettings ? { openHomeSettings: true } : {}),
    }, "*");
    page.focusSearch = false;
    page.question = "";
    page.knowledgeBaseIds = [];
    page.openHomeSettings = false;
  }

  function setPage(id, child = "", { fromHistory = false, focusSearch = false, question = "", knowledgeBaseIds, openHomeSettings = false } = {}) {
    const route = normalizeRoute(id, child);
    if (!route) return;
    if (!policy.canOpen(route.id, route.child)) {
      const name = route.child || findNavItem(route.id).label;
      if (!pages.size) setPage("home");
      else if (fromHistory) {
        const currentHash = `#${state.activeId}${state.activeChild ? `/${encodeURIComponent(state.activeChild)}` : ""}`;
        if (location.hash !== currentHash) window.history.replaceState(null, "", currentHash);
      }
      window.alert(`「${name}」暂未开通。请前往首页的「了解平台功能」申请权限。`);
      return;
    }
    const item = findNavItem(route.id);
    if (item.adminOnly) {
      location.href = "./admin.html#settings";
      return;
    }
    if (item.children && !route.child && item.autoChild !== false) route.child = item.children.find((name) => policy.canOpen(item.id, name)) || "";
    for (const [key, page] of pages) {
      if (key !== route.id && !page.element.hidden) {
        page.question = "";
        page.knowledgeBaseIds = [];
        page.openHomeSettings = false;
        page.element.contentWindow.postMessage({ type: "baige:deactivate", pageId: key }, "*");
        page.element.hidden = true;
      }
    }
    state.activeId = route.id;
    state.activeChild = route.child;
    if (item.children && item.subnav !== false) state.expanded.add(item.id);
    const pageFile = item.files?.[route.child] || item.file;
    let page = pages.get(item.id);
    if (page && page.file !== pageFile) {
      page.element.remove();
      pages.delete(item.id);
      page = null;
    }
    if (!page) {
      const frame = document.createElement("iframe");
      frame.className = "page-frame";
      frame.title = route.child || item.label;
      frame.src = `${pageFile}${route.child ? `#${encodeURIComponent(route.child)}` : ""}`;
      page = { element: frame, file: pageFile, ready: false, focusSearch: false, question: "", knowledgeBaseIds: [], openHomeSettings: false };
      pages.set(item.id, page);
      host.append(frame);
    } else {
      page.element.title = route.child || item.label;
    }
    page.focusSearch ||= focusSearch;
    // Keep the question out of URL/history and discard it after one delivery.
    const sources = validSources(knowledgeBaseIds);
    page.question = sources === null ? "" : validQuestion(route.id, route.child, question);
    page.knowledgeBaseIds = page.question ? sources : [];
    page.openHomeSettings = route.id === "home" && openHomeSettings === true;
    page.element.hidden = false;
    document.title = `${route.child || item.label} · 百舸数智平台`;
    renderNavigation();
    activateFrame(page);
    const hash = `#${route.id}${route.child ? `/${encodeURIComponent(route.child)}` : ""}`;
    if (!fromHistory && location.hash !== hash) location.hash = hash;
  }

  // file:// documents have opaque origins. Accept messages only from the exact
  // child window registered for a known route, and validate every route value.
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") return;
    const page = pages.get(message.pageId);
    if (!page || event.source !== page.element.contentWindow) return;
    if (message.type === "baige:ready") {
      page.ready = true;
      if (message.pageId === state.activeId) activateFrame(page);
    } else if (message.type === "baige:navigate" && message.pageId === state.activeId) {
      setPage(message.id, message.child, { focusSearch: message.focusSearch === true, question: message.question, knowledgeBaseIds: message.knowledgeBaseIds });
    } else if (message.type === "baige:home-settings-closed" && message.pageId === "home" && state.activeId === "home") {
      document.querySelector("#accountTrigger")?.focus({ preventScroll: true });
    }
  });

  document.addEventListener("baige:home-settings", () => setPage("home-settings"));

  navRoot.addEventListener("click", (event) => {
    const child = event.target.closest("[data-child]");
    if (child) {
      const parent = child.dataset.parent;
      const name = child.dataset.child;
      setPage(parent, name);
      const current = [...navRoot.querySelectorAll("[data-child]")].find((node) => node.dataset.parent === parent && node.dataset.child === name);
      current?.focus();
      return;
    }
    const button = event.target.closest("[data-nav]");
    if (!button) return;
    const item = findNavItem(button.dataset.nav);
    const hasSubnav = Boolean(item.children?.length) && item.subnav !== false;
    if (hasSubnav) {
      shell.classList.remove("sidebar-collapsed");
      if (state.expanded.has(item.id)) state.expanded.delete(item.id);
      else state.expanded.add(item.id);
      renderNavigation();
    } else setPage(item.id);
    // renderNavigation replaces the buttons; keep keyboard focus on the same item.
    [...navRoot.querySelectorAll("[data-nav]")].find((node) => node.dataset.nav === item.id)?.focus();
  });
  const collapseButton = document.querySelector("#collapseButton");
  collapseButton.innerHTML = icon("panel");
  collapseButton.addEventListener("click", () => {
    const collapsed = shell.classList.toggle("sidebar-collapsed");
    collapseButton.setAttribute("aria-label", collapsed ? "展开导航" : "收起导航");
    collapseButton.title = collapsed ? "展开导航" : "收起导航";
  });
  document.querySelector(".brand").addEventListener("click", (event) => {
    event.preventDefault(); setPage("home");
  });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault(); setPage("smart-tools", "", { focusSearch: true });
    }
  });
  function readRoute() {
    try {
      const [id, ...parts] = location.hash.slice(1).split("/");
      return normalizeRoute(id, decodeURIComponent(parts.join("/"))) || { id: "home", child: "" };
    } catch { return { id: "home", child: "" }; }
  }
  window.addEventListener("hashchange", () => {
    const route = readRoute();
    if (route.id !== state.activeId || route.child !== state.activeChild) setPage(route.id, route.child, { fromHistory: true });
  });
  const route = readRoute();
  setPage(route.id, route.child, { fromHistory: true });
})();
