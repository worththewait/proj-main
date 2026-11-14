(() => {
  "use strict";

  const store = window.BaigeIamStore;
  if (!store) return;
  const { escapeHtml: escape } = window.BaigeUI;
  let toastTimer;
  let localRequests;
  let requestOpener;

  function requireAdministrator() {
    if (store.actor().kind === "admin") return true;
    const content = document.querySelector(".iam-page");
    if (content) {
      content.innerHTML = '<section class="iam-panel iam-read-only"><h2>请使用管理员身份</h2><p>当前身份可在角色授权审核页处理申请。</p><a class="iam-btn" href="../admin.html#role-approval" target="_top">打开角色授权审核</a></section>';
    }
    return false;
  }

  function restoreRequestFocus() {
    const open = [...document.querySelectorAll("dialog[open]")].at(-1);
    const target = requestOpener?.isConnected ? requestOpener
      : open?.querySelector("[data-iam-close], button:not(:disabled)")
        || document.querySelector("#iamUserRequests, #iamRoleRequests");
    target?.focus({ preventScroll: true });
    requestOpener = null;
  }

  function mountRequestsDrawer(url, onClose) {
    const dialog = document.createElement("dialog");
    dialog.className = "iam-requests-drawer";
    dialog.id = "iamRequestsDrawer";
    dialog.setAttribute("aria-label", "我的申请");
    dialog.tabIndex = -1;
    dialog.innerHTML = '<iframe id="iamRequestsFrame" title="我的申请"></iframe>';
    const frame = dialog.querySelector("iframe");
    document.body.append(dialog);
    dialog.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && dialog.open) {
        event.preventDefault();
        dialog.close();
      }
    });
    dialog.addEventListener("close", () => {
      if (dialog.open) return;
      frame.removeAttribute("src");
      onClose();
    });
    window.addEventListener("message", (event) => {
      if (dialog.open && event.source === frame.contentWindow && event.data?.type === "baige:iam-requests-close") dialog.close();
    });
    return {
      open(requestId, category) {
        if (store.actor().kind !== "admin") return;
        const src = new URL(url, window.location.href);
        src.searchParams.set("panel", "1");
        if (category) src.searchParams.set("category", category);
        if (requestId) src.searchParams.set("request", requestId);
        frame.src = src.href;
        if (!dialog.open) dialog.showModal();
        frame.focus({ preventScroll: true });
      },
      close() { if (dialog.open) dialog.close(); },
    };
  }

  function goToRequest(requestId = "") {
    requestOpener = document.activeElement;
    if (window.parent !== window) {
      window.parent.postMessage({ type: "baige:iam-request", requestId }, "*");
      return;
    }
    localRequests ||= mountRequestsDrawer("./role-approval.html?v=20261114-role-list", restoreRequestFocus);
    localRequests.open(requestId, document.body.dataset.page === "iam-roles" ? "role" : "user");
  }

  window.addEventListener("message", (event) => {
    if (window.parent !== window && event.source === window.parent && event.data?.type === "baige:iam-requests-return") restoreRequestFocus();
  });

  function requestLink(id, label) {
    return `<button type="button" class="iam-request-link" data-iam-request-id="${escape(id)}" aria-haspopup="dialog">${escape(label)}</button>`;
  }

  function showRequestError(element, error) {
    element.textContent = error.message;
    if (error.requestId) element.insertAdjacentHTML("beforeend", ` ${requestLink(error.requestId, "查看原申请")}`);
  }

  function statusSwitch(kind, item, disabled) {
    const normal = item.status === "normal";
    const name = item.username || item.name;
    const hint = disabled ? "当前状态" : normal ? "申请停用" : "申请启用";
    return `<button class="iam-status-switch" type="button" role="switch" aria-checked="${normal}"
      data-iam-${kind}-toggle="${escape(item.id)}" aria-label="${escape(name)}的启用状态"
      title="${hint}"${disabled ? " disabled" : ""}>
      <span>${normal ? "正常" : "停用"}</span>
    </button>`;
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

  function toast(message, request, linkLabel = "查看授权申请") {
    const element = document.getElementById("iamToast");
    element.replaceChildren(document.createTextNode(message));
    if (request) {
      const link = document.createElement("button");
      link.type = "button";
      link.className = "iam-request-link";
      link.textContent = linkLabel;
      link.setAttribute("aria-haspopup", "dialog");
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

  function askPermissionChange({ title, summary, submitRequest, onSubmitted }) {
    const opener = document.activeElement;
    const dialog = document.createElement("dialog");
    dialog.className = "iam-dialog";
    dialog.setAttribute("aria-labelledby", "iamPermissionChangeTitle");
    dialog.innerHTML = `
      <header class="iam-dialog-head"><h2 id="iamPermissionChangeTitle">${escape(title)}</h2></header>
      <form class="iam-enable-form">
        <div class="iam-dialog-body">
          <p class="iam-dialog-note">${escape(summary)}</p>
          <label class="iam-form-field"><span>申请原因 <em>*</em></span><textarea class="iam-input iam-reason-input" data-iam-permission-reason required maxlength="240" placeholder="请说明本次变更的原因"></textarea></label>
          <p class="iam-form-feedback" role="status"></p>
        </div>
        <footer class="iam-dialog-foot"><button class="iam-btn" type="button">取消</button><button class="iam-btn is-primary" type="submit">提交审核</button></footer>
      </form>`;
    const form = dialog.querySelector("form");
    const reasonInput = form.querySelector("textarea");
    const feedback = form.querySelector("[role=status]");
    const submit = form.querySelector("button[type=submit]");
    const cancel = form.querySelector("button[type=button]");
    cancel.addEventListener("click", () => dialog.close());
    dialog.addEventListener("cancel", (event) => { if (submit.disabled) event.preventDefault(); });
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (submit.disabled) return;
      const reason = reasonInput.value.trim();
      if (!reason) {
        feedback.textContent = "请填写申请原因。";
        reasonInput.focus();
        return;
      }
      submit.disabled = true;
      cancel.disabled = true;
      feedback.textContent = "";
      try {
        const request = await store.withWriteLock(() => submitRequest(reason));
        dialog.close();
        toast("申请已提交，审核通过后生效", request);
        onSubmitted?.(request);
      } catch (error) {
        showRequestError(feedback, error);
      } finally {
        submit.disabled = false;
        cancel.disabled = false;
      }
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    reasonInput.focus();
  }

  function requestLifecycle(kind, item, operation) {
    const pending = (pendingItemsBy(kind === "user" ? "userId" : "roleId").get(item.id) || [])
      .find(change => kind === "user" || !change.userId);
    if (pending) {
      toast("该对象已有待审核申请，请先处理原申请。", { id: pending.requestId }, "查看原申请");
      return;
    }
    const name = item.username || item.name;
    const type = kind === "user" ? "用户" : "角色";
    const action = { enable: "恢复启用", disable: "停用", delete: "删除" }[operation];
    const source = `${type}管理 · ${action}`;
    askPermissionChange({
      title: `申请${action}${type}`,
      summary: `审核通过后${action}「${name}」。`,
      submitRequest: reason => store.requestLifecycle(kind, item.id, operation, { source, reason }),
    });
  }

  window.BaigeIamManagement = Object.freeze({ requireAdministrator, goToRequest, mountRequestsDrawer, askPermissionChange, requestLifecycle, requestLink, showRequestError, statusSwitch, pendingItemsBy, toast });
})();
