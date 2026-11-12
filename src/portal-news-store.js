/* 门户动态数据源：后台「动态发布」与门户列表/详情共用的唯一数据层。
   记录保存在浏览器本地（baige.portal.news.v1），首次访问回落到演示种子数据。 */
(() => {
  "use strict";

  const KEY = "baige.portal.news.v1";

  /* 公告标签：后台下拉与门户分类筛选共用同一份枚举。 */
  const TAGS = ["通知公告", "行业动态", "政策法规", "智库成果", "研究报告", "其他", "活动报名"];

  // 演示种子：与线上公告发布管理的 8 条记录一致（含置顶、类型与发布时间）。
  const SEED = [
    {
      id: "28",
      title: "中船集团各单位举行形式多样的“安全生产月”活动",
      tag: "行业动态",
      type: "普通公告",
      status: "已发布",
      pinned: true,
      sortNo: 1,
      publishedAt: "2026-09-24 16:03:54",
      thumb: "is-a",
      body: [
        "今年六月是第 24 个全国“安全生产月”，中船集团各所属单位围绕“人人讲安全、个个会应急”主题，结合生产实际开展警示教育、应急演练与隐患排查。",
        "活动期间，各单位把安全责任落实到班组和岗位，重点检查高处作业、有限空间、动火作业等环节，并通过线上答题与现场演练相结合的方式提升员工应急处置能力。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: "29",
      title: "徐鹏与四川大学校长汪劲松会谈 共谋“十五五”高质量发展",
      tag: "行业动态",
      type: "普通公告",
      status: "已发布",
      pinned: true,
      sortNo: 2,
      publishedAt: "2026-09-24 16:02:09",
      thumb: "is-b",
      body: [
        "双方围绕科研平台共建、人才培养与成果转化进行了交流，表示将发挥各自优势，在船舶与海洋工程、新材料与智能制造等方向深化合作。",
        "会谈前，汪劲松一行参观了集团展厅，了解中船集团在主业发展和科技创新方面的进展。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: "30",
      title: "中船先锋｜全国工人先锋号中船风帆清苑分公司极板车间铸板班组：以实干实绩彰显先锋本色",
      tag: "其他",
      type: "普通公告",
      status: "已发布",
      pinned: true,
      sortNo: 3,
      publishedAt: "2026-09-24 16:00:15",
      thumb: "is-c",
      body: [
        "该班组承担极板铸造的关键工序，通过工艺改进与班组建设，持续提升产品一致性与生产效率。",
        "班组以师带徒、岗位练兵为抓手，把质量要求落到每一道操作步骤，先后获得多项集体荣誉。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: "31",
      title: "儿童节活动",
      tag: "活动报名",
      type: "活动报名公告",
      status: "已发布",
      pinned: true,
      sortNo: 4,
      publishedAt: "2026-09-24 15:58:44",
      thumb: "is-d",
      body: [
        "集团总部举办亲子主题活动，设置手工、科普与互动游戏等环节，员工与家属共同参与。",
        "活动旨在丰富员工文化生活，增进员工与家庭的沟通交流。",
      ],
      byline: "来　源：集团工会",
    },
    {
      id: "32",
      title: "今日芒种｜中船二十四节气",
      tag: "其他",
      type: "普通公告",
      status: "已发布",
      pinned: true,
      sortNo: 5,
      publishedAt: "2026-09-24 15:57:40",
      thumb: "is-e",
      body: [
        "芒种时节，万物并秀。集团各条战线抢抓工期、稳产保供，以实干迎接仲夏。",
        "二十四节气系列内容由集团新闻宣传中心策划推出，记录节气里的船舶工业图景。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: "33",
      title: "中船集团与中国气象局签订战略合作框架协议 以务实合作赋能高质量可持续发展",
      tag: "行业动态",
      type: "普通公告",
      status: "已发布",
      pinned: false,
      sortNo: 6,
      publishedAt: "2026-09-24 16:09:20",
      thumb: "is-a",
      body: [
        "7月16日，中国船舶集团有限公司与中国气象局在上海签署战略合作框架协议。中船集团党组书记、董事长徐鹏，中国气象局党组书记、局长陈振林出席签约仪式。中国气象局党组成员、副局长毕宝贵，中船集团党组成员、副总经理赵同宾分别代表双方在协议上签字。签约前，双方就进一步加强沟通交流、推动互利共赢发展进行了交流探讨。",
        "徐鹏对陈振林一行来访表示欢迎，并介绍了中船集团改革发展情况和“十五五”规划思路。徐鹏表示，气象工作在保障船舶建设、赋能船舶工业高质量可持续发展等方面发挥着重要支撑作用，希望双方以此次签约为契机，进一步强化协同联动，建立健全常态化沟通机制，聚焦防灾减灾能力建设、气象装备研制、新兴产业开发等领域，加强科技创新协同攻关，推进科研成果双向转化应用，推动合作向更宽领域、更深层次迈进，携手为海洋强国、气象强国建设提供有力支撑。",
        "陈振林介绍了中国气象局发展概况。陈振林表示，中船集团是我国船舶工业的国家队和海洋科技创新的主力军，与中国气象局业务互补性强、战略契合度高。中国气象局愿与中船集团一道，以此次签约为契机，深化常态合作机制共建，加强在科研项目落地、数智赋能增效、科技成果转化等方面的合作，促进资源共建共享，加快推动合作协议落实落地，共同为落实国家重大战略作出新的更大贡献。",
        "中国气象局有关内设机构和单位负责人，中船集团总助级领导、总部有关部门和相关二级管理单位负责人参加上述活动。",
      ],
      byline: "记　者：刘　畅　责　编：钱　平　一　审：周　芒　二　审：项　丽　三　审：甘丰录　来　源：中船集团新闻宣传中心/中国船舶报社",
    },
    {
      id: "34",
      title: "中船集团亮相2026中国国际应急管理展览 王国强出席展会并调研集团参展企业",
      tag: "行业动态",
      type: "普通公告",
      status: "已发布",
      pinned: false,
      sortNo: 7,
      publishedAt: "2026-09-24 16:08:08",
      thumb: "is-c",
      body: [
        "展会集中展示了应急指挥、救援装备与安全保障等领域的技术与产品，中船集团组织所属单位联合参展。",
        "期间，集团领导到展台调研，了解产品研制进展与市场应用情况。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: "35",
      title: "徐鹏调研中船集团上海地区部分单位",
      tag: "行业动态",
      type: "普通公告",
      status: "已发布",
      pinned: false,
      sortNo: 8,
      publishedAt: "2026-09-24 16:05:03",
      thumb: "is-b",
      body: [
        "调研期间，集团领导深入科研生产一线，了解重点项目进展、能力建设与人才队伍情况。",
        "在随后召开的座谈会上，围绕“十五五”规划编制、深化改革与风险防控听取了意见建议。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
  ];

  const clone = value => JSON.parse(JSON.stringify(value));

  /* 旧数据里的自定义标签迁移到新枚举，避免历史记录筛不出来。 */
  const LEGACY_TAGS = {
    "安全生产月": "行业动态", "会谈": "行业动态", "战略合作": "行业动态",
    "应急管理展": "行业动态", "地区调研": "行业动态",
    "中船先锋": "其他", "今日芒种": "其他",
    "节日活动": "活动报名",
  };

  function normalize(item) {
    const tag = TAGS.includes(item.tag) ? item.tag : (LEGACY_TAGS[item.tag] || "其他");
    return { ...item, tag, type: item.type || "普通公告", status: item.status || "已发布" };
  }
  const timeOf = item => String(item.publishedAt || "").slice(0, 16);

  function all() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) return clone(SEED).map(normalize);
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(normalize) : clone(SEED).map(normalize);
    } catch {
      return clone(SEED).map(normalize);
    }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 隐私模式或 file:// 受限 */ }
    window.dispatchEvent(new CustomEvent("baige:portal-news", { detail: { count: list.length } }));
  }

  const pinnedFirst = (a, b) => (Number(b.pinned) - Number(a.pinned)) || timeOf(b).localeCompare(timeOf(a));
  const newestFirst = (a, b) => timeOf(b).localeCompare(timeOf(a));

  /* 门户「最新动态」列表：置顶优先，其次按发布时间倒序。 */
  const feed = () => all().filter(item => item.status === "已发布").sort(pinnedFirst);
  /* 首页右侧三条：只按发布时间取最新。 */
  const latest = (count = 3) => all().filter(item => item.status === "已发布").sort(newestFirst).slice(0, count);
  const find = id => all().find(item => String(item.id) === String(id)) || null;

  function nextId() {
    const used = all().map(item => Number(item.id)).filter(num => Number.isFinite(num));
    return String((used.length ? Math.max(...used) : 0) + 1);
  }

  function upsert(item) {
    const list = all();
    const index = list.findIndex(entry => String(entry.id) === String(item.id));
    if (index >= 0) list[index] = { ...list[index], ...item };
    else list.unshift(item);
    save(list);
    return item;
  }

  function remove(id) {
    save(all().filter(item => String(item.id) !== String(id)));
  }

  /* 保存表单数据：正文按空行拆段，兼容富文本与纯文本两种录入。 */
  function fromForm(form) {
    const stamp = form.publishedAt || new Date().toISOString().slice(0, 16).replace("T", " ");
    const paragraphs = String(form.content || "")
      .split(/\n{2,}/)
      .map(text => text.trim())
      .filter(Boolean);
    return {
      id: form.id || nextId(),
      title: String(form.title || "").trim(),
      tag: String(form.tag || "").trim(),
      type: form.type || "普通公告",
      status: form.status || "草稿",
      pinned: Boolean(form.pinned),
      sortNo: Number(form.sortNo) || 0,
      publishedAt: stamp,
      date: stamp.slice(0, 10),
      thumb: form.thumb || "is-a",
      image: form.image || "",
      content: String(form.content || ""),
      body: paragraphs,
      byline: form.byline || "来　源：门户管理后台",
    };
  }

  window.BaigePortalNewsStore = Object.freeze({
    KEY, TAGS, SEED, all, save, feed, latest, find, upsert, remove, fromForm, nextId,
  });
})();
