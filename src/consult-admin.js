/* 后台「留言咨询」：筛选、分页与导出 CSV。数据来自 portal-consult-store。 */
(() => {
  "use strict";

  const store = window.BaigeConsultStore;
  if (!store) return;

  const PAGE_SIZE = 10;
  const $ = sel => document.querySelector(sel);
  const body = $("#csTableBody");
  const pager = $("#csPager");
  const countEl = $("#csCount");
  const noteEl = $("#csNote");

  const state = { filters: { from: "", to: "", name: "", phone: "", type: "", keyword: "" }, page: 1 };

  const escapeHtml = value => String(value).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));

  function rows() {
    const { from, to, name, phone, type, keyword } = state.filters;
    return store.all().filter(item => {
      const day = String(item.createdAt || "").slice(0, 10);
      if (from && day < from) return false;
      if (to && day > to) return false;
      if (name && !String(item.name).includes(name)) return false;
      if (phone && !String(item.phone).includes(phone)) return false;
      if (type && item.type !== type) return false;
      if (keyword && !String(item.content).includes(keyword)) return false;
      return true;
    });
  }

  function render() {
    const list = rows();
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (state.page > pages) state.page = pages;
    const slice = list.slice((state.page - 1) * PAGE_SIZE, state.page * PAGE_SIZE);

    body.innerHTML = slice.length
      ? slice.map(item => `<tr>
          <td><span class="cs-time">${escapeHtml(item.createdAt)}</span></td>
          <td><span class="cs-type" data-type="${escapeHtml(item.type)}">${escapeHtml(item.type)}</span></td>
          <td><span class="cs-name">${escapeHtml(item.name)}</span></td>
          <td><span class="cs-company">${escapeHtml(item.company)}</span></td>
          <td><span class="cs-phone">${escapeHtml(item.phone)}</span></td>
          <td><span class="cs-content">${escapeHtml(item.content)}</span></td>
        </tr>`).join("")
      : `<tr><td class="cs-empty" colspan="6"><strong>暂无数据</strong><span>门户提交留言咨询后，这里会实时出现记录。</span></td></tr>`;

    countEl.textContent = `共 ${list.length} 条数据`;
    const byType = store.TYPES.map(type => ({ type, count: list.filter(item => item.type === type).length })).filter(entry => entry.count);
    noteEl.textContent = list.length ? byType.map(entry => `${entry.type} ${entry.count}`).join(" · ") : "";

    const buttons = [`<button type="button" data-page="prev" ${state.page === 1 ? "disabled" : ""}>上一页</button>`];
    for (let i = 1; i <= pages; i += 1) buttons.push(`<button type="button" data-page="${i}" class="${i === state.page ? "is-active" : ""}">${i}</button>`);
    buttons.push(`<button type="button" data-page="next" ${state.page === pages ? "disabled" : ""}>下一页</button>`);
    buttons.push(`<span class="cs-size">${PAGE_SIZE} / page</span>`);
    pager.innerHTML = buttons.join("");
  }

  function toast(message) {
    const el = $("#csToast");
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 2400);
  }

  function exportCsv() {
    const list = rows();
    if (!list.length) { toast("当前筛选没有数据可导出"); return; }
    const header = ["咨询时间", "咨询类型", "姓名", "单位", "联系电话", "咨询内容"];
    const lines = list.map(item => [item.createdAt, item.type, item.name, item.company, item.phone, item.content]
      .map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(","));
    const csv = `\ufeff${header.join(",")}\n${lines.join("\n")}`;
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `留言咨询-${store.stamp().slice(0, 10)}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`已导出 ${list.length} 条记录`);
  }

  $("#csSearch").addEventListener("click", () => {
    state.filters = {
      from: $("#csFrom").value,
      to: $("#csTo").value,
      name: $("#csName").value.trim(),
      phone: $("#csPhone").value.trim(),
      type: $("#csType").value,
      keyword: $("#csKeyword").value.trim(),
    };
    state.page = 1;
    render();
  });

  $("#csReset").addEventListener("click", () => {
    ["#csFrom", "#csTo", "#csName", "#csPhone", "#csType", "#csKeyword"].forEach(sel => { $(sel).value = ""; });
    state.filters = { from: "", to: "", name: "", phone: "", type: "", keyword: "" };
    state.page = 1;
    render();
  });

  $("#csExport").addEventListener("click", exportCsv);

  pager.addEventListener("click", event => {
    const button = event.target.closest("[data-page]");
    if (!button || button.disabled) return;
    const value = button.dataset.page;
    const pages = Math.max(1, Math.ceil(rows().length / PAGE_SIZE));
    if (value === "prev") state.page = Math.max(1, state.page - 1);
    else if (value === "next") state.page = Math.min(pages, state.page + 1);
    else state.page = Number(value);
    render();
  });

  /* 类型下拉与门户共用同一枚举 */
  $("#csType").insertAdjacentHTML("beforeend", store.TYPES.map(type => `<option value="${type}">${type}</option>`).join(""));

  /* 门户提交后即时刷新 */
  window.addEventListener("baige:portal-consults", render);
  window.addEventListener("storage", event => { if (event.key === store.KEY) render(); });

  render();

  window.BaigeConsultAdmin = Object.freeze({ PAGE_SIZE, state, rows });
})();
