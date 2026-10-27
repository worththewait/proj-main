(() => {
  'use strict';
  const model = window.BaigeHomeCarouselModel;
  const {escapeHtml, icon} = window.BaigeUI;
  const access = window.BaigeHomeAccess;
  const root = document.querySelector('#homeCarousel');
  const link = document.querySelector('#homeCarouselLink');
  const previous = document.querySelector('#homeCarouselPrevious');
  const next = document.querySelector('#homeCarouselNext');
  const dots = document.querySelector('#homeCarouselDots');
  const toggle = document.querySelector('#homeCarouselToggle');
  const status = document.querySelector('#homeCarouselStatus');
  const controls = document.querySelector('#homeCarouselControls');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const art = {ship: '../assets/baige-hero-v2.png', knowledge: '../assets/carousel-knowledge.svg', tools: '../assets/carousel-tools.svg'};
  let slides = model.defaults(), index = 0, timer = null;
  let hovered = false, focused = false, active = true, paused = media.matches;

  function safeImage(slide) { return window.BaigeHomeCardImages.isSafeImage(slide.image); }
  function destination(slide) { return model.destinations().find(item => item.route === slide.route && item.child === slide.child); }
  function actionText(slide) {
    const label = destination(slide)?.label || '功能';
    const state = access?.status ? access.status(slide.route, slide.child) : window.BaigePermissions.canOpen(slide.route, slide.child) ? 'granted' : 'locked';
    return state === 'locked' ? `申请使用${label}` : state === 'pending' ? '查看权限申请' : `进入${label}`;
  }
  function contentMarkup(slide) {
    const source = safeImage(slide) ? slide.image : art[slide.art] || art.ship;
    const phrases = slide.title.split('，');
    const headline = phrases.map((phrase, i) => `<span class="home-carousel-title-phrase">${escapeHtml(phrase)}${i < phrases.length - 1 ? '，' : ''}</span>`).join('');
    return `<span class="home-update-feature-copy"><strong>${headline}</strong>${slide.description ? `<span class="home-carousel-description">${escapeHtml(slide.description)}</span>` : ''}<span class="home-update-feature-action">${escapeHtml(actionText(slide))}${icon('arrow')}</span></span><img src="${escapeHtml(source)}" alt="" decoding="async">`;
  }
  function previewMarkup(slide) {
    const theme = Object.hasOwn(art, slide.art) ? slide.art : 'ship';
    return `<div class="home-update-feature home-carousel-preview-content${safeImage(slide) ? ' is-custom' : ''}" data-art="${theme}">${contentMarkup(slide)}</div>`;
  }
  // The independent settings page shares the preview without mounting a player.
  if (!root) {window.BaigeHomeCarousel = Object.freeze({previewMarkup}); return;}
  function canPlay() { return slides.length > 1 && active && !paused && !hovered && !focused && !document.hidden; }
  function syncTimer() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    const toggleLabel = paused ? '播放轮播' : '暂停轮播';
    // Hover/focus may happen between pointer-down and click. Keep the icon node
    // stable then, otherwise replacing that target can swallow the first click.
    if (toggle.getAttribute('aria-label') !== toggleLabel || !toggle.innerHTML) {
      toggle.setAttribute('aria-label', toggleLabel);
      toggle.setAttribute('title', toggleLabel);
      toggle.innerHTML = paused ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3"/></svg>';
    }
    status.setAttribute('aria-live', canPlay() ? 'off' : 'polite');
    if (canPlay()) timer = setInterval(() => {
      // Modal editing and knowledge selection must not animate behind the dialog.
      if (!document.querySelector('dialog[open]')) select(index + 1);
    }, 5000);
  }
  function render() {
    const slide = slides[index];
    link.innerHTML = contentMarkup(slide);
    link.setAttribute('data-art', slide.art);
    link.classList.toggle('is-custom', safeImage(slide));
    link.setAttribute('aria-label', `${slide.title}，${actionText(slide)}`);
    status.textContent = `第 ${index + 1} 张，共 ${slides.length} 张`;
    for (const button of dots.querySelectorAll('button')) button.setAttribute('aria-current', String(Number(button.dataset.carouselIndex) === index));
    controls.hidden = slides.length < 2;
    previous.disabled = next.disabled = slides.length < 2;
    syncTimer();
  }
  function select(value) { index = (value % slides.length + slides.length) % slides.length; render(); }
  function setSlides(value) {
    slides = model.validate(value) || model.defaults();
    index = 0;
    dots.innerHTML = slides.map((slide, i) => `<button type="button" class="home-carousel-dot" data-carousel-index="${i}" aria-label="切换到第 ${i + 1} 张：${escapeHtml(slide.title)}" aria-current="${i === 0}"></button>`).join('');
    render();
  }
  previous.addEventListener('click', () => select(index - 1));
  next.addEventListener('click', () => select(index + 1));
  dots.addEventListener('click', event => {
    const button = event.target.closest('[data-carousel-index]');
    if (!button) return;
    const value = Number(button.dataset.carouselIndex);
    if (Number.isInteger(value) && value >= 0 && value < slides.length) select(value);
  });
  toggle.addEventListener('click', () => {paused = !paused; syncTimer();});
  link.addEventListener('click', () => access.navigate(slides[index].route, slides[index].child, link));
  root.addEventListener('mouseenter', () => {hovered = true; syncTimer();});
  root.addEventListener('mouseleave', () => {hovered = false; syncTimer();});
  root.addEventListener('focusin', () => {focused = true; syncTimer();});
  root.addEventListener('focusout', event => {if (!root.contains(event.relatedTarget)) {focused = false; syncTimer();}});
  root.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault(); select(index + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  document.addEventListener('visibilitychange', syncTimer);
  media.addEventListener('change', event => {if (event.matches) paused = true; syncTimer();});
  access.onChange(render);
  window.BaigePage.onDeactivate(() => {active = false; hovered = focused = false; syncTimer();});
  window.BaigeHomeCarousel = Object.freeze({setSlides, previewMarkup, activate() {active = true; syncTimer();}});
  setSlides(slides);
})();
