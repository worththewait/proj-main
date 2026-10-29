const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function createStore() {
  const storage = new Map();
  const window = {
    localStorage: {
      getItem: (key) => storage.has(key) ? storage.get(key) : null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: (key) => storage.delete(key),
    },
  };
  const context = vm.createContext({ window });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "src", "notice-store.js"), "utf8"), context);
  return { store: window.BaigeNoticeStore, storage };
}

test("notice store defaults, publishing, status and read state stay in sync", () => {
  const { store, storage } = createStore();
  assert.equal(store.defaults.length, 3);
  assert.deepEqual(Array.from(store.all().map((item) => item.title)), ["我是公告", "我是一个通知提示", "1111"]);
  assert.equal(store.active().length, 3);
  assert.equal(store.unreadCount(), 3);

  const created = store.upsert({
    title: "新发布的公告",
    type: "公告",
    status: "正常",
    content: "公告正文",
  });
  assert.ok(created);
  assert.equal(created.creator, "1");
  assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.equal(store.all().length, 4);
  assert.equal(store.unreadCount(), 4);

  store.markAllRead();
  assert.equal(store.unreadCount(), 0);

  const newUnread = store.upsert({ title: "未读通知", type: "通知", status: "正常", content: "未读正文" });
  assert.equal(store.unreadCount(), 1);
  assert.equal(store.get(newUnread.id).title, "未读通知");

  store.upsert({ id: newUnread.id, title: "已关闭通知", status: "关闭", content: "未读正文" });
  assert.equal(store.active().some((item) => item.id === newUnread.id), false);
  assert.equal(store.all().some((item) => item.id === newUnread.id), true);
  assert.equal(store.remove(newUnread.id), true);
  assert.equal(store.all().length, 4);

  store.all().forEach((item) => store.remove(item.id));
  assert.equal(store.all().length, 0, "an explicitly emptied notice store must not reseed");
  assert.ok(storage.size > 0);
});
