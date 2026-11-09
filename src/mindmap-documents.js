(() => {
  "use strict";

  const KEY = "baige.mindmap.documents.v1";
  const store = window.BaigeProofreadStore.createFileAuditStore(KEY, window.BaigeProofreadTool.scanSecret);
  const cache = window.BaigeLocalFiles;
  const cacheKey = id => `mindmap:${id}`;
  const find = id => store.list().find(record => record.id === id);

  function availableRecord(record) {
    if (record.secretStatus === "passed") return record;
    const { text, ...metadata } = record;
    return metadata;
  }

  async function submit(file) {
    let text;
    try { text = await window.BaigeProofreadFile.read(file); }
    catch (error) {
      const reason = error.message || "文件读取失败，请重新上传。";
      return availableRecord(store.failFile(file.name, reason));
    }
    const record = store.submitFile({ fileName: file.name, text, source: "upload" });
    try {
      await cache?.save(cacheKey(record.id), file);
    } catch {
      // 正文已送审，原文件缓存失败只影响后续下载。
    }
    return availableRecord(record);
  }

  async function remove(id) {
    store.remove(id);
    await cache?.remove(cacheKey(id)).catch(() => {});
  }

  function requirePassed(id) {
    if (find(id)?.secretStatus !== "passed") {
      throw new Error("仅可下载通过涉密核查的原文件。");
    }
  }

  async function original(id) {
    requirePassed(id);
    const file = await cache?.read(cacheKey(id)).catch(() => null);
    requirePassed(id);
    if (!file) throw new Error("当前浏览器没有保存原文件，无法下载。");
    return file;
  }

  window.BaigeMindmapDocuments = Object.freeze({
    KEY,
    list: () => store.list().map(availableRecord),
    submit,
    audit: (id, status) => availableRecord(store.audit(id, status)),
    remove,
    original,
  });
})();
