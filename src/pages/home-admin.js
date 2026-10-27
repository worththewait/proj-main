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
  let group = 'all', newsFilter = 'all', editingId = null, deleteId = null, deleteTrigger = null, detailTrigger = null;
  let nextId = 0;
  const notice = text => { get('adminNotice').textContent = text; };

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
    const updates = config.read().updates;
    const query = get('updatesSearch').value.trim().toLowerCase();
    const visible = updates.filter(item => (newsFilter==='all'||item.status===newsFilter) && item.title.toLowerCase().includes(query)).sort((a,b)=>b.date.localeCompare(a.date));
    get('updatesTable').innerHTML = visible.length ? visible.map(item=>`<tr><td><strong class="admin-news-title" title="${escape(item.title)}">${escape(item.title)}</strong><small class="admin-news-excerpt">${escape(item.body || '正文待完善')}</small></td><td><span class="admin-news-destination" title="${escape(destinationFor(item)?.label || '未设置')}">${escape(destinationFor(item)?.label || '未设置')}</span></td><td><span class="admin-state${item.status==='published'?' is-published':''}">${item.status==='published'?'已发布':'草稿'}</span></td><td><div class="admin-row-actions"><button type="button" class="admin-text-button" data-${item.status==='published'?'view':'edit'}-update="${escape(item.id)}" aria-label="${item.status==='published'?'查看':'编辑'}${escape(item.title)}">${item.status==='published'?'查看':'编辑'}</button><button type="button" class="admin-text-button is-danger" data-delete-update="${item.id}" aria-label="删除${escape(item.title)}">删除</button></div></td></tr>`).join('') : '<tr><td colspan="4" class="admin-empty">没有匹配的动态，可新增动态或调整筛选条件。</td></tr>';
    get('updatesSummary').textContent = `共 ${updates.length} 条动态 · 已发布 ${updates.filter(item=>item.status==='published').length} 条 · 草稿 ${updates.filter(item=>item.status==='draft').length} 条${visible.length!==updates.length?` · 当前显示 ${visible.length} 条`:''}`;
    get('newUpdate').disabled = updates.length>=100;
  }
  function setNewsFilter(value) {
    newsFilter = value;
    for (const filter of get('updatesFilters').querySelectorAll('button')) filter.setAttribute('aria-pressed',String(filter.dataset.newsFilter===value));
  }
  get('updatesFilters').addEventListener('click', event => {const button=event.target.closest('[data-news-filter]'); if (button) {setNewsFilter(button.dataset.newsFilter); renderNews();}});
  get('updatesSearch').addEventListener('input', renderNews);
  function bodyCount() {get('updateBodyCount').textContent = `${get('updateBody').value.length} / 5000 字`;}
  function openEditor(item) {
    if (item?.status === 'published') {openDetail(item); return;}
    editingId = item?.id || null;
    get('updateEditorTitle').textContent = item ? '编辑动态' : '新增动态';
    get('updateTitle').value = item?.title || '';
    get('updateDestination').value = item ? destinationFor(item)?.key || '' : '';
    get('updateBody').value = item?.body || '';
    get('publishUpdate').textContent = '发布动态';
    get('updateStateNote').textContent = '草稿不会显示在首页。';
    get('updateFeedback').textContent = '';
    for (const id of ['updateTitle','updateDestination','updateBody']) get(id).removeAttribute('aria-invalid');
    get('updatesListView').hidden = true; get('updateForm').hidden = false;
    notice(''); bodyCount(); get('updateTitle').focus();
  }
  function closeEditor() {get('updateForm').hidden = true; get('updatesListView').hidden = false; editingId=null; renderNews(); get('newUpdate').focus();}
  function openDetail(item, trigger = null) {
    detailTrigger = trigger;
    get('updateDetailTitle').textContent = item.title;
    get('updateDetailBody').textContent = item.body;
    get('updateDetailDestination').textContent = destinationFor(item)?.label || '未设置';
    get('updateDetailStatus').textContent = item.status === 'published' ? '已发布' : '草稿';
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
  function saveNews(status) {
    const latest=config.read().updates;
    if (editingId) {
      const current = latest.find(item => item.id === editingId);
      if (!current || current.status !== 'draft') {
        get('updateFeedback').textContent = current ? '这条动态已发布，不能再修改。请返回列表查看。' : '这条动态已删除，无法保存。请返回列表。';
        return;
      }
    }
    const target=newsDestinations.find(target=>target.key===get('updateDestination').value);
    const now=new Date();
    const date=status==='published' ? `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` : latest.find(item=>item.id===editingId)?.date;
    const item={id:editingId || `news-${Date.now().toString(36)}-${++nextId}`,title:get('updateTitle').value.trim(),date,body:get('updateBody').value.trim(),status,destination:target?{route:target.route,child:target.child}:null};
    const invalid = !item.title||item.title.length>60 ? ['updateTitle','请输入动态标题，最多 60 字。'] : get('updateDestination').value&&!target ? ['updateDestination','请选择有效的平台内功能。'] : item.body.length>5000 || (status==='published'&&!item.body) ? ['updateBody','发布前请填写正文，最多 5000 字。'] : null;
    if (invalid) {get('updateFeedback').textContent=invalid[1];get(invalid[0]).setAttribute('aria-invalid','true');get(invalid[0]).focus();return;}
    const index=latest.findIndex(update=>update.id===item.id);
    if (index>=0) latest[index]=item; else latest.unshift(item);
    try {config.saveSection('updates',latest);setNewsFilter('all');get('updatesSearch').value='';closeEditor();notice(status==='published'?'动态已发布，首页产品动态已同步更新。':'草稿已保存，不会展示在首页。');}
    catch(error) {get('updateFeedback').textContent=error.message;}
  }
  get('updateForm').addEventListener('submit', event => {event.preventDefault();saveNews('published');});
  get('saveUpdateDraft').addEventListener('click', () => saveNews('draft'));
  get('updatesTable').addEventListener('click', event => {
    const edit=event.target.closest('[data-edit-update]');
    const view=event.target.closest('[data-view-update]');
    const remove=event.target.closest('[data-delete-update]');
    if (edit) {const item=config.read().updates.find(item=>item.id===edit.dataset.editUpdate);if(item) {if(item.status==='published') openDetail(item, edit); else openEditor(item);}}
    if (view) {const item=config.read().updates.find(item=>item.id===view.dataset.viewUpdate);if(item) openDetail(item, view);}
    if (remove) {
      const item=config.read().updates.find(item=>item.id===remove.dataset.deleteUpdate);if(!item)return;
      deleteId=item.id;deleteTrigger=remove;
      get('deleteUpdateDescription').textContent=`「${item.title}」删除后无法恢复${item.status==='published'?'，同时从首页移除':''}。`;
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
  window.BaigePage.onDeactivate(() => {if(get('deleteUpdateDialog').open)get('deleteUpdateDialog').close();});
  window.BaigePage.onActivate(() => {renderNews();});
  renderOptions(); renderNews();
})();
