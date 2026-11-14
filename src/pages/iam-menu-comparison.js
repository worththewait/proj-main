(() => {
  "use strict";

  const catalog = window.BaigeIamMenuCatalog;
  const { escapeHtml: escape } = window.BaigeUI;
  const labels = { granted: "已授权", partial: "部分授权", absent: "未授权" };

  function difference(current = [], requested = []) {
    const before = new Set(catalog.expand(current));
    const after = new Set(catalog.expand(requested));
    return {
      before, after,
      added: new Set([...after].filter(key => !before.has(key))),
      removed: new Set([...before].filter(key => !after.has(key))),
    };
  }

  function comparisonTree(keys) {
    const unmatched = new Set(keys);
    const groups = catalog.groups().filter(group => group.items.length);
    const routeKeys = new Map();
    for (const { items } of groups) {
      for (const { key, parentId } of items) {
        unmatched.delete(key);
        if (!parentId) continue;
        if (!routeKeys.has(parentId)) routeKeys.set(parentId, []);
        routeKeys.get(parentId).push(key);
      }
    }
    const nodes = catalog.tree(groups).map(group => ({ ...group, children: group.children.map(node => {
      const route = node.children?.[0]?.parentId;
      return route ? { ...node, routeKeys: routeKeys.get(route) } : node;
    }) }));
    const client = { label: "客户端", children: nodes.filter(node => node.id !== "backend")
      .flatMap(node => node.id === "home" ? node.children : [node]) };
    const backend = nodes.find(node => node.id === "backend");
    const historical = { label: "历史菜单", children: [...unmatched].map(key => ({ key, label: catalog.label(key) })) };
    return [client, backend, historical].filter(node => node?.children.length);
  }

  function renderNode(node, scope, keys, changed, change) {
    const children = node.children?.map(child => renderNode(child, scope, keys, changed, change));
    const granted = children ? children.reduce((sum, child) => sum + child.granted, 0) : Number(keys.has(node.key));
    const total = children ? children.reduce((sum, child) => sum + child.total, 0) : 1;
    const displayedGranted = node.routeKeys ? node.routeKeys.filter(key => keys.has(key)).length : granted;
    const displayedTotal = node.routeKeys?.length ?? total;
    const state = !displayedGranted ? "absent" : displayedGranted === displayedTotal ? "granted" : "partial";
    const inScope = children ? children.some(child => child.inScope) : scope.has(node.key);
    const shownChildren = node.routeKeys ? children : children?.filter(child => child.inScope);
    const isChanged = changed.has(node.key);
    const label = `<span class="iam-compare-mark" data-state="${state}" role="img" aria-label="${labels[state]}"></span><span class="iam-compare-name">${escape(node.label)}</span>`;
    const content = children
      ? `<details open><summary class="iam-compare-node">${label}</summary><ul>${shownChildren.map(child => child.html).join("")}</ul></details>`
      : `<div class="iam-compare-node">${label}${isChanged ? `<span class="approval-change-label">${change === "added" ? "新增" : "移除"}</span>` : ""}</div>`;
    return { granted, total, inScope, html: `<li${isChanged ? ` data-change="${change}"` : ""}>${content}</li>` };
  }

  function side(label, tree, scope, keys, changed, change) {
    const nodes = tree.map(node => renderNode(node, scope, keys, changed, change)).filter(node => node.inScope);
    return `<section class="approval-compare-side" aria-label="${escape(label)}">
      <div class="approval-compare-head"><strong>${escape(label)}</strong><span>${keys.size} 项</span></div>
      ${nodes.length ? `<ul class="iam-compare-tree">${nodes.map(node => node.html).join("")}</ul>`
        : '<p class="approval-compare-empty">无权限菜单</p>'}
    </section>`;
  }

  function render(current, requested, resultLabel, beforeLabel = "变更前") {
    const { before, after, added, removed } = difference(current, requested);
    const scope = new Set([...before, ...after]);
    const tree = comparisonTree(scope);
    return `<div class="approval-compare">
      ${side(beforeLabel, tree, scope, before, removed, "removed")}
      ${side(resultLabel, tree, scope, after, added, "added")}
    </div>`;
  }

  window.BaigeIamMenuComparison = Object.freeze({ difference, render });
})();
