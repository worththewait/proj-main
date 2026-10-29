(() => {
  "use strict";

  const store = window.BaigeNoticeStore;
  if (!store) return;

  const $ = (id) => document.getElementById(id);
  const tbody = $("noticeTableBody");
  const state = {
    title: "",
    creator: "",
    type: "",
    page: 1,
    pageSize: 10,
    status: "正常",
    editingId: null,
    deleteId: null,
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));

  const pencilIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16-1 5 5-1L20 8l-4-4Z"/><path d="m14 6 4 4"/></svg>';
  const trashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 14h10l1-14M9 7V4h6v3"/></svg>';

  let toastTimer = null;
  function toast(message) {
    const node = $("noticeToast");
    node.textContent = message;
    node.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.classList.remove("is-visible"), 2200);
  }

  function filtered() {
    return store.all().filter((item) => {
      if (state.title && !item.title.toLowerCase().includes(state.title)) return false;
      if (state.creator && !item.creator.toLowerCase().includes(state.creator)) return false;
      if (state.type && item.type !== state.type) return false;
      return true;
    });
  }

  function renderPager(pages) {
    const prev = `<button class="notice-page-button" type="button" data-page="${state.page - 1}" ${state.page === 1 ? "disabled" : ""} aria-label="上一页">‹</button>`;
    let numbers = "";
    for (let page = 1; page <= pages; page += 1) {
      numbers += `<button class="notice-page-button${page === state.page ? " is-current" : ""}" type="button" data-page="${page}" ${page === state.page ? 'aria-current="page"' : ""}>${page}</button>`;
    }
    const next = `<button class="notice-page-button" type="button" data-page="${state.page + 1}" ${state.page === pages ? "disabled" : ""} aria-label="下一页">›</button>`;
    $("noticePager").innerHTML = prev + numbers + next;
  }

  function render() {
    const list = filtered();
    const pages = Math.max(1, Math.ceil(list.length / state.pageSize));
    state.page = Math.min(Math.max(1, state.page), pages);
    const start = (state.page - 1) * state.pageSize;
    const visible = list.slice(start, start + state.pageSize);
    tbody.innerHTML = visible.length
      ? visible.map((item) => {
        const type = item.type === "公告"
          ? '<span class="notice-type notice-type-announcement">公告</span>'
          : '<span class="notice-type notice-type-notice">通知</span>';
        const status = `<span class="notice-status ${item.status === "正常" ? "is-normal" : "is-closed"}">${escapeHtml(item.status)}</span>`;
        return `<tr>
          <td><div class="notice-title" title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</div></td>
          <td>${type}</td>
          <td>${status}</td>
          <td>${escapeHtml(item.creator)}</td>
          <td>${escapeHtml(item.createdAt)}</td>
          <td><div class="notice-action-group">
            <button class="notice-icon-action" type="button" data-edit-id="${escapeHtml(item.id)}" aria-label="编辑${escapeHtml(item.title)}">${pencilIcon}</button>
            <button class="notice-icon-action is-delete" type="button" data-delete-id="${escapeHtml(item.id)}" aria-label="删除${escapeHtml(item.title)}">${trashIcon}</button>
          </div></td>
        </tr>`;
      }).join("")
      : '<tr class="notice-empty-row"><td colspan="6">暂无公告</td></tr>';
    $("noticeCount").textContent = `共 ${list.length} 条数据`;
    renderPager(pages);
  }

  function applyFilters() {
    state.title = $("filterTitle").value.trim().toLowerCase();
    state.creator = $("filterCreator").value.trim().toLowerCase();
    state.type = $("filterType").value;
    state.page = 1;
    render();
  }

  function resetFilters() {
    $("filterTitle").value = "";
    $("filterCreator").value = "";
    $("filterType").value = "";
    state.title = "";
    state.creator = "";
    state.type = "";
    state.page = 1;
    render();
  }

  function setStatus(status) {
    state.status = status === "关闭" ? "关闭" : "正常";
    document.querySelectorAll("[data-notice-status]").forEach((button) => {
      const active = button.dataset.noticeStatus === state.status;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  function openEditor(item = null) {
    state.editingId = item ? item.id : null;
    $("noticeEditorTitle").textContent = item ? "编辑公告" : "新建公告";
    $("noticeEditorSubmit").textContent = item ? "保存" : "新增";
    $("noticeFieldTitle").value = item ? item.title : "";
    $("noticeFieldType").value = item ? item.type : "通知";
    $("noticeFieldContent").value = item ? item.content : "";
    $("noticeFieldFeedback").textContent = "";
    for (const id of ["noticeFieldTitle", "noticeFieldContent"]) $(id).removeAttribute("aria-invalid");
    setStatus(item ? item.status : "正常");
    $("noticeEditor").showModal();
    $("noticeFieldTitle").focus({ preventScroll: true });
  }

  function closeEditor() {
    $("noticeEditor").close();
  }

  function openDelete(item) {
    state.deleteId = item.id;
    $("noticeDeleteName").textContent = `「${item.title}」`;
    $("noticeDeleteDialog").showModal();
    $("noticeDeleteCancel").focus({ preventScroll: true });
  }

  $("newNotice").addEventListener("click", () => openEditor());
  $("queryFilters").addEventListener("click", applyFilters);
  $("resetFilters").addEventListener("click", resetFilters);
  for (const id of ["filterTitle", "filterCreator"]) {
    $(id).addEventListener("keydown", (event) => { if (event.key === "Enter") applyFilters(); });
  }
  $("filterType").addEventListener("change", applyFilters);

  tbody.addEventListener("click", (event) => {
    const edit = event.target.closest("[data-edit-id]");
    const remove = event.target.closest("[data-delete-id]");
    if (edit) {
      const item = store.get(edit.dataset.editId);
      if (item) openEditor(item);
    } else if (remove) {
      const item = store.get(remove.dataset.deleteId);
      if (item) openDelete(item);
    }
  });

  $("noticePager").addEventListener("click", (event) => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    state.page = Number(button.dataset.page);
    render();
  });

  document.querySelectorAll("[data-notice-status]").forEach((button) => {
    button.addEventListener("click", () => setStatus(button.dataset.noticeStatus));
  });

  $("noticeFieldTitle").addEventListener("input", (event) => {
    event.target.removeAttribute("aria-invalid");
    $("noticeFieldFeedback").textContent = "";
  });
  $("noticeFieldContent").addEventListener("input", (event) => {
    event.target.removeAttribute("aria-invalid");
    $("noticeFieldFeedback").textContent = "";
  });

  $("noticeEditorClose").addEventListener("click", closeEditor);
  $("noticeEditorCancel").addEventListener("click", closeEditor);
  $("noticeForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = $("noticeFieldTitle").value.trim();
    const content = $("noticeFieldContent").value.trim();
    const type = $("noticeFieldType").value === "公告" ? "公告" : "通知";
    const editingId = state.editingId;
    const existing = editingId ? store.get(editingId) : null;
    const feedback = $("noticeFieldFeedback");
    if (!title || !content) {
      feedback.textContent = "请填写标题和内容。";
      if (!title) $("noticeFieldTitle").setAttribute("aria-invalid", "true");
      if (!content) $("noticeFieldContent").setAttribute("aria-invalid", "true");
      (!title ? $("noticeFieldTitle") : $("noticeFieldContent")).focus();
      return;
    }
    const saved = store.upsert({
      id: editingId || undefined,
      title,
      type,
      status: state.status,
      content,
      creator: existing?.creator || "1",
      createdAt: existing?.createdAt,
    });
    if (!saved) {
      feedback.textContent = "公告保存失败，请检查标题和内容。";
      return;
    }
    closeEditor();
    if (!editingId) state.page = 1;
    state.editingId = null;
    render();
    toast(editingId ? "公告已保存" : "公告已新增");
  });

  $("noticeDeleteCancel").addEventListener("click", () => $("noticeDeleteDialog").close());
  $("noticeDeleteConfirm").addEventListener("click", () => {
    if (!state.deleteId) return;
    store.remove(state.deleteId);
    state.deleteId = null;
    $("noticeDeleteDialog").close();
    render();
    toast("公告已删除");
  });

  window.addEventListener("storage", (event) => {
    if (event.key && !event.key.startsWith("baige.notice-center")) return;
    render();
  });

  render();
})();
