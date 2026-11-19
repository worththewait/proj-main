(() => {
  "use strict";
  const { escapeHtml: escape, hydrate } = window.BaigeUI;
  const demo = window.BaigeTransferDemo;
  const $ = (id) => document.getElementById(id);
  const environment = new URLSearchParams(location.search).get("environment") === "external" ? "external" : "internal";
  const kind = environment === "external" ? "export" : "import";
  const kindLabels = Object.fromEntries(demo.catalogKinds.map(({ id, label }) => [id, label]));
  const packageSizeLimit = 5 * 1024 * 1024;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let draining = false;
  let reading = false;
  const history = window.BaigeTransferHistory.mount({
    kind, onDownload: downloadPackage, onManifest: downloadManifest,
  });

  function showRecords() {
    $("transferExport").hidden = true;
    $("transferHistory").hidden = false;
    $("transferExportEntry").hidden = true;
    $("transferNewTask").hidden = false;
    $("transferBack").hidden = true;
    history.render();
  }

  function downloadFile(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadPackage(bundle, name) {
    downloadFile(new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }), name);
  }

  function groupBy(items, keyOf) {
    const groups = new Map();
    for (const item of items) {
      const key = keyOf(item);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    return [...groups.values()];
  }

  function fileSource(item) {
    return {
      source: sourceName(item), sourceKey: item.id, kind: item.kind,
      sourceOwner: item.owner, sourceOwnerKey: item.ownerKey, sourceName: item.name,
      accessMode: item.accessMode,
    };
  }

  function downloadManifest(record) {
    const finishedAt = new Date(record.finishedAt || record.startedAt);
    const date = Number.isNaN(finishedAt.getTime()) ? "时间未记录" : new Intl.DateTimeFormat("zh-CN", {
      dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Shanghai"
    }).format(finishedAt);
    const labels = { success: "已入包", skipped: "未入包", failed: "导出失败", queued: "未处理" };
    const groups = groupBy(record.files, (file) => JSON.stringify([file.kind, file.sourceOwnerKey || file.sourceOwner || file.source]));
    const rows = groups.map((files) => {
      const first = files[0];
      const owner = [kindLabels[first.kind], first.sourceOwner].filter(Boolean).join(" / ") || first.source || "来源未记录";
      const libraries = groupBy(files, (file) => file.kind === "library" ? "" : file.sourceKey || file.sourceName || "");
      return `<section><h2>${escape(owner)}</h2>${libraries.map((library) => `
        ${library[0].sourceName && library[0].kind !== "library" ? `<h3>${escape(library[0].sourceName)}</h3>` : ""}
        <table><thead><tr><th>文件名称</th><th>结果</th><th>原因</th></tr></thead><tbody>
          ${library.map((file) => `<tr><td>${escape(file.name)}</td><td>${labels[file.state] || "未记录"}</td><td>${escape(file.reason || "—")}</td></tr>`).join("")}
        </tbody></table>`).join("")}</section>`;
    }).join("");
    const packed = record.files.filter((file) => file.state === "success").length;
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>摆渡文件清单</title>
      <style>body{max-width:960px;margin:32px auto;padding:0 16px;font:14px/1.6 system-ui,sans-serif;color:#1d2433}h1{font-size:24px}h2{font-size:17px}h3{font-size:14px}section{margin-top:24px}table{border-collapse:collapse;width:100%;margin-bottom:12px}th,td{padding:6px 8px;border:1px solid #e1e7f1;text-align:left;overflow-wrap:anywhere}th{background:#f4f6fb}</style>
      </head><body><h1>摆渡文件清单</h1><p>${escape(record.name)} · ${escape(date)} · 已入包 ${packed} 份 · 未入包 ${record.files.length - packed} 份</p>
      <p>任务编号 ${escape(record.id)}</p>${rows}</body></html>`;
    downloadFile(new Blob([html], { type: "text/html;charset=utf-8" }), record.name.replace(/\.json$/i, "") + "-文件清单.html");
  }

  function sourceName(item) {
    return item.kind === "library" ? `百舸文库 / ${item.owner}` : `${kindLabels[item.kind]} / ${item.owner} / ${item.name}`;
  }

  function newTask(name) {
    return {
      id: (kind === "import" ? "IN-" : "OUT-") + crypto.randomUUID(),
      kind, name, submittedBy: "管理员", startedAt: new Date().toISOString(),
      state: "running", phase: "排队中", totalKnown: false, total: 0, processed: 0, files: [], engineVersion: 1,
    };
  }

  function importFiles(rows) {
    return rows.flatMap((row) => row.files.map((file) => ({
      ...fileSource(row.item), name: file.name,
      target: row.targetName, targetName: row.item.kind === "library" && row.targetName ? "百舸文库" : row.targetName,
      targetOwner: row.targetOwner, targetOwnerKey: row.targetOwnerKey, targetKey: row.targetId,
      state: row.state === "blocked" ? "failed" : file.duplicate ? "skipped" : "success",
      reason: row.state === "blocked" ? row.reason : file.duplicate ? "内网同名文件已存在" : "",
    })));
  }

  async function runTask(task) {
    try {
      task.phase = task.kind === "import" ? "解析中" : "打包中";
      task.totalKnown = false;
      history.update(task);
      await wait(900);
      const bundle = demo.parsePackage(task.inputText);
      task.totalKnown = true;
      const entries = bundle.items.flatMap((item) => item.files.map((file) => ({ item, file })));
      if (!entries.length) throw new Error("摆渡包中没有文档。");
      task.total = entries.length;
      task.files = entries.map(({ item, file }) => ({ ...fileSource(item), name: file.name, state: "queued" }));
      task.phase = task.kind === "import" ? "解析中" : "打包中";
      task.processed = 0;
      history.update(task);
      const step = Math.max(1, Math.ceil(entries.length / 20));
      for (let index = 0; index < entries.length; index += step) {
        await wait(130);
        task.processed = Math.min(entries.length, index + step);
        task.currentFile = entries[Math.min(entries.length - 1, index + step - 1)].file.name;
        history.update(task);
      }
      if (task.kind === "import") {
        task.phase = "导入中";
        task.processed = 0;
        history.update(task);
        await wait(900);
        // Re-plan immediately before synchronous writing under the shared task lock.
        const rows = demo.planImport(bundle);
        const files = importFiles(rows);
        const applied = demo.applyImport(rows);
        task.files = files;
        task.grantsRestored = applied.grants;
        task.unmatchedPeople = rows.filter((row) => row.targetName)
          .flatMap((row) => row.missing.map((person) => ({ ...person, source: sourceName(row.item) })));
        task.missingGrants = task.unmatchedPeople.length;
        task.restoredPeople = rows.flatMap((row) => row.grantsAdded.map((person) => ({
          ...person, source: sourceName(row.item), scope: "整库授权，含内网已有文档",
        })));
        const failed = files.filter((file) => file.state === "failed").length;
        task.state = failed === files.length && !applied.grants ? "failed"
          : failed || task.missingGrants ? "partial" : "complete";
      } else {
        if (new Blob([task.inputText]).size > packageSizeLimit) throw new Error("摆渡包超过 5 MB，请减少文档后重新提交。");
        task.package = bundle;
        task.files.forEach((file) => { file.state = "success"; });
        task.state = "complete";
      }
      task.processed = task.total;
    } catch (error) {
      task.state = "failed";
      task.error = error.message || "任务处理失败，请重新提交。";
      task.files = task.files.map((file) => ({ ...file, state: "failed", reason: task.error }));
    }
    task.phase = "";
    task.currentFile = "";
    task.inputText = null;
    task.finishedAt = new Date().toISOString();
    history.update(task);
  }

  async function drain() {
    if (draining) return;
    draining = true;
    const run = async () => {
      history.refresh();
      let task;
      while ((task = history.records().reverse().find((record) =>
        record.state === "running" && record.engineVersion === 1 && typeof record.inputText === "string"))) {
        await runTask(task);
        history.refresh();
      }
    };
    try {
      if (navigator.locks) await navigator.locks.request("baige-transfer-task-runner", run);
      else await run();
    } finally {
      draining = false;
      if (history.records().some((record) => record.state === "running" && record.engineVersion === 1 && typeof record.inputText === "string")) {
        void drain();
      }
    }
  }

  function submitExport(bundle, name) {
    const task = { ...newTask(name), inputText: JSON.stringify(bundle), totalKnown: false };
    history.add(task);
    showRecords();
    void drain();
    return { submitted: true };
  }

  function readFile(file, task) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        task.uploadPercent = event.lengthComputable ? Math.floor(event.loaded / event.total * 100) : 0;
        history.update(task);
      };
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("文件上传失败，请重新选择摆渡包。"));
      reader.onabort = () => reject(new Error("文件上传已中断。"));
      reader.readAsText(file);
    });
  }

  $("transferSwitchEnvironment").addEventListener("click", () => {
    const embedded = new URLSearchParams(location.search).get("embed") === "admin";
    const next = kind === "import" ? "external" : "internal";
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ type: "baige:transfer-environment", environment: next }, "*");
      return;
    }
    const url = new URL(location.href);
    url.searchParams.set("environment", next);
    location.assign(url.href);
  });
  $("transferNewTask").addEventListener("click", () => {
    if (kind === "import") $("transferFile").click();
    else {
      $("transferHistory").hidden = true;
      $("transferExport").hidden = false;
      $("transferExportEntry").hidden = false;
      $("transferNewTask").hidden = true;
      $("transferBack").hidden = false;
    }
  });
  $("transferBack").addEventListener("click", showRecords);
  $("transferFile").addEventListener("change", async () => {
    const [file] = $("transferFile").files;
    $("transferFile").value = "";
    if (!file || reading) return;
    reading = true;
    $("transferNewTask").disabled = true;
    $("transferSwitchEnvironment").disabled = true;
    const task = { ...newTask(file.name), phase: "上传中", uploadPercent: 0 };
    history.add(task);
    showRecords();
    try {
      if (file.size > packageSizeLimit) throw new Error("摆渡包超过 5 MB，请选择较小的文件。");
      task.inputText = await readFile(file, task);
      task.phase = "排队中";
      history.update(task);
      void drain();
    } catch (error) {
      history.update({ ...task, state: "failed", phase: "", error: error.message, finishedAt: new Date().toISOString() });
    } finally {
      reading = false;
      $("transferNewTask").disabled = false;
      $("transferSwitchEnvironment").disabled = false;
    }
  });

  $("transferEnvironment").textContent = (kind === "import" ? "内网" : "外网") + " · 演示环境";
  $("transferSwitchEnvironment").textContent = kind === "import" ? "切换到外网" : "切换到内网";
  $("transferDescription").textContent = kind === "import"
    ? "选择外网摆渡包，解析后自动导入。支持 JSON，单包不超过 5 MB。"
    : "选择文档后后台打包，完成后从导出记录下载摆渡包。";
  $("transferNewTask").textContent = kind === "import" ? "导入" : "导出";
  if (kind === "export") window.BaigeTransferExport.mount({ onExport: submitExport });
  hydrate();
  showRecords();
  void drain();
})();
