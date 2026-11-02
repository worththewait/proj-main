(() => {
  "use strict";

  const REQUESTS_KEY = "baige.permission.requests.v1";
  const GRANTS_KEY = "baige.permission.grants.v1";
  const CURRENT = Object.freeze({
    name: "系统管理员",
    email: "admin@cimtec.net.cn",
    organization: "中船综合院",
    dept: "中船综合院",
    role: "超级管理员",
    phone: "",
  });
  const PEOPLE = Object.freeze([
    { name: "系统管理员", email: "admin@cimtec.net.cn", organization: "中船综合院", dept: "中船综合院", role: "超级管理员" },
    { name: "李明远", email: "limingyuan@cimtec.net.cn", organization: "中船综合院", dept: "经济研究中心", role: "高级研究员" },
    { name: "王振国", email: "wangzhenguo@cimtec.net.cn", organization: "中船综合院", dept: "经济研究中心", role: "研究员" },
    { name: "张海宁", email: "zhanghaining@cimtec.net.cn", organization: "中船综合院", dept: "经济研究中心", role: "研究员" },
    { name: "陈晓峰", email: "chenxiaofeng@cimtec.net.cn", organization: "中船综合院", dept: "动力研究院", role: "工程师" },
  ]);
  const STATUS_LABEL = Object.freeze({
    pending: "待审核",
    approved: "已通过",
    partial: "部分通过",
    rejected: "已驳回",
  });
  const listeners = new Set();

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch { return fallback; }
  }
  function write(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* file:// */ }
  }
  function currentApplicant() {
    const profile = window.BaigeAccountProfile;
    if (!profile) return clone(CURRENT);
    return {
      ...clone(CURRENT),
      ...clone(profile),
      name: profile.name || CURRENT.name,
      email: profile.email || CURRENT.email,
      organization: profile.organization || CURRENT.organization,
      dept: profile.dept || profile.organization || CURRENT.dept,
    };
  }
  function statusOf(items) {
    if (!Array.isArray(items) || !items.length) return "pending";
    const approved = items.filter((item) => item.status === "approved").length;
    const rejected = items.filter((item) => item.status === "rejected").length;
    if (approved === items.length) return "approved";
    if (rejected === items.length) return "rejected";
    if (approved + rejected === 0) return "pending";
    return "partial";
  }
  function normalizeItem(item, type) {
    const base = { ...item, type: type || item.type || "function", status: ["approved", "rejected"].includes(item.status) ? item.status : "pending" };
    if (base.type === "data") base.key = base.key || `d:${base.kbId || base.id || base.name}`;
    else base.key = base.key || `f:${base.route || ""}:${base.child || ""}`;
    return base;
  }
  function normalizeRequest(record) {
    const items = (record.items || []).map((item) => normalizeItem(item, item.type));
    return { ...record, items, status: record.status || statusOf(items) };
  }
  function nowText() {
    const date = new Date();
    const part = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())} ${part(date.getHours())}:${part(date.getMinutes())}:${part(date.getSeconds())}`;
  }
  function nextId(requests) {
    const date = new Date();
    const prefix = `AP${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
    const used = new Set(requests.map((item) => item.id));
    let seq = 1;
    while (used.has(`${prefix}${String(seq).padStart(3, "0")}`)) seq += 1;
    return `${prefix}${String(seq).padStart(3, "0")}`;
  }
  function func(name, route, child, status = "pending") {
    return { key: `f:${route}:${child || ""}`, type: "function", name, route, child: child || "", status };
  }
  function kb(name, kbId, scope, status = "pending") {
    return { key: `d:${kbId}`, type: "data", name, kbId, scope: scope || "", status };
  }
  function seed() {
    return [
      {
        id: "AP20261102001",
        applicant: clone(CURRENT),
        reason: "参与跨部门联合研究项目，需要检索专业资料并使用智能问数分析业务数据。",
        items: [func("智能问数", "qa", "智能问数"), kb("企业问答知识库", "enterprise-qa", "企业")],
        status: "pending", comment: "", reviewer: "", reviewedAt: "", createdAt: "2026-11-02 09:20:15",
      },
      {
        id: "AP20261101001",
        applicant: clone(CURRENT),
        reason: "负责专业资料研究，需要检索前沿研究信息。",
        items: [func("智研通", "frontier", "智研通", "rejected")],
        status: "rejected", comment: "当前岗位暂不需要智研通权限，建议使用已有资料库。", reviewer: "系统管理员", reviewedAt: "2026-11-01 16:20:33", createdAt: "2026-11-01 14:30:05",
      },
      {
        id: "AP20261031001",
        applicant: { name: "李明远", email: "limingyuan@cimtec.net.cn", organization: "中船综合院", dept: "经济研究中心", role: "高级研究员" },
        reason: "承担船舶标准编制任务，需要调用智能工具中的标准编制与船舶标准知识库。",
        items: [func("标准编制", "smart-tools", "标准编制"), kb("船舶标准知识库", "industry-standard", "行业")],
        status: "pending", comment: "", reviewer: "", reviewedAt: "", createdAt: "2026-10-31 11:08:42",
      },
      {
        id: "AP20261030001",
        applicant: { name: "王振国", email: "wangzhenguo@cimtec.net.cn", organization: "中船综合院", dept: "经济研究中心", role: "研究员" },
        reason: "开展市场分析时需要智能问数与企业制度知识库支持。",
        items: [func("智能问数", "qa", "智能问数"), kb("企业制度知识库", "enterprise-policy", "企业")],
        status: "pending", comment: "", reviewer: "", reviewedAt: "", createdAt: "2026-10-30 09:15:22",
      },
    ];
  }
  function loadRequests() {
    const raw = read(REQUESTS_KEY, null);
    if (raw === null) {
      const seeded = seed().map(normalizeRequest);
      write(REQUESTS_KEY, seeded);
      return seeded;
    }
    if (!Array.isArray(raw)) return [];
    return raw.map(normalizeRequest);
  }
  function saveRequests(requests) {
    write(REQUESTS_KEY, requests);
    syncGrants(requests);
    notify();
  }
  function grantsFor(requests) {
    const all = {};
    requests.forEach((request) => {
      const email = request.applicant?.email;
      if (!email) return;
      request.items.forEach((item) => {
        if (item.type !== "function" || item.status !== "approved") return;
        if (!all[email]) all[email] = {};
        all[email][`${item.route}:${item.child || ""}`] = true;
      });
    });
    return all;
  }
  function syncGrants(requests = loadRequests()) {
    write(GRANTS_KEY, grantsFor(requests));
  }
  function notify() {
    const detail = { requests: loadRequests() };
    listeners.forEach((callback) => { try { callback(clone(detail)); } catch { /* noop */ } });
    if (typeof window.dispatchEvent === "function" && typeof window.CustomEvent === "function") {
      window.dispatchEvent(new window.CustomEvent("baige:permission-store", { detail }));
    }
  }
  function list(email = "") {
    const requests = loadRequests().slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return email ? requests.filter((item) => item.applicant?.email === email) : requests;
  }
  function get(id) {
    return loadRequests().find((item) => item.id === id) || null;
  }
  function create(applicant, reason, items) {
    const cleanReason = String(reason || "").trim();
    const cleanItems = (items || []).map((item) => normalizeItem(item, item.type)).filter((item) => item.name);
    if (!applicant?.email) throw new Error("申请人信息无效。");
    if (!cleanItems.length) throw new Error("请至少选择一项功能或数据权限。");
    if (!cleanReason) throw new Error("请填写申请事由。");
    const requests = loadRequests();
    const record = normalizeRequest({
      id: nextId(requests),
      applicant: clone(applicant),
      reason: cleanReason,
      items: cleanItems,
      status: "pending",
      comment: "",
      reviewer: "",
      reviewedAt: "",
      createdAt: nowText(),
    });
    requests.unshift(record);
    saveRequests(requests);
    return clone(record);
  }
  function review(id, decisions, comment, reviewer = "系统管理员") {
    const requests = loadRequests();
    const record = requests.find((item) => item.id === id);
    if (!record) throw new Error("申请单不存在或已删除。");
    const cleanComment = String(comment || "").trim();
    if (!cleanComment) throw new Error("请填写审核意见。");
    record.items = record.items.map((item) => {
      const next = decisions?.[item.key];
      return next === "approved" || next === "rejected" ? { ...item, status: next } : item;
    });
    record.status = statusOf(record.items);
    record.comment = cleanComment;
    record.reviewer = reviewer;
    record.reviewedAt = nowText();
    saveRequests(requests);
    return clone(record);
  }
  function people() { return PEOPLE.map((item) => ({ ...item })); }
  function applicantFor(email) {
    const person = PEOPLE.find((item) => item.email === email);
    return person ? { ...person } : null;
  }
  function isGranted(email, route, child = "") {
    if (!email) return false;
    const grants = read(GRANTS_KEY, {});
    return Boolean(grants?.[email]?.[`${route}:${child || ""}`]);
  }
  function hasPending(email, route, child = "") {
    const key = `${route}:${child || ""}`;
    return loadRequests().some((request) =>
      request.applicant?.email === email &&
      request.items.some((item) => item.type === "function" && item.key === `f:${key}` && item.status === "pending") &&
      request.status === "pending");
  }
  function subscribe(callback) {
    if (typeof callback !== "function") return () => {};
    listeners.add(callback);
    return () => listeners.delete(callback);
  }
  function resetForDemo() {
    try { window.localStorage.removeItem(REQUESTS_KEY); window.localStorage.removeItem(GRANTS_KEY); } catch { /* noop */ }
    loadRequests();
    notify();
  }

  if (typeof window.addEventListener === "function") {
    window.addEventListener("storage", (event) => {
      if (event.key === REQUESTS_KEY || event.key === GRANTS_KEY) notify();
    });
  }

  syncGrants(loadRequests());
  window.BaigePermissionStore = Object.freeze({
    REQUESTS_KEY, GRANTS_KEY, STATUS_LABEL, currentApplicant,
    people, applicantFor, isGranted,
    list, get, create, review, hasPending, subscribe, syncGrants, resetForDemo,
  });
})();
