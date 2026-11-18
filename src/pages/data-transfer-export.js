(() => {
  "use strict";

  const dateFormat = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
  });

  function recordedDate(value) {
    if (!value) return "";
    const timestamp = new Date(value);
    if (!Number.isFinite(timestamp.getTime())) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value) && timestamp.toISOString().slice(0, 10) !== value) return "";
    return dateFormat.format(timestamp);
  }

  function mount({ onExport }) {
    const root = document.getElementById("transferExport");
    const { icon, escapeHtml } = window.BaigeUI;
    const demo = window.BaigeTransferDemo;
    const kinds = demo.catalogKinds;
    const selected = new Map();
    const expanded = new Set();
    const collapsedSearch = new Set();
    const collapsedManifest = new Set();
    const fileNodes = [];
    let activeKind = kinds[0].id;
    let query = "";
    let startDate = "";
    let endDate = "";
    let exporting = false;

    function makeFile(item, index, kind) {
      const file = item.files[index];
      const node = {
        id: "file-" + fileNodes.length,
        name: file.name,
        recordedDate: recordedDate(file.recordedAt),
        item,
        index,
        path: [kind.label, item.owner, item.kind !== "library" ? item.name : ""].filter(Boolean).join(" / "),
        access: item.kind === "library" ? (item.accessMode === "limited" ? "有限公开" : "全部公开") : "",
      };
      fileNodes.push(node);
      return node;
    }

    const catalog = new Map(kinds.map((kind) => {
      const owners = new Map();
      for (const item of demo.items.filter((entry) => entry.kind === kind.id)) {
        if (!item.files.length) continue;
        if (!owners.has(item.ownerKey)) {
          owners.set(item.ownerKey, {
            id: kind.id + "-owner-" + owners.size,
            name: item.owner,
            icon: kind.ownerIcon,
            children: [],
          });
        }
        const owner = owners.get(item.ownerKey);
        const files = item.files.map((_, index) => makeFile(item, index, kind));
        if (kind.id === "library") {
          owner.children.push(...files);
        } else {
          owner.children.push({ id: "collection-" + fileNodes.length, name: item.name, icon: "folder", children: files });
        }
      }
      const groups = [...owners.values()].filter((owner) => owner.children.length);
      const first = groups[0];
      if (first) {
        expanded.add(first.id);
        if (first.children[0].children) expanded.add(first.children[0].id);
      }
      return [kind.id, groups];
    }));
    const filesById = new Map(fileNodes.map((file) => [file.id, file]));

    root.innerHTML = `
      <div class="transfer-export-toolbar">
        <div class="transfer-catalog-tabs" role="tablist" aria-label="资料来源">
          ${kinds.map((kind) => `<button id="transferCatalogTab-${kind.id}" type="button" role="tab"
            data-catalog-kind="${kind.id}" aria-controls="transferCatalogPane">${kind.label}</button>`).join("")}
        </div>
        <form class="transfer-catalog-dates" id="transferCatalogDates" aria-label="按录入日期筛选">
          <span>录入日期</span>
          <input type="date" class="iam-input" id="transferDateFrom" aria-label="录入开始日期" />
          <span aria-hidden="true">至</span>
          <input type="date" class="iam-input" id="transferDateTo" aria-label="录入结束日期" />
          <button class="iam-btn" type="submit" id="transferApplyDates" disabled>筛选</button>
          <button class="transfer-link" type="button" id="transferClearDates" hidden>清除日期</button>
        </form>
        <label class="transfer-search transfer-catalog-search">${icon("search")}
          <input type="search" class="iam-input" id="transferCatalogSearch"
            aria-label="搜索导出目录" placeholder="搜索部门、库名或文档" autocomplete="off" />
        </label>
      </div>
      <p class="transfer-date-feedback" id="transferDateFeedback" role="status" hidden></p>
      <div class="transfer-export-workspace">
        <section id="transferCatalogPane" class="transfer-catalog" role="tabpanel">
          <div class="transfer-catalog-toolbar">
            <label class="transfer-catalog-all"><input id="transferCatalogAll" type="checkbox" />
              <span id="transferCatalogAllLabel">全选当前列表</span>
            </label>
            <span class="transfer-catalog-totals"><strong id="transferCatalogCount" role="status"></strong><span>录入日期</span></span>
          </div>
          <div id="transferCatalogTree" class="transfer-catalog-tree"></div>
        </section>
        <section class="transfer-export-manifest" aria-labelledby="transferManifestTitle">
          <header class="transfer-manifest-heading">
            <h2 id="transferManifestTitle">摆渡包清单</h2>
            <button class="transfer-link" id="transferClearFiles" type="button" disabled>清空</button>
          </header>
          <div id="transferManifestRows" class="transfer-manifest-rows"></div>
          <footer class="transfer-manifest-footer">
            <strong id="transferManifestCount" role="status" aria-live="polite"></strong>
          </footer>
          <p id="transferExportMessage" class="transfer-feedback" role="status" hidden></p>
        </section>
      </div>`;

    const search = root.querySelector("#transferCatalogSearch");
    const tree = root.querySelector("#transferCatalogTree");
    const countLabel = root.querySelector("#transferCatalogCount");
    const dateForm = root.querySelector("#transferCatalogDates");
    const from = root.querySelector("#transferDateFrom");
    const to = root.querySelector("#transferDateTo");
    const applyDates = root.querySelector("#transferApplyDates");
    const clearDates = root.querySelector("#transferClearDates");
    const dateFeedback = root.querySelector("#transferDateFeedback");
    const all = root.querySelector("#transferCatalogAll");
    const allLabel = root.querySelector("#transferCatalogAllLabel");
    const manifest = root.querySelector("#transferManifestRows");
    const total = root.querySelector("#transferManifestCount");
    const clear = root.querySelector("#transferClearFiles");
    const download = document.getElementById("transferDownload");
    const message = root.querySelector("#transferExportMessage");
    const tabs = [...root.querySelectorAll("[data-catalog-kind]")];
    const catalogPane = root.querySelector("#transferCatalogPane");
    let visibleFiles = [];
    let branchFiles = new Map();

    function leaves(node) {
      return node.children ? node.children.flatMap(leaves) : [node];
    }

    function isSelected(node) {
      return selected.get(node.item.id)?.has(node.index) || false;
    }

    function filterNodes(nodes, matches) {
      return nodes.flatMap((node) => {
        if (matches(node)) return [node];
        if (!node.children) return [];
        const children = filterNodes(node.children, matches);
        return children.length ? [{ ...node, children }] : [];
      });
    }

    function inDateRange(node) {
      return !startDate || (node.recordedDate >= startDate && node.recordedDate <= endDate);
    }

    function hasDateChanges() {
      return from.value !== startDate || to.value !== endDate;
    }

    function syncDownload() {
      download.disabled = exporting || !selected.size || hasDateChanges();
    }

    function announceDates(text, error = false) {
      dateFeedback.textContent = text;
      dateFeedback.classList.toggle("is-error", error);
      dateFeedback.hidden = !text;
    }

    function renderNode(node, depth = 0) {
      const indent = `style="--catalog-depth: ${depth}"`;
      if (!node.children) {
        return `<li><label class="transfer-catalog-file" ${indent}>
          <input type="checkbox" data-catalog-file="${node.id}" />
          ${icon("file")}<span>${escapeHtml(node.name)}</span>
          <small class="transfer-catalog-meta">
            ${node.access ? `<span>${node.access}</span>` : ""}
            ${node.recordedDate ? `<time datetime="${node.recordedDate}">${node.recordedDate}</time>` : "<span>未记录</span>"}
          </small>
        </label></li>`;
      }
      const filtered = Boolean(query || startDate);
      const open = filtered ? !collapsedSearch.has(node.id) : expanded.has(node.id);
      const files = leaves(node);
      branchFiles.set(node.id, files);
      return `<li class="transfer-catalog-branch">
        <div class="transfer-catalog-branch-line" ${indent}>
          <input type="checkbox" data-catalog-branch="${node.id}" aria-label="选择${escapeHtml(node.name)}内${filtered ? "匹配的" : "的"}文档" />
          <button type="button" data-catalog-toggle="${node.id}" aria-expanded="${open}" aria-controls="transferBranch-${node.id}">
            ${icon("chevron")}${icon(node.icon)}<span>${escapeHtml(node.name)}</span>
          </button>
          <small class="transfer-catalog-num" data-catalog-count="${node.id}">${files.length} 篇</small>
        </div>
        <ul id="transferBranch-${node.id}" ${open ? "" : "hidden"}>
          ${node.children.map((child) => renderNode(child, depth + 1)).join("")}
        </ul>
      </li>`;
    }

    function renderCatalog() {
      const allGroups = catalog.get(activeKind);
      const groups = startDate ? filterNodes(allGroups, (node) => !node.children && inDateRange(node)) : allGroups;
      const nodes = query ? filterNodes(groups, (node) => node.name.toLowerCase().includes(query)) : groups;
      visibleFiles = nodes.flatMap(leaves);
      const filtered = Boolean(query || startDate);
      allLabel.textContent = filtered ? "全选匹配文档" : "全选当前列表";
      const count = `${filtered ? "匹配 " : ""}${visibleFiles.length} 篇`;
      countLabel.textContent = startDate ? count : `不限日期 · ${count}`;
      branchFiles = new Map();
      tree.innerHTML = nodes.length
        ? `<ul>${nodes.map((node) => renderNode(node)).join("")}</ul>`
        : `<p class="transfer-catalog-empty">${filtered ? "当前筛选条件下没有文档。" : "此分类暂无可导出的文档。"}</p>`;
      updateSelections();
    }

    function updateSelections() {
      for (const input of tree.querySelectorAll("[data-catalog-file]")) {
        input.checked = isSelected(filesById.get(input.dataset.catalogFile));
      }
      for (const input of tree.querySelectorAll("[data-catalog-branch]")) {
        const files = branchFiles.get(input.dataset.catalogBranch);
        const count = files.filter(isSelected).length;
        input.disabled = files.length === 0;
        input.checked = count > 0 && count === files.length;
        input.indeterminate = count > 0 && count < files.length;
      }
      for (const label of tree.querySelectorAll("[data-catalog-count]")) {
        const files = branchFiles.get(label.dataset.catalogCount);
        const count = files.filter(isSelected).length;
        label.textContent = count ? `已选 ${count} / ${files.length} 篇` : `${files.length} 篇`;
      }
      const count = visibleFiles.filter(isSelected).length;
      all.disabled = visibleFiles.length === 0;
      all.checked = count > 0 && count === visibleFiles.length;
      all.indeterminate = count > 0 && count < visibleFiles.length;
    }

    function renderManifestNode(node) {
      if (!node.children) {
        return `<li class="transfer-manifest-file">
          ${icon("file")}<strong>${escapeHtml(node.name)}</strong>
          <button class="transfer-manifest-remove" type="button" data-remove-file="${node.id}"
            aria-label="移除${escapeHtml(node.name)}（${escapeHtml(node.path)}）">${icon("close")}</button>
        </li>`;
      }

      const open = !collapsedManifest.has(node.id);
      return `<li class="transfer-manifest-group">
        <button class="transfer-manifest-toggle" type="button" data-manifest-toggle="${node.id}"
          aria-expanded="${open}" aria-controls="transferManifestBranch-${node.id}">
          ${icon("chevron")}${icon(node.icon)}
          <strong>${escapeHtml(node.name)}</strong>
          <span class="transfer-manifest-num">${leaves(node).length} 篇</span>
        </button>
        <ul id="transferManifestBranch-${node.id}"${open ? "" : " hidden"}>
          ${node.children.map(renderManifestNode).join("")}
        </ul>
      </li>`;
    }

    function renderManifest() {
      const files = fileNodes.filter(isSelected);
      if (!files.length) {
        manifest.innerHTML = '<p class="transfer-manifest-empty">勾选目录中的文档后，清单会显示入包文件。</p>';
      } else {
        const groups = kinds.map((kind) => ({
          id: `kind-${kind.id}`,
          name: kind.label,
          icon: "book",
          children: filterNodes(catalog.get(kind.id), (node) => !node.children && isSelected(node)),
        })).filter((group) => group.children.length);
        manifest.innerHTML = `<ul>${groups.map(renderManifestNode).join("")}</ul>`;
      }
      total.textContent = `已选 ${files.length} 篇文档`;
      clear.disabled = files.length === 0;
      syncDownload();
    }

    function changeSelection(files, checked) {
      for (const node of files) {
        const indices = selected.get(node.item.id) || new Set();
        if (checked) indices.add(node.index);
        else indices.delete(node.index);
        if (indices.size) selected.set(node.item.id, indices);
        else selected.delete(node.item.id);
      }
      message.hidden = true;
      updateSelections();
      renderManifest();
    }

    function selectKind(kind) {
      activeKind = kind;
      search.value = "";
      query = "";
      collapsedSearch.clear();
      for (const tab of tabs) {
        const isActive = tab.dataset.catalogKind === kind;
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
        if (isActive) catalogPane.setAttribute("aria-labelledby", tab.id);
      }
      renderCatalog();
    }

    for (const tab of tabs) {
      tab.addEventListener("click", () => selectKind(tab.dataset.catalogKind));
      tab.addEventListener("keydown", (event) => {
        const index = tabs.indexOf(tab);
        const targets = { ArrowLeft: (index + tabs.length - 1) % tabs.length, ArrowRight: (index + 1) % tabs.length, Home: 0, End: tabs.length - 1 };
        const target = tabs[targets[event.key]];
        if (!target) return;
        event.preventDefault();
        selectKind(target.dataset.catalogKind);
        target.focus();
      });
    }

    search.addEventListener("input", () => {
      query = search.value.trim().toLowerCase();
      collapsedSearch.clear();
      renderCatalog();
    });

    function updateDateControls() {
      const changed = hasDateChanges();
      applyDates.disabled = !changed;
      clearDates.hidden = !from.value && !to.value && !startDate && !endDate;
      syncDownload();
    }

    function applyDateRange() {
      startDate = from.value;
      endDate = to.value;
      collapsedSearch.clear();
      tree.scrollTop = 0;
      const removed = fileNodes.filter((node) => isSelected(node) && !inDateRange(node));
      changeSelection(removed, false);
      renderCatalog();
      updateDateControls();
      announceDates(removed.length ? `已从摆渡包清单移除 ${removed.length} 篇超出日期范围的文档。` : "");
    }

    dateForm.addEventListener("input", () => {
      updateDateControls();
      announceDates(hasDateChanges() ? "日期已修改，点击「筛选」应用。" : "");
    });

    dateForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (!hasDateChanges()) return;
      if (Boolean(from.value) !== Boolean(to.value)) {
        announceDates("请选择完整的起止日期。", true);
        (from.value ? to : from).focus();
        return;
      }
      if (from.valueAsNumber > to.valueAsNumber) {
        announceDates("结束日期须在开始日期当天或之后。", true);
        to.focus();
        return;
      }
      applyDateRange();
      from.focus();
    });

    clearDates.addEventListener("click", () => {
      dateForm.reset();
      applyDateRange();
      from.focus();
    });

    tree.addEventListener("click", (event) => {
      const button = event.target.closest("[data-catalog-toggle]");
      if (!button) return;
      const id = button.dataset.catalogToggle;
      const open = button.getAttribute("aria-expanded") !== "true";
      const filtered = Boolean(query || startDate);
      const state = filtered ? collapsedSearch : expanded;
      if (open !== filtered) state.add(id);
      else state.delete(id);
      button.setAttribute("aria-expanded", String(open));
      document.getElementById(button.getAttribute("aria-controls")).hidden = !open;
    });

    tree.addEventListener("change", (event) => {
      const { catalogBranch, catalogFile } = event.target.dataset;
      if (catalogBranch) changeSelection(branchFiles.get(catalogBranch), event.target.checked);
      if (catalogFile) changeSelection([filesById.get(catalogFile)], event.target.checked);
    });

    all.addEventListener("change", () => changeSelection(visibleFiles, all.checked));
    clear.addEventListener("click", () => {
      changeSelection(fileNodes, false);
      search.focus();
    });
    manifest.addEventListener("click", (event) => {
      const disclosure = event.target.closest("[data-manifest-toggle]");
      if (disclosure) {
        const id = disclosure.dataset.manifestToggle;
        const open = collapsedManifest.delete(id);
        if (!open) collapsedManifest.add(id);
        disclosure.setAttribute("aria-expanded", String(open));
        document.getElementById(disclosure.getAttribute("aria-controls")).hidden = !open;
        return;
      }
      const button = event.target.closest("[data-remove-file]");
      if (!button) return;
      const visibleRemovals = () => [...manifest.querySelectorAll("[data-remove-file]")].filter((item) => !item.closest("[hidden]"));
      const index = visibleRemovals().indexOf(button);
      changeSelection([filesById.get(button.dataset.removeFile)], false);
      const buttons = visibleRemovals();
      (buttons[Math.min(index, buttons.length - 1)] || manifest.querySelector("[data-manifest-toggle]") || search).focus();
    });

    download.addEventListener("click", async () => {
      if (exporting || !selected.size || hasDateChanges()) return;
      exporting = true;
      download.disabled = true;
      message.hidden = true;
      const stamp = new Intl.DateTimeFormat("sv-SE", {
        timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
      }).format(new Date()).replace(/[\s:]/g, "-");
      const filename = `百舸数据摆渡-${stamp}.json`;
      try {
        const requestedFiles = fileNodes.filter(isSelected).map(({ item, index }) => ({ item, index }));
        const bundle = demo.createPackage([...selected.keys()], selected);
        const result = await onExport(bundle, filename, requestedFiles);
        message.classList.toggle("is-error", result?.downloaded === false);
        const skipped = result?.skipped?.length || 0;
        const note = skipped ? `跳过 ${skipped} 篇文档，可在摆渡记录中查看原因。` : "";
        message.textContent = result?.downloaded === false
          ? `${result.error || "本次未生成摆渡包。"}${note || "可在摆渡记录中查看详情。"}`
          : `已生成 ${filename}。${note || "可在导入页选用此文件。"}`;
      } catch (error) {
        message.classList.add("is-error");
        message.textContent = error.message || "生成摆渡包失败，请重试。";
      } finally {
        message.hidden = false;
        exporting = false;
        renderManifest();
      }
    });

    selectKind(activeKind);
    renderManifest();
  }

  window.BaigeTransferExport = Object.freeze({ mount });
})();
