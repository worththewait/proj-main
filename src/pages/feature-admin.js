(() => {
  'use strict';
  const config = window.BaigeFeatureConfig;
  const {escapeHtml: escape, icon, hydrate} = window.BaigeUI;
  const get = id => document.querySelector(`#${id}`);
  const fields = ['icon', 'iconImage', 'image', 'homeCategory', 'toolCategory'];
  const tabs = [...document.querySelectorAll('[data-feature-tab]')];
  const scopes = [...document.querySelectorAll('[data-category-scope]')];
  const pageSize = 10;
  let page = 1, categoryScope = 'home', editing = null, draft = null, baseline = null;
  let editTrigger = null, categoryTrigger = null, categoryAction = null, pendingLeave = null, leaveFocus = null;
  let generation = 0, tokens = {icon:0,image:0}, busy = {icon:false,image:false}, toastTimer;
  const imageSource = entry => config.imageSource ? config.imageSource(entry, '../') : entry.image?.startsWith('assets/') ? `../${entry.image}` : entry.image || '';
  const dirty = () => Boolean(draft && (busy.icon || busy.image || fields.some(field => draft[field] !== baseline[field])));
  const categoryDirty = () => Boolean(categoryAction && categoryAction.action !== 'delete' && get('featureCategoryName').value !== categoryAction.initialName);
  const option = (id, label) => `<option value="${escape(id)}">${escape(label)}</option>`;

  function toast(message) {
    get('featureToast').innerHTML = `${icon('check')}<span>${escape(message)}</span>`;
    get('featureToast').classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => get('featureToast').classList.remove('is-visible'), 2400);
  }
  function populateSelect(element, categories, value, allLabel = '') {
    const exists = categories.some(item => item.id === value);
    element.innerHTML = (allLabel ? option('', allLabel) : '') + categories.map(item => option(item.id, item.label)).join('') + (!allLabel && value && !exists ? option(value, '原分类已删除，请重新选择') : '');
    element.value = value && (exists || !allLabel) ? value : '';
  }
  function refreshFilters(settings) {
    populateSelect(get('featureHomeFilter'), settings.categories.home, get('featureHomeFilter').value, '全部首页分类');
    populateSelect(get('featureToolFilter'), settings.categories.tools, get('featureToolFilter').value, '全部工具分类');
  }
  function renderList() {
    const settings = config.read();
    refreshFilters(settings);
    const all = config.catalog(settings), query = get('featureSearch').value.trim().toLowerCase();
    const home = get('featureHomeFilter').value, tool = get('featureToolFilter').value;
    const matches = all.filter(entry => (!home || entry.homeCategory === home) && (!tool || entry.toolCategory === tool) && `${entry.name} ${entry.description} ${entry.homeCategoryLabel} ${entry.toolCategoryLabel}`.toLowerCase().includes(query));
    const pages = Math.max(1, Math.ceil(matches.length / pageSize));
    page = Math.min(page, pages);
    get('featureTable').innerHTML = matches.length ? matches.slice((page-1)*pageSize, page*pageSize).map(entry => `<tr>
      <td><div class="feature-identity"><span class="feature-row-icon" aria-hidden="true">${config.iconMarkup(entry)}</span><span class="feature-identity-copy"><strong title="${escape(entry.name)}">${escape(entry.name)}</strong><small>${escape(entry.isTool ? '智能工具' : window.BaigeData.findNavItem(entry.route)?.label || '')}</small></span></div></td>
      <td class="feature-cell-label">${escape(entry.homeCategoryLabel)}</td><td class="feature-cell-label${entry.isTool ? '' : ' feature-cell-muted'}">${escape(entry.toolCategoryLabel || '—')}</td>
      <td><div class="feature-thumb-cell">${entry.image ? `<img class="feature-thumb" src="${escape(imageSource(entry))}" alt="${escape(entry.name)}大图" />` : `<span class="feature-thumb-empty" aria-hidden="true">${icon('file')}</span>`}<small>${entry.usesImage ? '用于热门工具' : entry.image ? '已配置 · 暂未使用' : '未配置'}</small></div></td>
      <td><button class="feature-text-button" type="button" data-edit-feature="${escape(entry.id)}" aria-label="编辑${escape(entry.name)}${entry.isTool ? '' : `（${escape(window.BaigeData.findNavItem(entry.route)?.label || '')}）`}">编辑</button></td></tr>`).join('') : '<tr><td colspan="5" class="feature-empty">没有找到匹配的功能<br>请尝试其他关键词或重置筛选。</td></tr>';
    get('featureSummary').textContent = `共 ${all.length} 项功能${matches.length !== all.length ? `，筛选出 ${matches.length} 项` : ''} · 第 ${page} / ${pages} 页`;
    const pager = get('featurePager');
    pager.hidden = pages <= 1;
    pager.innerHTML = pages <= 1 ? '' : `<button type="button" data-feature-page="${page-1}" aria-label="上一页" ${page===1?'disabled':''}>上一页</button>${Array.from({length:pages}, (_,i) => `<button type="button" data-feature-page="${i+1}" aria-label="第 ${i+1} 页"${page===i+1?' aria-current="page"':''}>${i+1}</button>`).join('')}<button type="button" data-feature-page="${page+1}" aria-label="下一页" ${page===pages?'disabled':''}>下一页</button>`;
  }
  function renderCategories() {
    const settings = config.read(), entries = config.catalog(settings);
    const list = settings.categories[categoryScope], field = categoryScope === 'home' ? 'homeCategory' : 'toolCategory';
    get('categoryScopeDescription').textContent = categoryScope === 'home' ? '用于首页「了解平台功能」的分类，覆盖平台全部功能。' : '用于智能工具目录的分组，仅管理智能工具中的功能。';
    get('featureCategoryTable').innerHTML = list.map(category => `<tr><td>${escape(category.label)}</td><td>${entries.filter(entry => entry[field] === category.id).length} 项</td><td><button class="feature-text-button" type="button" data-rename-category="${escape(category.id)}" aria-label="重命名${escape(category.label)}">重命名</button><button class="feature-text-button" type="button" data-delete-category="${escape(category.id)}" aria-label="删除${escape(category.label)}" ${list.length===1?'disabled title="至少保留一个分类"':''}>删除</button></td></tr>`).join('');
  }
  function renderAll() { renderList(); renderCategories(); }
  function switchTab(name, focus = false) {
    for (const tab of tabs) {
      const active = tab.dataset.featureTab === name;
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    get('featureListPanel').hidden = name !== 'list';
    get('featureCategoryPanel').hidden = name !== 'categories';
    renderAll();
  }
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.featureTab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = event.key==='ArrowRight' ? (index+1)%tabs.length : event.key==='ArrowLeft' ? (index+tabs.length-1)%tabs.length : event.key==='Home' ? 0 : event.key==='End' ? tabs.length-1 : -1;
      if (next>=0) {event.preventDefault();switchTab(tabs[next].dataset.featureTab,true);}
    });
  });
  for (const id of ['featureSearch','featureHomeFilter','featureToolFilter']) get(id).addEventListener(id==='featureSearch'?'input':'change', () => {page=1;renderList();});
  get('resetFeatureFilters').addEventListener('click', () => {get('featureSearch').value='';get('featureHomeFilter').value='';get('featureToolFilter').value='';page=1;renderList();get('featureSearch').focus();});
  get('featurePager').addEventListener('click', event => {
    const button = event.target.closest('[data-feature-page]');
    if (!button || button.disabled) return;
    const next = Number(button.dataset.featurePage);
    if (Number.isInteger(next) && next>=1) {page=next;renderList();get('featureSearch').focus();}
  });

  function updateBusy() {get('saveFeatureEdit').disabled = busy.icon || busy.image;get('saveFeatureEdit').textContent = busy.icon || busy.image ? '正在处理图片…' : '保存修改';}
  function preview() {
    if (!draft) return;
    const entry = {...editing,...draft};
    get('featureIconPreview').innerHTML = config.iconMarkup(entry);
    get('featureImagePreview').innerHTML = entry.image ? `<img src="${escape(imageSource(entry))}" alt="${escape(entry.name)}大图预览" />` : `<div class="feature-image-placeholder">${icon('file')}<span>尚未配置大图</span></div>`;
    get('featureEntryPreview').innerHTML = `<span class="feature-row-icon" aria-hidden="true">${config.iconMarkup(entry)}</span><div><strong>${escape(entry.name)}</strong><p>${escape(entry.description)}</p></div>`;
    get('featureEditorFeedback').textContent = '';
  }
  function editorCategories() {
    const settings = config.read();
    populateSelect(get('editFeatureHome'),settings.categories.home,draft.homeCategory);
    populateSelect(get('editFeatureTool'),settings.categories.tools,draft.toolCategory);
  }
  function openEditor(id, trigger) {
    const entry = config.get(id);
    if (!entry) return;
    editing=entry; editTrigger=trigger; generation++;
    draft=Object.fromEntries(fields.map(field=>[field,entry[field]]));baseline={...draft};
    busy={icon:false,image:false};tokens={icon:0,image:0};
    get('featureEditorTitle').textContent = `编辑 · ${entry.name}`;
    get('featureEditorSubtitle').textContent = `${entry.isTool?'智能工具':window.BaigeData.findNavItem(entry.route)?.label || '平台功能'} · 图标与分类同步前台`;
    get('editFeatureToolField').hidden = !entry.isTool;
    editorCategories();
    get('editFeatureIcon').innerHTML = config.iconOptions.map(item=>option(item.id,item.label)).join('');
    get('editFeatureIcon').value = draft.icon;
    get('featureImageUsage').textContent = entry.usesImage ? '当前用于智能工具 · 热门工具' : '当前未用于热门工具，可预先配置';
    for (const id of ['featureIconFeedback','featureImageFeedback']) get(id).textContent='';
    for (const id of ['uploadFeatureIcon','uploadFeatureImage']) get(id).value='';
    preview();updateBusy();
    get('featureEditor').showModal();get('editFeatureHome').focus();
  }
  function closeEditor() {
    generation++;editing=null;draft=null;baseline=null;busy={icon:false,image:false};pendingLeave=null;
    if (get('featureEditor').open) get('featureEditor').close();
    updateBusy();
    // Rows redraw on save; resolve the matching new trigger rather than a detached one.
    const triggerId=editTrigger?.dataset.editFeature;
    const current=[...get('featureTable').querySelectorAll('[data-edit-feature]')].find(el=>el.dataset.editFeature===triggerId);
    (current || (editTrigger?.isConnected ? editTrigger : get('featureSearch')))?.focus();
  }
  function leaveEditor(action = closeEditor) {
    if (!dirty()) {action();return;}
    pendingLeave=action;leaveFocus=get('cancelFeatureEdit');get('featureDiscardDialog').showModal();get('continueFeatureEdit').focus();
  }
  get('featureTable').addEventListener('click', event => {const button=event.target.closest('[data-edit-feature]');if(button) {if(editing)leaveEditor(()=>{closeEditor();openEditor(button.dataset.editFeature,button);});else openEditor(button.dataset.editFeature,button);}});
  for (const id of ['closeFeatureEditor','cancelFeatureEdit']) get(id).addEventListener('click', () => leaveEditor());
  get('featureEditor').addEventListener('cancel', event => {event.preventDefault();leaveEditor();});
  get('continueFeatureEdit').addEventListener('click', () => {pendingLeave=null;get('featureDiscardDialog').close();leaveFocus?.focus();});
  get('featureDiscardDialog').addEventListener('cancel', () => {pendingLeave=null;});
  get('discardFeatureEdit').addEventListener('click', () => {const action=pendingLeave;pendingLeave=null;get('featureDiscardDialog').close();if(action)action();});
  for (const [id,field] of [['editFeatureHome','homeCategory'],['editFeatureTool','toolCategory']]) get(id).addEventListener('change', () => {if(draft){draft[field]=get(id).value;preview();}});
  get('editFeatureIcon').addEventListener('change', () => {if(!draft)return;tokens.icon++;busy.icon=false;draft.icon=get('editFeatureIcon').value;draft.iconImage='';get('featureIconFeedback').textContent='';updateBusy();preview();});
  get('resetFeatureIcon').addEventListener('click', () => {if(!draft)return;tokens.icon++;busy.icon=false;draft.icon=config.defaults().features[editing.id].icon;draft.iconImage='';get('editFeatureIcon').value=draft.icon;get('featureIconFeedback').textContent='';updateBusy();preview();});
  get('resetFeatureImage').addEventListener('click', () => {if(!draft)return;tokens.image++;busy.image=false;draft.image=config.defaults().features[editing.id].image;get('featureImageFeedback').textContent='';updateBusy();preview();});
  async function upload(input, type) {
    const file=input.files?.[0];input.value='';if(!file || !draft)return;
    const currentGeneration=generation, token=++tokens[type], feedback=get(type==='icon'?'featureIconFeedback':'featureImageFeedback');
    busy[type]=true;feedback.textContent='正在处理图片…';updateBusy();
    try {
      const image=await window.BaigeHomeCardImages.process(file,{aspectRatio:type==='icon'?1:2});
      if (currentGeneration!==generation || token!==tokens[type] || !draft)return;
      draft[type==='icon'?'iconImage':'image']=image;feedback.textContent='';preview();
    } catch(error) {if(currentGeneration===generation && token===tokens[type])feedback.textContent=error.message;}
    finally {if(currentGeneration===generation && token===tokens[type]){busy[type]=false;updateBusy();}}
  }
  get('uploadFeatureIcon').addEventListener('change', () => upload(get('uploadFeatureIcon'),'icon'));
  get('uploadFeatureImage').addEventListener('change', () => upload(get('uploadFeatureImage'),'image'));
  get('featureEditorForm').addEventListener('submit', event => {
    event.preventDefault();if(!draft || busy.icon || busy.image)return;
    try {
      const patch=Object.fromEntries(fields.filter(field=>draft[field]!==baseline[field]).map(field=>[field,draft[field]]));
      config.saveFeature(editing.id,patch);closeEditor();renderAll();toast('功能已保存，前台展示已同步更新。');
    } catch(error) {get('featureEditorFeedback').textContent=error.message;}
  });

  function openCategory(action,id='',trigger=get('addFeatureCategory')) {
    const settings=config.read(), list=settings.categories[categoryScope];
    const category=list.find(item=>item.id===id);
    if(action!=='add' && !category)return;
    const field=categoryScope==='home'?'homeCategory':'toolCategory';
    const count=id?config.catalog(settings).filter(entry=>entry[field]===id).length:0;
    categoryAction={action,id,scope:categoryScope,initialName:category?.label||''};categoryTrigger=trigger;
    get('featureCategoryDialogTitle').textContent=action==='add'?'新增分类':action==='rename'?'重命名分类':'删除分类';
    get('featureCategoryDialogDescription').textContent=action==='delete'?`确定删除「${category.label}」？${count?`该分类包含 ${count} 项功能，请选择迁入分类。`:'该分类暂无功能，删除后将从前台分类中移除。'}`:`${categoryScope==='home'?'首页分类':'工具分类'} · 保存后同步前台分类名称。`;
    get('categoryNameField').hidden=action==='delete';get('categoryMigrationField').hidden=action!=='delete'||count===0;
    get('featureCategoryName').value=category?.label||'';
    const targets=list.filter(item=>item.id!==id);
    get('featureCategoryTarget').innerHTML=option('','请选择迁入分类')+targets.map(item=>option(item.id,item.label)).join('');get('featureCategoryTarget').value='';
    get('featureCategoryFeedback').textContent='';get('saveFeatureCategory').textContent=action==='delete'?'删除分类':'保存分类';
    get('saveFeatureCategory').className=action==='delete'?'feature-danger-button':'primary-button';
    get('featureCategoryDialog').showModal();get(action==='delete'?(count?'featureCategoryTarget':'cancelFeatureCategory'):'featureCategoryName').focus();
  }
  scopes.forEach(button=>button.addEventListener('click',()=>{categoryScope=button.dataset.categoryScope;scopes.forEach(item=>item.setAttribute('aria-pressed',String(item===button)));renderCategories();}));
  get('addFeatureCategory').addEventListener('click',()=>openCategory('add'));
  get('featureCategoryTable').addEventListener('click',event=>{
    const rename=event.target.closest('[data-rename-category]'),remove=event.target.closest('[data-delete-category]');
    if(rename)openCategory('rename',rename.dataset.renameCategory,rename);
    else if(remove&&!remove.disabled)openCategory('delete',remove.dataset.deleteCategory,remove);
  });
  function closeCategory() {get('featureCategoryDialog').close();categoryAction=null;(categoryTrigger?.isConnected?categoryTrigger:get('addFeatureCategory')).focus();}
  function leaveCategory() {
    if(!categoryDirty()){closeCategory();return;}
    pendingLeave=closeCategory;leaveFocus=get('featureCategoryName');get('featureDiscardDialog').showModal();get('continueFeatureEdit').focus();
  }
  get('cancelFeatureCategory').addEventListener('click',leaveCategory);
  get('featureCategoryDialog').addEventListener('cancel',event=>{event.preventDefault();leaveCategory();});
  get('featureCategoryForm').addEventListener('submit',event=>{
    event.preventDefault();if(!categoryAction)return;
    const {scope,id,action}=categoryAction;
    try {
      if(action==='add')config.addCategory(scope,get('featureCategoryName').value);
      else if(action==='rename')config.renameCategory(scope,id,get('featureCategoryName').value);
      else config.deleteCategory(scope,id,get('featureCategoryTarget').value);
      closeCategory();renderAll();toast(action==='delete'?'分类已删除，已有功能已妥善保留。':'分类已保存，前台分类已同步更新。');
    } catch(error) {get('featureCategoryFeedback').textContent=error.message;}
  });
  window.addEventListener('beforeunload',event=>{if(dirty()||categoryDirty()){event.preventDefault();event.returnValue='';}});
  config.subscribe(()=>{renderAll();if(draft)editorCategories();});
  hydrate();renderAll();
})();
