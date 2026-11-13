(() => {
  "use strict";

  function menuTree(groups) {
    return groups.map(group => {
      const children = [];
      const parents = new Map();
      for (const item of group.items) {
        if (!item.parentId) {
          children.push(item);
          continue;
        }
        if (!parents.has(item.parentId)) {
          const parent = { id: `${group.id}/${item.parentId}`, label: item.parentLabel, children: [] };
          parents.set(item.parentId, parent);
          children.push(parent);
        }
        parents.get(item.parentId).children.push(item);
      }
      return { id: group.id, label: group.label, children };
    });
  }

  const leaves = node => node.children ? node.children.flatMap(leaves) : [node];
  const branches = node => node.children ? [node, ...node.children.flatMap(branches)] : [];

  function mount(target, { selected = [], disabled = false, onChange = () => {} } = {}) {
    const catalog = window.BaigeIamMenuCatalog;
    const { escapeHtml: escape, icon } = window.BaigeUI;
    const groups = menuTree(catalog.groups());
    const entries = groups.flatMap(leaves);
    const items = new Map(entries.map(item => [item.key, item]));
    const nodes = new Map(groups.flatMap(branches).map(node => [node.id, node]));
    const original = new Set(selected);
    const covered = new Map();
    const chosen = new Set();
    const opened = new Set(nodes.keys());
    const protectedItem = item => item.protected || window.BaigeIamStore.isPrivilegedMenu(item.key);
    const editable = entries.filter(item => !item.alwaysAvailable && !protectedItem(item)).map(item => item.key);
    const editableKeys = new Set(editable);
    const isChecked = item => item.alwaysAvailable || chosen.has(item.key);
    let linked = true;
    let query = "";
    let visibleKeys = new Set(items.keys());

    for (const key of original) {
      const coverage = catalog.expand([key]);
      covered.set(key, coverage);
      coverage.forEach(value => chosen.add(value));
    }
    const initial = new Set(chosen);

    function keys() {
      if (chosen.size === initial.size && [...chosen].every(key => initial.has(key))) return [...original];
      const output = new Set(chosen);
      for (const [key, coverage] of covered) {
        if (coverage.every(item => chosen.has(item))) {
          coverage.forEach(item => output.delete(item));
          output.add(key);
        }
      }
      return [...output];
    }

    target.innerHTML = `<div class="iam-role-menu-heading">
      <h3>菜单权限</h3>
      <div class="iam-role-menu-tools" role="group" aria-label="菜单树操作">
        <button class="iam-role-menu-switch" type="button" data-role-menu-action="expand" aria-pressed="true">展开</button>
        <button class="iam-role-menu-switch" type="button" data-role-menu-action="all" aria-pressed="false">全不选</button>
        <button class="iam-role-menu-switch" type="button" data-role-menu-action="link" aria-pressed="false">父子不联动</button>
      </div>
    </div>
    <div class="iam-role-menu-panes">
      <section class="iam-role-menu-pane" aria-label="可选菜单">
        <div class="iam-role-menu-summary">
          <button class="iam-role-menu-text" type="button" data-role-menu-action="select-all">全选</button>
          <span>共 ${entries.length} 项</span>
        </div>
        <label class="iam-role-menu-search">
          <input class="iam-input" type="search" data-role-menu-search placeholder="搜索菜单名称" aria-label="搜索菜单名称">
          ${icon("search")}
        </label>
        <div class="iam-role-menu-tree" data-role-menu-tree></div>
      </section>
      <section class="iam-role-menu-pane" aria-label="已选菜单">
        <div class="iam-role-menu-summary">
          <button class="iam-role-menu-text" type="button" data-role-menu-action="clear">清除</button>
          <span data-role-menu-count role="status"></span>
        </div>
        <div class="iam-role-menu-selected" data-role-menu-selected></div>
      </section>
    </div>`;

    const tree = target.querySelector("[data-role-menu-tree]");
    const selectedList = target.querySelector("[data-role-menu-selected]");
    const selectedCount = target.querySelector("[data-role-menu-count]");
    const search = target.querySelector("[data-role-menu-search]");
    const control = name => target.querySelector(`[data-role-menu-action="${name}"]`);

    function checkbox(data, label, { checked, partial, locked }) {
      return `<input type="checkbox" ${data} aria-label="${escape(label)}"${checked ? " checked" : ""}${partial ? ' data-role-menu-partial aria-checked="mixed"' : ""}${locked ? " disabled" : ""}>`;
    }

    function matchingLeaves(node, ancestorMatches = false) {
      const matches = ancestorMatches || !query || node.label.toLocaleLowerCase().includes(query);
      if (node.children) return node.children.flatMap(child => matchingLeaves(child, matches));
      return matches ? [node.key] : [];
    }

    const visibleEditable = () => editable.filter(key => visibleKeys.has(key));

    function markup(node) {
      const label = escape(node.label);
      if (!node.children) {
        if (!visibleKeys.has(node.key)) return "";
        const locked = disabled || !editableKeys.has(node.key);
        return `<li><label class="iam-role-menu-row">
          <span class="iam-role-menu-offset" aria-hidden="true"></span>
          ${checkbox(`data-role-menu-key="${escape(node.key)}"`, node.label, { checked: isChecked(node), locked })}
          <span title="${label}">${label}</span>${node.alwaysAvailable ? "<small>默认可用</small>" : protectedItem(node) ? "<small>系统预置</small>" : ""}
        </label></li>`;
      }
      const branchItems = leaves(node).filter(item => visibleKeys.has(item.key));
      if (!branchItems.length) return "";
      const checked = branchItems.every(isChecked);
      const partial = !checked && branchItems.some(isChecked);
      const expanded = Boolean(query) || opened.has(node.id);
      const locked = disabled || !linked || !branchItems.some(item => editableKeys.has(item.key));
      return `<li>
        <div class="iam-role-menu-row iam-role-menu-branch">
          <button type="button" class="iam-role-menu-caret" data-role-menu-action="branch" data-role-menu-branch="${escape(node.id)}" aria-expanded="${expanded}" aria-label="${expanded ? "收起" : "展开"}${label}"${query ? " disabled" : ""}>${icon("chevron")}</button>
          <label>${checkbox(`data-role-menu-group="${escape(node.id)}"`, node.label, { checked, partial, locked })}<span title="${label}">${label}</span></label>
        </div>
        ${expanded ? `<ul>${node.children.map(markup).join("")}</ul>` : ""}
      </li>`;
    }

    function redrawTree(focus = null) {
      const scroll = tree.scrollTop;
      const content = groups.map(group => markup(group)).join("");
      tree.innerHTML = content ? `<ul>${content}</ul>` : '<p class="iam-role-menu-empty">没有匹配的菜单</p>';
      tree.scrollTop = scroll;
      tree.querySelectorAll("[data-role-menu-partial]").forEach(input => { input.indeterminate = true; });
      if (focus) {
        const replacement = [...tree.querySelectorAll(`[${focus.attribute}]`)]
          .find(element => element.getAttribute(focus.attribute) === focus.value);
        replacement?.focus({ preventScroll: true });
      }
    }

    function updateControls() {
      const visible = visibleEditable();
      const all = visible.length > 0 && visible.every(key => chosen.has(key));
      const expanded = Boolean(query) || (nodes.size > 0 && opened.size === nodes.size);
      control("expand").setAttribute("aria-pressed", String(expanded));
      control("expand").disabled = Boolean(query) || nodes.size === 0;
      control("all").setAttribute("aria-pressed", String(all));
      control("all").textContent = all ? "全不选" : "全选";
      control("all").setAttribute("aria-label", query ? (all ? "取消选择搜索结果" : "选择全部搜索结果") : control("all").textContent);
      control("all").disabled = disabled || visible.length === 0;
      control("link").setAttribute("aria-pressed", String(!linked));
      control("link").disabled = disabled;
      control("select-all").setAttribute("aria-label", query ? "选择全部搜索结果" : "全选");
      control("select-all").disabled = disabled || visible.length === 0 || all;
      control("clear").disabled = disabled || !editable.some(key => chosen.has(key));
    }

    function renderSelection() {
      const current = entries.filter(item => chosen.has(item.key));
      const unknown = [...chosen].filter(key => !items.has(key));
      const selectedNames = [
        ...current.map(item => item.label),
        ...unknown.map(key => catalog.label?.(key) || key),
      ];
      selectedCount.textContent = `已选 ${selectedNames.length} 项`;
      selectedList.innerHTML = selectedNames.length
        ? `<ul>${selectedNames.map(name => `<li title="${escape(name)}">${escape(name)}</li>`).join("")}</ul>`
        : '<p class="iam-role-menu-empty">暂无已选菜单</p>';
      updateControls();
    }

    function setSelection(keysToChange, checked, focus = null) {
      if (disabled) return;
      for (const key of keysToChange) {
        if (!editableKeys.has(key)) continue;
        if (checked) chosen.add(key);
        else chosen.delete(key);
      }
      redrawTree(focus);
      renderSelection();
      onChange();
    }

    search.addEventListener("input", () => {
      query = search.value.trim().toLocaleLowerCase();
      visibleKeys = new Set(groups.flatMap(group => matchingLeaves(group)));
      redrawTree();
      updateControls();
    });
    target.addEventListener("change", ({ target: input }) => {
      const { roleMenuKey: key, roleMenuGroup: group } = input.dataset;
      if (key !== undefined && visibleKeys.has(key)) {
        setSelection([key], input.checked, { attribute: "data-role-menu-key", value: key });
      } else if (group !== undefined && linked && nodes.has(group)) {
        const visible = leaves(nodes.get(group)).map(item => item.key).filter(key => visibleKeys.has(key));
        setSelection(visible, input.checked, { attribute: "data-role-menu-group", value: group });
      }
    });
    target.addEventListener("click", event => {
      const button = event.target.closest("[data-role-menu-action]");
      if (!button || button.disabled) return;
      const { roleMenuAction: action, roleMenuBranch: branch } = button.dataset;
      if (action === "expand") {
        if (opened.size === nodes.size) opened.clear();
        else nodes.forEach((_, id) => opened.add(id));
        redrawTree();
        updateControls();
      } else if (action === "branch") {
        if (opened.has(branch)) opened.delete(branch);
        else opened.add(branch);
        redrawTree({ attribute: "data-role-menu-branch", value: branch });
        updateControls();
      } else if (action === "link" && !disabled) {
        linked = !linked;
        redrawTree();
        updateControls();
      } else if (action === "all") {
        const visible = visibleEditable();
        setSelection(visible, !visible.every(key => chosen.has(key)));
      } else if (action === "select-all" || action === "clear") {
        setSelection(action === "clear" ? editable : visibleEditable(), action === "select-all");
      }
    });

    redrawTree();
    renderSelection();
    return Object.freeze({ keys });
  }

  window.BaigeIamRoleMenuPicker = Object.freeze({ mount });
})();
