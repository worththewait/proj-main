(() => {
  "use strict";

  // 五个配置收在一个页面里：本脚本只负责页签与面板可见性，
  // 具体编辑逻辑仍由 home-admin.js 与 feature-admin.js 各自维护。
  const VIEWS = [
    { key: "recommend", tab: "tabRecommendations", panel: "panelRecommendations" },
    { key: "carousel", tab: "tabCarousel", panel: "panelCarousel" },
    { key: "updates", tab: "tabUpdates", panel: "panelUpdates" },
    { key: "features", tab: "featureListTab", panel: "featureListPanel" },
    { key: "categories", tab: "featureCategoryTab", panel: "featureCategoryPanel" },
  ];
  // 旧入口的参数与 hash 继续可用：settings 指向推荐功能，features 指向功能展示。
  const ALIASES = { recommend: "recommend", recommendations: "recommend", settings: "recommend", carousel: "carousel", updates: "updates", features: "features", categories: "categories" };

  const tabsRoot = document.querySelector("#ifaceTabs");
  const tabs = [...tabsRoot.querySelectorAll("[data-view]")];
  const viewByKey = new Map(VIEWS.map((view) => [view.key, view]));
  let current = "";

  function initialKey() {
    const hash = decodeURIComponent(location.hash.slice(1)).trim();
    const param = new URLSearchParams(location.search).get("view");
    const candidate = viewByKey.has(hash) ? hash : ALIASES[param] || ALIASES[hash] || "";
    return viewByKey.has(candidate) ? candidate : "recommend";
  }

  function counts() {
    const home = window.BaigeHomeConfig?.read?.();
    const feature = window.BaigeFeatureConfig;
    const settings = feature ? feature.read() : null;
    return {
      recommend: home?.recommendedIds?.length ?? 0,
      carousel: home?.slides?.length ?? 0,
      updates: home?.updates?.length ?? 0,
      features: feature ? feature.catalog().length : 0,
      categories: settings ? settings.categories.home.length + settings.categories.tools.length : 0,
    };
  }

  function renderCounts() {
    const values = counts();
    tabsRoot.querySelectorAll("[data-count]").forEach((node) => {
      const value = values[node.dataset.count];
      node.textContent = String(Number.isFinite(value) ? value : 0);
    });
  }

  function show(key, { focus = false, writeHash = true } = {}) {
    const view = viewByKey.get(key) || viewByKey.get("recommend");
    // 先让原脚本按自己的分组完成渲染与显隐，再把其余面板统一收起。
    document.getElementById(view.tab)?.click();
    for (const entry of VIEWS) {
      const panel = document.getElementById(entry.panel);
      if (panel) panel.hidden = entry.key !== view.key;
    }
    tabs.forEach((tab) => {
      const active = tab.dataset.view === view.key;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    });
    current = view.key;
    renderCounts();
    if (writeHash && location.hash.slice(1) !== view.key) {
      try { history.replaceState(null, "", `#${view.key}`); } catch { location.hash = view.key; }
    }
  }

  tabsRoot.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-view]");
    if (tab) show(tab.dataset.view, { focus: event.detail === 0 });
  });
  tabsRoot.addEventListener("keydown", (event) => {
    if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.findIndex((tab) => tab.dataset.view === current);
    const next = event.key === "Home" ? 0
      : event.key === "End" ? tabs.length - 1
        : event.key === "ArrowRight" ? (index + 1) % tabs.length
          : (index - 1 + tabs.length) % tabs.length;
    show(tabs[next].dataset.view, { focus: true });
  });

  // 徽标跟着内容走：功能与分类配置会主动广播，推荐/轮播/动态在保存动作后补一次刷新。
  window.BaigeFeatureConfig?.subscribe?.(renderCounts);
  window.addEventListener("storage", renderCounts);
  document.addEventListener("click", (event) => {
    const saved = event.target.closest("#saveRecommendations, #saveCarousel, #publishUpdate, #confirmDeleteUpdate, [data-publish-update], [data-unpublish-update], [data-delete-update]");
    if (saved) setTimeout(renderCounts, 0);
  });
  window.BaigePage?.onActivate?.(renderCounts);

  show(initialKey());
})();
