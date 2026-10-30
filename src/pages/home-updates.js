(() => {
  'use strict';
  const {escapeHtml: escape, icon} = window.BaigeUI;
  const config = window.BaigeHomeConfig;
  const dialog = document.querySelector('#productUpdatesDialog');
  const title = document.querySelector('#productUpdateDialogTitle');
  const content = document.querySelector('#productUpdateContent');
  const list = document.querySelector('#homeUpdatesList');
  const destinations = config.updateDestinations();
  const destinationFor = item => item.destination && destinations.find(target=>target.route===item.destination.route && target.child===item.destination.child);
  let trigger = null;
  let shownIds = [];
  let mode = 'detail';
  let visibleCount = 10;
  let expandedId = null;
  const batchSize = 10;
  function refresh() {
    const updates = config.published();
    list.innerHTML = updates.length ? updates.slice(0,3).map(item=>`<button class="home-update-row" type="button" data-product-update="${item.id}"><time datetime="${item.date}">${item.date.slice(2)}</time><span>${escape(item.title)}</span>${icon('arrow')}</button>`).join('') + `<button class="home-updates-all" type="button" data-all-product-updates>查看全部产品动态${icon('arrow')}</button>` : '<p class="home-updates-empty">暂无产品动态</p>';
  }
  function setMode(next) {
    mode=next;
    dialog.dataset.mode=next;
    content.dataset.mode=next;
  }
  function actionMarkup(item) {
    const action=destinationFor(item);
    return action?`<button type="button" class="home-update-detail-action" data-update-target="${escape(item.id)}">进入${escape(action.label)}${icon('arrow')}</button>`:'';
  }
  function open(source) {
    trigger=source;
    if(!dialog.open)dialog.showModal();
    content.scrollTop=0;
  }
  function showDetail(item, source) {
    setMode('detail');
    shownIds=[item.id];
    title.textContent=item.title;
    content.innerHTML=`<article><time datetime="${escape(item.date)}">${escape(item.date)}</time><p>${escape(item.body)}</p>${actionMarkup(item)}</article>`;
    open(source);
  }
  function renderAll() {
    const items=config.published();
    const visible=items.slice(0,visibleCount);
    shownIds=visible.map(item=>item.id);
    if(!shownIds.includes(expandedId))expandedId=null;
    let lastMonth='';
    const entries=visible.map(item=>{
      const month=item.date.slice(0,7);
      const heading=month!==lastMonth?`<h3 class="home-update-month">${escape(month.slice(0,4))}年${Number(month.slice(5))}月</h3>`:'';
      lastMonth=month;
      const expanded=expandedId===item.id;
      const plain=item.body.replace(/\s+/g,' ').trim();
      const characters=Array.from(plain);
      const preview=characters.slice(0,160).join('')+(characters.length>160?'…':'');
      const panelId=`product-update-body-${item.id}`;
      return `${heading}<article data-update-id="${escape(item.id)}"><time datetime="${escape(item.date)}">${escape(item.date)}</time><h4 class="home-update-entry-title">${escape(item.title)}</h4>${expanded?'':`<p class="home-update-preview">${escape(preview)}</p>`}<button type="button" class="home-update-expand" data-expand-update="${escape(item.id)}" aria-expanded="${expanded}" aria-controls="${escape(panelId)}" aria-label="${expanded?'收起':'展开'}：${escape(item.title)}">${expanded?'收起全文':'展开全文'}</button><div id="${escape(panelId)}" ${expanded?'class="home-update-body"':'hidden'}>${expanded?`<p>${escape(item.body)}</p>${actionMarkup(item)}`:''}</div></article>`;
    }).join('');
    content.innerHTML=entries+`<div class="home-update-stream-footer"><p role="status">已显示 ${visible.length} 条，共 ${items.length} 条动态</p>${visible.length<items.length?'<button type="button" class="home-update-load" data-load-earlier-updates>加载更早动态</button>':'<span class="home-update-stream-end">已显示全部动态</span>'}</div>`;
  }
  function showAll(source) {
    if(!config.published().length)return;
    setMode('all');
    visibleCount=batchSize;
    expandedId=null;
    title.textContent='全部产品动态';
    renderAll();
    open(source);
  }
  function entryButton(id) {
    return Array.from(content.querySelectorAll('[data-expand-update]')).find(button=>button.dataset.expandUpdate===id);
  }
  function close() {if(dialog.open)dialog.close();}
  document.addEventListener('click',event=>{
    const row=event.target.closest('[data-product-update]');
    if(row) {const item=config.published().find(item=>item.id===row.dataset.productUpdate);if(item)showDetail(item,row);return;}
    const all=event.target.closest('[data-all-product-updates]');
    if(all)showAll(all);
  });
  content.addEventListener('click',event=>{
    if(!dialog.open)return;
    const load=event.target.closest('[data-load-earlier-updates]');
    if(load && mode==='all') {
      if(shownIds.length>=config.published().length)return;
      const previousCount=shownIds.length;
      const scrollTop=content.scrollTop;
      visibleCount+=batchSize;
      renderAll();
      content.scrollTop=scrollTop;
      const next=entryButton(shownIds[previousCount]);
      if(next) {
        next.focus({preventScroll:true});
        next.scrollIntoView({block:'nearest',inline:'nearest'});
      }
      return;
    }
    const expand=event.target.closest('[data-expand-update]');
    if(expand && mode==='all') {
      const id=expand.dataset.expandUpdate;
      if(!shownIds.includes(id)||!config.published().some(item=>item.id===id))return;
      const scrollTop=content.scrollTop;
      const top=expand.getBoundingClientRect().top;
      expandedId=expandedId===id?null:id;
      renderAll();
      content.scrollTop=scrollTop;
      const next=entryButton(id);
      if(next) {
        content.scrollTop+=next.getBoundingClientRect().top-top;
        next.focus({preventScroll:true});
      }
      return;
    }
    const button=event.target.closest('[data-update-target]');if(!button || !dialog.open || !shownIds.includes(button.dataset.updateTarget))return;
    if(mode==='all' && expandedId!==button.dataset.updateTarget)return;
    const item=config.published().find(item=>item.id===button.dataset.updateTarget);
    const action=item && destinationFor(item);
    if(!action)return;
    close();
    if(action.route==='home') {document.querySelector('#featureDirectory').scrollIntoView({block:'start'});document.querySelector('#featureDirectory').focus({preventScroll:true});}
    else window.BaigeHomeAccess.navigate(action.route,action.child,trigger);
  });
  document.querySelector('#closeProductUpdates').addEventListener('click',close);
  document.querySelector('#dismissProductUpdates').addEventListener('click',close);
  dialog.addEventListener('close',()=>trigger?.isConnected&&trigger.focus({preventScroll:true}));
  window.BaigePage.onDeactivate(()=>{trigger=null;close();});
  window.addEventListener('storage',event=>{if(event.key===config.storageKey||event.key===null){close();refresh();}});
  window.BaigeHomeUpdates=Object.freeze({refresh});
  refresh();
})();
