/* 门户「留言咨询」弹窗：横幅按钮 [data-contact] 打开，提交后写入 consult-store，
   后台「留言咨询」列表即时可见。 */
(() => {
  "use strict";

  const MAIL_ICON = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>';
  const store = window.BaigeConsultStore;
  const TYPES = store ? store.TYPES : ["合作咨询", "问题咨询", "使用反馈", "功能建议"];

  const FIELDS = [
    { name: "contactName", label: "姓名", required: true, placeholder: "请输入姓名" },
    { name: "company", label: "单位", required: true, placeholder: "请输入单位" },
    { name: "phone", label: "联系电话", required: true, placeholder: "请输入联系电话", type: "tel" },
  ];

  const markup = `<div class="pc-mask" data-contact-mask hidden></div>
  <form class="pc-modal" data-contact-modal role="dialog" aria-modal="true" aria-labelledby="pcTitle" hidden novalidate>
    <header class="pc-head">
      <span class="pc-icon" aria-hidden="true">${MAIL_ICON}</span>
      <div class="pc-head-copy"><strong id="pcTitle">留言咨询</strong><p>请填写以下信息，我们将尽快与您联系</p></div>
      <button class="pc-close" type="button" data-contact-close aria-label="关闭">×</button>
    </header>
    <div class="pc-body">
      <label class="pc-field"><span>咨询类型<b>*</b></span>
        <select class="pc-input pc-select" name="consultType">
          <option value="">请选择咨询类型</option>
          ${TYPES.map(type => `<option value="${type}">${type}</option>`).join("")}
        </select>
      </label>
      ${FIELDS.map(field => `<label class="pc-field"><span>${field.label}${field.required ? "<b>*</b>" : ""}</span>
        <input class="pc-input" type="${field.type || "text"}" name="${field.name}" placeholder="${field.placeholder}" autocomplete="off"></label>`).join("")}
      <label class="pc-field"><span>咨询内容<b>*</b></span>
        <textarea class="pc-input pc-textarea" name="content" maxlength="50" placeholder="请输入咨询内容"></textarea>
        <span class="pc-count" data-contact-count>0/50</span>
      </label>
      <p class="pc-error" data-contact-error role="alert"></p>
    </div>
    <footer class="pc-foot">
      <button class="pc-cancel" type="button" data-contact-close>取消</button>
      <button class="pc-submit" type="submit">提交咨询</button>
    </footer>
  </form>`;

  const host = document.createElement("div");
  host.innerHTML = markup;
  document.body.append(...host.children);

  const mask = document.querySelector("[data-contact-mask]");
  const modal = document.querySelector("[data-contact-modal]");
  const errorEl = modal.querySelector("[data-contact-error]");
  const content = modal.querySelector('textarea[name="content"]');
  const counter = modal.querySelector("[data-contact-count]");

  function open() {
    errorEl.textContent = "";
    modal.hidden = false;
    mask.hidden = false;
    document.body.style.overflow = "hidden";
    modal.querySelector('select[name="consultType"]').focus();
  }

  function close() {
    modal.hidden = true;
    mask.hidden = true;
    document.body.style.overflow = "";
  }

  let toastTimer = 0;
  function toast(message) {
    let el = document.querySelector("[data-portal-toast]");
    if (!el) {
      el = document.createElement("div");
      el.className = "portal-toast";
      el.setAttribute("data-portal-toast", "");
      el.setAttribute("role", "status");
      el.hidden = true;
      document.body.append(el);
    }
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  document.addEventListener("click", event => {
    if (event.target.closest("[data-contact]")) { open(); return; }
    if (event.target.closest("[data-contact-close]")) close();
  });

  mask.addEventListener("click", close);
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !modal.hidden) close(); });
  content.addEventListener("input", () => { counter.textContent = `${content.value.length}/50`; });

  modal.addEventListener("submit", event => {
    event.preventDefault();
    const value = name => (modal.querySelector(`[name="${name}"]`)?.value || "").trim();
    if (!value("consultType")) { errorEl.textContent = "请选择咨询类型"; return; }
    if (!value("contactName")) { errorEl.textContent = "请填写姓名"; return; }
    if (!value("company")) { errorEl.textContent = "请填写单位"; return; }
    if (!/^[\d\-+() ]{7,20}$/.test(value("phone"))) { errorEl.textContent = "请填写正确的联系电话"; return; }
    if (!value("content")) { errorEl.textContent = "请填写咨询内容"; return; }
    errorEl.textContent = "";
    const record = store
      ? store.add({ type: value("consultType"), name: value("contactName"), company: value("company"), phone: value("phone"), content: value("content") })
      : null;
    modal.reset();
    counter.textContent = "0/50";
    close();
    toast(record ? "已提交，我们会尽快与您联系" : "已提交，我们会尽快与您联系");
  });

  window.BaigePortalContact = Object.freeze({ open, close, FIELDS, TYPES });
})();
