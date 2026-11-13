(() => {
  "use strict";

  const store = window.BaigeIamStore;
  if (!store) return;
  const { escapeHtml: escape } = window.BaigeUI;
  let toastTimer;

  function requireAdministrator() {
    if (store.actor().kind === "admin") return true;
    const content = document.querySelector(".iam-page");
    if (content) {
      content.innerHTML = '<section class="iam-panel iam-read-only"><h2>请使用管理员身份</h2><p>当前身份可在角色授权审核页处理申请。</p><a class="iam-btn" href="../admin.html#role-approval" target="_top">打开角色授权审核</a></section>';
    }
    return false;
  }

  function goToRequest(requestId) {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "baige:iam-request", requestId }, "*");
      return;
    }
    window.location.href = `../admin.html?request=${encodeURIComponent(requestId)}#role-approval`;
  }

  function requestLink(id, label) {
    return `<button type="button" class="iam-request-link" data-iam-request-id="${escape(id)}">${escape(label)}</button>`;
  }

  function pendingItemsBy(key) {
    const pending = new Map();
    for (const request of store.requests()) {
      if (request.status !== "pending") continue;
      for (const item of request.items) {
        const value = item[key];
        if (!value) continue;
        if (!pending.has(value)) pending.set(value, []);
        pending.get(value).push({ ...item, requestId: request.id });
      }
    }
    return pending;
  }

  function toast(message, request) {
    const element = document.getElementById("iamToast");
    element.replaceChildren(document.createTextNode(message));
    if (request) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "iam-request-link";
      link.textContent = "查看授权申请";
      link.addEventListener("click", () => goToRequest(request.id));
      element.append(link);
    }
    element.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      element.classList.remove("is-visible");
      element.querySelector("button")?.remove();
    }, request ? 7000 : 2600);
  }

  function requestEnable(kind, item) {
    const name = item.username || item.name;
    const source = kind === "user" ? "用户管理 · 恢复启用" : "角色管理 · 恢复启用";
    const dialog = document.createElement("dialog");
    dialog.className = "iam-dialog";
    dialog.setAttribute("aria-labelledby", "iamEnableTitle");
    dialog.innerHTML = `
      <header class="iam-dialog-head"><h2 id="iamEnableTitle">申请恢复启用</h2></header>
      <form class="iam-enable-form">
        <div class="iam-dialog-body">
          <p class="iam-dialog-note" data-iam-enable-note></p>
          <label class="iam-form-field"><span>申请理由 <em>*</em></span><textarea class="iam-input iam-reason-input" required maxlength="240" placeholder="说明恢复启用的原因"></textarea></label>
          <p class="iam-form-feedback" role="status"></p>
        </div>
        <footer class="iam-dialog-foot"><button class="iam-btn" type="button">取消</button><button class="iam-btn is-primary" type="submit">提交审核</button></footer>
      </form>`;
    dialog.querySelector("[data-iam-enable-note]").textContent = `「${name}」将在审核通过后恢复启用。`;
    const form = dialog.querySelector("form");
    const reasonInput = form.querySelector("textarea");
    const feedback = form.querySelector("[role=status]");
    const submit = form.querySelector("button[type=submit]");
    form.querySelector("button[type=button]").addEventListener("click", () => dialog.close());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const reason = reasonInput.value.trim();
      if (!reason) {
        feedback.textContent = "请填写申请理由。";
        reasonInput.focus();
        return;
      }
      submit.disabled = true;
      try {
        const request = await store.withWriteLock(() => store.requestEnable(kind, item.id, { source, reason }));
        dialog.close();
        toast("恢复启用申请已提交", request);
      } catch (error) {
        feedback.textContent = error.message;
      } finally {
        submit.disabled = false;
      }
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
    reasonInput.focus();
  }

  window.BaigeIamManagement = Object.freeze({ requireAdministrator, goToRequest, requestEnable, requestLink, pendingItemsBy, toast });
})();
