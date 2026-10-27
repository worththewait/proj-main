(() => {
  "use strict";

  const { navigation } = window.BaigeData;
  const page = window.BaigePage;
  const dialog = document.querySelector("#homeAccessDialog");
  const description = document.querySelector("#homeAccessDescription");
  const feedback = document.querySelector("#homeAccessFeedback");
  const applyButton = document.querySelector("#applyHomeAccess");
  const closeButton = document.querySelector("#closeHomeAccess");

  const policy = window.BaigePermissions;
  const pendingApplications = new Set();
  const listeners = new Set();
  let currentRequest = null;
  let returnFocus = null;
  let returnFocusIdentity = null;
  let restoreFocus = true;
  let requestVersion = 0;
  let busy = false;

  function target(route, child = "") {
    const item = navigation.find((entry) => entry.id === route);
    if (!item) return null;
    child = typeof child === "string" ? child : "";
    if (child && !policy.childNames(route).includes(child)) return null;
    const scopeChild = child;
    return {
      route,
      child,
      scopeChild,
      name: scopeChild || item.label,
      locked: !policy.canOpen(route, child),
      key: JSON.stringify([route, scopeChild]),
    };
  }

  function status(route, child = "") {
    const destination = target(route, child);
    if (!destination) return "locked";
    if (!destination.locked) return "granted";
    return pendingApplications.has(destination.key) ? "pending" : "locked";
  }

  function canOpen(route, child = "") {
    return status(route, child) === "granted";
  }

  function canFocus(element) {
    return element instanceof HTMLElement && element.isConnected &&
      typeof element.focus === "function" && !element.matches(":disabled") &&
      element.matches("a[href], area[href], button, input, select, textarea, [tabindex]") &&
      !element.closest("[hidden], [inert], dialog:not([open])") &&
      element.getClientRects().length > 0 && !dialog.contains(element);
  }

  function rememberTrigger(element) {
    returnFocus = element;
    returnFocusIdentity = element ? {
      id: element.id,
      route: element.dataset.homeRoute,
      child: element.dataset.homeChild || "",
      containerId: element.closest("#featureResults")?.id,
    } : null;
  }

  function resolveReturnFocus() {
    if (canFocus(returnFocus)) return returnFocus;
    const identity = returnFocusIdentity;
    if (identity) {
      const byId = identity.id ? document.getElementById(identity.id) : null;
      if (canFocus(byId)) return byId;
      // Permission changes redraw the directory. Find the equivalent new
      // button by its target rather than trying to focus the detached original node.
      let equivalents = [];
      if (identity.route !== undefined) {
        equivalents = [...document.querySelectorAll("[data-home-route]")].filter((button) =>
          button.dataset.homeRoute === identity.route &&
          (button.dataset.homeChild || "") === identity.child);
      }
      const inSameContainer = equivalents.find((button) =>
        canFocus(button) && button.closest("#featureResults")?.id === identity.containerId);
      if (inSameContainer) return inSameContainer;
      const equivalent = equivalents.find(canFocus);
      if (equivalent) return equivalent;
    }
    const search = document.querySelector("#featureSearch");
    return canFocus(search) ? search : null;
  }

  function updateDialog() {
    if (!currentRequest) return;
    const pending = pendingApplications.has(currentRequest.key);
    document.querySelector("#homeAccessTitle").textContent = pending ? "申请待审批" : "暂无该功能权限";
    description.textContent = `你尚未获得「${currentRequest.name}」的使用权限，可申请开通后使用。`;
    applyButton.disabled = pending || busy;
    applyButton.textContent = pending ? "申请已提交" : busy ? "正在打开…" : "申请权限";
    feedback.textContent = pending ? "模拟申请已提交，等待审批。此操作不会实际开通权限。" : "";
  }

  function request(route, child = "", trigger = null) {
    const destination = target(route, child);
    if (!destination) return false;
    if (!destination.locked) {
      page.navigate(destination.route, destination.child);
      return true;
    }

    requestVersion += 1;
    busy = false;
    currentRequest = destination;
    if (canFocus(trigger)) rememberTrigger(trigger);
    else if (!dialog.open && canFocus(document.activeElement)) rememberTrigger(document.activeElement);
    else if (!dialog.open) rememberTrigger(null);
    restoreFocus = true;
    updateDialog();
    if (!dialog.open) dialog.showModal();
    return false;
  }

  function navigate(route, child = "", trigger = null) {
    if (!target(route, child)) return false;
    if (!canOpen(route, child)) return request(route, child, trigger);
    page.navigate(route, typeof child === "string" ? child : "");
    return true;
  }

  function notifyChange(destination) {
    const change = Object.freeze({
      route: destination.route,
      child: destination.scopeChild,
      status: "pending",
    });
    listeners.forEach((callback) => {
      try { callback(change); }
      catch (error) { console.error("首页权限状态更新失败", error); }
    });
  }

  async function apply() {
    const destination = currentRequest;
    if (!destination || busy || pendingApplications.has(destination.key)) return;
    const integration = window.BaigeRequestAccess;
    if (typeof integration !== "function") {
      pendingApplications.add(destination.key);
      updateDialog();
      notifyChange(destination);
      if (dialog.open && currentRequest === destination) closeButton.focus({ preventScroll: true });
      return;
    }

    const version = requestVersion;
    busy = true;
    updateDialog();
    try {
      const application = { id: destination.route, name: destination.name };
      if (destination.scopeChild) application.child = destination.scopeChild;
      await integration(application);
      if (version !== requestVersion) return;
      busy = false;
      updateDialog();
      // Opening the real application flow does not mean an application was submitted.
      feedback.textContent = "已调用申请入口，请在申请流程中完成操作。";
    } catch {
      if (version !== requestVersion) return;
      busy = false;
      updateDialog();
      feedback.textContent = "申请入口暂时无法打开，请重试。";
    }
  }

  function close(shouldRestoreFocus) {
    restoreFocus = shouldRestoreFocus;
    requestVersion += 1;
    busy = false;
    if (dialog.open) dialog.close();
  }

  closeButton.addEventListener("click", () => close(true));
  dialog.addEventListener("cancel", () => {
    restoreFocus = true;
    requestVersion += 1;
    busy = false;
  });
  dialog.addEventListener("close", () => {
    if (dialog.open) return;
    if (restoreFocus) resolveReturnFocus()?.focus({ preventScroll: true });
    returnFocus = null;
    returnFocusIdentity = null;
    currentRequest = null;
  });
  applyButton.addEventListener("click", apply);

  window.BaigeHomeAccess = Object.freeze({
    canOpen,
    summary: policy.summary,
    status,
    navigate,
    request,
    onChange(callback) {
      if (typeof callback !== "function") return () => {};
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
    deactivate() { close(false); },
  });
})();
