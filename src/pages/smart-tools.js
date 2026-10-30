(() => {
  "use strict";
  const baseTools = window.BaigeData.tools;
  const tools = baseTools.map(tool=>({...tool}));
  const featureConfig=window.BaigeFeatureConfig;
  const { icon, escapeHtml, hydrate } = window.BaigeUI;
  const bridge = window.BaigePage;
  const content = document.querySelector("#content");
  const state = { category: "all", query: "" };
  let categories=[];
  function readFeatures() {
    const settings=featureConfig?.read();
    categories=settings?.categories.tools || [...new Set(baseTools.map(tool=>tool.group))].map(label=>({id:label,label}));
    const categoryById=new Map(categories.map(item=>[item.id,item.label]));
    tools.forEach((tool,index)=>{
      const managed=featureConfig?.get(`tool:${tool.name}`,settings);
      Object.assign(tool,baseTools[index]);
      tool.feature=managed;
      tool.categoryId=managed?.toolCategory || tool.group;
      tool.group=categoryById.get(tool.categoryId)||tool.group;
      tool.icon=managed?.icon || tool.icon;
    });
    if (state.category!=="all" && !categories.some(item=>item.id===state.category)) state.category="all";
  }
  function toolIcon(tool) {
    return tool.feature ? featureConfig.iconMarkup(tool.feature) : window.BaigeDirectoryIcons.icon(tool.icon);
  }
  readFeatures();
  let activeChild = null;
  const toolWorkspace = new window.BaigeToolWorkspace({
    host: content,
    bar: document.querySelector("#toolWorkspaceBar"),
    scroller: document.querySelector("#contentScroll"),
    tools, icon, escapeHtml, renderCatalog: renderTools, renderTool: renderToolPage,
    iconForTool:name=>{const tool=tools.find(item=>item.name===name);return tool?toolIcon(tool):icon('grid');},
    onNavigate: (name) => bridge.navigate("smart-tools", name),
  });

  function renderTools(root) {
    root.replaceChildren(document.querySelector("#catalogTemplate").content.cloneNode(true));
    const search = root.querySelector("#toolSearch");
    search.value = state.query;
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderToolResults(root);
    });
    updateCatalog(root);
    hydrate(root);
  }

  function updateCatalog(root) {
    root.querySelector("#toolCategories").innerHTML = [{id:'all',label:'全部工具'},...categories].map(({id,label}) => `<button data-category="${escapeHtml(id)}" aria-pressed="${state.category === id}" class="category-tab ${state.category === id ? "is-active" : ""}">${escapeHtml(label)}</button>`).join("");
    root.querySelector("#totalTools").textContent = `${tools.length} 个工具`;
    root.querySelectorAll(".featured-tool").forEach((button) => {
      const tool = tools.find((tool) => tool.name === button.dataset.tool);
      button.dataset.toolGroup = tool?.group || "";
      button.querySelector("[data-featured-description]").textContent = tool?.description || "";
      if (tool?.feature?.image) {
        const source=tool.feature.image;
        button.querySelector('.featured-art img').setAttribute('src',source.startsWith('data:')?source:`../${source}`);
      }
    });
    renderToolResults(root);
  }

  function renderToolResults(catalog = toolWorkspace.catalog) {
    const query = state.query.trim().toLowerCase();
    const matches = tools.filter((tool) => (state.category === "all" || tool.categoryId === state.category)
      && `${tool.name} ${tool.description}`.toLowerCase().includes(query));
    const root = catalog.querySelector("#toolResults");
    root.innerHTML = matches.length ? [...new Set(matches.map((tool) => tool.group))].map((group, index) => {
      const groupedTools = matches.filter((tool) => tool.group === group);
      return `<section class="tool-group" data-tool-group="${escapeHtml(group)}" aria-labelledby="toolGroup${index}">
        <h2 id="toolGroup${index}">${escapeHtml(group)}</h2>
        <div class="tool-list">${groupedTools.map((tool) => `
          <button class="tool-entry" data-tool="${escapeHtml(tool.name)}" data-tool-group="${escapeHtml(tool.group)}">
            <span class="tool-icon">${toolIcon(tool)}</span>
            <span class="tool-entry-copy"><span class="tool-name">${escapeHtml(tool.name)}</span>
            <span class="tool-description">${escapeHtml(tool.description)}</span></span>
          </button>`).join("")}</div>
      </section>`;
    }).join("") : `<div class="search-empty">${icon("search")}<h2>没有找到匹配的工具</h2>
      <p>试试“翻译”“文档”或“写作”，也可以清除筛选。</p>
      <button class="secondary-button" data-reset-tools>清除筛选</button></div>`;
    catalog.querySelector("#resultCount").textContent = `显示 ${matches.length} 个工具，共 ${tools.length} 个`;
  }

  function renderToolPage(tool, root) {
    root.dataset.toolGroup = tool.group;
    root.replaceChildren(document.querySelector("#toolTemplate").content.cloneNode(true));
    root.querySelector("[data-tool-name]").textContent = tool.name;
    root.querySelector("[data-tool-description]").textContent = tool.description;
    updateDetail(tool,root);
    hydrate(root);
    // Add tool-specific components here. After saving a form, call
    // toolWorkspace.setDirty(tool.name, false) to clear its close confirmation.
  }

  function updateDetail(tool,root) {
    root.dataset.toolGroup=tool.group;
    root.querySelectorAll('[data-detail-icon]').forEach(node=>{node.innerHTML=toolIcon(tool);});
  }

  function refreshConfiguration() {
    readFeatures();
    if (toolWorkspace.catalog) updateCatalog(toolWorkspace.catalog);
    for (const [key,page] of toolWorkspace.pages) {
      if (key) updateDetail(tools.find(tool=>tool.name===key),page.panel);
    }
    if (toolWorkspace.pages.size && !toolWorkspace.bar.hidden) toolWorkspace.renderTabs();
  }

  content.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.tool) {
      toolWorkspace.rememberFocus(button);
      bridge.navigate("smart-tools", button.dataset.tool);
    } else if (button.dataset.category) {
      state.category = button.dataset.category;
      content.querySelectorAll("[data-category]").forEach((tab) => {
        const active = tab.dataset.category === state.category;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-pressed", active);
      });
      renderToolResults();
    } else if (button.hasAttribute("data-reset-tools")) {
      state.category = "all";
      state.query = "";
      renderTools(toolWorkspace.catalog);
      toolWorkspace.catalog.querySelector("#toolSearch").focus();
    }
  });
  bridge.onDeactivate(() => toolWorkspace.closePicker());
  featureConfig?.subscribe(refreshConfiguration);
  bridge.onActivate(({ child, focusSearch }) => {
    refreshConfiguration();
    if (activeChild !== child) {
      toolWorkspace.show(child);
      activeChild = child;
    } else toolWorkspace.revealActiveTab();
    if (focusSearch) toolWorkspace.catalog.querySelector("#toolSearch").focus();
  });
})();
