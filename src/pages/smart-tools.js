(() => {
  "use strict";
  const { tools } = window.BaigeData;
  const { icon, escapeHtml, hydrate } = window.BaigeUI;
  const bridge = window.BaigePage;
  const content = document.querySelector("#content");
  const state = { category: "全部工具", query: "" };
  let activeChild = null;
  const toolWorkspace = new window.BaigeToolWorkspace({
    host: content,
    bar: document.querySelector("#toolWorkspaceBar"),
    scroller: document.querySelector("#contentScroll"),
    tools, icon, escapeHtml, renderCatalog: renderTools, renderTool: renderToolPage,
    onNavigate: (name) => bridge.navigate("smart-tools", name),
  });

  function renderTools(root) {
    root.replaceChildren(document.querySelector("#catalogTemplate").content.cloneNode(true));
    const categories = ["全部工具", ...new Set(tools.map((tool) => tool.group))];
    root.querySelector("#toolCategories").innerHTML = categories.map((name) => `<button data-category="${escapeHtml(name)}" aria-pressed="${state.category === name}" class="category-tab ${state.category === name ? "is-active" : ""}">${escapeHtml(name)}</button>`).join("");
    root.querySelector("#totalTools").textContent = `${tools.length} 个工具`;
    root.querySelectorAll(".featured-tool").forEach((button) => {
      const tool = tools.find((tool) => tool.name === button.dataset.tool);
      button.dataset.toolGroup = tool?.group || "";
      button.querySelector("[data-featured-description]").textContent = tool?.description || "";
    });
    const search = root.querySelector("#toolSearch");
    search.value = state.query;
    search.addEventListener("input", (event) => {
      state.query = event.target.value;
      renderToolResults(root);
    });
    hydrate(root);
    renderToolResults(root);
  }

  function renderToolResults(catalog = toolWorkspace.catalog) {
    const query = state.query.trim().toLowerCase();
    const matches = tools.filter((tool) => (state.category === "全部工具" || tool.group === state.category)
      && `${tool.name} ${tool.description}`.toLowerCase().includes(query));
    const root = catalog.querySelector("#toolResults");
    root.innerHTML = matches.length ? [...new Set(matches.map((tool) => tool.group))].map((group, index) => {
      const groupedTools = matches.filter((tool) => tool.group === group);
      return `<section class="tool-group" data-tool-group="${escapeHtml(group)}" aria-labelledby="toolGroup${index}">
        <h2 id="toolGroup${index}">${group}</h2>
        <div class="tool-list">${groupedTools.map((tool) => `
          <button class="tool-entry" data-tool="${escapeHtml(tool.name)}" data-tool-group="${escapeHtml(tool.group)}">
            <span class="tool-icon">${window.BaigeDirectoryIcons.icon(tool.icon)}</span>
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
    root.querySelectorAll("[data-detail-icon]").forEach((node) => {
      if (node.classList.contains("tool-icon")) node.innerHTML = icon(tool.icon);
      else node.outerHTML = icon(tool.icon);
    });
    hydrate(root);
    // Add tool-specific components here. After saving a form, call
    // toolWorkspace.setDirty(tool.name, false) to clear its close confirmation.
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
      state.category = "全部工具";
      state.query = "";
      renderTools(toolWorkspace.catalog);
      toolWorkspace.catalog.querySelector("#toolSearch").focus();
    }
  });
  bridge.onDeactivate(() => toolWorkspace.closePicker());
  bridge.onActivate(({ child, focusSearch }) => {
    if (activeChild !== child) {
      toolWorkspace.show(child);
      activeChild = child;
    } else toolWorkspace.revealActiveTab();
    if (focusSearch) toolWorkspace.catalog.querySelector("#toolSearch").focus();
  });
})();
