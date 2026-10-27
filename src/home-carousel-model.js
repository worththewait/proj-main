(() => {
  'use strict';

  const {navigation, tools} = window.BaigeData;
  const limits = Object.freeze({maxSlides: 8, maxTitle: 32, maxDescription: 80});
  const arts = new Set(['ship', 'knowledge', 'tools']);
  const copy = slides => slides.map(slide => ({...slide}));
  const defaultSlides = [
    {id: 'slide-workbench', title: '让知识与工具，走进每一项工作。',
      description: '百舸工作台 · 问答、知识与专业工具', image: '', art: 'ship', route: 'qa', child: '对话'},
    {id: 'slide-knowledge', title: '让专业回答，有据可循。',
      description: '连接行业、企业与部门知识，围绕资料展开提问', image: '', art: 'knowledge', route: 'knowledge', child: ''},
    {id: 'slide-tools', title: '从资料到成果，让工作更进一步。',
      description: '翻译、识别与创作，常用工具触手可及', image: '', art: 'tools', route: 'smart-tools', child: ''},
  ];

  // Configuration may target locked functions; the existing navigation layer
  // decides whether to enter the function or open the permission application.
  const destinationList = navigation.filter(item => !['home','home-settings'].includes(item.id)).flatMap(item => {
    const children = item.id === 'smart-tools' ? tools.map(tool => tool.name) : item.children || [];
    return [{key: JSON.stringify([item.id, '']), label: item.label, route: item.id, child: ''},
      ...children.map(child => ({key: JSON.stringify([item.id, child]), label: `${item.label} · ${child}`, route: item.id, child}))];
  });
  const destinationKeys = new Set(destinationList.map(item => item.key));

  function validate(slides) {
    if (!Array.isArray(slides) || slides.length < 1 || slides.length > limits.maxSlides) return null;
    const ids = new Set();
    const normalized = [];
    for (const slide of slides) {
      if (!slide || typeof slide !== 'object' || Array.isArray(slide) ||
          typeof slide.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(slide.id) || ids.has(slide.id) ||
          typeof slide.title !== 'string' || typeof slide.description !== 'string' ||
          typeof slide.image !== 'string' || !arts.has(slide.art) ||
          typeof slide.route !== 'string' || typeof slide.child !== 'string') return null;
      const title = slide.title.trim();
      const description = slide.description.trim();
      if (!title || title.length > limits.maxTitle || description.length > limits.maxDescription ||
          (slide.image && !window.BaigeHomeCardImages.isSafeImage(slide.image)) ||
          !destinationKeys.has(JSON.stringify([slide.route, slide.child]))) return null;
      ids.add(slide.id);
      normalized.push({id: slide.id, title, description, image: slide.image, art: slide.art, route: slide.route, child: slide.child});
    }
    return normalized;
  }

  window.BaigeHomeCarouselModel = Object.freeze({
    limits,
    defaults() { return copy(defaultSlides); },
    clone: copy,
    destinations() { return copy(destinationList); },
    validate,
  });
})();
