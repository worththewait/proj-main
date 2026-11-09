(() => {
  'use strict';
  let opening;

  function open() {
    if (!opening) {
      opening = new Promise((resolve, reject) => {
        const request = window.indexedDB.open('baige-local-files', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('files');
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }).catch(error => {
        opening = null;
        throw error;
      });
    }
    return opening;
  }

  async function access(mode, action) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('files', mode);
      const request = action(transaction.objectStore('files'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error || request.error || new Error('文件操作未完成。'));
    });
  }

  window.BaigeLocalFiles = Object.freeze({
    save: (key, file) => access('readwrite', store => store.put(file, key)),
    read: key => access('readonly', store => store.get(key)),
    remove: key => access('readwrite', store => store.delete(key)),
  });
})();
