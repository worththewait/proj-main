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
  function refresh() {
    const updates = config.published();
    list.innerHTML = updates.length ? updates.slice(0,3).map(item=>`<button class="home-update-row" type="button" data-product-update="${item.id}"><time datetime="${item.date}">${item.date.slice(2)}</time><span>${escape(item.title)}</span>${icon('arrow')}</button>`).join('') + `<button class="home-updates-all" type="button" data-all-product-updates>查看全部产品动态${icon('arrow')}</button>` : '<p class="home-updates-empty">暂无产品动态</p>';
  }
  function show(items, source) {
    if (!items.length) return;
    trigger=source;
    shownIds=items.map(item=>item.id);
    title.textContent=items.length===1?items[0].title:'全部产品动态';
    content.innerHTML=items.map(item=>{
      const action=destinationFor(item);
      return `<article>${items.length>1?`<h3>${escape(item.title)}</h3>`:''}<p>${escape(item.body)}</p>${action?`<button type="button" class="home-update-detail-action" data-update-target="${item.id}">进入${escape(action.label)}${icon('arrow')}</button>`:''}</article>`;
    }).join('');
    if(!dialog.open)dialog.showModal();
  }
  function close() {if(dialog.open)dialog.close();}
  document.addEventListener('click',event=>{
    const row=event.target.closest('[data-product-update]');
    if(row) {const item=config.published().find(item=>item.id===row.dataset.productUpdate);if(item)show([item],row);return;}
    const all=event.target.closest('[data-all-product-updates]');
    if(all)show(config.published(),all);
  });
  content.addEventListener('click',event=>{
    const button=event.target.closest('[data-update-target]');if(!button || !dialog.open || !shownIds.includes(button.dataset.updateTarget))return;
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
