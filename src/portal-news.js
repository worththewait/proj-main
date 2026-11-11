/* 门户「最新动态」列表与详情：数据为演示内容，详情按 ?id= 渲染。 */
(() => {
  "use strict";

  const NEWS = [
    {
      id: 28,
      title: "中船集团各单位举行形式多样的“安全生产月”活动",
      tag: "安全生产",
      date: "2026-09-24",
      thumb: "is-a",
      body: [
        "今年六月是第 24 个全国“安全生产月”，中船集团各所属单位围绕“人人讲安全、个个会应急”主题，结合生产实际开展警示教育、应急演练与隐患排查。",
        "活动期间，各单位把安全责任落实到班组和岗位，重点检查高处作业、有限空间、动火作业等环节，并通过线上答题与现场演练相结合的方式提升员工应急处置能力。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: 29,
      title: "徐鹏与四川大学校长汪劲松会谈 共谋“十五五”高质量发展",
      tag: "会谈",
      date: "2026-09-24",
      thumb: "is-b",
      body: [
        "双方围绕科研平台共建、人才培养与成果转化进行了交流，表示将发挥各自优势，在船舶与海洋工程、新材料与智能制造等方向深化合作。",
        "会谈前，汪劲松一行参观了集团展厅，了解中船集团在主业发展和科技创新方面的进展。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: 30,
      title: "中船先锋｜全国工人先锋号中船风帆清苑分公司极板车间铸板班组：…",
      tag: "中船先锋",
      date: "2026-09-24",
      thumb: "is-c",
      body: [
        "该班组承担极板铸造的关键工序，通过工艺改进与班组建设，持续提升产品一致性与生产效率。",
        "班组以师带徒、岗位练兵为抓手，把质量要求落到每一道操作步骤，先后获得多项集体荣誉。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: 31,
      title: "儿童节活动",
      tag: "节日活动",
      date: "2026-09-24",
      thumb: "is-d",
      body: [
        "集团总部举办亲子主题活动，设置手工、科普与互动游戏等环节，员工与家属共同参与。",
        "活动旨在丰富员工文化生活，增进员工与家庭的沟通交流。",
      ],
      byline: "来　源：集团工会",
    },
    {
      id: 32,
      title: "今日芒种｜中船二十四节气",
      tag: "节气",
      date: "2026-09-24",
      thumb: "is-e",
      body: [
        "芒种时节，万物并秀。集团各条战线抢抓工期、稳产保供，以实干迎接仲夏。",
        "二十四节气系列内容由集团新闻宣传中心策划推出，记录节气里的船舶工业图景。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: 33,
      title: "中船集团与中国气象局签订战略合作框架协议 以务实合作赋能高质量可持续发展",
      tag: "战略合作",
      date: "2026-09-24",
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
      id: 34,
      title: "中船集团亮相2026中国国际应急管理展览 王国强出席展会并调研…",
      tag: "展会",
      date: "2026-09-24",
      thumb: "is-c",
      body: [
        "展会集中展示了应急指挥、救援装备与安全保障等领域的技术与产品，中船集团组织所属单位联合参展。",
        "期间，集团领导到展台调研，了解产品研制进展与市场应用情况。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
    {
      id: 35,
      title: "徐鹏调研中船集团上海地区部分单位",
      tag: "调研",
      date: "2026-09-24",
      thumb: "is-b",
      body: [
        "调研期间，集团领导深入科研生产一线，了解重点项目进展、能力建设与人才队伍情况。",
        "在随后召开的座谈会上，围绕“十五五”规划编制、深化改革与风险防控听取了意见建议。",
      ],
      byline: "来　源：中船集团新闻宣传中心",
    },
  ];

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  const listRoot = document.querySelector("[data-news-list]");
  const detailRoot = document.querySelector("[data-news-detail]");

  if (listRoot) {
    listRoot.innerHTML = NEWS.map(item => `<a class="portal-feed-item" href="./portal-news-detail.html?id=${item.id}">
      <span class="portal-feed-thumb ${item.thumb}" aria-hidden="true"></span>
      <span class="portal-feed-copy"><span class="portal-feed-title">${escapeHtml(item.title)}</span><span class="portal-feed-date">${escapeHtml(item.date)}</span></span>
    </a>`).join("");
  }

  window.BaigePortalNews = Object.freeze({ NEWS });

  if (detailRoot) {
    const id = new URLSearchParams(location.search).get("id");
    const item = NEWS.find(entry => String(entry.id) === id) || NEWS.find(entry => entry.id === 33);
    document.title = `${item.title.slice(0, 20)} - 百舸门户`;
    detailRoot.innerHTML = `<article class="portal-article">
      <div class="portal-article-inner">
        <h1>${escapeHtml(item.title)}</h1>
        <div class="portal-article-meta"><span class="portal-article-tag">${escapeHtml(item.tag)}</span><time>${escapeHtml(item.date)}</time></div>
        <div class="portal-article-body">${item.body.map(para => `<p>${escapeHtml(para)}</p>`).join("")}</div>
        <p class="portal-article-byline">${escapeHtml(item.byline)}</p>
        <a class="portal-article-back" href="./portal-news.html">← 返回最新动态</a>
      </div>
    </article>`;
  }
})();
