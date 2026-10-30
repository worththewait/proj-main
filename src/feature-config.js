(() => {
  'use strict';

  const storageKey = 'baige.feature-config.v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const scopes = ['home', 'tools'];
  const iconOptions = Object.freeze([
    ['chat', '对话'], ['book', '知识'], ['pen', '写作'], ['file', '文档'],
    ['folder', '文件夹'], ['shield', '权限'], ['globe', '情报'], ['chart', '分析'],
    ['translate', '翻译'], ['scan', '识别'], ['check', '校对'], ['slides', '演示文稿'],
    ['branch', '思维导图'], ['standard', '标准'], ['compass', '探索'], ['layers', '系统'],
    ['database', '数据集'], ['code', '开发'], ['server', '数据平台'], ['bulb', '提示词'],
    ['tag', '标注'], ['bug', '采集'],
  ].map(([id, label]) => Object.freeze({id, label})));
  const iconIds = new Set(iconOptions.map(item => item.id));
  const initialCategories = {
    home: [{id: 'knowledge-research', label: '知识与研究'}, {id: 'tools-platforms', label: '工具与平台'}],
    tools: [{id: 'documents', label: '文档处理'}, {id: 'writing', label: '写作创作'}, {id: 'research', label: '研究辅助'}],
  };
  const researchRoutes = new Set(['qa', 'knowledge', 'writing', 'library', 'intel', 'analysis']);
  const routeMeta = {
    qa: ['围绕问题展开对话，探索信息与数据。', 'blue'],
    knowledge: ['把常用知识汇集到一个入口。', 'purple'],
    writing: ['从主题与框架出发，组织专业表达。', 'purple'],
    library: ['集中查阅文库资源，积累专业资料。', 'blue'],
    intel: ['关注研究领域与行业信息。', 'teal'],
    analysis: ['让资料分析有清晰的工作入口。', 'teal'],
    frontier: ['探索前沿工具与研究服务。', 'teal'],
    digital: ['查看数智系统相关入口。', 'teal'],
    datasets: ['船海全链条八大数据集，可直接查阅。', 'teal'],
    platform: ['面向智能能力的开发与管理。', 'blue'],
    'data-platform': ['汇集数据标注、采集与管理入口。', 'blue'],
  };
  const childMeta = {
    '对话': ['chat', '围绕问题展开交流，辅助梳理资料与思路。'],
    '智能问数': ['chart', '通过自然语言，提出业务数据问题。'],
    '全球鹰': ['globe', '关注全球动态与行业信息的服务入口。'],
    '智研通': ['compass', '面向专业研究的信息与服务入口。'],
    '数据标注平台': ['tag', '面向数据标注任务的工作入口。'],
    '爬虫平台': ['bug', '面向数据采集任务的工作入口。'],
    '数据中台': ['server', '集中管理与使用数据的工作入口。'],
    '标准编制': ['standard', '辅助整理标准结构、编制内容与条款。'],
    '专利编制': ['file', '辅助梳理专利技术方案与申请材料，形成编制思路。'],
  };
  const popularImages = {
    'OCR识别': 'assets/document-layers.svg',
    '文档翻译': 'assets/language-wave.svg',
    '思维导图生成': 'assets/research-flow.svg',
  };
  const toolCategoryIds = {'文档处理': 'documents', '写作创作': 'writing', '研究辅助': 'research'};
  const toolTones = {'文档处理': 'blue', '写作创作': 'purple', '研究辅助': 'teal'};

  // Stable IDs identify destinations, not labels: same-name tools and systems stay distinct.
  const registry = window.BaigeData.navigation.filter(item => !['home', 'home-settings'].includes(item.id) && !item.adminOnly).flatMap(item => {
    const homeCategory = researchRoutes.has(item.id) ? 'knowledge-research' : 'tools-platforms';
    const base = {route: item.id, homeCategory, tone: routeMeta[item.id]?.[1] || 'blue'};
    if (item.id === 'smart-tools') return window.BaigeData.tools.map(tool => ({
      ...base, id: `tool:${tool.name}`, child: tool.name, name: tool.name, description: tool.description,
      icon: tool.name === '提示词生成' ? 'bulb' : tool.icon,
      toolCategory: toolCategoryIds[tool.group], tone: toolTones[tool.group], isTool: true,
      usesImage: Object.hasOwn(popularImages, tool.name), image: popularImages[tool.name] || '',
    }));
    if (item.children?.length && item.subnav !== false) return item.children
      .filter(child => !['文件管理', '权限管理'].includes(child))
      .map((child, index) => ({
        ...base, id: index === 0 && item.id === 'qa' ? 'route:qa' : `route:${item.id}:${child}`,
        child, name: child, icon: childMeta[child]?.[0] || item.icon,
        description: childMeta[child]?.[1] || routeMeta[item.id]?.[0] || '',
        toolCategory: '', isTool: false, usesImage: false, image: '',
      }));
    return [{...base, id: `route:${item.id}`, child: '', name: item.label,
      icon: item.id === 'library' ? 'book' : item.icon, description: routeMeta[item.id]?.[0] || '',
      toolCategory: '', isTool: false, usesImage: false, image: '',
    }];
  });
  const byId = new Map(registry.map(item => [item.id, item]));
  const fields = ['icon', 'iconImage', 'image', 'homeCategory', 'toolCategory'];
  const defaultFeature = item => ({icon: item.icon, iconImage: '', image: item.image,
    homeCategory: item.homeCategory, toolCategory: item.toolCategory});
  function defaults() {
    return {version: 1, categories: clone(initialCategories),
      features: Object.fromEntries(registry.map(item => [item.id, defaultFeature(item)]))};
  }

  function isRaster(value) {
    if (typeof value !== 'string' || value.length > 260000) return false;
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    const signatures = {png: 'iVBORw0KGgo', jpeg: '/9j/', webp: 'UklGR'};
    return Boolean(match && match[2].length % 4 === 0 && match[2].startsWith(signatures[match[1]]));
  }
  const isObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
  function checkedLabel(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 20 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw Error('分类名称需为 1—20 个字，不能包含换行或控制字符。');
    }
    return value.trim();
  }
  function checkedScope(scope) {
    if (!scopes.includes(scope)) throw Error('分类范围无效，请重新选择首页分类或工具分类。');
    return scope;
  }
  function checkedCategories(value) {
    if (!isObject(value)) throw Error('分类配置无效。');
    return Object.fromEntries(scopes.map(scope => {
      const list = value[scope];
      if (!Array.isArray(list) || list.length < 1 || list.length > 50) throw Error('每套分类至少保留一个，最多支持 50 个。');
      const ids = new Set(), labels = new Set();
      return [scope, list.map(item => {
        if (!isObject(item) || typeof item.id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(item.id) || ids.has(item.id)) throw Error('分类标识无效或重复。');
        const label = checkedLabel(item.label);
        if (labels.has(label.toLocaleLowerCase())) throw Error('已有同名分类，请换一个名称。');
        ids.add(item.id); labels.add(label.toLocaleLowerCase());
        return {id: item.id, label};
      })];
    }));
  }
  function checkedFeature(id, value, categories) {
    const entry = byId.get(id);
    if (!entry || !isObject(value)) throw Error('功能不存在，请刷新列表后重试。');
    if (!iconIds.has(value.icon)) throw Error('请选择列表中的内置图标。');
    if (value.iconImage !== '' && !isRaster(value.iconImage)) throw Error('图标图片无效，请重新上传 PNG、JPG 或 WebP。');
    if (value.image !== '' && value.image !== entry.image && !isRaster(value.image)) throw Error('大图无效，请重新上传 PNG、JPG 或 WebP。');
    if (!categories.home.some(item => item.id === value.homeCategory)) throw Error('首页分类已不存在，请重新选择分类。');
    if (entry.isTool ? !categories.tools.some(item => item.id === value.toolCategory) : value.toolCategory !== '') throw Error('工具分类无效，请重新选择分类。');
    return Object.fromEntries(fields.map(field => [field, value[field]]));
  }
  function checkedConfig(value) {
    if (!isObject(value) || value.version !== 1 || !isObject(value.features)) throw Error('功能配置版本无效。');
    const categories = checkedCategories(value.categories);
    const features = Object.fromEntries(registry.map(item => [item.id,
      checkedFeature(item.id, Object.hasOwn(value.features, item.id) ? value.features[item.id] : defaultFeature(item), categories)]));
    return {version: 1, categories, features};
  }
  function load(strictStorage = false) {
    let source;
    try {source = window.localStorage.getItem(storageKey);}
    catch {
      if (strictStorage) throw Error('未能读取浏览器存储，当前编辑内容已保留，请检查浏览器设置后重试。');
      return defaults();
    }
    if (!source) return defaults();
    try {return checkedConfig(JSON.parse(source));} catch {return defaults();}
  }
  const read = () => load(false);
  function catalog(config = read()) {
    const settings = checkedConfig(config);
    return registry.map(item => ({...item, ...settings.features[item.id],
      homeCategoryLabel: settings.categories.home.find(category => category.id === settings.features[item.id].homeCategory).label,
      toolCategoryLabel: item.isTool ? settings.categories.tools.find(category => category.id === settings.features[item.id].toolCategory).label : '',
    }));
  }
  function get(id, config = read()) {
    return byId.has(id) ? catalog(config).find(item => item.id === id) : null;
  }
  function idFor(route, child = '') {
    const entry = registry.find(item => item.route === route && item.child === child);
    if (entry) return entry.id;
    if (route === 'qa' && child === '') return 'route:qa';
    if (route === 'library' && child === '文库首页') return 'route:library';
    return null;
  }
  function iconMarkup(entry) {
    if (isRaster(entry?.iconImage)) return `<img class="feature-custom-icon" src="${entry.iconImage}" alt="" aria-hidden="true" />`;
    const name = iconIds.has(entry?.icon) ? entry.icon : 'file';
    return window.BaigeDirectoryIcons?.icon(name) || window.BaigeUI?.icon(name) || '';
  }

  const listeners = new Set();
  function notify() {
    for (const listener of listeners) {
      // A consumer render failure must not turn a successful persisted save into a failure.
      try {listener(read());} catch {}
    }
  }
  window.addEventListener?.('storage', event => {
    if (event.key === storageKey || event.key === null) notify();
  });
  function subscribe(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
  }
  function persist(config) {
    const checked = checkedConfig(config);
    try {window.localStorage.setItem(storageKey, JSON.stringify(checked));}
    catch {throw Error('未能保存，浏览器存储空间不足或不可用。当前编辑内容已保留，请重试。');}
    notify();
    return clone(checked);
  }
  function saveFeature(id, patch) {
    if (!byId.has(id) || !isObject(patch)) throw Error('功能不存在，请刷新列表后重试。');
    if (Object.keys(patch).some(field => !fields.includes(field))) throw Error('只能修改图标、大图和所属分类。');
    const config = load(true);
    config.features[id] = checkedFeature(id, {...config.features[id], ...patch}, config.categories);
    return persist(config);
  }
  function ensureUnique(list, label, exceptId = '') {
    if (list.some(item => item.id !== exceptId && item.label.toLocaleLowerCase() === label.toLocaleLowerCase())) throw Error('已有同名分类，请换一个名称。');
  }
  let sequence = 0;
  function addCategory(scope, value) {
    checkedScope(scope);
    const label = checkedLabel(value), config = load(true), list = config.categories[scope];
    ensureUnique(list, label);
    if (list.length >= 50) throw Error('每套最多支持 50 个分类。');
    let id;
    do {id = `custom-${Date.now().toString(36)}-${++sequence}`;} while (list.some(item => item.id === id));
    list.push({id, label});
    return persist(config);
  }
  function renameCategory(scope, id, value) {
    checkedScope(scope);
    const label = checkedLabel(value), config = load(true), list = config.categories[scope];
    const category = list.find(item => item.id === id);
    if (!category) throw Error('分类已不存在，请刷新后重试。');
    ensureUnique(list, label, id);
    category.label = label;
    return persist(config);
  }
  function deleteCategory(scope, id, targetId = '') {
    checkedScope(scope);
    const config = load(true), list = config.categories[scope];
    if (!list.some(item => item.id === id)) throw Error('分类已不存在，请刷新后重试。');
    if (list.length <= 1) throw Error('每套分类至少保留一个，不能删除最后一个分类。');
    const field = scope === 'home' ? 'homeCategory' : 'toolCategory';
    const members = Object.values(config.features).filter(item => item[field] === id);
    if (targetId === id || (targetId && !list.some(item => item.id === targetId))) throw Error('迁入分类无效，请重新选择。');
    if (members.length && !targetId) throw Error('该分类仍有功能，请先选择迁入分类。');
    members.forEach(item => {item[field] = targetId;});
    config.categories[scope] = list.filter(item => item.id !== id);
    return persist(config);
  }

  window.BaigeFeatureConfig = Object.freeze({storageKey, defaults, read, catalog, get, idFor, iconMarkup,
    saveFeature, addCategory, renameCategory, deleteCategory, subscribe, iconOptions});
})();
