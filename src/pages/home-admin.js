(() => {
  'use strict';
  const config = window.BaigeHomeConfig;
  const editor = window.BaigeHomeCarouselEditor;
  const {escapeHtml: escape, icon} = window.BaigeUI;
  const get = id => document.querySelector(`#${id}`);
  const tabs = [...document.querySelectorAll('[data-admin-tab]')];
  const catalog = config.catalog;
  const byId = new Map(catalog.map(item => [item.id, item]));
  const newsDestinations = config.updateDestinations();
  const destinationFor = item => item.destination && newsDestinations.find(target=>target.route===item.destination.route && target.child===item.destination.child);
  get('updateDestination').innerHTML = '<option value="">不设置跳转</option>' + newsDestinations.map(item=>`<option value="${escape(item.key)}">${escape(item.label)}</option>`).join('');
  let selected = new Set(config.read().recommendedIds);
  let group = 'all', deleteId = null, deleteTrigger = null, detailTrigger = null;
  let nextId = 0;
  const notice = text => { get('adminNotice').textContent = text; };
  let toastTimer = null;
  function showToast(text) {
    const toast = get('adminToast');
    toast.innerHTML = `${icon('check')}<span>${escape(text)}</span>`;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('is-visible');
      toastTimer = null;
    }, 2000);
  }

  function switchTab(name, focus = false) {
    for (const tab of tabs) {
      const active = tab.dataset.adminTab === name;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      get(`panel${tab.dataset.adminTab}`).hidden = !active;
      if (active && focus) tab.focus();
    }
    notice('');
    if (name === 'Updates') renderNews();
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => switchTab(tab.dataset.adminTab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index+1)%tabs.length : event.key === 'ArrowLeft' ? (index+tabs.length-1)%tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : -1;
      if (next >= 0) {event.preventDefault(); switchTab(tabs[next].dataset.adminTab, true);}
    });
  }
  function selectionState() {
    get('recommendCount').textContent = `已选 ${selected.size} / 4 项`;
    get('recommendSelected').innerHTML = '<small>已选推荐</small>' + (selected.size ? [...selected].map(id => `<button class="admin-selected-chip" type="button" data-remove-rec="${escape(id)}" aria-label="取消推荐${escape(byId.get(id).name)}">${escape(byId.get(id).name)}${icon('close')}</button>`).join('') : '<span>尚未选择功能，可从下方添加。</span>');
    for (const input of get('recommendOptions').querySelectorAll('input[data-recommend-id]')) {
      const checked = selected.has(input.value);
      input.checked = checked;
      input.disabled = selected.size >= 4 && !checked;
      input.closest('label').classList.toggle('is-selected', checked);
      input.closest('label').classList.toggle('is-disabled', input.disabled);
    }
  }
  function renderOptions() {
    const query = get('recommendSearch').value.trim().toLowerCase();
    const visible = catalog.filter(item => (group === 'all' || item.group === group) && `${item.name} ${item.description}`.toLowerCase().includes(query));
    get('recommendOptions').innerHTML = visible.length ? visible.map(item => `<label class="admin-option" data-tone="${item.tone}"><input type="checkbox" data-recommend-id value="${escape(item.id)}" aria-label="推荐${escape(item.name)}"><span class="admin-option-icon" aria-hidden="true">${window.BaigeDirectoryIcons?.icon(item.icon)||icon(item.icon)}</span><span class="admin-option-copy"><strong>${escape(item.name)}</strong><small title="${escape(item.description)}">${escape(item.description)}</small></span></label>`).join('') : '<p class="admin-empty">没有匹配的功能，请更换关键词或分类。</p>';
    selectionState();
  }
  get('recommendOptions').addEventListener('change', event => {
    const input = event.target.closest('input[data-recommend-id]');
    if (!input || !byId.has(input.value)) return;
    if (input.checked && selected.size < 4) selected.add(input.value);
    else if (!input.checked) selected.delete(input.value);
    else get('recommendFeedback').textContent = '最多推荐 4 项，请先取消一项。';
    selectionState(); notice('');
  });
  get('recommendSelected').addEventListener('click', event => {
    const button = event.target.closest('[data-remove-rec]');
    if (!button) return;
    const id = button.dataset.removeRec;
    selected.delete(id); selectionState(); get('recommendFeedback').textContent = ''; notice('');
    const input = [...get('recommendOptions').querySelectorAll('input')].find(input=>input.value===id);
    (input || get('recommendSearch')).focus();
  });
  get('recommendFilters').addEventListener('click', event => {
    const button = event.target.closest('[data-rec-group]'); if (!button) return;
    group = button.dataset.recGroup;
    for (const filter of get('recommendFilters').querySelectorAll('button')) filter.setAttribute('aria-pressed', String(filter===button));
    renderOptions();
  });
  get('recommendSearch').addEventListener('input', renderOptions);
  get('saveRecommendations').addEventListener('click', () => {
    try {config.saveSection('recommendedIds', [...selected]); get('recommendFeedback').textContent = ''; notice('推荐功能已保存，首页「推荐」已更新。');}
    catch(error) {get('recommendFeedback').textContent = error.message;}
  });
  get('resetRecommendations').addEventListener('click', () => {
    selected = new Set(config.read().recommendedIds); renderOptions(); get('recommendFeedback').textContent = ''; notice('已取消修改，恢复为上次保存的推荐。');
  });

  editor.beginDraft(config.read().slides);
  editor.onBusyChange(busy => {get('saveCarousel').disabled = busy;});
  get('saveCarousel').addEventListener('click', () => {
    if (editor.isBusy()) return;
    const slides = editor.validateDraft(); if (!slides) return;
    try {config.saveSection('slides', slides); notice('轮播已保存，首页轮播已更新。');}
    catch(error) {get('carouselSettingsFeedback').textContent = error.message;}
  });
  get('resetCarousel').addEventListener('click', () => {editor.beginDraft(config.read().slides); notice('已取消修改，恢复为上次保存的轮播。');});

  function renderNews() {
    const all = config.read().updates;
    const updates = all.filter(item => item.status === 'published' || item.status === 'unpublished');
    const publishedCount = updates.filter(item => item.status === 'published').length;
    const unpublishedCount = updates.length - publishedCount;
    const query = get('updatesSearch').value.trim().toLowerCase();
    const visible = updates.filter(item => item.title.toLowerCase().includes(query)).sort((a,b)=>b.date.localeCompare(a.date));
    get('updatesTable').innerHTML = visible.length ? visible.map(item=>{
      const published = item.status === 'published';
      const actions = published
        ? `<button type="button" class="admin-text-button" data-view-update="${escape(item.id)}" aria-label="查看${escape(item.title)}">查看</button><button type="button" class="admin-text-button" data-unpublish-update="${escape(item.id)}" aria-label="取消发布${escape(item.title)}">取消发布</button>`
        : `<button type="button" class="admin-text-button" data-view-update="${escape(item.id)}" aria-label="查看${escape(item.title)}">查看</button><button type="button" class="admin-text-button" data-publish-update="${escape(item.id)}" aria-label="重新发布${escape(item.title)}">发布</button>`;
      return `<tr><td><strong class="admin-news-title" title="${escape(item.title)}">${escape(item.title)}</strong><small class="admin-news-excerpt">${escape(item.body || '正文待完善')}</small></td><td><span class="admin-news-destination" title="${escape(destinationFor(item)?.label || '未设置')}">${escape(destinationFor(item)?.label || '未设置')}</span></td><td><span class="admin-state${published ? ' is-published' : ' is-unpublished'}">${published ? '已发布' : '取消发布'}</span></td><td><div class="admin-row-actions">${actions}<button type="button" class="admin-text-button is-danger" data-delete-update="${escape(item.id)}" aria-label="删除${escape(item.title)}">删除</button></div></td></tr>`;
    }).join('') : '<tr><td colspan="4" class="admin-empty">没有匹配的动态，可直接新增动态。</td></tr>';
    get('updatesSummary').textContent = `共 ${updates.length} 条动态 · 已发布 ${publishedCount} 条 · 取消发布 ${unpublishedCount} 条${visible.length!==updates.length?` · 当前显示 ${visible.length} 条`:''}`;
    get('newUpdate').disabled = all.length>=100;
  }
  get('updatesSearch').addEventListener('input', renderNews);
  function bodyCount() {get('updateBodyCount').textContent = `${get('updateBody').value.length} / 5000 字`;}
  function openEditor() {
    get('updateEditorTitle').textContent = '新增动态';
    get('updateTitle').value = '';
    get('updateDestination').value = '';
    get('updateBody').value = '';
    get('updateStateNote').textContent = '发布后立即展示在首页产品动态。';
    get('updateFeedback').textContent = '';
    for (const id of ['updateTitle','updateDestination','updateBody']) get(id).removeAttribute('aria-invalid');
    get('updatesListView').hidden = true; get('updateForm').hidden = false;
    notice(''); bodyCount(); get('updateTitle').focus();
  }
  function closeEditor() {get('updateForm').hidden = true; get('updatesListView').hidden = false; renderNews(); get('newUpdate').focus();}
  function openDetail(item, trigger = null) {
    detailTrigger = trigger;
    get('updateDetailTitle').textContent = item.title;
    get('updateDetailBody').textContent = item.body;
    get('updateDetailDestination').textContent = destinationFor(item)?.label || '未设置';
    get('updateDetailStatus').textContent = item.status === 'published' ? '已发布' : '取消发布';
    get('updatesListView').hidden = true; get('updateForm').hidden = true; get('updateDetailView').hidden = false;
    notice(''); get('closeUpdateDetail').focus();
  }
  get('closeUpdateDetail').addEventListener('click', () => {
    get('updateDetailView').hidden = true; get('updatesListView').hidden = false; renderNews();
    (detailTrigger?.isConnected ? detailTrigger : get('newUpdate')).focus(); detailTrigger = null;
  });
  get('newUpdate').addEventListener('click', () => openEditor());
  get('cancelUpdate').addEventListener('click', closeEditor);
  for (const id of ['updateTitle','updateDestination','updateBody']) get(id).addEventListener('input', () => {get(id).removeAttribute('aria-invalid'); get('updateFeedback').textContent=''; if(id==='updateBody')bodyCount();});
  function publishNews() {
    const latest=config.read().updates;
    const target=newsDestinations.find(target=>target.key===get('updateDestination').value);
    const now=new Date();
    const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const item={id:`news-${Date.now().toString(36)}-${++nextId}`,title:get('updateTitle').value.trim(),date,body:get('updateBody').value.trim(),status:'published',destination:target?{route:target.route,child:target.child}:null};
    const invalid = !item.title||item.title.length>60 ? ['updateTitle','请输入动态标题，最多 60 字。'] : get('updateDestination').value&&!target ? ['updateDestination','请选择有效的平台内功能。'] : !item.body||item.body.length>5000 ? ['updateBody','发布前请填写正文，最多 5000 字。'] : null;
    if (invalid) {get('updateFeedback').textContent=invalid[1];get(invalid[0]).setAttribute('aria-invalid','true');get(invalid[0]).focus();return;}
    latest.unshift(item);
    try {config.saveSection('updates',latest);get('updatesSearch').value='';closeEditor();notice('动态已发布，首页产品动态已同步更新。');}
    catch(error) {get('updateFeedback').textContent=error.message;}
  }
  function unpublishNews(id) {
    const latest=config.read().updates;
    const index=latest.findIndex(item=>item.id===id);
    if(index<0||latest[index].status!=='published') return;
    latest[index]={...latest[index],status:'unpublished'};
    try {config.saveSection('updates',latest);renderNews();notice('');showToast('已取消发布，首页已移除。');}
    catch(error) {notice(error.message);}
  }
  function publishExisting(id) {
    const latest=config.read().updates;
    const index=latest.findIndex(item=>item.id===id);
    if(index<0||latest[index].status!=='unpublished') return;
    const now=new Date();
    const date=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    latest[index]={...latest[index],status:'published',date};
    try {config.saveSection('updates',latest);renderNews();notice('');showToast('已重新发布，首页产品动态已同步更新。');}
    catch(error) {notice(error.message);}
  }
  get('updateForm').addEventListener('submit', event => {event.preventDefault();publishNews();});
  get('updatesTable').addEventListener('click', event => {
    const view=event.target.closest('[data-view-update]');
    const unpublish=event.target.closest('[data-unpublish-update]');
    const publish=event.target.closest('[data-publish-update]');
    const remove=event.target.closest('[data-delete-update]');
    if (view) {const item=config.read().updates.find(item=>item.id===view.dataset.viewUpdate);if(item) openDetail(item, view);}
    if (unpublish) {unpublishNews(unpublish.dataset.unpublishUpdate);}
    if (publish) {publishExisting(publish.dataset.publishUpdate);}
    if (remove) {
      const item=config.read().updates.find(item=>item.id===remove.dataset.deleteUpdate);if(!item)return;
      deleteId=item.id;deleteTrigger=remove;
      get('deleteUpdateDescription').textContent=`「${item.title}」删除后无法恢复，同时从首页移除。`;
      get('deleteUpdateFeedback').textContent='';get('deleteUpdateDialog').showModal();get('cancelDeleteUpdate').focus();
    }
  });
  get('cancelDeleteUpdate').addEventListener('click', () => get('deleteUpdateDialog').close());
  get('confirmDeleteUpdate').addEventListener('click', () => {
    if(!deleteId)return;
    try {config.saveSection('updates',config.read().updates.filter(item=>item.id!==deleteId));renderNews();get('deleteUpdateDialog').close();notice('动态已删除。');}
    catch(error) {get('deleteUpdateFeedback').textContent=error.message;}
  });
  get('deleteUpdateDialog').addEventListener('close', () => {deleteId=null;(deleteTrigger?.isConnected?deleteTrigger:get('newUpdate')).focus();deleteTrigger=null;});
  window.BaigePage.onDeactivate(() => {
    if(get('deleteUpdateDialog').open)get('deleteUpdateDialog').close();
    if(toastTimer){clearTimeout(toastTimer);toastTimer=null;}
    get('adminToast').classList.remove('is-visible');
  });
  window.BaigePage.onActivate(() => {renderNews();});
  renderOptions(); renderNews();
})();
