(() => {
  "use strict";

  const { navigation, findNavItem, roleMenuKey, roleMenuChildren, legacyRoleMenu } = window.BaigeData;
  const backendItems = [
    { key: "review", label: "权限审核", protected: true },
    { key: "system", label: "系统管理", protected: true },
  ];
  const homeItem = { key: "home", label: "首页", route: "home", alwaysAvailable: true };

  function toItem(route, child, label) {
    const item = { key: roleMenuKey(route, child), label, route, child };
    if (child) {
      item.parentId = route;
      item.parentLabel = findNavItem(route).label;
      const legacyKey = legacyRoleMenu(route, child);
      if (legacyKey) item.legacyKey = legacyKey;
    }
    return item;
  }

  const routeItems = navigation.filter(item => item.id !== "home" && !item.adminOnly).flatMap(item => {
    const children = roleMenuChildren(item);
    return children.length ? children.map(child => toItem(item.id, child, child)) : [toItem(item.id, "", item.label)];
  });
  const legacyGroups = new Map();
  for (const { key, legacyKey } of routeItems) {
    if (legacyKey) legacyGroups.set(legacyKey, [...(legacyGroups.get(legacyKey) || []), key]);
  }
  const labels = new Map([...routeItems, homeItem, ...backendItems].map(({ key, label }) => [key, label]));
  labels.set("tools", "智能工具");

  function groups() {
    const config = window.BaigeFeatureConfig;
    const settings = config?.read();
    const homepageGroups = settings
      ? settings.categories.home.map(category => ({
        id: category.id,
        label: category.label,
        items: [],
      }))
      : [{ id: "features", label: "功能目录", items: routeItems.slice() }];
    if (settings) {
      const byId = new Map(homepageGroups.map(group => [group.id, group]));
      for (const item of config.catalog(settings)) {
        byId.get(item.homeCategory)?.items.push(toItem(item.route, item.child, item.name));
      }
    }
    return [
      { id: "home", label: "客户端", items: [homeItem] },
      ...homepageGroups,
      { id: "backend", label: "后台", items: backendItems },
    ];
  }

  function expand(keys) {
    return [...new Set(keys.flatMap(key => legacyGroups.get(key) || [key]))];
  }

  function tree(menuGroups) {
    return menuGroups.map(group => {
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

  function grantedGroups(keys) {
    const granted = new Set(expand(keys));
    return groups().map(group => ({
      ...group,
      items: group.items.filter(item => item.route && (item.alwaysAvailable || granted.has(item.key))),
    })).filter(group => group.items.length);
  }

  function label(key) {
    return labels.get(key) || findNavItem(key)?.label || key;
  }

  window.BaigeIamMenuCatalog = Object.freeze({ groups, tree, expand, grantedGroups, label });
})();
