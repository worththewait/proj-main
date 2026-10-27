(() => {
  "use strict";
  const {escapeHtml, icon} = window.BaigeUI;
  const config = window.BaigeHomeConfig;
  const access = window.BaigeHomeAccess;
  const page = window.BaigePage;
  const question = document.querySelector('#quickQuestion');
  const quickForm = document.querySelector('#quickQuestionForm');
  const sendButton = document.querySelector('#quickQuestionSend');
  const questionFeedback = document.querySelector('#quickQuestionFeedback');
  const commonFunctions = document.querySelector('#commonFunctions');
  const commonTabs = document.querySelector('#commonFunctionTabs');
  const candidateById = new Map(config.catalog.map(item=>[item.id,item]));
  let settings = config.read();
  let selectedCommonTab = 'mine', composing = false;
  const maxQuestionLength = 16000;
  const defaultIds = config.defaults().recommendedIds;

  function myFunctions() {
    const legacy = config.readLegacy();
    const legacyIds = Array.isArray(legacy?.commonIds) ? legacy.commonIds.filter(id=>candidateById.has(id)) : [];
    return {ids:[...new Set([...legacyIds,...defaultIds])].slice(0,4), cards:legacy?.cards||{}};
  }
  function renderCommonFunctions() {
    for (const tab of commonTabs.querySelectorAll('[data-home-tab]')) tab.setAttribute('aria-pressed',String(tab.dataset.homeTab===selectedCommonTab));
    const mine=myFunctions();
    const visibleIds=selectedCommonTab==='mine'?mine.ids:settings.recommendedIds;
    commonFunctions.setAttribute('aria-label',selectedCommonTab==='mine'?'我的常用入口':'推荐功能入口');
    commonFunctions.setAttribute('data-count',String(visibleIds.length));
    commonFunctions.innerHTML=visibleIds.map(id=>{
      const item=candidateById.get(id);
      const custom=selectedCommonTab==='mine'?mine.cards[id]||{}:{};
      const name=typeof custom.text==='string'&&custom.text.trim()&&custom.text.trim().length<=16?custom.text.trim():item.name;
      const state=access.status(item.route,item.child);
      const action={granted:'进入功能',locked:'申请权限',pending:'查看申请'}[state];
      const status=state==='granted'?'':`<span class="home-access-tag${state==='pending'?' is-pending':''}">${state==='pending'?'待审批':'需申请'}</span>`;
      const image=window.BaigeHomeCardImages.isSafeImage(custom.image);
      const graphic=image?`<img src="${escapeHtml(custom.image)}" alt="" width="48" height="48">`:(window.BaigeDirectoryIcons?.icon(item.icon)||icon(item.icon));
      return `<button class="home-common-card" type="button" data-tone="${item.tone}" data-home-route="${escapeHtml(item.route)}" data-home-child="${escapeHtml(item.child)}" aria-label="${escapeHtml(name)}，${action}"><span class="home-shortcut-icon${image?' is-custom':''}">${graphic}</span><span class="home-shortcut-name">${escapeHtml(name)}${status}</span><span class="home-shortcut-arrow" aria-hidden="true">${icon('arrow')}</span></button>`;
    }).join('') || '<p class="home-recommend-empty">暂未配置推荐功能。</p>';
  }
  function refresh() {
    settings=config.read();
    renderCommonFunctions();
    window.BaigeHomeCarousel?.setSlides(settings.slides);
  }
  const introTitle=document.querySelector('#dashboardIntroTitle');
  introTitle.textContent='专业问题找百舸';
  introTitle.innerHTML='专业问题<span>找百舸</span>';
  document.querySelector('#dashboardIntroDescription').textContent='输入您的问题，百舸为您解答';
  question.placeholder='输入您的问题，百舸为您解答';
  window.BaigeHomeKnowledge?.setPrompt(question.placeholder);
  function updateQuestion() {
    sendButton.disabled = !question.value.trim();
    questionFeedback.textContent = "";
  }

  function submitQuestion(event) {
    event.preventDefault();
    if (composing) return;
    const text = question.value.trim();
    if (!text) {
      questionFeedback.textContent = "请输入问题后再发送。";
      question.focus();
      return;
    }
    if (question.value.length > maxQuestionLength) {
      questionFeedback.textContent = "问题不能超过 16000 个字符，请精简后发送。";
      question.focus();
      return;
    }
    if (!access.canOpen("qa", "对话")) {
      access.navigate("qa", "对话", sendButton);
      return;
    }
    if (window.parent === window) {
      questionFeedback.innerHTML = '请从平台首页使用快捷问答，当前问题已保留。<a href="../index.html#home" target="_blank" rel="noopener">打开平台首页</a>';
      return;
    }
    // Keep question text out of URLs and persistent storage.
    page.navigate("qa", "对话", { question: text, ...window.BaigeHomeKnowledge?.getQuestionOptions() });
  }

  question.addEventListener("input", updateQuestion);
  question.addEventListener("compositionstart", () => { composing = true; });
  question.addEventListener("compositionend", () => { composing = false; });
  question.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || composing || event.keyCode === 229) return;
    submitQuestion(event);
  });
  quickForm.addEventListener("submit", submitQuestion);
  commonTabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-home-tab]");
    if (!tab || !["mine", "recommended"].includes(tab.dataset.homeTab)) return;
    selectedCommonTab = tab.dataset.homeTab;
    renderCommonFunctions();
  });

  access.onChange(renderCommonFunctions);
  window.addEventListener('storage',event=>{if(event.key===config.storageKey||event.key==='baige.homepage.v1'||event.key===null)refresh();});
  window.BaigeHomeDashboard=Object.freeze({refresh});
  updateQuestion();refresh();
})();
