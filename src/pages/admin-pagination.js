(() => {
  "use strict";

  const sizes = [5, 10, 20, 50];

  function create(element, render, initialSize = 10) {
    let page = 1;
    let size = initialSize;
    let pageCount = 1;
    let renderedState = "";

    const reset = () => { page = 1; };
    function slice(items, reveal) {
      pageCount = Math.max(1, Math.ceil(items.length / size));
      if (reveal) {
        const index = items.findIndex(reveal);
        if (index >= 0) page = Math.floor(index / size) + 1;
      }
      page = Math.min(page, pageCount);
      const state = [page, pageCount, size].join("/");
      if (state !== renderedState) {
        renderedState = state;
        const first = Math.max(1, Math.min(page - 1, pageCount - 2));
        const last = Math.min(pageCount, first + 2);
        const button = (number, label, content, disabled = false, current = false) =>
          `<button type="button" data-admin-page="${number}" aria-label="${label}"${disabled ? " disabled" : ""}${current ? ' aria-current="page"' : ""}>${content}</button>`;
        const pages = [];
        if (first > 1) pages.push(button(1, "第 1 页", 1));
        if (first > 2) pages.push('<span aria-hidden="true">…</span>');
        for (let number = first; number <= last; number += 1) {
          pages.push(button(number, `第 ${number} 页`, number, false, number === page));
        }
        if (last < pageCount - 1) pages.push('<span aria-hidden="true">…</span>');
        if (last < pageCount) pages.push(button(pageCount, `第 ${pageCount} 页`, pageCount));
        element.innerHTML = `<label class="admin-page-size">每页 <select aria-label="每页条数">
          ${sizes.map(option => `<option value="${option}"${option === size ? " selected" : ""}>${option} 条</option>`).join("")}</select></label>
          <div class="admin-page-buttons">${button(page - 1, "上一页", "‹", page === 1)}${pages.join("")}${button(page + 1, "下一页", "›", page === pageCount)}</div>`;
      }
      return items.slice((page - 1) * size, page * size);
    }

    element.addEventListener("click", (event) => {
      const button = event.target.closest("[data-admin-page]");
      if (!button || button.disabled) return;
      const next = Number(button.dataset.adminPage);
      if (next === page || next < 1 || next > pageCount) return;
      page = next;
      render();
      element.querySelector('[aria-current="page"]')?.focus({ preventScroll: true });
    });
    element.addEventListener("change", (event) => {
      if (!event.target.matches("select")) return;
      const nextSize = Number(event.target.value);
      if (!sizes.includes(nextSize) || nextSize === size) return;
      size = nextSize;
      reset();
      render();
      element.querySelector("select")?.focus({ preventScroll: true });
    });
    return { reset, slice };
  }

  window.BaigeAdminPagination = Object.freeze({ create });
})();
