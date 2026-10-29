(() => {
  "use strict";

  const { navigation, tools, knowledgeScopes } = window.BaigeData;
  const { icon, escapeHtml } = window.BaigeUI;
  const page = window.BaigePage;
  const access = window.BaigeHomeAccess;
  const groupSwitch = document.querySelector("#featureGroups");
  const results = document.querySelector("#featureResults");
  const commonFunctions = document.querySelector("#commonFunctions");
  const search = document.querySelector("#featureSearch");
  const clearSearch = document.querySelector("#featureClear");
  const availableOnly = document.querySelector("#availableOnly");
  const searchSummary = document.querySelector("#featureSearchSummary");

  // Display copy belongs to the homepage; route and child names come from data.js.
  const profiles = {
    qa: { summary: "围绕问题展开对话，探索信息与数据。", tone: "blue" },
    knowledge: { summary: "把常用知识汇集到一个入口。", tone: "purple" },
    writing: { summary: "从主题与框架出发，组织专业表达。", tone: "purple" },
    library: { summary: "集中查阅文库资源，积累专业资料。", tone: "blue" },
    intel: { summary: "关注研究领域与行业信息。", tone: "teal" },
    analysis: { summary: "让资料分析有清晰的工作入口。", tone: "teal" },
    "smart-tools": { summary: "翻译、识别、写作与研究辅助工具。", tone: "blue" },
    frontier: { summary: "探索前沿工具与研究服务。", tone: "teal" },
    digital: { summary: "查看数智系统相关入口。", tone: "teal" },
    datasets: { summary: "船海全链条八大数据集，可直接查阅。", tone: "teal" },
    platform: { summary: "面向智能能力的开发与管理。", tone: "blue" },
    "data-platform": { summary: "汇集数据标注、采集与管理入口。", tone: "blue" },
  };
  const childProfiles = {
    qa: {
      "对话": { description: "围绕问题展开交流，辅助梳理资料与思路。", icon: "chat" },
      "智能问数": { description: "通过自然语言，提出业务数据问题。", icon: "chart" },
    },
    library: {
      "文库首页": { description: "浏览文库分类、检索文档并进入阅读器。", icon: "book" },
    },
    frontier: {
      "全球鹰": { description: "关注全球动态与行业信息的服务入口。", icon: "globe" },
      "智研通": { description: "面向专业研究的信息与服务入口。", icon: "compass" },
    },
    "data-platform": {
      "数据标注平台": { description: "面向数据标注任务的工作入口。", icon: "tag" },
      "爬虫平台": { description: "面向数据采集任务的工作入口。", icon: "bug" },
      "数据中台": { description: "集中管理与使用数据的工作入口。", icon: "server" },
    },
    digital: {
      "标准编制": { description: "辅助整理标准结构、编制内容与条款。", icon: "standard" },
      "专利编制": { description: "辅助梳理专利技术方案与申请材料，形成编制思路。", icon: "file" },
    },
  };
  const groups = [
    { id: "knowledge-research", label: "知识与研究", description: "问答、知识与专业研究", ids: ["qa", "knowledge", "writing", "library", "intel", "analysis"] },
    { id: "tools-platforms", label: "工具与平台", description: "资料处理与专业平台", ids: ["smart-tools", "frontier", "digital", "datasets", "platform", "data-platform"] },
  ];
  const toolTone = { "文档处理": "blue", "写作创作": "purple", "研究辅助": "teal" };

  // Flatten only navigational children. Dataset resources remain one destination.
  const entries = groups.flatMap((group) => group.ids.flatMap((route) => {
    const item = navigation.find((entry) => entry.id === route);
    const profile = profiles[route];
    const base = { route, group: group.id, tone: profile.tone, parent: item.label };
    if (route === "smart-tools") return tools.map((tool) => ({
      ...base, child: tool.name, name: tool.name, description: tool.description,
      icon: tool.name === "提示词生成" ? "bulb" : tool.icon, tone: toolTone[tool.group],
      keywords: [item.label, tool.group].join(" "),
    }));
    if (item.children?.length && item.subnav !== false) return item.children.map((name) => ({
      ...base, child: name, name, ...childProfiles[route][name],
      keywords: item.label,
    }));
    return [{ ...base, child: "", name: item.label, description: profile.summary, icon: item.icon,
      keywords: [...(route === "knowledge" ? knowledgeScopes : []), ...(item.children || [])].join(" ") }];
  }));
  let selectedGroup = "all";
  let beforeSearch = null;

  const actionLabel = (entry) => ({ granted: "进入功能", locked: "申请权限", pending: "查看申请" })[access.status(entry.route, entry.child)];
  function statusMarkup(entry) {
    const status = access.status(entry.route, entry.child);
    return status === "granted" ? "" : `<span class="home-access-tag${status === "pending" ? " is-pending" : ""}">${status === "pending" ? "待审批" : "需申请"}</span>`;
  }
  function renderEntry(entry) {
    const action = actionLabel(entry);
    const graphic = window.BaigeDirectoryIcons?.icon(entry.icon) || icon(entry.icon);
    return `<button class="home-directory-item" type="button" data-home-route="${escapeHtml(entry.route)}" data-home-child="${escapeHtml(entry.child)}" data-tone="${entry.tone}" aria-label="${escapeHtml(entry.name)}，${action}">
      <span class="home-directory-icon">${graphic}</span>
      <span class="home-directory-copy">
        <span class="home-directory-name"><strong>${escapeHtml(entry.name)}</strong>${statusMarkup(entry)}</span>
        <span class="home-directory-description" title="${escapeHtml(entry.description)}">${escapeHtml(entry.description)}</span>
        <span class="home-directory-action" aria-hidden="true">${action}${icon("arrow")}</span>
      </span>
    </button>`;
  }
  function renderDirectory(focusGroup = null) {
    const query = search.value.trim().toLowerCase();
    const active = query ? "all" : selectedGroup;
    clearSearch.hidden = !search.value;
    groupSwitch.innerHTML = [{ id: "all", label: "全部功能" }, ...groups].map((group) => `<button class="home-group-button" type="button" data-feature-group="${group.id}" aria-pressed="${group.id === active}">${escapeHtml(group.label)}</button>`).join("");
    const visible = entries.filter((entry) =>
      (active === "all" || entry.group === active) &&
      (!availableOnly.checked || access.canOpen(entry.route, entry.child)) &&
      (!query || [entry.name, entry.description, entry.keywords].join(" ").toLowerCase().includes(query)));
    results.innerHTML = groups.map((group) => {
      const items = visible.filter((entry) => entry.group === group.id);
      if (!items.length) return "";
      return `<section class="home-function-group" aria-labelledby="${group.id}Title">
        <div class="home-category-heading"><h3 id="${group.id}Title">${escapeHtml(group.label)}</h3><span>${group.description}</span></div>
        <div class="home-directory-grid">${items.map(renderEntry).join("")}</div>
      </section>`;
    }).join("");
    searchSummary.textContent = query ? `找到 ${visible.length} 项功能` : availableOnly.checked ? `当前显示 ${visible.length} 项已开通功能` : "";
    if (!visible.length) results.innerHTML = `<div class="home-feature-empty">${icon("search")}<h3>没有找到匹配的功能</h3><p>试试“翻译”“写作”等关键词，或重置筛选条件。</p><button type="button" data-reset-directory>重置筛选</button></div>`;
    if (focusGroup) [...groupSwitch.querySelectorAll("button")].find((button) => button.dataset.featureGroup === focusGroup)?.focus({ preventScroll: true });
  }
  function updateSearch() {
    const hasQuery = Boolean(search.value.trim());
    if (hasQuery && beforeSearch === null) beforeSearch = selectedGroup;
    else if (!hasQuery && beforeSearch !== null) { selectedGroup = beforeSearch; beforeSearch = null; }
    renderDirectory();
  }
  function clearQuery() {
    search.value = "";
    updateSearch();
    search.focus({ preventScroll: true });
  }
  groupSwitch.addEventListener("click", (event) => {
    const button = event.target.closest("[data-feature-group]");
    if (!button) return;
    selectedGroup = button.dataset.featureGroup;
    search.value = "";
    beforeSearch = null;
    renderDirectory(selectedGroup);
  });
  search.addEventListener("input", updateSearch);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && search.value) { event.preventDefault(); clearQuery(); }
  });
  clearSearch.addEventListener("click", clearQuery);
  availableOnly.addEventListener("change", () => renderDirectory());
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-home-route]");
    // This handler also owns the existing common shortcuts. Other page controls
    // cannot dispatch navigation merely by carrying a route attribute.
    if (button && ((results.contains(button) && button.matches(".home-directory-item")) ||
        (commonFunctions?.contains(button) && button.matches(".home-common-card")))) {
      access.navigate(button.dataset.homeRoute, button.dataset.homeChild || "", button);
      return;
    }
    const reset = event.target.closest("[data-reset-directory]");
    if (reset && results.contains(reset)) {
      search.value = ""; selectedGroup = "all"; beforeSearch = null; availableOnly.checked = false;
      renderDirectory();
      search.focus({ preventScroll: true });
    }
  });
  // BaigeHomeAccess resolves a detached trigger to the new route+child button
  // after this redraw, keeping permission-dialog focus restoration intact.
  access.onChange(() => renderDirectory());
  renderDirectory();
  page.onDeactivate(() => access.deactivate());
  page.onActivate(() => {
    window.BaigeHomeDashboard?.refresh();
    window.BaigeHomeUpdates?.refresh();
    window.BaigeHomeCarousel?.activate();
  });
})();
