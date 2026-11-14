(() => {
  "use strict";

  const { escapeHtml, icon } = window.BaigeUI;
  const storageKey = "baige-data-transfer-history-v1";
  const taskStates = {
    running: ["处理中", "running"],
    complete: ["已完成", "good"],
    partial: ["部分完成", "warning"],
    failed: ["失败", "blocked"],
    interrupted: ["已中断", "blocked"]
  };
  const fileStates = {
    success: ["成功", "good"],
    skipped: ["跳过", "neutral"],
    failed: ["失败", "blocked"],
    queued: ["未处理", "neutral"]
  };
  const sourceKindLabels = {
    department: "部门知识库",
    enterprise: "企业知识库",
    personal: "个人知识库",
    library: "百舸文库"
  };
  const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
  });

  function loadSavedRecords() {
    try {
      const records = JSON.parse(localStorage.getItem(storageKey) || "[]");
      if (Array.isArray(records)) {
        return records.filter((record) => record?.id != null && ["export", "import"].includes(record.kind)
          && Object.hasOwn(taskStates, record.state) && Array.isArray(record.files)
          && record.files.every((file) => file && Object.hasOwn(fileStates, file.state)));
      }
    } catch {
      // The record list can still operate while browser storage is unavailable.
    }
    return [];
  }

  function formatDate(value) {
    const date = value == null ? null : new Date(value);
    return date && Number.isFinite(date.getTime()) ? dateFormatter.format(date) : "—";
  }

  function fileCounts(files) {
    const counts = { success: 0, skipped: 0, failed: 0, queued: 0 };
    for (const file of files) {
      if (Object.hasOwn(counts, file.state)) counts[file.state] += 1;
    }
    return counts;
  }

  function statusChip(label, tone) {
    return `<span class="transfer-history-status is-${tone}">${label}</span>`;
  }

  function renderStatus(record) {
    const [label, tone] = taskStates[record.state] || taskStates.interrupted;
    return statusChip(record.state === "running" ? (record.kind === "import" ? "导入中" : "导出中") : label, tone);
  }

  const taskType = (record) => record.kind === "import" ? "导入" : "导出";

  function renderProgress(record) {
    const total = Math.max(Number(record.total) || 0, 0);
    const processed = Math.min(Math.max(Number(record.processed) || 0, 0), total);
    const percent = total > 0 ? Math.floor(processed * 100 / total) : 0;
    return `<div class="transfer-history-progress">
      <progress max="100" value="${percent}" aria-label="${taskType(record)}进度"></progress>
      <span>${processed} / ${total} 份</span>
    </div>`;
  }

  function renderOutcome(record) {
    if (record.state === "running") return renderProgress(record);
    const { success, skipped, failed, queued } = fileCounts(record.files);
    const successLabel = record.kind === "export" ? "已打包" : "成功";
    return `<span class="transfer-history-outcome">${successLabel} ${success} · 跳过 ${skipped} · 失败 ${failed}${queued ? ` · 未处理 ${queued}` : ""}</span>`;
  }

  function renderFile(file, kind) {
    const [label, tone] = fileStates[file.state] || fileStates.queued;
    return `<tr>
      <td data-label="文件名称"><strong>${escapeHtml(file.name)}</strong></td>
      ${kind === "import" ? `<td data-label="来源">${escapeHtml(file.source || [file.sourceOwner, file.sourceName].filter(Boolean).join(" / ") || "—")}</td>` : ""}
      <td data-label="处理结果">${statusChip(kind === "export" && file.state === "success" ? "已打包" : label, tone)}
        ${file.reason ? `<small>${escapeHtml(file.reason)}</small>` : ""}</td>
    </tr>`;
  }

  function renderImportedFiles(files) {
    const owners = new Map();
    for (const file of files) {
      const targetName = file.targetName || file.target;
      const ownerName = file.targetOwner || (targetName ? "内网归属未记录" : "未确定内网去向");
      const ownerKind = file.kind === "personal" || file.kind === "enterprise" ? file.kind : "department";
      const ownerKey = JSON.stringify([ownerKind, file.targetOwnerKey || ownerName]);
      if (!owners.has(ownerKey)) owners.set(ownerKey, { name: ownerName, destinations: new Map() });
      const { destinations } = owners.get(ownerKey);
      const targetKey = file.targetKey || targetName || "";
      if (!destinations.has(targetKey)) destinations.set(targetKey, { name: targetName, files: [] });
      destinations.get(targetKey).files.push(file);
    }

    return [...owners.values()].map(({ name, destinations }) => `
      <tr class="transfer-history-owner"><th colspan="3">${escapeHtml(name)}</th></tr>
      ${[...destinations.values()].map((destination) => `
        ${destination.name ? `<tr class="transfer-history-destination"><th colspan="3">
          ${icon("folder")}<span>${escapeHtml(destination.name)}</span><small>${destination.files.length} 份</small>
        </th></tr>` : ""}
        ${destination.files.map((file) => renderFile(file, "import")).join("")}
      `).join("")}`).join("");
  }

  function exportSource(file) {
    const [legacyType, legacyOwner, ...legacyNameParts] = String(file.source || "").split(" / ");
    const legacyKind = Object.keys(sourceKindLabels).find((kind) => sourceKindLabels[kind] === legacyType);
    const kind = Object.hasOwn(sourceKindLabels, file.kind) ? file.kind : legacyKind;
    if (!kind) return { owner: file.source || "来源未记录", kind: "", name: "" };

    const owner = file.sourceOwner || (legacyKind === kind ? legacyOwner : "");
    const name = kind === "library" ? "" : file.sourceName || (legacyKind === kind ? legacyNameParts.join(" / ") : file.source);
    return { owner, kind, name };
  }

  function summarizeExportFiles(files) {
    const { success, skipped, failed, queued } = fileCounts(files);
    return [
      success && `已打包 ${success} 份`,
      skipped && `跳过 ${skipped} 份`,
      failed && `失败 ${failed} 份`,
      queued && `未处理 ${queued} 份`
    ].filter(Boolean).join(" · ");
  }

  function renderExportedFiles(files) {
    const owners = new Map();
    for (const file of files) {
      const { owner, kind, name } = exportSource(file);
      const ownerKey = JSON.stringify([kind, file.sourceOwnerKey || owner]);
      if (!owners.has(ownerKey)) owners.set(ownerKey, { owner, kind, libraries: new Map() });
      const { libraries } = owners.get(ownerKey);
      const sourceKey = name ? file.sourceKey || name : "";
      if (!libraries.has(sourceKey)) libraries.set(sourceKey, { name, files: [] });
      libraries.get(sourceKey).files.push(file);
    }

    return [...owners.values()].map(({ owner, kind, libraries }) => {
      const label = [sourceKindLabels[kind], owner].filter(Boolean).join(" / ");
      const directFiles = libraries.get("")?.files;
      return `<tr class="transfer-history-owner"><th colspan="2">
        <span>${escapeHtml(label)}</span>${directFiles ? `<small>${summarizeExportFiles(directFiles)}</small>` : ""}
      </th></tr>
      ${[...libraries.values()].map((library) => `
        ${library.name ? `<tr class="transfer-history-destination"><th colspan="2">
          ${icon("folder")}<span>${escapeHtml(library.name)}</span><small>${summarizeExportFiles(library.files)}</small>
        </th></tr>` : ""}
        ${library.files.map((file) => renderFile(file, "export")).join("")}
      `).join("")}`;
    }).join("");
  }

  function mount({ onDownload, onManifest }) {
    const root = document.getElementById("transferHistory");
    const recordsById = new Map(loadSavedRecords().map((record) => [String(record.id), record]));
    const activeIds = new Set();
    // Every unfinished record loaded into a new page stays viewable with the completed file outcomes.
    for (const record of recordsById.values()) {
      if (record.state === "running") record.state = "interrupted";
    }

    root.innerHTML = `<section class="transfer-history-panel" aria-labelledby="transferHistoryTitle">
      <header class="transfer-history-header">
        <h2 id="transferHistoryTitle">导入导出记录</h2>
      </header>
      <div class="transfer-history-toolbar">
        <div class="transfer-history-filters" role="group" aria-label="筛选摆渡记录">
          <select class="iam-input" id="transferHistoryKind" aria-label="筛选任务类型">
            <option value="">全部类型</option><option value="import">导入</option><option value="export">导出</option>
          </select>
          <select class="iam-input" id="transferHistoryState" aria-label="筛选任务状态">
            <option value="">全部状态</option>
            ${Object.entries(taskStates).map(([state, [label]]) => `<option value="${state}">${label}</option>`).join("")}
          </select>
        </div>
        <label class="transfer-history-search">${icon("search")}
          <input class="iam-input" type="search" id="transferHistorySearch" placeholder="搜索摆渡包或任务编号" aria-label="搜索摆渡包或任务编号" />
        </label>
      </div>
      <p class="transfer-history-storage" id="transferHistoryStorage" role="status" hidden></p>
      <div class="transfer-history-table-wrap">
        <table class="transfer-history-table" role="table">
          <thead><tr>
            <th scope="col">摆渡包</th><th scope="col">任务类型</th><th scope="col">开始时间</th>
            <th scope="col">状态</th><th scope="col">文件处理情况</th><th scope="col">操作</th>
          </tr></thead>
          <tbody id="transferHistoryRows"></tbody>
        </table>
      </div>
      <footer class="transfer-history-footer" id="transferHistorySummary" role="status"></footer>
    </section>
    <dialog id="transferHistoryDialog" class="iam-dialog transfer-history-dialog" aria-labelledby="transferHistoryDetailTitle">
      <header class="iam-dialog-head">
        <h2 id="transferHistoryDetailTitle">摆渡任务详情</h2>
        <button type="button" class="iam-dialog-close" id="transferHistoryClose" aria-label="关闭详情">${icon("close")}</button>
      </header>
      <div class="iam-dialog-body">
        <div id="transferHistoryMeta"></div>
        <div class="transfer-history-detail-heading">
          <h3 id="transferHistoryFilesTitle">文件清单</h3>
          <select class="iam-input" id="transferHistoryFileState" aria-label="筛选文件处理结果"></select>
        </div>
        <div class="transfer-history-table-wrap">
          <table class="transfer-history-table transfer-history-file-table" id="transferHistoryFileTable" role="table">
            <thead><tr><th scope="col">文件名称</th><th scope="col" id="transferHistorySourceHead">来源</th><th scope="col">处理结果</th></tr></thead>
            <tbody id="transferHistoryFileRows"></tbody>
          </table>
        </div>
      </div>
      <footer class="iam-dialog-foot">
        <button class="iam-btn" type="button" data-history-close>关闭</button>
        <button class="iam-btn" type="button" id="transferHistoryManifest" hidden>${icon("download")} 下载文件清单</button>
        <button class="iam-btn is-primary" type="button" id="transferHistoryDownload" hidden>${icon("download")} 重新下载摆渡包</button>
      </footer>
    </dialog>`;

    const get = (id) => root.querySelector(`#${id}`);
    const queryInput = get("transferHistorySearch");
    const kindInput = get("transferHistoryKind");
    const stateInput = get("transferHistoryState");
    const rows = get("transferHistoryRows");
    const detail = get("transferHistoryDialog");
    const fileFilter = get("transferHistoryFileState");
    const manifest = get("transferHistoryManifest");
    const download = get("transferHistoryDownload");
    let openId = null;

    function records() {
      return [...recordsById.values()].sort((left, right) => new Date(right.startedAt) - new Date(left.startedAt));
    }

    function renderFileRows(record) {
      const filter = fileFilter.value;
      const files = record.files.filter((file) => !filter || filter === file.state);
      const body = get("transferHistoryFileRows");
      const isExport = record.kind === "export";
      body.innerHTML = files.length ? (isExport ? renderExportedFiles(files) : renderImportedFiles(files))
        : `<tr><td colspan="${isExport ? 2 : 3}" class="transfer-history-empty">没有符合条件的文件。</td></tr>`;
    }

    function renderDetail(record) {
      const counts = fileCounts(record.files);
      const unmatchedPeople = Array.isArray(record.unmatchedPeople) ? record.unmatchedPeople : [];
      const newLibraries = Array.isArray(record.newLibrariesDetails) ? record.newLibrariesDetails : [];
      const summary = record.kind === "import"
        ? [
          record.newLibraries ? `新建库 ${Number(record.newLibraries)} 个` : "",
          record.grantsRestored ? `恢复授权 ${Number(record.grantsRestored)} 条` : "",
          record.missingGrants ? `未匹配授权 ${Number(record.missingGrants)} 条` : ""
        ].filter(Boolean).join(" · ")
        : "";
      get("transferHistoryMeta").innerHTML = `<div class="transfer-history-detail-title">
        ${icon("file")} <strong>${escapeHtml(record.name)}</strong> ${renderStatus(record)}
      </div>
      <dl class="transfer-history-meta">
        <div><dt>任务编号</dt><dd>${escapeHtml(record.id)}</dd></div>
        <div><dt>任务类型</dt><dd>${taskType(record)}</dd></div>
        <div><dt>开始时间</dt><dd>${formatDate(record.startedAt)}</dd></div>
        <div><dt>完成时间</dt><dd>${formatDate(record.finishedAt)}</dd></div>
      </dl>
      <div class="transfer-history-detail-summary">
        ${renderOutcome(record)}${summary ? `<span>${summary}</span>` : ""}
        ${record.state === "running" && record.phase ? `<span>${escapeHtml(record.phase)}</span>` : ""}
        ${record.state === "running" && record.currentFile ? `<span>${escapeHtml(record.currentFile)}</span>` : ""}
        ${record.state === "interrupted" ? "<span>上次离开页面时任务尚未完成。</span>" : ""}
        ${record.error ? `<span class="transfer-history-error">${escapeHtml(record.error)}</span>` : ""}
        ${record.packageUnavailable && !record.package ? "<span>此记录保留了文件清单。如需下载摆渡包，请重新导出。</span>" : ""}
      </div>
      ${newLibraries.length ? `<details class="transfer-history-new-libraries">
        <summary>新建知识库（${newLibraries.length} 个）</summary>
        <ul>${newLibraries.map((library) => `<li>${escapeHtml([library.owner, library.name].filter(Boolean).join(" / "))}</li>`).join("")}</ul>
      </details>` : ""}
      ${unmatchedPeople.length ? `<section class="transfer-history-unmatched" aria-labelledby="transferHistoryPeopleTitle">
        <h3 id="transferHistoryPeopleTitle">未匹配的授权人员（${unmatchedPeople.length}）</h3>
        <ul>${unmatchedPeople.map((person) => `<li><strong>${escapeHtml(person.name)}</strong>
          <span>外网部门 ${escapeHtml(person.department || "—")}</span>
          <span>来源知识库 ${escapeHtml(person.source || "—")}</span></li>`).join("")}</ul>
      </section>` : ""}`;
      const filter = fileFilter.value;
      fileFilter.innerHTML = `<option value="">全部文件（${record.files.length}）</option>${Object.entries(fileStates).map(([value, [label]]) => (
        `<option value="${value}">${record.kind === "export" && value === "success" ? "已打包" : label}（${counts[value]}）</option>`
      )).join("")}`;
      fileFilter.value = filter;
      const isExport = record.kind === "export";
      get("transferHistoryFilesTitle").textContent = isExport ? "按来源查看导出文件" : "按内网去向查看文件";
      get("transferHistorySourceHead").hidden = isExport;
      get("transferHistoryFileTable").classList.toggle("is-export", isExport);
      manifest.hidden = !isExport || !record.files.length || typeof onManifest !== "function";
      download.hidden = record.kind !== "export" || !record.package || typeof onDownload !== "function";
      renderFileRows(record);
    }

    function render() {
      const all = records();
      const query = queryInput.value.trim().toLowerCase();
      const filtered = all.filter((record) => {
        const matchesQuery = `${record.name} ${record.id}`.toLowerCase().includes(query);
        return matchesQuery && (!kindInput.value || record.kind === kindInput.value) &&
          (!stateInput.value || record.state === stateInput.value);
      });
      const activeDetailButton = document.activeElement?.dataset.historyDetail;
      rows.innerHTML = filtered.length ? filtered.map((record) => `<tr>
        <td><div class="transfer-history-file-copy">${icon("file")}<div>
          <strong title="${escapeHtml(record.name)}">${escapeHtml(record.name)}</strong><small>${escapeHtml(record.id)}</small>
        </div></div></td>
        <td data-label="任务类型">${taskType(record)}</td>
        <td data-label="开始时间" class="transfer-history-date">${formatDate(record.startedAt)}</td>
        <td data-label="状态">${renderStatus(record)}</td>
        <td data-label="文件处理情况">${renderOutcome(record)}</td>
        <td><button class="transfer-history-link" type="button" data-history-detail="${escapeHtml(record.id)}">查看详情</button></td>
      </tr>`).join("") : `<tr><td colspan="6" class="transfer-history-empty">${all.length
        ? "没有符合筛选条件的摆渡记录。"
        : "<strong>暂无摆渡记录</strong><small>完成一次导出或开始导入后，可在此查看文件清单与处理结果。</small>"}</td></tr>`;
      if (activeDetailButton) {
        [...rows.querySelectorAll("[data-history-detail]")].find((button) => button.dataset.historyDetail === activeDetailButton)?.focus();
      }
      get("transferHistorySummary").textContent = filtered.length === all.length
        ? `共 ${all.length} 条记录`
        : `显示 ${filtered.length} 条，共 ${all.length} 条记录`;
      if (detail.open && recordsById.has(openId)) renderDetail(recordsById.get(openId));
    }

    function persist(record) {
      const storageNotice = get("transferHistoryStorage");
      const saved = new Map(loadSavedRecords().map((item) => [String(item.id), item]));
      const id = String(record.id);
      saved.set(id, record);
      try {
        localStorage.setItem(storageKey, JSON.stringify([...saved.values()]));
        storageNotice.hidden = true;
      } catch {
        if (record.package) {
          const { package: bundle, ...metadata } = record;
          saved.set(id, { ...metadata, packageUnavailable: true });
          try {
            localStorage.setItem(storageKey, JSON.stringify([...saved.values()]));
            record.packageUnavailable = true;
            storageNotice.hidden = true;
            return;
          } catch {
            // If saving just the manifest also fails, keep the current session usable.
          }
        }
        storageNotice.textContent = "当前浏览器无法保存新记录，本次会话仍可查看。";
        storageNotice.hidden = false;
      }
    }

    function upsert(record) {
      const id = String(record.id);
      const next = { ...recordsById.get(id), ...record };
      recordsById.set(id, next);
      if (next.state === "running") activeIds.add(id);
      else activeIds.delete(id);
      persist(next);
      render();
    }

    queryInput.addEventListener("input", render);
    kindInput.addEventListener("change", render);
    stateInput.addEventListener("change", render);
    rows.addEventListener("click", (event) => {
      const button = event.target.closest("[data-history-detail]");
      if (!button) return;
      const record = recordsById.get(button.dataset.historyDetail);
      if (!record) return;
      openId = String(record.id);
      fileFilter.value = "";
      renderDetail(record);
      if (record.kind === "import" && record.state !== "running" && record.files.some((file) => file.state === "success")) {
        fileFilter.value = "success";
        renderFileRows(record);
      }
      detail.showModal();
      get("transferHistoryClose").focus();
    });
    fileFilter.addEventListener("change", () => {
      const record = recordsById.get(openId);
      if (record) renderFileRows(record);
    });
    download.addEventListener("click", () => {
      const record = recordsById.get(openId);
      if (record?.package) onDownload(record.package, record.name);
    });
    manifest.addEventListener("click", () => {
      const record = recordsById.get(openId);
      if (!manifest.hidden && record) onManifest(record);
    });
    get("transferHistoryClose").addEventListener("click", () => detail.close());
    detail.querySelector("[data-history-close]").addEventListener("click", () => detail.close());
    detail.addEventListener("close", () => {
      const trigger = [...rows.querySelectorAll("[data-history-detail]")].find((button) => button.dataset.historyDetail === openId);
      (trigger || queryInput).focus();
      openId = null;
    });
    window.addEventListener("pagehide", (event) => {
      if (event.persisted) return;
      for (const id of activeIds) {
        const record = recordsById.get(id);
        if (record?.state === "running") persist({ ...record, state: "interrupted" });
      }
    });

    render();
    return { add: upsert, update: upsert, records, render };
  }

  window.BaigeTransferHistory = { mount };
})();
