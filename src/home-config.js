(() => {
  'use strict';
  const storageKey = 'baige.home-config.v2';
  const {navigation, tools} = window.BaigeData;
  const carousel = window.BaigeHomeCarouselModel;
  const research = new Set(['qa','knowledge','writing','library','intel','analysis']);
  const descriptions = {
    qa:'围绕问题展开交流，辅助梳理资料与思路。', knowledge:'连接行业、企业与部门的知识资源。',
    writing:'从主题与框架出发，组织专业表达。', library:'查阅与管理专业文献资源。',
    intel:'关注研究领域与行业信息。', analysis:'科研分析与研究工作的统一入口。',
    digital:'连接专业业务系统。', datasets:'船海产业全链条数据资源。', platform:'面向智能应用的开发工作入口。',
  };
  const childMeta = {
    '对话':['chat',descriptions.qa], '智能问数':['chart','通过自然语言，提出业务数据问题。'],
    '文库首页':['file',descriptions.library], '全球鹰':['globe','关注全球动态与行业信息。'],
    '智研通':['compass','面向专业研究的信息与服务入口。'],
    '数据标注平台':['tag','面向数据标注任务的工作入口。'], '爬虫平台':['bug','面向数据采集任务的工作入口。'],
    '数据中台':['server','集中管理与使用数据的工作入口。'],
  };
  const catalog = navigation.filter(item => !['home','home-settings'].includes(item.id)).flatMap(item => {
    const base = {route:item.id, group:research.has(item.id)?'知识与研究':'工具与平台', tone:research.has(item.id)?'purple':'blue'};
    if (item.id === 'smart-tools') return tools.map(tool => ({...base, id:`tool:${tool.name}`, name:tool.name,
      child:tool.name, icon:tool.icon, description:tool.description, tone:tool.group==='研究辅助'?'teal':'blue'}));
    if (item.children?.length && item.subnav !== false) return item.children.filter(child=>!['文件管理','权限管理'].includes(child)).map((child,index) => ({
      ...base, id:index===0 && ['qa','library'].includes(item.id)?`route:${item.id}`:`route:${item.id}:${child}`,
      name:child==='文库首页'?item.label:child, child, icon:childMeta[child]?.[0]||item.icon,
      description:childMeta[child]?.[1]||'',
    }));
    return [{...base, id:`route:${item.id}`, name:item.label, child:'', icon:item.icon, description:descriptions[item.id]||''}];
  }).map(item=>Object.freeze(item));
  const ids = new Set(catalog.map(item=>item.id));
  const defaultIds = ['tool:PPT生成','tool:文档翻译','tool:OCR识别','tool:思维导图生成'];
  const updateDestinations = [{key:JSON.stringify(['home','']),label:'首页 · 了解平台功能',route:'home',child:''},...carousel.destinations()];
  const updateDestinationKeys = new Set(updateDestinations.map(item=>item.key));
  const defaultUpdates = [
    {id:'workbench', date:'2026-10-26', title:'百舸工作台焕新，让知识连接工作',
      body:'从首页直接发起问题，通过「我的常用」快速进入工具，或切换「推荐」发现平台能力。下方「了解平台功能」汇集全部入口，可搜索功能、查看开通状态并申请使用。', status:'published', destination:{route:'home',child:''}},
    {id:'knowledge', date:'2026-10-24', title:'知识库问答，让回答有据可循',
      body:'知识库问答支持行业、企业、部门三个范围。可跨分类选择多个知识库，确认后将问题与所选范围带入对话。当前为原型演示，实际文档检索与模型回答待接入。', status:'published', destination:{route:'qa',child:'对话'}},
    {id:'tools', date:'2026-10-24', title:'专业工具，贯通资料处理与内容创作',
      body:'从文档翻译、OCR识别到专业编写、PPT生成与思维导图生成，按任务选择对应工具。工具目录与独立页签可体验操作流程，实际处理能力待接入。', status:'published', destination:{route:'smart-tools',child:''}},
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  function validateRecommendations(value) {
    return Array.isArray(value) && value.length<=4 && new Set(value).size===value.length && value.every(id=>ids.has(id)) ? [...value] : null;
  }
  function validateUpdates(value) {
    if (!Array.isArray(value) || value.length>100) return null;
    const seen = new Set(); const result = [];
    for (const item of value) {
      if (!item || typeof item.id!=='string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(item.id) || seen.has(item.id) ||
        typeof item.title!=='string' || !item.title.trim() || item.title.trim().length>60 ||
        typeof item.body!=='string' || item.body.trim().length>5000 || !['draft','published','unpublished'].includes(item.status)) return null;
      const now = new Date();
      // The publisher supplies the current date; older records keep their saved date.
      const dateValue = item.date === undefined ? `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}` : item.date;
      if (typeof dateValue!=='string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return null;
      const date = new Date(`${dateValue}T00:00:00Z`);
      if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==dateValue || (item.status==='published' && !item.body.trim())) return null;
      const destination = item.destination === undefined ? defaultUpdates.find(entry=>entry.id===item.id)?.destination || null : item.destination;
      if (destination !== null && (typeof destination!=='object' || Array.isArray(destination) || typeof destination.route!=='string' || typeof destination.child!=='string' || !updateDestinationKeys.has(JSON.stringify([destination.route,destination.child])))) return null;
      seen.add(item.id);
      result.push({id:item.id,title:item.title.trim(),body:item.body.trim(),date:dateValue,status:item.status,destination:destination?{route:destination.route,child:destination.child}:null});
    }
    return result;
  }
  function defaults() {return {version:2,recommendedIds:[...defaultIds],slides:carousel.defaults(),updates:clone(defaultUpdates)};}
  function readLegacy() {
    try {const value=JSON.parse(window.localStorage.getItem('baige.homepage.v1'));return value?.version===1?value:null;} catch {return null;}
  }
  const isRetiredLibraryAdmin = (route, child) => route==='library' && ['文件管理','权限管理'].includes(child);
  // Preserve existing content when the former backend-only targets are retired.
  const safeSlides = value => Array.isArray(value) ? value.map(slide => slide && isRetiredLibraryAdmin(slide.route,slide.child) ? {...slide,child:'文库首页'} : slide) : value;
  const safeUpdates = value => Array.isArray(value) ? value.map(item => item?.destination && isRetiredLibraryAdmin(item.destination.route,item.destination.child) ? {...item,destination:null} : item) : value;
  function read() {
    const result=defaults(); let value;
    try {value=JSON.parse(window.localStorage.getItem(storageKey));} catch {}
    if (value?.version===2) {
      result.recommendedIds=validateRecommendations(value.recommendedIds)??result.recommendedIds;
      result.slides=carousel.validate(safeSlides(value.slides))||result.slides;
      result.updates=validateUpdates(safeUpdates(value.updates))??result.updates;
    } else {
      const legacy=readLegacy();
      if (legacy) {
        const selected=Array.isArray(legacy.commonIds)?[...new Set(legacy.commonIds.filter(id=>ids.has(id)))].slice(0,4):null;
        result.recommendedIds=selected??result.recommendedIds;
        result.slides=carousel.validate(safeSlides(legacy.slides))||result.slides;
      }
    }
    return result;
  }
  function saveSection(section, value) {
    const validators={recommendedIds:validateRecommendations,slides:carousel.validate,updates:validateUpdates};
    const next=Object.hasOwn(validators,section)?validators[section](value):null;
    if (!next) throw Error('配置无效，请检查填写内容。');
    const settings=read(); settings[section]=next;
    try {window.localStorage.setItem(storageKey,JSON.stringify(settings));}
    catch {throw Error('未能保存，浏览器存储空间不足或不可用。当前编辑内容已保留，请重试。');}
    return settings;
  }
  function published() {return read().updates.filter(item=>item.status==='published').sort((a,b)=>b.date.localeCompare(a.date));}
  window.BaigeHomeConfig=Object.freeze({storageKey,catalog:Object.freeze(catalog),defaults,read,readLegacy,saveSection,validateRecommendations,validateUpdates,published,updateDestinations:()=>clone(updateDestinations)});
})();
