(() => {
  "use strict";

  const STORAGE_KEY = "baige.notice-center.v1";
  const READ_KEY = "baige.notice-center.read.v1";

  const DEFAULTS = [
    {
      id: "notice-1",
      title: "我是公告",
      type: "公告",
      status: "正常",
      creator: "1",
      createdAt: "2026-10-29 10:45:36",
      content: "我是公告的具体信息，这是一个示意。",
    },
    {
      id: "notice-2",
      title: "我是一个通知提示",
      type: "通知",
      status: "正常",
      creator: "1",
      createdAt: "2026-10-29 10:44:00",
      content: "我是通知的具体信息，这是一个示意",
    },
    {
      id: "notice-3",
      title: "1111",
      type: "通知",
      status: "正常",
      creator: "1",
      createdAt: "2026-10-29 10:43:00",
      content: "1111",
    },
  ];

  const clone = (item) => ({ ...item });

  function readJson(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable in restricted file contexts.
    }
  }

  function pad(value) {
    return String(value).padStart(2, "0");
  }

  function nowStamp() {
    const date = new Date();
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }

  function normalize(item) {
    if (!item || typeof item !== "object") return null;
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const content = typeof item.content === "string" ? item.content.trim() : "";
    if (!title || !content) return null;
    return {
      id: String(item.id || `notice-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
      title,
      type: item.type === "公告" ? "公告" : "通知",
      status: item.status === "关闭" ? "关闭" : "正常",
      creator: String(item.creator || "1"),
      createdAt: String(item.createdAt || nowStamp()),
      content,
    };
  }

  function all() {
    const stored = readJson(STORAGE_KEY, null);
    const list = Array.isArray(stored) ? stored : DEFAULTS;
    return list
      .map(normalize)
      .filter(Boolean)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  function active() {
    return all().filter((item) => item.status === "正常");
  }

  function get(id) {
    return all().find((item) => item.id === String(id)) || null;
  }

  function upsert(input) {
    if (!input || typeof input !== "object") return null;
    const list = all();
    const existing = input.id ? list.find((item) => item.id === String(input.id)) : null;
    const item = normalize({
      ...(existing || {}),
      ...input,
      id: existing?.id || input.id,
      createdAt: existing?.createdAt || input.createdAt || nowStamp(),
    });
    if (!item) return null;
    if (existing) list[list.indexOf(existing)] = item;
    else list.push(item);
    writeJson(STORAGE_KEY, list);
    return clone(item);
  }

  function remove(id) {
    const list = all();
    const next = list.filter((item) => item.id !== String(id));
    if (next.length === list.length) return false;
    writeJson(STORAGE_KEY, next);
    return true;
  }

  function readIds() {
    const stored = readJson(READ_KEY, []);
    if (!Array.isArray(stored)) return [];
    return [...new Set(stored.map(String))];
  }

  function unreadCount() {
    const read = new Set(readIds());
    return active().filter((item) => !read.has(item.id)).length;
  }

  function markAllRead() {
    const merged = [...new Set([...readIds(), ...active().map((item) => item.id)])];
    writeJson(READ_KEY, merged);
    return merged.length;
  }

  window.BaigeNoticeStore = Object.freeze({
    all,
    active,
    get,
    upsert,
    remove,
    unreadCount,
    markAllRead,
    defaults: DEFAULTS.map(clone),
  });
})();
