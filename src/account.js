(() => {
  "use strict";
  const root = document.querySelector("#accountRoot");
  if (!root) return;
  const { icon, escapeHtml } = window.BaigeUI;
  const account = { email: "admin@cimtec.net.cn", role: "超级管理员", organization: "中船综合院" };
  const feedback = { type: "使用建议", content: "" };
  const paths = {
    person: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v3Z"/>',
    bell: '<path d="M5 10a7 7 0 0 1 14 0v6l2 3H3l2-3Z M10 22h4 M12 1v2"/>',
    support: '<path d="M4 13v-2a8 8 0 0 1 16 0v2 M4 12H3a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h3v-6H4Z M20 12h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-3v-6h2Z M19 18a5 5 0 0 1-5 4h-2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6 M12 7h.01"/>',
    feedback: '<path d="M5 3h14v18H5Z M8 7h8 M8 11h5"/>',
    admin: '<rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8 M12 16v5 M7 12V9 M12 12V6 M17 12V8"/>',
    logout: '<path d="M10 3H4v18h6 M9 12h12 M16 7l5 5-5 5"/>',
  };
  const accountIcon = (name) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
  const avatar = '<span class="account-avatar" aria-hidden="true"><img src="./assets/baige-logo.svg" width="28" height="30" alt="" /></span>';
  const items = [
    ["profile", "person", "个人中心"], ["notifications", "bell", "通知提醒"],
    ["about", "info", "关于我们"], ["feedback", "feedback", "系统反馈"],
    ["admin", "admin", "后台系统"], ["logout", "logout", "退出登录"],
  ];
  root.innerHTML = `<button class="account-trigger" type="button" id="accountTrigger" aria-label="个人中心菜单" aria-haspopup="menu" aria-expanded="false" aria-controls="accountMenu" title="个人中心"><span class="account-trigger-copy"><strong>${escapeHtml(account.organization)}</strong><small>演示账号</small></span><span class="account-trigger-avatar" aria-hidden="true">${accountIcon("person")}</span></button>
    <div class="account-menu" id="accountPopover" hidden>
      <div class="account-summary">${avatar}<div class="account-summary-copy"><strong class="account-email">${escapeHtml(account.email)}</strong><p class="account-role">${escapeHtml(account.role)}</p></div></div>
      <div class="account-menu-items" id="accountMenu" role="menu" aria-label="账户操作">${items.map(([id, symbol, label]) => `<button class="account-menu-item" type="button" role="menuitem" tabindex="-1" data-account-action="${id}">${accountIcon(symbol)}<span>${label}</span></button>`).join("")}</div>
    </div>`;
  const trigger = root.querySelector("#accountTrigger");
  const popover = root.querySelector("#accountPopover");
  const menu = root.querySelector("#accountMenu");
  const menuItems = [...menu.querySelectorAll('[role="menuitem"]')];
  const supportTrigger = document.querySelector("#supportTrigger");
  const notificationTrigger = document.querySelector("#notificationTrigger");
  if (supportTrigger) supportTrigger.innerHTML = accountIcon("support");
  if (notificationTrigger) notificationTrigger.innerHTML = `${accountIcon("bell")}<span class="notification-dot" aria-hidden="true"></span>`;
  const noticeStore = window.BaigeNoticeStore;
  let selectedNoticeId = null;
  const noticeSpeakerIcon = '<svg class="notice-speaker-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/></svg>';
  const noticeEmptyIcon = '<svg class="notice-empty-icon" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="10" y="17" width="44" height="32" rx="4"/><path d="M10 36h12l4 6h12l4-6h12"/><circle cx="47" cy="18" r="10" fill="#f5f5f5"/><path d="m43.5 14.5 7 7m0-7-7 7"/></svg>';
  function refreshNoticeIndicator() {
    if (!notificationTrigger) return;
    const dot = notificationTrigger.querySelector(".notification-dot");
    const count = noticeStore ? noticeStore.unreadCount() : 0;
    if (dot) dot.hidden = count === 0;
    notificationTrigger.setAttribute("aria-label", count ? `通知提醒，${count}条未读` : "通知提醒，无未读通知");
  }
  refreshNoticeIndicator();
  let dialogTrigger = trigger;
  const dialog = document.createElement("dialog");
  dialog.id = "accountDialog";
  dialog.className = "account-dialog";
  dialog.setAttribute("aria-labelledby", "accountDialogTitle");
  dialog.setAttribute("aria-describedby", "accountDialogDescription");
  document.body.append(dialog);

  function closeMenu(restoreFocus = false) {
    popover.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    menuItems.forEach((item) => { item.tabIndex = -1; });
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }
  function focusItem(index) {
    menuItems.forEach((item, i) => { item.tabIndex = i === index ? 0 : -1; });
    menuItems[index].focus();
  }
  function openMenu(last = false) {
    popover.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    focusItem(last ? menuItems.length - 1 : 0);
  }
  trigger.addEventListener("click", () => {
    if (popover.hidden) openMenu();
    else closeMenu(true);
  });
  trigger.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openMenu(event.key === "ArrowUp");
  });
  menu.addEventListener("keydown", (event) => {
    const index = menuItems.indexOf(document.activeElement);
    let next;
    if (event.key === "ArrowDown") next = (index + 1) % menuItems.length;
    else if (event.key === "ArrowUp") next = (index - 1 + menuItems.length) % menuItems.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = menuItems.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault(); closeMenu(true); return;
    } else if (event.key === "Tab") { closeMenu(); return; }
    if (next !== undefined) { event.preventDefault(); focusItem(next); }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!popover.hidden && !root.contains(event.target)) closeMenu();
  });
  document.addEventListener("focusin", (event) => {
    if (!popover.hidden && !root.contains(event.target)) closeMenu();
  });
  // A click inside a child page moves focus to its iframe. No cross-document DOM access.
  window.addEventListener("blur", () => {
    requestAnimationFrame(() => {
      if (document.activeElement?.tagName === "IFRAME") closeMenu();
    });
  });
  window.addEventListener("hashchange", () => { closeMenu(); if (dialog.open) dialog.close(); });

  function renderDialog(title, description, content, footer) {
    dialog.className = "account-dialog";
    dialog.setAttribute("aria-labelledby", "accountDialogTitle");
    dialog.setAttribute("aria-describedby", "accountDialogDescription");
    dialog.innerHTML = `<header class="account-dialog-header"><h2 id="accountDialogTitle" tabindex="-1">${title}</h2><button class="icon-button" type="button" data-account-close aria-label="关闭">${icon("close")}</button></header>
      <div class="account-dialog-body"><p id="accountDialogDescription" class="account-dialog-intro">${description}</p>${content}</div>
      <footer class="account-dialog-footer">${footer || '<button class="primary-button" type="button" data-account-close>知道了</button>'}</footer>`;
  }
  function renderNoticePanels() {
    const items = noticeStore ? noticeStore.active() : [];
    if (selectedNoticeId && !items.some((item) => item.id === selectedNoticeId)) selectedNoticeId = null;
    const list = dialog.querySelector("#noticeList");
    const detail = dialog.querySelector("#noticeDetail");
    if (!list || !detail) return;
    list.innerHTML = items.length
      ? items.map((item) => `<button class="notice-list-item${item.id === selectedNoticeId ? " is-active" : ""}" type="button" data-notice-id="${escapeHtml(item.id)}" aria-pressed="${item.id === selectedNoticeId}">${noticeSpeakerIcon}<span class="notice-list-copy"><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.createdAt)}</small></span></button>`).join("")
      : '<p class="notice-list-empty">暂无通知</p>';
    if (!selectedNoticeId) {
      detail.innerHTML = `<div class="notice-detail-empty">${noticeEmptyIcon}<p>无数据</p></div>`;
      return;
    }
    const item = items.find((entry) => entry.id === selectedNoticeId);
    detail.innerHTML = item
      ? `<h3>${escapeHtml(item.title)}</h3><div class="notice-detail-content">${escapeHtml(item.content)}</div>`
      : `<div class="notice-detail-empty">${noticeEmptyIcon}<p>无数据</p></div>`;
  }
  function openNoticeDialog() {
    selectedNoticeId = null;
    if (noticeStore) noticeStore.markAllRead();
    refreshNoticeIndicator();
    dialog.className = "account-dialog notice-dialog";
    dialog.setAttribute("aria-labelledby", "noticeDialogTitle");
    dialog.removeAttribute("aria-describedby");
    dialog.innerHTML = `<header class="notice-dialog-head"><h2 id="noticeDialogTitle" tabindex="-1">通知提醒</h2><button class="notice-dialog-close" type="button" data-account-close aria-label="关闭">${icon("close")}</button></header>
      <div class="notice-dialog-body"><aside class="notice-list" id="noticeList" aria-label="通知列表"></aside><section class="notice-detail" id="noticeDetail" aria-live="polite"></section></div>
      <footer class="notice-dialog-footer"><button class="secondary-button" type="button" data-account-close>取消</button><button class="primary-button" type="button" data-account-close>确认</button></footer>`;
    renderNoticePanels();
    if (!dialog.open) dialog.showModal();
    dialog.querySelector("#noticeDialogTitle")?.focus({ preventScroll: true });
  }
  function openDialog(action, source = trigger) {
    dialogTrigger = source;
    closeMenu();
    if (action === "admin") {
      window.location.href = "./admin.html";
      return;
    }
    if (action === "profile") {
      renderDialog("个人中心", "查看当前演示账户的基本信息。", `<dl class="account-profile"><div><dt>登录账号</dt><dd>${escapeHtml(account.email)}</dd></div><div><dt>用户角色</dt><dd>${escapeHtml(account.role)}</dd></div><div><dt>所属单位</dt><dd>${escapeHtml(account.organization)}</dd></div></dl><p class="account-notice">当前账号与角色为原型演示信息，实际账户资料待接入。</p>`);
    } else if (action === "notifications") {
      openNoticeDialog();
      return;
    } else if (action === "support") {
      renderDialog("客服帮助", "在这里查看使用指引，或记录问题与建议。", '<dl class="account-help-list"><div><dt>如何开始问答？</dt><dd>在首页输入问题后发送，即可进入对话；选择知识库问答，可指定行业、企业或部门知识库。</dd></div><div><dt>如何设置推荐功能？</dt><dd>从个人中心进入「后台系统」，打开「自定义界面」，在「推荐功能」中最多选择 4 项并保存。</dd></div><div><dt>功能无法使用怎么办？</dt><dd>在「了解平台功能」查看开通状态，未开通项可申请权限。</dd></div></dl><p class="account-notice">当前为客服帮助演示，尚未接入人工在线客服。系统反馈仅在原型内演示，不实际发送。</p>', '<button class="secondary-button" type="button" data-account-close>关闭</button><button class="primary-button" type="button" data-account-feedback>系统反馈</button>');
    } else if (action === "about") {
      renderDialog("关于我们", "百舸 · 让知识连接工作", `<div class="account-about-brand">${avatar}<div><strong>百舸数智平台</strong><small>中船综合院</small></div></div><p class="account-about-copy">汇集知识问答、知识资源、写作与研究工具，为船舶行业工作提供统一的数智服务入口。</p>`);
    } else if (action === "feedback") {
      renderDialog("系统反馈", "告诉我们使用中遇到的问题或建议。", `<form class="account-form" id="accountFeedbackForm" novalidate><label class="account-field"><span>反馈类型</span><select id="accountFeedbackType" name="type">${["使用建议", "功能问题", "界面体验", "其他"].map((type) => `<option${feedback.type === type ? " selected" : ""}>${type}</option>`).join("")}</select></label><label class="account-field"><span class="account-field-label"><span>反馈内容（必填）</span><small id="accountFeedbackCount">${feedback.content.length} / 1000</small></span><textarea id="accountFeedbackContent" name="content" required maxlength="1000" placeholder="请描述遇到的问题、操作步骤或改进建议" aria-describedby="accountFeedbackHint accountFeedbackStatus">${escapeHtml(feedback.content)}</textarea></label><p class="account-feedback-hint" id="accountFeedbackHint">原型演示，反馈内容不会实际发送。</p><p class="account-feedback-status" id="accountFeedbackStatus" role="status" hidden></p></form>`, '<button class="secondary-button" type="button" data-account-close>取消</button><button class="primary-button" type="submit" form="accountFeedbackForm">提交反馈</button>');
    } else if (action === "logout") {
      renderDialog("退出登录", "确认退出当前演示账户？", '<p class="account-exit-message">此操作仅演示退出登录流程，可随时返回演示。</p>', '<button class="secondary-button" type="button" data-account-close>取消</button><button class="primary-button" type="button" data-account-exit>确认退出</button>');
    }
    if (!dialog.open) dialog.showModal();
    const initial = action === "feedback" ? dialog.querySelector("#accountFeedbackType") : dialog.querySelector("#accountDialogTitle");
    initial.focus({ preventScroll: true });
  }
  menu.addEventListener("click", (event) => {
    const item = event.target.closest("[data-account-action]");
    if (item) openDialog(item.dataset.accountAction);
  });
  supportTrigger?.addEventListener("click", () => openDialog("support", supportTrigger));
  notificationTrigger?.addEventListener("click", () => openDialog("notifications", notificationTrigger));
  dialog.addEventListener("click", (event) => {
    const notice = event.target.closest("[data-notice-id]");
    if (notice) {
      selectedNoticeId = notice.dataset.noticeId;
      renderNoticePanels();
      dialog.querySelector(".notice-list-item.is-active")?.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest("[data-account-close]")) dialog.close();
    else if (event.target.closest("[data-account-feedback]")) openDialog("feedback", dialogTrigger);
    else if (event.target.closest("[data-account-exit]")) {
      renderDialog("已退出演示", "退出登录流程演示已完成。", '<p class="account-exit-message">点击下方按钮返回平台，继续查看原型。</p>', '<button class="primary-button" type="button" data-account-close>返回演示</button>');
      dialog.querySelector("[data-account-close]").focus({ preventScroll: true });
    }
  });
  window.addEventListener("storage", (event) => {
    if (event.key && !event.key.startsWith("baige.notice-center")) return;
    refreshNoticeIndicator();
    if (dialog.open && dialog.classList.contains("notice-dialog")) renderNoticePanels();
  });
  dialog.addEventListener("close", () => { (dialogTrigger?.isConnected ? dialogTrigger : trigger).focus({ preventScroll: true }); });
  dialog.addEventListener("input", (event) => {
    if (event.target.id !== "accountFeedbackContent") return;
    feedback.content = event.target.value;
    dialog.querySelector("#accountFeedbackCount").textContent = `${feedback.content.length} / 1000`;
    event.target.removeAttribute("aria-invalid");
    dialog.querySelector("#accountFeedbackStatus").hidden = true;
  });
  dialog.addEventListener("change", (event) => {
    if (event.target.id === "accountFeedbackType") feedback.type = event.target.value;
  });
  dialog.addEventListener("submit", (event) => {
    if (event.target.id !== "accountFeedbackForm") return;
    event.preventDefault();
    const input = dialog.querySelector("#accountFeedbackContent");
    const status = dialog.querySelector("#accountFeedbackStatus");
    const invalid = !input.value.trim();
    status.hidden = false;
    status.classList.toggle("is-error", invalid);
    status.textContent = invalid ? "请填写反馈内容后再提交。" : "已完成反馈提交演示，内容未实际发送。";
    input.setAttribute("aria-invalid", String(invalid));
    if (invalid) input.focus();
  });
})();
