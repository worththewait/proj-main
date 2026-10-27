(() => {
  'use strict';
  const model = window.BaigeHomeCarouselModel;
  const images = window.BaigeHomeCardImages;
  const {escapeHtml} = window.BaigeUI;
  const get = id => document.querySelector(`#${id}`);
  const list = get('carouselSlideList');
  if (!list) return;
  const count = get('carouselSlideCount');
  const title = get('carouselSlideTitle');
  const description = get('carouselSlideDescription');
  const destination = get('carouselSlideDestination');
  const upload = get('carouselSlideUpload');
  const preview = get('carouselSlidePreview');
  const feedback = get('carouselSettingsFeedback');
  const imageNote = get('carouselSlideImageNote');
  const add = get('addCarouselSlide');
  const remove = get('deleteCarouselSlide');
  const moveUp = get('moveCarouselSlideUp');
  const moveDown = get('moveCarouselSlideDown');
  const clearImage = get('clearCarouselSlideImage');
  const choices = model.destinations();
  const byKey = new Map(choices.map(choice => [choice.key, choice]));
  const busyListeners = new Set();
  const pending = new Map();
  let draft = [];
  let selectedId = '';
  let generation = 0;
  let nextId = 0;
  const selected = () => draft.find(slide => slide.id === selectedId);
  const isBusy = () => pending.size > 0;
  const notifyBusy = () => busyListeners.forEach(callback => callback(isBusy()));

  destination.innerHTML = choices.map(choice => `<option value="${escapeHtml(choice.key)}">${escapeHtml(choice.label)}</option>`).join('');

  function updateActions() {
    const index = draft.findIndex(slide => slide.id === selectedId);
    count.textContent = `${draft.length} / ${model.limits.maxSlides} 张`;
    add.disabled = draft.length >= model.limits.maxSlides;
    remove.disabled = draft.length <= 1;
    moveUp.disabled = index <= 0;
    moveDown.disabled = index === -1 || index >= draft.length - 1;
    clearImage.disabled = !selected()?.image && !pending.has(selectedId);
  }
  function drawPreview() {
    const slide = selected();
    preview.innerHTML = slide ? window.BaigeHomeCarousel.previewMarkup(slide) : '';
  }
  function drawImageState() {
    imageNote.textContent = pending.has(selectedId) ? '正在处理图片，请稍候…' : selected()?.image ? '已使用自定义图片，保存后生效。' : '当前使用系统默认配图。';
    updateActions();
  }
  function drawList() {
    list.innerHTML = draft.map((slide, index) => `<button type="button" data-carousel-slide="${escapeHtml(slide.id)}" aria-pressed="${slide.id === selectedId}" aria-label="编辑第 ${index + 1} 张：${escapeHtml(slide.title || '未填写标题')}"><small>第 ${index + 1} 张</small><span data-carousel-list-title="${escapeHtml(slide.id)}">${escapeHtml(slide.title || '未填写标题')}</span></button>`).join('');
    updateActions();
  }
  function drawFields() {
    const slide = selected();
    if (!slide) return;
    title.value = slide.title;
    description.value = slide.description;
    destination.value = JSON.stringify([slide.route, slide.child]);
    for (const field of [title, description, destination, upload]) field.removeAttribute('aria-invalid');
    drawPreview();
    drawImageState();
  }
  function beginDraft(slides) {
    generation++;
    pending.clear();
    upload.value = '';
    draft = model.clone(Array.isArray(slides) && slides.length ? slides : model.defaults());
    selectedId = draft[0].id;
    feedback.textContent = '';
    drawList();
    drawFields();
    notifyBusy();
  }
  function captureFields() {
    const slide = selected();
    if (!slide) return false;
    slide.title = title.value;
    slide.description = description.value;
    const choice = byKey.get(destination.value);
    if (!choice) return false;
    slide.route = choice.route;
    slide.child = choice.child;
    return true;
  }
  function editFields(event) {
    event?.target?.removeAttribute('aria-invalid');
    const validChoice = captureFields();
    if (!validChoice) {
      destination.setAttribute('aria-invalid', 'true');
      feedback.textContent = '请选择平台内部功能，不支持外部网址。';
    } else {
      destination.removeAttribute('aria-invalid');
      feedback.textContent = '';
    }
    const label = list.querySelector(`[data-carousel-list-title="${selectedId}"]`);
    if (label) label.textContent = selected()?.title || '未填写标题';
    const button = list.querySelector(`[data-carousel-slide="${selectedId}"]`);
    button?.setAttribute('aria-label', `编辑第 ${draft.findIndex(slide => slide.id === selectedId) + 1} 张：${selected()?.title || '未填写标题'}`);
    drawPreview();
  }
  function validateDraft() {
    if (isBusy()) { feedback.textContent = '图片正在处理，请稍候再保存。'; upload.focus(); return null; }
    if (!captureFields()) { feedback.textContent = '请选择平台内部功能，不支持外部网址。'; destination.setAttribute('aria-invalid', 'true'); destination.focus(); return null; }
    const valid = model.validate(draft);
    if (valid) return valid;
    const invalid = draft.find(slide => !model.validate([slide]));
    if (invalid) {
      selectedId = invalid.id;
      drawList(); drawFields();
      let field = destination;
      if (!invalid.title.trim() || invalid.title.trim().length > model.limits.maxTitle) { feedback.textContent = `请输入 1 至 ${model.limits.maxTitle} 个字符的轮播标题。`; field = title; }
      else if (invalid.description.trim().length > model.limits.maxDescription) { feedback.textContent = `轮播说明不能超过 ${model.limits.maxDescription} 个字符。`; field = description; }
      else if (invalid.image && !images.isSafeImage(invalid.image)) { feedback.textContent = '轮播图片无效，请重新上传图片。'; field = upload; }
      else feedback.textContent = '请为轮播图选择有效的平台内部功能。';
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    } else feedback.textContent = `请保留 1 至 ${model.limits.maxSlides} 张有效轮播图。`;
    return null;
  }
  function selectSlide(id) {
    if (!draft.some(slide => slide.id === id)) return;
    captureFields();
    selectedId = id;
    feedback.textContent = '';
    drawList(); drawFields();
    list.querySelector(`[data-carousel-slide="${selectedId}"]`)?.focus({preventScroll: true});
  }
  function reorder(offset) {
    captureFields();
    const index = draft.findIndex(slide => slide.id === selectedId);
    const target = index + offset;
    if (index < 0 || target < 0 || target >= draft.length) return;
    [draft[index], draft[target]] = [draft[target], draft[index]];
    drawList(); drawFields();
  }
  async function uploadImage() {
    const file = upload.files?.[0];
    upload.value = '';
    const slide = selected();
    if (!file || !slide) return;
    const id = slide.id, version = generation, token = {};
    pending.set(id, token);
    feedback.textContent = '正在处理图片，请稍候…';
    drawImageState(); notifyBusy();
    const current = () => generation === version && pending.get(id) === token && draft.some(item => item.id === id);
    try {
      const image = await images.process(file, {aspectRatio: 8 / 3});
      if (!current()) return;
      if (!images.isSafeImage(image)) throw new Error('图片处理失败，请更换图片。');
      draft.find(item => item.id === id).image = image;
      feedback.textContent = '图片预览已更新，保存后生效。';
    } catch (error) {
      if (!current()) return;
      feedback.textContent = error.message || '图片处理失败，请更换图片。';
    } finally {
      if (current()) {
        pending.delete(id);
        if (selectedId === id) { drawPreview(); drawImageState(); }
        notifyBusy();
      }
    }
  }

  for (const field of [title, description]) field.addEventListener('input', editFields);
  destination.addEventListener('change', editFields);
  list.addEventListener('click', event => {
    const button = event.target?.closest('[data-carousel-slide]');
    if (button) selectSlide(button.dataset.carouselSlide);
  });
  add.addEventListener('click', () => {
    if (draft.length >= model.limits.maxSlides) return;
    captureFields();
    const slide = {...model.defaults()[0], id: `slide-${Date.now().toString(36)}-${++nextId}`, title: '新的轮播图', description: '', image: ''};
    draft.push(slide); selectedId = slide.id;
    feedback.textContent = '';
    drawList(); drawFields(); title.focus();
  });
  remove.addEventListener('click', () => {
    if (draft.length <= 1) return;
    const index = draft.findIndex(slide => slide.id === selectedId);
    pending.delete(selectedId);
    draft.splice(index, 1);
    selectedId = draft[Math.min(index, draft.length - 1)].id;
    feedback.textContent = '';
    drawList(); drawFields(); notifyBusy();
  });
  moveUp.addEventListener('click', () => reorder(-1));
  moveDown.addEventListener('click', () => reorder(1));
  upload.addEventListener('change', uploadImage);
  clearImage.addEventListener('click', () => {
    const slide = selected();
    if (!slide) return;
    pending.delete(slide.id);
    slide.image = '';
    feedback.textContent = '已恢复默认配图，保存后生效。';
    drawPreview(); drawImageState(); notifyBusy();
  });
  window.BaigeHomeCarouselEditor = Object.freeze({
    beginDraft, validateDraft, isBusy,
    onBusyChange(callback) { if (typeof callback === 'function') {busyListeners.add(callback); callback(isBusy());} },
  });
})();
