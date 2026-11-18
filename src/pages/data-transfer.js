(() => {
  "use strict";

  const { escapeHtml: escape, icon, hydrate } = window.BaigeUI;
  const demo = window.BaigeTransferDemo;
  const packageSizeLimit = 5 * 1024 * 1024;
  const unmatchedPreviewLimit = 3;
  const $ = (id) => document.getElementById(id);
  const deployment = new URLSearchParams(location.search).get("environment");
  const kindLabels = Object.fromEntries(demo.catalogKinds.map(({ id, label }) => [id, label]));
  const previewStates = {
    all: "全部状态",
    ready: "可导入",
    blocked: "无法导入",
    duplicate: "同名已存在",
    missing: "人员未匹配",
    grants: "新增授权覆盖已有文档"
  };
  const previewTones = { ready: "is-success", blocked: "is-blocked" };
  const resultStates = { success: "已新增", skipped: "已跳过", failed: "无法导入" };
  const tabs = ["Export", "Import", "History"];
  const unavailableTab = deployment === "internal" ? "Export" : deployment === "external" ? "Import" : "";
  let bundle;
  let previewQueue = "all";
  let resultQueue = "success";
  let activeTab = deployment === "external" ? "Export" : "Import";
  let displayEnvironment = deployment === "external" ? "外网" : "内网";
  let activeJob;
  let taskNumber = 0;
  let readingPackage = false;

  const search = $("transferSearch");
  const previewPanel = $("transferPreview");
  const progressPanel = $("transferProgress");
  const resultPanel = $("transferResult");
  const importRows = $("transferImportRows");
  const queueSelect = $("transferQueues");
  const previewAll = $("transferPreviewAll");
  const confirm = $("transferConfirm");
  const fileInput = $("transferFile");
  const chooseFile = $("transferChooseFile");
  const history = window.BaigeTransferHistory.mount(unavailableTab === "Export"
    ? {} : { onDownload: downloadPackage, onManifest: downloadManifest });

  function setTab(name) {
    if (name === unavailableTab) return;
    activeTab = name;
    tabs.forEach((tab) => {
      $(`transfer${tab}Tab`).hidden = tab === unavailableTab;
      $(`transfer${tab}Tab`).setAttribute("aria-pressed", String(tab === name));
      $(`transfer${tab}`).hidden = tab !== name;
    });
    $("transferImportEntry").hidden = name !== "Import";
    $("transferExportEntry").hidden = name !== "Export";
    if (name !== "History" && !["internal", "external"].includes(deployment)) {
      displayEnvironment = name === "Export" ? "外网" : "内网";
    }
    $("transferEnvironment").textContent = `${displayEnvironment} · 演示环境`;
    if (name === "History") history.render();
    document.querySelector(".content-scroll").scrollTop = 0;
  }

  function syncHistoryCount() {
    const count = history.records().length;
    $("transferHistoryCount").hidden = !count;
    $("transferHistoryCount").textContent = count;
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

  function packageBlob(bundle) {
    return new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
  }

  function downloadPackage(bundle, name) {
    downloadFile(packageBlob(bundle), name);
  }

  function taskId(kind) {
    return `${kind === "import" ? "IN" : "OUT"}-${Date.now()}-${++taskNumber}`;
  }

  function fileSource(item) {
    return {
      source: sourceName(item),
      sourceKey: item.id,
      kind: item.kind,
      sourceOwner: item.owner,
      sourceOwnerKey: item.ownerKey,
      sourceName: item.name
    };
  }

  function exportTask(bundle, name, requestedFiles) {
    const startedAt = new Date().toISOString();
    const packed = bundle.items.flatMap((item) => item.files.map((file) => ({ item, file })));
    const remaining = new Map();
    const packedKey = (item, file) => JSON.stringify([item.id, file.name, file.text]);
    for (const { item, file } of packed) {
      const key = packedKey(item, file);
      remaining.set(key, (remaining.get(key) || 0) + 1);
    }
    const skipped = [];
    for (const { item, index } of requestedFiles) {
      const file = item.files[index];
      const key = packedKey(item, file);
      const count = remaining.get(key) || 0;
      if (count) remaining.set(key, count - 1);
      else skipped.push({ ...fileSource(item), name: file.name, state: "skipped", reason: "生成的摆渡包中没有此文件" });
    }

    const blob = packageBlob(bundle);
    let failure = "";
    if (!packed.length) failure = "没有可打包的文件。";
    else if (blob.size > packageSizeLimit) failure = "摆渡包超过 5 MB 导入上限，请减少所选文件后重新导出。";
    else {
      try {
        downloadFile(blob, name);
      } catch {
        failure = "浏览器未能发起下载，请重新导出。";
      }
    }

    const files = [
      ...packed.map(({ item, file }) => ({
        ...fileSource(item), name: file.name, state: failure ? "failed" : "success", reason: failure
      })),
      ...skipped
    ];
    history.add({
      id: taskId("export"), kind: "export", name, startedAt, finishedAt: new Date().toISOString(),
      state: failure ? "failed" : skipped.length ? "partial" : "complete",
      total: files.length, processed: files.length, files, ...(failure ? { error: failure } : { package: bundle })
    });
    syncHistoryCount();
    return { downloaded: !failure, skipped, error: failure };
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

  function countFiles(rows) {
    return rows.reduce((sum, row) => sum + row.files.length, 0);
  }

  function queueOf(row) {
    if (row.state !== "matched") return row.state;
    if (!row.grantsAdded.length && row.files.length && row.files.every((file) => file.duplicate)) return "duplicate";
    return "ready";
  }

  function countPreview(rows) {
    const ready = rows.filter((row) => queueOf(row) === "ready");
    const readyDuplicates = ready.reduce((sum, row) => sum + row.files.filter((file) => file.duplicate).length, 0);
    return {
      add: countFiles(ready) - readyDuplicates,
      duplicates: readyDuplicates + countFiles(rows.filter((row) => queueOf(row) === "duplicate")),
      blocked: rows.filter((row) => row.state === "blocked").length,
      grants: ready.reduce((sum, row) => sum + row.grantsAdded.length, 0),
      missing: rows.reduce((sum, row) => sum + row.missing.length, 0),
    };
  }

  function queueButtons(labels, selected, counts, type) {
    return Object.entries(labels).map(([key, label]) =>
      `<button type="button" data-${type}-queue="${key}" aria-pressed="${key === selected}">${label}<span>${counts[key] || 0}</span></button>`
    ).join("");
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

  function groupByKind(items, kindOf) {
    return demo.catalogKinds.map((kind) => ({
      ...kind,
      entries: items.filter((item) => kindOf(item) === kind.id)
    })).filter(({ entries }) => entries.length);
  }

  function importGroup({ level, name, glyph, count, open, key, context = "" }, body) {
    return `<details class="transfer-${level}-group"${key ? ` data-preview-group="${escape(key)}"` : ""}${open ? " open" : ""}>
      <summary class="transfer-group-head">
        ${icon("chevron")}${icon(glyph)}<strong>${escape(name)}</strong>
        ${context ? `<span class="transfer-group-context">${escape(context)}</span>` : ""}
        <span class="transfer-group-count">${escape(count)}</span>
      </summary>
      <div class="transfer-group-body">${body}</div>
    </details>`;
  }

  function permitNote(row) {
    if (row.item.kind === "enterprise") return "企业成员可见";
    if (row.item.kind === "personal") return "仅本人可见";
    if (row.item.kind === "library") return row.item.accessMode === "limited" ? "有限公开" : "全部公开";
    return "同名匹配";
  }

  function statusLabel(state) {
    return `<span class="transfer-review-state ${previewTones[state] || ""}">${previewStates[state]}</span>`;
  }

  function hasExistingGrants(row) {
    return row.grantsAdded.length > 0;
  }

  function previewItems(label, entries, renderItem, note = "", more = "") {
    if (!entries.length) return "";
    return `<div class="transfer-route-outcome">
      <dt>${label}</dt>
      <dd>
        ${note ? `<p class="transfer-route-outcome-note">${note}</p>` : ""}
        <ul>${entries.map(renderItem).join("")}</ul>
        ${more}
      </dd>
    </div>`;
  }

  function previewUnmatched(row, renderPerson, query, openGroups) {
    const { missing } = row;
    const label = `${missing.length} 人未匹配`;
    const note = "内网找不到对应人员，本次不恢复。";
    if (missing.length <= unmatchedPreviewLimit) return previewItems(label, missing, renderPerson, note);

    let people = missing;
    if (query) {
      const matches = [];
      const others = [];
      for (const person of missing) {
        const group = person.name.toLowerCase().includes(query) ? matches : others;
        group.push(person);
      }
      people = matches.concat(others);
    }
    const remaining = people.slice(unmatchedPreviewLimit);
    const key = JSON.stringify([row.item.id, "unmatched", "people"]);
    const more = `<details class="transfer-unmatched-more" data-preview-group="${escape(key)}"${openGroups.get(key) ? " open" : ""}>
      <summary><span>展开其余 ${remaining.length} 人</span><span>收起其余 ${remaining.length} 人</span></summary>
      <ul tabindex="0" aria-label="其余未匹配人员">${remaining.map(renderPerson).join("")}</ul>
    </details>`;
    return previewItems(label, people.slice(0, unmatchedPreviewLimit), renderPerson, note, more);
  }

  function previewChanges(row, query, openGroups) {
    const files = row.files.filter((file) => !file.duplicate);
    const duplicates = row.files.filter((file) => file.duplicate);
    const fileItem = ({ name }) => `<li>${icon("file")}<span>${escape(name)}</span></li>`;
    const personItem = ({ name, department }) => `<li><span>${escape(name)}</span><small>${escape(department)}</small></li>`;
    const { grantsAdded, missing } = row;
    const showPermissions = grantsAdded.length > 0 || missing.length > 0;
    const fileAction = row.state === "matched" ? "将新增" : "无法导入";
    return `<div class="transfer-route-body">
      <section class="transfer-route-documents">
        <h5>文档处理</h5>
        ${row.files.length ? `<dl class="transfer-route-outcomes">
          ${previewItems(`${fileAction} ${files.length} 份`, files, fileItem)}
          ${previewItems(`同名跳过 ${duplicates.length} 份`, duplicates, fileItem)}
        </dl>` : '<p class="transfer-subline">此条目没有文件。</p>'}
      </section>
      ${showPermissions ? `<section class="transfer-route-permissions">
        <h5>权限处理</h5>
        <dl class="transfer-route-outcomes">
          ${previewItems(`将恢复授权 ${grantsAdded.length} 人`, grantsAdded, personItem,
            '<strong class="transfer-review-impact">整库授权，含内网已有文档</strong>')}
          ${previewUnmatched(row, personItem, query, openGroups)}
        </dl>
      </section>` : ""}
    </div>`;
  }

  function previewRow(row, query, openGroups, libraryFile) {
    const note = row.targetName ? permitNote(row) : "";
    const destination = row.item.kind === "library" ? "百舸文库" : row.targetName;
    const title = libraryFile?.name || row.item.name;
    const sourceTitle = libraryFile && row.item.name !== title && row.item.name !== title.replace(/\.[^.]+$/, "") ? row.item.name : "";
    return `<article class="transfer-route">
      <div class="transfer-route-map">
        <div class="transfer-route-source">
          <div><h4 class="transfer-route-title">${icon(libraryFile ? "file" : "folder")}${escape(title)}</h4>
            ${sourceTitle ? `<span class="transfer-subline">${escape(sourceTitle)}</span>` : ""}</div>
        </div>
        <span class="transfer-route-arrow">${icon("arrow")}</span>
        <div class="transfer-route-target">
          ${row.targetName ? `<h4 class="transfer-route-title">${escape(destination)}</h4><span class="transfer-subline">内网 · ${escape(row.targetOwner)}${note ? ` · ${note}` : ""}</span>`
            : `<span class="transfer-route-reason">${escape(row.reason)}</span>`}
        </div>
        <div class="transfer-route-actions">
          ${statusLabel(libraryFile?.duplicate ? "duplicate" : queueOf(row))}
        </div>
      </div>
      ${libraryFile ? "" : previewChanges(row, query, openGroups)}
    </article>`;
  }

  function renderPreview(resetGroups = false) {
    const openGroups = new Map(resetGroups ? [] : [...importRows.querySelectorAll("[data-preview-group]")]
      .map((group) => [group.dataset.previewGroup, group.open]));
    const previewRows = demo.planImport(bundle);
    const counts = {
      all: previewRows.length,
      missing: previewRows.filter((row) => row.missing.length).length,
      grants: previewRows.filter(hasExistingGrants).length
    };
    for (const row of previewRows) {
      const status = queueOf(row);
      counts[status] = (counts[status] || 0) + 1;
    }
    queueSelect.innerHTML = Object.entries(previewStates).map(([key, label]) =>
      `<option value="${key}">${label}（${counts[key] || 0}）</option>`).join("");
    queueSelect.value = previewQueue;
    const query = search.value.trim().toLowerCase();
    const visibleRows = previewRows.filter((row) => {
      const matches = previewQueue === "all" || queueOf(row) === previewQueue
        || (previewQueue === "missing" && row.missing.length) || (previewQueue === "grants" && hasExistingGrants(row));
      const fields = [kindLabels[row.item.kind], row.item.name, row.item.owner, row.targetName, row.targetOwner,
        ...row.files.map((file) => file.name), ...row.missing.map((person) => person.name), ...row.grantsAdded.map((person) => person.name)];
      return matches && fields.some((value) => value.toLowerCase().includes(query));
    });
    importRows.innerHTML = renderPreviewList(visibleRows, query, openGroups);
    $("transferVisibleCount").textContent = `显示 ${visibleRows.length} / ${previewRows.length} 项来源`;
    previewAll.hidden = previewQueue === "all" && !query;

    const summary = countPreview(previewRows);
    $("transferImportCount").innerHTML = [
      `<span class="transfer-review-metric"><strong>${summary.add}</strong> 份将新增</span>`,
      `<span class="transfer-review-metric"><strong>${summary.duplicates}</strong> 份同名跳过</span>`,
      `<button type="button" class="transfer-review-metric is-blocked" data-summary-queue="blocked"${summary.blocked ? "" : " disabled"}>
        <strong>${summary.blocked}</strong> 项无法导入</button>`
    ].join("");
    $("transferReviewNotes").innerHTML = [
      `<span>恢复 ${summary.grants} 条授权</span>`,
      summary.grants ? `<button type="button" class="transfer-link transfer-review-impact" data-summary-queue="grants">${summary.grants} 条授权涉及已有文档</button>` : "",
      summary.missing ? `<button type="button" class="transfer-link transfer-review-impact" data-summary-queue="missing">${summary.missing} 条授权未匹配人员</button>` : "<span>未匹配人员授权 0 条</span>"
    ].filter(Boolean).join(" · ");
    const hasChanges = summary.add + summary.grants > 0;
    confirm.disabled = readingPackage || !hasChanges;
    confirm.title = hasChanges ? "" : "当前没有新增文件或可恢复授权";
  }

  function renderPreviewList(visibleRows, query, openGroups) {
    if (!visibleRows.length) return `<p class="transfer-empty">${query ? "没有符合搜索条件的条目。" : "此状态暂无条目。"}</p>`;
    const groups = groupByKind(visibleRows, ({ item }) => item.kind);
    const expandKinds = groups.length === 1 || Boolean(query) || previewQueue !== "all";
    const sections = groups.map((kind) => {
      const summary = countPreview(kind.entries);
      const key = `kind-${kind.id}`;
      const count = [
        `${countFiles(kind.entries)} 份文件`,
        summary.add ? `将新增 ${summary.add} 份` : "",
        summary.blocked ? `${summary.blocked} 项无法导入` : ""
      ].filter(Boolean).join(" · ");
      const owners = groupBy(kind.entries, ({ item }) => item.ownerKey).map((rows) => {
        const { item } = rows[0];
        const ownerKey = JSON.stringify([kind.id, item.ownerKey]);
        const add = countPreview(rows).add;
        const ownerCount = kind.id === "library" ? `${countFiles(rows)} 份文件` : `${rows.length} 个库`;
        const body = rows.map((row) => kind.id === "library" && row.files.length
          ? row.files.map((file) => previewRow(row, query, openGroups, file)).join("")
          : previewRow(row, query, openGroups)).join("");
        return importGroup({
          level: "owner", name: item.owner, glyph: kind.ownerIcon, count: `${ownerCount} · 将新增 ${add} 份`,
          open: openGroups.get(ownerKey) ?? true, key: ownerKey
        }, body);
      }).join("");
      return importGroup({
        level: "kind", name: kind.label, glyph: "book", count, key, open: openGroups.get(key) ?? expandKinds
      }, owners);
    }).join("");
    return `<div class="transfer-route-map transfer-route-columns" aria-hidden="true">
      <span>外网来源</span><span></span><span>内网去向</span><span>状态</span>
    </div>${sections}`;
  }

  function setQueue(queue) {
    previewQueue = queue;
    importRows.scrollTop = 0;
    renderPreview(true);
  }

  function loadPackage(next, name) {
    bundle = next;
    activeJob = null;
    importRows.scrollTop = 0;
    search.value = "";
    $("transferPackageName").textContent = name;
    $("transferPackageInfo").textContent = `${bundle.items.length} 项内容 · ${countFiles(bundle.items)} 份文件`;
    $("transferImportError").hidden = true;
    progressPanel.hidden = true;
    resultPanel.hidden = true;
    previewPanel.hidden = false;
    setQueue("all");
  }

  function importFiles(rows) {
    return rows.flatMap((row) => row.files.map((file) => {
      const finalState = row.state === "blocked" ? "failed" : file.duplicate ? "skipped" : "success";
      const reason = row.state === "blocked" ? row.reason : file.duplicate ? "内网同名文件已存在" : "";
      return {
        ...fileSource(row.item), name: file.name, target: row.targetName, state: "queued", finalState, reason,
        targetOwner: row.targetOwner, targetOwnerKey: row.targetOwnerKey,
        targetName: row.item.kind === "library" && row.targetName ? "百舸文库" : row.targetName, targetKey: row.targetId
      };
    }));
  }

  function unmatchedPeople(rows) {
    return rows.filter((row) => row.targetName)
      .flatMap((row) => row.missing.map((person) => ({ ...person, source: sourceName(row.item) })));
  }

  function taskSnapshot(task) {
    return {
      ...task,
      files: task.files.map(({ finalState, ...file }) => ({
        ...file, state: file.state === "validated" ? "queued" : file.state
      }))
    };
  }

  function progress() {
    const task = activeJob;
    const percent = task.total ? Math.floor(task.processed / task.total * 100) : 100;
    $("transferProgressPhase").textContent = task.phase;
    $("transferProgressPercent").textContent = `${percent}%`;
    $("transferProgressBar").value = percent;
    $("transferProgressCount").textContent = `已核对 ${task.processed} / ${task.total} 份文件`;
    $("transferProgressElapsed").textContent = `耗时 ${Math.floor((Date.now() - Date.parse(task.startedAt)) / 1000)} 秒`;
    $("transferCurrentFile").textContent = task.currentFile ? `当前文件：${task.currentFile}`
      : task.phase === "写入内网目录" ? "正在保存本次新增文件和授权。" : "正在核对摆渡包和内网归属。";
    const recent = task.files.slice(0, task.processed).slice(-3).reverse();
    $("transferRecentFiles").innerHTML = recent.length
      ? recent.map((file) => `<li><span>${escape(file.name)}</span><span class="transfer-status is-${file.state}">${file.state === "validated" ? "已核对 · 待写入" : resultStates[file.state]}</span></li>`).join("")
      : '<li class="transfer-subline">等待处理第一份文件。</li>';
  }

  function resultCounts() {
    const counts = { success: 0, skipped: 0, failed: 0 };
    activeJob.files.forEach((file) => { counts[file.state]++; });
    return counts;
  }

  function renderResultFiles(files) {
    const list = (items) => `<ul class="transfer-result-file-list">${items.map((file) => `<li>
            <span class="transfer-result-filename">${icon("file")}${escape(file.name)}</span>
            <small>${escape(file.source)}</small>
            ${file.reason ? `<span class="transfer-result-reason">${escape(file.reason)}</span>` : ""}
          </li>`).join("")}</ul>`;
    const count = (items) => `${resultStates[resultQueue]} ${items.length} 份`;
    const groups = groupByKind(files, (file) => file.kind);
    return groups.map((kind) => {
      const owners = groupBy(kind.entries, (file) => JSON.stringify(file.targetKey
        ? ["target", file.targetOwnerKey] : ["source", file.sourceOwnerKey]));
      const body = owners.map((items) => {
        const first = items[0];
        const locations = kind.id === "library" ? list(items) : groupBy(items, (file) => file.targetKey || file.sourceKey)
          .map((location) => `<section class="transfer-result-location">
            <h4 class="transfer-route-title">${icon("folder")}${escape(location[0].targetName || location[0].sourceName)}</h4>
            ${list(location)}
          </section>`).join("");
        return importGroup({
          level: "owner", name: first.targetOwner || first.sourceOwner, glyph: kind.ownerIcon, count: count(items),
          open: true, context: first.targetKey ? "内网归属" : "外网归属"
        }, locations);
      }).join("");
      return importGroup({
        level: "kind", name: kind.label, glyph: "book", count: count(kind.entries), open: groups.length === 1
      }, body);
    }).join("");
  }

  function renderResult(focus = false) {
    const counts = resultCounts();
    $("transferResultQueues").innerHTML = queueButtons(resultStates, resultQueue, counts, "result");
    $("transferResultMeta").textContent = `${activeJob.name} · ${bundle.items.length} 项内容 · 已处理 ${activeJob.processed} 份文件`;
    $("transferResultFeedback").textContent = activeJob.error ||
      `导入成功 ${counts.success} 份，跳过 ${counts.skipped} 份，无法导入 ${counts.failed} 份。恢复 ${activeJob.grantsRestored} 条授权，${activeJob.missingGrants} 条授权因人员未匹配而未恢复。`;
    const rows = activeJob.files.filter((file) => file.state === resultQueue);
    $("transferResultRows").innerHTML = rows.length ? `<div class="transfer-result-destinations">${renderResultFiles(rows)}</div>`
      : '<p class="transfer-empty">此结果清单暂无文件。</p>';
    const missing = activeJob.unmatchedPeople;
    if (missing.length) {
      $("transferResultRows").insertAdjacentHTML("beforeend", `<details class="transfer-result-permissions"><summary>未恢复的人员授权（${missing.length} 条）</summary><ul>
        ${missing.map((entry) => `<li>${escape(entry.name)} · ${escape(entry.department)}<span class="transfer-subline">${escape(entry.source)}</span></li>`).join("")}
      </ul></details>`);
    }
    if (focus) $("transferResultQueues").querySelector('[aria-pressed="true"]')?.focus();
  }

  async function startImport() {
    if (readingPackage || activeJob?.state === "running") return;
    const rows = demo.planImport(bundle);
    const files = importFiles(rows);
    const task = {
      id: taskId("import"), kind: "import", name: $("transferPackageName").textContent, startedAt: new Date().toISOString(),
      state: "running", total: files.length, processed: 0, files, phase: "校验摆渡包", currentFile: "",
      grantsRestored: 0, missingGrants: 0, unmatchedPeople: []
    };
    activeJob = task;
    chooseFile.disabled = true;
    previewPanel.hidden = true;
    progressPanel.hidden = false;
    document.querySelector(".content-scroll").scrollTop = 0;
    $("transferProgressMeta").textContent = `${task.name} · ${$("transferPackageInfo").textContent}`;
    $("transferProgressTitle").focus();
    history.add(taskSnapshot(task));
    syncHistoryCount();
    progress();
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    await wait(420);
    task.phase = "核对文件与权限";
    const delay = Math.max(35, Math.min(430, 4200 / Math.max(1, files.length)));
    for (const file of files) {
      task.currentFile = file.name;
      progress();
      await wait(delay);
      file.state = file.finalState === "success" ? "validated" : file.finalState;
      task.processed++;
      history.update(taskSnapshot(task));
    }

    task.phase = "写入内网目录";
    task.currentFile = "";
    progress();
    await wait(350);
    const currentRows = demo.planImport(bundle);
    const results = importFiles(currentRows);
    task.files = results;
    try {
      const applied = demo.applyImport(currentRows);
      task.grantsRestored = applied.grants;
      task.unmatchedPeople = unmatchedPeople(currentRows);
      task.missingGrants = task.unmatchedPeople.length;
      results.forEach((file) => { file.state = file.finalState; });
    } catch {
      task.error = "浏览器未能保存内网演示目录。请检查存储空间后重新导入。";
      results.forEach((file) => {
        file.state = file.finalState === "success" ? "failed" : file.finalState;
        if (file.finalState === "success") file.reason = "演示目录写入失败";
      });
    }

    const result = resultCounts();
    task.state = task.error ? "failed" : result.failed ? (result.success || task.grantsRestored ? "partial" : "failed")
      : result.skipped || task.missingGrants ? "partial" : "complete";
    task.finishedAt = new Date().toISOString();
    task.currentFile = "";
    task.phase = "";
    history.update(taskSnapshot(task));
    chooseFile.disabled = false;
    progressPanel.hidden = true;
    resultPanel.hidden = false;
    resultQueue = result.success ? "success" : result.failed ? "failed" : "skipped";
    renderResult();
    if (activeTab === "Import") $("transferResultTitle").focus();
  }

  tabs.forEach((tab) => $(`transfer${tab}Tab`).addEventListener("click", () => setTab(tab)));
  $("transferViewHistory").addEventListener("click", () => {
    setTab("History");
    $("transferHistoryTab").focus();
  });
  queueSelect.addEventListener("change", () => setQueue(queueSelect.value));
  previewAll.addEventListener("click", () => {
    search.value = "";
    setQueue("all");
    queueSelect.focus();
  });
  $("transferPreview").querySelector(".transfer-review-overview").addEventListener("click", (event) => {
    const button = event.target.closest("[data-summary-queue]");
    if (!button) return;
    search.value = "";
    setQueue(button.dataset.summaryQueue);
    queueSelect.focus();
  });
  $("transferResultQueues").addEventListener("click", (event) => {
    const button = event.target.closest("[data-result-queue]");
    if (!button) return;
    resultQueue = button.dataset.resultQueue;
    renderResult(true);
  });
  search.addEventListener("input", () => {
    importRows.scrollTop = 0;
    renderPreview(true);
  });
  chooseFile.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const [file] = fileInput.files;
    if (!file || activeJob?.state === "running") return;
    fileInput.value = "";
    readingPackage = true;
    confirm.disabled = true;
    chooseFile.disabled = true;
    try {
      if (file.size > packageSizeLimit) throw new Error("演示包上限为 5 MB，请选择较小的文件。");
      loadPackage(demo.parsePackage(await file.text()), file.name);
    } catch (error) {
      const errorMessage = $("transferImportError");
      errorMessage.textContent = error.message || "读取失败，请重新选择摆渡包。";
      errorMessage.hidden = false;
    } finally {
      readingPackage = false;
      if (!previewPanel.hidden) renderPreview();
      chooseFile.disabled = false;
      chooseFile.focus();
    }
  });

  confirm.addEventListener("click", startImport);
  if (unavailableTab !== "Export") window.BaigeTransferExport.mount({ onExport: exportTask });
  hydrate();
  syncHistoryCount();
  loadPackage(demo.examplePackage, "外网摆渡示例包");
  setTab(activeTab);
})();
