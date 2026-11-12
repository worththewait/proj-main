/* 留言咨询数据层：门户提交与后管「留言咨询」列表共用。
   记录保存在浏览器本地（baige.portal.consults.v1），首访回落三条演示数据。 */
(() => {
  "use strict";

  const KEY = "baige.portal.consults.v1";

  /* 咨询类型：门户下拉与后台筛选共用同一份枚举。 */
  const TYPES = ["合作咨询", "问题咨询", "使用反馈", "功能建议"];

  const SEED = [
    {
      id: "c1",
      type: "合作咨询",
      name: "王海涛",
      company: "江南造船（集团）有限责任公司",
      phone: "13901234567",
      content: "希望了解行业大模型在船舶设计院所的私有化部署方案与实施周期。",
      createdAt: "2026-11-11 09:12:40",
    },
    {
      id: "c2",
      type: "使用反馈",
      name: "李静",
      company: "中船集团第七〇八研究所",
      phone: "13812345678",
      content: "百舸文库的转页预览在超大 PDF 上加载偏慢，建议增加进度提示。",
      createdAt: "2026-11-11 10:26:03",
    },
    {
      id: "c3",
      type: "功能建议",
      name: "陈鹏",
      company: "中船集团第十一研究所",
      phone: "13700001111",
      content: "希望在智能工具里支持批量上传并一次性触发文档翻译。",
      createdAt: "2026-11-11 14:05:11",
    },
  ];

  const clone = value => JSON.parse(JSON.stringify(value));

  function all() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === null) return clone(SEED);
      const parsed = JSON.parse(raw);
      const list = Array.isArray(parsed) ? parsed : clone(SEED);
      return list
        .map(item => ({ ...item, type: item.type || TYPES[0] }))
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    } catch {
      return clone(SEED);
    }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* 隐私模式不受支持 */ }
    window.dispatchEvent(new CustomEvent("baige:portal-consults", { detail: { count: list.length } }));
  }

  function stamp(date = new Date()) {
    const pad = n => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function nextId() {
    const used = all().map(item => Number(String(item.id).replace(/\D/g, ""))).filter(Number.isFinite);
    return `c${(used.length ? Math.max(...used) : 0) + 1}`;
  }

  function add(record) {
    const item = {
      id: record.id || nextId(),
      type: TYPES.includes(record.type) ? record.type : TYPES[0],
      name: String(record.name || "").trim(),
      company: String(record.company || "").trim(),
      phone: String(record.phone || "").trim(),
      content: String(record.content || "").trim(),
      createdAt: record.createdAt || stamp(),
    };
    save([item, ...all()]);
    return item;
  }

  function remove(id) {
    save(all().filter(item => String(item.id) !== String(id)));
  }

  window.BaigeConsultStore = Object.freeze({ KEY, TYPES, all, add, remove, save, stamp, nextId });
})();
