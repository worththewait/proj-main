/* 后台「分类归属」：一张部门列表 + 一份类型库。
   部门行的「分配类型」从类型库多选，保存即生效并留痕。 */
(() => {
  "use strict";

  const store = window.BaigeLibraryCategoryStore;
  const library = window.BaigeLibraryStore;
  if (!store || !library) return;

  const $ = (sel) => document.querySelector(sel);
  const body = $("#lcBody");
  const note = $("#lcNote");
  const historyEl = $("#lcHistory");
  const typeModal = $("#lcTypeModal");
  const deptModal = $("#lcDeptModal");
  const mask = $("#lcMask");

  const params = new URLSearchParams(location.search);
  const actorId = params.get("actor") || "";
  const actorKind = params.get("kind") || "";
  const actorName = params.get("by") || actorId || "平台配置";
  const canConfigure = store.canConfigure(actorKind ? { id: actorId, kind: actorKind } : actorId);

  const state = { version: 0, dept: "" };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
  const label = (dept) => dept ? library.managerLabel(dept) : "未分配";

  function docCounts() {
    const map = new Map();
    library.loadDocs().forEach((doc) => map.set(doc.category, (map.get(doc.category) || 0) + 1));
    return map;
  }

  let toastTimer = 0;
  function toast(message) {
    const el = $("#lcToast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function chips(names) {
    return names.map((name) => `<span class="lc-chip">${escapeHtml(name)}</span>`).join("");
  }

  function render() {
    const snapshot = store.snapshot();
    state.version = snapshot.version;
    const rows = store.DEPARTMENTS.map((dept) => {
      const owned = snapshot.types.filter((name) => snapshot.owners[name] === dept);
      return `<tr data-dept="${escapeHtml(dept)}">
        <td class="col-dept">
          <span class="lc-dept">${escapeHtml(label(dept))}</span>
          ${label(dept) !== dept ? `<small>${escapeHtml(dept)}</small>` : ""}
        </td>
        <td>${owned.length ? `<span class="lc-chips">${chips(owned)}</span>` : '<span class="lc-muted">暂未负责类型</span>'}</td>
        <td class="col-ops"><button class="lc-adjust" type="button" data-manage="${escapeHtml(dept)}">分配类型</button></td>
      </tr>`;
    });
    const idle = snapshot.types.filter((name) => !snapshot.owners[name]);
    if (idle.length) {
      rows.push(`<tr class="lc-idle-row">
        <td class="col-dept"><span class="lc-dept">未分配类型</span></td>
        <td><span class="lc-chips">${chips(idle)}</span></td>
        <td class="col-ops"><span class="lc-muted">在部门中勾选</span></td>
      </tr>`);
    }
    body.innerHTML = rows.join("");
    note.textContent = `共 ${snapshot.types.length} 个类型，已分配 ${snapshot.types.length - idle.length} 个${idle.length ? `，未分配 ${idle.length} 个` : ""}；部门「分配类型」与类型库共用同一份配置。`;
    renderHistory();
  }

  function renderHistory() {
    const rows = store.changes(3);
    historyEl.innerHTML = rows.length
      ? rows.map((item) => {
        const who = escapeHtml(item.by || "平台配置");
        const name = `「${escapeHtml(item.category)}」`;
        let text;
        if (item.action === "create") text = `${who} 新增类型${name}`;
        else if (item.action === "delete") text = `${who} 删除类型${name}`;
        else if (item.action === "unassign") text = `${who} 将${name}改为未分配`;
        else if (item.action === "assign") text = `${who} 将${name}交由 ${escapeHtml(label(item.to))} 负责`;
        else text = `${who} 将${name}由 ${escapeHtml(label(item.from))} 调整为 ${escapeHtml(label(item.to))}`;
        return `<li><span>${text}</span><time>${escapeHtml(item.at)}</time></li>`;
      }).join("")
      : '<li class="lc-history-empty">暂无调整记录，当前沿用初始分工。</li>';
  }

  function lockScroll(locked) {
    document.body.style.overflow = locked ? "hidden" : "";
  }

  function closeModals() {
    typeModal.hidden = true;
    deptModal.hidden = true;
    mask.hidden = true;
    lockScroll(false);
    state.dept = "";
  }

  /* 类型库：新增、删除、查看每个类型的负责部门。 */
  function renderTypeList() {
    const snapshot = store.snapshot();
    $("#lcTypeList").innerHTML = snapshot.types.length
      ? snapshot.types.map((name) => {
        const owner = snapshot.owners[name];
        return `<li>
          <span class="lc-type-name">${escapeHtml(name)}</span>
          <span class="lc-type-owner${owner ? "" : " is-empty"}">${owner ? escapeHtml(label(owner)) : "未分配"}</span>
          <button class="lc-del" type="button" data-del="${escapeHtml(name)}">删除</button>
        </li>`;
      }).join("")
      : '<li class="lc-empty">类型库为空，先在上方添加类型</li>';
  }

  function openTypes() {
    if (!canConfigure) return;
    closeModals();
    $("#lcNewType").value = "";
    $("#lcTypeError").textContent = "";
    renderTypeList();
    typeModal.hidden = false;
    mask.hidden = false;
    lockScroll(true);
  }

  function addType(event) {
    if (event) event.preventDefault();
    const input = $("#lcNewType");
    try {
      store.addType(input.value, { by: actorName, expectedVersion: store.snapshot().version });
    } catch (error) {
      if (error && error.code === "conflict") {
        $("#lcTypeError").textContent = "类型配置已被其他配置人员修改，请刷新后再确认。";
        render();
        renderTypeList();
        return;
      }
      $("#lcTypeError").textContent = error.message || "保存失败，请稍后重试。";
      return;
    }
    input.value = "";
    $("#lcTypeError").textContent = "";
    render();
    renderTypeList();
    toast("类型已添加");
  }

  function removeType(name) {
    const count = docCounts().get(name) || 0;
    if (count) {
      $("#lcTypeError").textContent = `「${name}」下还有 ${count} 篇文档，暂不能删除；可先调整文档类型。`;
      return;
    }
    if (!window.confirm(`删除类型「${name}」？删除后不再出现在部门分配类型与上传向导中。`)) return;
    try {
      store.removeType(name, { by: actorName, expectedVersion: store.snapshot().version });
    } catch (error) {
      $("#lcTypeError").textContent = error.code === "conflict"
        ? "类型配置已被其他配置人员修改，请刷新后再确认。"
        : (error.message || "删除失败，请稍后重试。");
      return;
    }
    $("#lcTypeError").textContent = "";
    render();
    renderTypeList();
    toast("类型已删除");
  }

  /* 部门「分配类型」：勾选框来自类型库，可多选。 */
  function openDept(dept) {
    if (!canConfigure) return;
    const snapshot = store.snapshot();
    state.dept = dept;
    state.version = snapshot.version;
    $("#lcDeptTitle").textContent = `${label(dept)} · 分配类型`;
    $("#lcDeptError").textContent = "";
    $("#lcDeptTypes").innerHTML = snapshot.types.length
      ? snapshot.types.map((name) => {
        const owner = snapshot.owners[name];
        const hint = owner === dept ? "" : (owner ? `现由 ${label(owner)} 负责` : "未分配");
        return `<label class="lc-check">
          <input type="checkbox" value="${escapeHtml(name)}"${owner === dept ? " checked" : ""}>
          <span class="lc-check-name">${escapeHtml(name)}</span>
          ${hint ? `<em>${escapeHtml(hint)}</em>` : ""}
        </label>`;
      }).join("")
      : '<p class="lc-muted">类型库为空，请先在「类型管理」里添加类型。</p>';
    deptModal.hidden = false;
    mask.hidden = false;
    lockScroll(true);
  }

  function saveDept() {
    const checked = [...$("#lcDeptTypes").querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value);
    try {
      store.setDepartmentTypes(state.dept, checked, { by: actorName, expectedVersion: state.version });
    } catch (error) {
      if (error && error.code === "conflict") {
        $("#lcDeptError").textContent = "类型配置已被其他配置人员修改，请刷新后再确认。";
        render();
        return;
      }
      $("#lcDeptError").textContent = error.message || "保存失败，请稍后重试。";
      return;
    }
    closeModals();
    render();
    toast("类型已更新");
  }

  body.addEventListener("click", (event) => {
    const button = event.target.closest("[data-manage]");
    if (button) openDept(button.dataset.manage);
  });

  $("#lcTypes").addEventListener("click", openTypes);
  typeModal.addEventListener("submit", addType);
  $("#lcAddType").addEventListener("click", addType);
  $("#lcTypeList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-del]");
    if (button) removeType(button.dataset.del);
  });
  $("#lcNewType").addEventListener("input", () => { $("#lcTypeError").textContent = ""; });
  $("#lcTypeDone").addEventListener("click", closeModals);
  $("#lcTypeClose").addEventListener("click", closeModals);
  $("#lcDeptSave").addEventListener("click", saveDept);
  $("#lcDeptCancel").addEventListener("click", closeModals);
  $("#lcDeptClose").addEventListener("click", closeModals);
  mask.addEventListener("click", closeModals);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (!typeModal.hidden || !deptModal.hidden)) closeModals();
  });

  if (!canConfigure) {
    document.querySelectorAll(".lc-panel").forEach((panel) => { panel.hidden = true; });
    $("#lcDenied").hidden = false;
  }

  window.addEventListener("baige:library-category", () => { if (canConfigure) { render(); if (!typeModal.hidden) renderTypeList(); } });
  window.addEventListener("storage", (event) => { if (event.key === store.KEY && canConfigure) render(); });

  render();

  window.BaigeLibraryCategoryPage = Object.freeze({ canConfigure, render, state });
})();
