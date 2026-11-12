/* 后台「动态发布」：公告列表的筛选、分页与新增/编辑抽屉。
   保存后写入 portal-news-store，门户首页与「最新动态」立即同步。 */
(() => {
  "use strict";

  const store = window.BaigePortalNewsStore;
  if (!store) return;

  const PAGE_SIZE = 10;
  const $ = sel => document.querySelector(sel);
  const body = $("#pnTableBody");
  const pagers = $("#pnPager");
  const countEl = $("#pnCount");
  const noteEl = $("#pnPanelNote");

  const state = {
    filters: { title: "", type: "", status: "", from: "", to: "" },
    page: 1,
    editing: null,
    image: "",
  };

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  /* 后台列表：按发布时间倒序，与线上后台一致。 */
  function rows() {
    const { title, type, status, from, to } = state.filters;
    return store.all()
      .filter(item => {
        if (title && !item.title.includes(title)) return false;
        if (type && item.type !== type) return false;
        if (status && item.status !== status) return false;
        const day = String(item.publishedAt || "").slice(0, 10);
        if (from && day < from) return false;
        if (to && day > to) return false;
        return true;
      })
      .sort((a, b) => String(b.publishedAt || "").localeCompare(String(a.publishedAt || "")));
  }

  function thumbCell(item) {
    if (item.image) return `<img class="pn-thumb" src="${escapeHtml(item.image)}" alt="">`;
    if (item.thumb) return `<span class="pn-thumb ${escapeHtml(item.thumb)}" aria-hidden="true"></span>`;
    return '<span class="pn-thumb-empty">—</span>';
  }

  function render() {
    const list = rows();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const start = (state.page - 1) * PAGE_SIZE;
    const slice = list.slice(start, start + PAGE_SIZE);

    body.innerHTML = slice.length
      ? slice.map(item => `<tr data-id="${escapeHtml(item.id)}">
          <td><span class="pn-title-cell">${escapeHtml(item.title)}</span></td>
          <td><span class="pn-tag">${escapeHtml(item.tag)}</span></td>
          <td><span class="pn-type">${escapeHtml(item.type || "普通公告")}</span></td>
          <td>${thumbCell(item)}</td>
          <td>${item.status === "已发布" ? '<span class="pn-state">已发布</span>' : '<span class="pn-state is-draft">草稿</span>'}</td>
          <td>${item.pinned ? '<span class="pn-pin is-on">置顶</span>' : '<span class="pn-pin">未置顶</span>'}</td>
          <td><span class="pn-time">${escapeHtml(item.publishedAt || "")}</span></td>
          <td><div class="pn-actions">
            <button class="pn-btn-edit" type="button" data-act="edit">编辑</button>
            <button class="pn-btn-del" type="button" data-act="del">删除</button>
          </div></td>
        </tr>`).join("")
      : '<tr><td class="pn-empty" colspan="8">没有符合条件的动态</td></tr>';

    countEl.textContent = `共 ${list.length} 条数据`;
    const published = list.filter(item => item.status === "已发布").length;
    noteEl.textContent = list.length ? `已发布 ${published} 条 · 草稿 ${list.length - published} 条` : "";

    const buttons = [];
    buttons.push(`<button type="button" data-page="prev" ${state.page === 1 ? "disabled" : ""}>上一页</button>`);
    for (let i = 1; i <= pages; i += 1) {
      buttons.push(`<button type="button" data-page="${i}" class="${i === state.page ? "is-active" : ""}">${i}</button>`);
    }
    buttons.push(`<button type="button" data-page="next" ${state.page === pages ? "disabled" : ""}>下一页</button>`);
    buttons.push(`<span class="pn-page-size">${PAGE_SIZE} / page</span>`);
    pagers.innerHTML = buttons.join("");
  }

  /* 抽屉 */
  const drawer = $("#pnDrawer");
  const mask = $("#pnMask");
  const form = $("#pnForm");
  const editor = $("#pnContent");
  const hint = $("#pnFormHint");
  const titleInput = $("#pnTitle");
  const tagInput = $("#pnTag");
  const sortInput = $("#pnSort");
  const imageInput = $("#pnImage");
  const preview = $("#pnUploadPreview");
  const clearImageBtn = $("#pnImageClear");

  /* 公告标签：下拉选项与门户分类筛选共用 store.TAGS */
  function fillTags() {
    const options = store.TAGS.map(tag => `<option value="${escapeHtml(tag)}">${escapeHtml(tag)}</option>`).join("");
    tagInput.insertAdjacentHTML("beforeend", options);
  }

  const counter = (input, n) => {
    const node = document.querySelector(`[data-counter-for="${input.id}"]`);
    if (node) node.textContent = `${input.value.length} / ${n}`;
  };

  function setImage(dataUrl) {
    state.image = dataUrl || "";
    preview.hidden = !dataUrl;
    clearImageBtn.hidden = !dataUrl;
    if (dataUrl) preview.src = dataUrl;
    else preview.removeAttribute("src");
  }

  function openDrawer(item) {
    state.editing = item ? item.id : null;
    state.image = item?.image || "";
    $("#pnDrawerTitle").lastChild.nodeValue = item ? "编辑" : "新增";
    titleInput.value = item?.title || "";
    tagInput.value = item?.tag || "";
    sortInput.value = item?.sortNo ?? 0;
    editor.innerHTML = item?.content || (item?.body || []).map(para => `<p>${escapeHtml(para)}</p>`).join("");
    form.querySelector(`input[name="pnStatus"][value="${item?.status === "已发布" ? "已发布" : "草稿"}"]`).checked = true;
    form.querySelector(`input[name="pnPinned"][value="${item?.pinned ? 1 : 0}"]`).checked = true;
    form.querySelector(`input[name="pnType"][value="${item?.type === "活动报名公告" ? "活动报名公告" : "普通公告"}"]`).checked = true;
    counter(titleInput, 50);
    setImage(item?.image || "");
    hint.textContent = "";
    drawer.hidden = false;
    mask.hidden = false;
    document.body.style.overflow = "hidden";
    titleInput.focus();
  }

  function closeDrawer() {
    drawer.hidden = true;
    mask.hidden = true;
    document.body.style.overflow = "";
    state.editing = null;
  }

  function collect() {
    const status = form.querySelector('input[name="pnStatus"]:checked').value;
    const pinned = form.querySelector('input[name="pnPinned"]:checked').value === "1";
    const type = form.querySelector('input[name="pnType"]:checked').value;
    const html = editor.innerHTML.trim();
    const text = (editor.innerText || "").trim();
    return {
      id: state.editing || undefined,
      title: titleInput.value.trim(),
      tag: tagInput.value.trim(),
      content: text && !/<p>|<br|<ul|<blockquote/i.test(html) ? text : html,
      status,
      pinned,
      type,
      sortNo: sortInput.value,
      image: state.image,
      thumb: store.find(state.editing)?.thumb || ["is-a", "is-b", "is-c", "is-d", "is-e"][Number(store.all().length) % 5],
      publishedAt: store.find(state.editing)?.publishedAt || nowStamp(),
    };
  }

  function nowStamp() {
    const d = new Date();
    const pad = n => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function save() {
    const data = collect();
    if (!data.title) { hint.textContent = "请填写公告标题"; titleInput.focus(); return; }
    if (!data.tag) { hint.textContent = "请填写公告标签"; tagInput.focus(); return; }
    if (!(editor.innerText || "").trim()) { hint.textContent = "请填写公告内容"; editor.focus(); return; }
    hint.textContent = "";
    store.upsert(store.fromForm(data));
    closeDrawer();
    render();
    toast(data.status === "已发布" ? "已发布，门户首页与最新动态已同步" : "已保存为草稿，门户不可见");
  }

  let toastTimer = 0;
  function toast(message) {
    const el = $("#pnToast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  /* 事件 */
  $("#pnNew").addEventListener("click", () => openDrawer(null));
  $("#pnClose").addEventListener("click", closeDrawer);
  $("#pnCancel").addEventListener("click", closeDrawer);
  mask.addEventListener("click", closeDrawer);
  $("#pnSave").addEventListener("click", save);

  document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !drawer.hidden) closeDrawer();
  });

  titleInput.addEventListener("input", () => counter(titleInput, 50));
  tagInput.addEventListener("change", () => { if (tagInput.value) hint.textContent = ""; });


  form.querySelectorAll("[data-step]").forEach(button => {
    button.addEventListener("click", () => {
      const next = Number(sortInput.value || 0) + Number(button.dataset.step);
      sortInput.value = String(Math.max(0, next));
    });
  });

  imageInput.addEventListener("change", () => {
    const file = imageInput.files && imageInput.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { toast("请选择图片文件"); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 640;
        const scale = Math.min(1, max / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        setImage(canvas.toDataURL("image/jpeg", 0.82));
      };
      img.onerror = () => setImage("");
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });

  clearImageBtn.addEventListener("click", () => { setImage(""); imageInput.value = ""; });

  document.querySelector(".pn-editor-tools").addEventListener("click", event => {
    const button = event.target.closest("button[data-cmd]");
    if (!button) return;
    editor.focus();
    const { cmd, value } = button.dataset;
    if (cmd === "formatBlock") document.execCommand(cmd, false, value);
    else document.execCommand(cmd, false, null);
  });

  body.addEventListener("click", event => {
    const button = event.target.closest("[data-act]");
    if (!button) return;
    const id = button.closest("tr").dataset.id;
    const item = store.find(id);
    if (!item) return;
    if (button.dataset.act === "edit") { openDrawer(item); return; }
    if (!window.confirm(`删除「${item.title}」？门户端会同步移除。`)) return;
    store.remove(id);
    render();
    toast("已删除，门户端同步移除");
  });

  pagers.addEventListener("click", event => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    const value = button.dataset.page;
    const pages = Math.max(1, Math.ceil(rows().length / PAGE_SIZE));
    if (value === "prev") state.page = Math.max(1, state.page - 1);
    else if (value === "next") state.page = Math.min(pages, state.page + 1);
    else state.page = Number(value);
    render();
  });

  $("#pnSearch").addEventListener("click", () => {
    state.filters = {
      title: $("#pnFilterTitle").value.trim(),
      type: $("#pnFilterType").value,
      status: $("#pnFilterStatus").value,
      from: $("#pnFilterFrom").value,
      to: $("#pnFilterTo").value,
    };
    state.page = 1;
    render();
  });

  $("#pnReset").addEventListener("click", () => {
    ["#pnFilterTitle", "#pnFilterType", "#pnFilterStatus", "#pnFilterFrom", "#pnFilterTo"].forEach(sel => { $(sel).value = ""; });
    state.filters = { title: "", type: "", status: "", from: "", to: "" };
    state.page = 1;
    render();
  });

  fillTags();
  render();

  window.BaigePortalNewsAdmin = Object.freeze({ PAGE_SIZE, nowStamp, state });
})();
