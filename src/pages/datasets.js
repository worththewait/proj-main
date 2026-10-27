(() => {
  "use strict";

  const { escapeHtml } = window.BaigeUI;
  const page = window.BaigePage;
  const datasets = window.BaigeDatasets || [];
  const byName = new Map(datasets.map((dataset) => [dataset.name, dataset]));

  const scroller = document.querySelector("#contentScroll");
  const listView = document.querySelector("#datasetListView");
  const detailView = document.querySelector("#datasetDetailView");
  const detailTitle = document.querySelector("#datasetDetailTitle");
  const detailSummary = document.querySelector("#datasetDetailSummary");
  const detailUpdated = document.querySelector("#datasetDetailUpdated");
  const detailIcon = document.querySelector("#datasetDetailIcon");
  const detailCrumb = document.querySelector("#datasetDetailCrumb");
  const detailContent = document.querySelector("#datasetDetailContent");

  const applyDialog = document.querySelector("#datasetApplyDialog");
  const applyForm = document.querySelector("#datasetApplyForm");
  const applyDataset = document.querySelector("#datasetApplyDataset");
  const applySuccess = document.querySelector("#datasetApplySuccess");
  const applySuccessTitle = document.querySelector("#datasetApplySuccessTitle");
  const applyFeedback = document.querySelector("#applyFeedback");
  const applyScopes = document.querySelector("#applyScopes");
  const applyReason = document.querySelector("#applyReason");
  const applyOtherScope = document.querySelector("#applyOtherScope");
  const applyStart = document.querySelector("#applyStart");
  const applyEnd = document.querySelector("#applyEnd");
  const applyName = document.querySelector("#applyName");
  const applyUnit = document.querySelector("#applyUnit");
  const applyContact = document.querySelector("#applyContact");
  const applySubmit = document.querySelector("#submitDatasetApply");
  const scopeInputs = [...applyForm.querySelectorAll('input[name="scopes"]')];

  let currentView = "";
  let currentChild = null;
  let currentDataset = null;
  let listScroll = 0;
  let lastCardName = "";
  let pendingFocus = "";
  let applyTrigger = null;
  let restoreApplyFocus = true;
  let requestId = 0;
  let busy = false;

  function localISODate(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function renderSections(dataset) {
    return dataset.sections.map((section) => {
      const body = section.items?.length
        ? `<div class="ds-detail-items">${section.items.map((item) => `<article class="ds-detail-item"><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.text)}</p></article>`).join("")}</div>`
        : `<div class="${section.contact ? "ds-detail-contact" : "ds-detail-paragraphs"}">${(section.paragraphs || []).map((text) => `<p>${escapeHtml(text)}</p>`).join("")}</div>`;
      return `<section class="ds-detail-section${section.contact ? " is-contact" : ""}"><h2>${escapeHtml(section.title)}</h2>${body}</section>`;
    }).join("");
  }

  function renderDetail(dataset) {
    currentDataset = dataset;
    detailTitle.textContent = dataset.name;
    detailSummary.textContent = dataset.summary;
    detailUpdated.textContent = dataset.updated;
    detailIcon.src = dataset.icon;
    detailCrumb.textContent = dataset.name;
    detailContent.innerHTML = renderSections(dataset);
    applyDataset.textContent = `申请数据集：${dataset.name}`;
  }

  function showDetail(name) {
    const dataset = byName.get(name);
    if (!dataset) return showList();
    const shouldFocus = pendingFocus === "detail";
    pendingFocus = "";
    if (currentView === "list") listScroll = scroller.scrollTop;
    renderDetail(dataset);
    listView.hidden = true;
    detailView.hidden = false;
    currentView = "detail";
    currentChild = name;
    scroller.scrollTop = 0;
    if (shouldFocus) detailTitle.focus({ preventScroll: true });
  }

  function showList() {
    const shouldFocusCard = pendingFocus === "card";
    pendingFocus = "";
    detailView.hidden = true;
    listView.hidden = false;
    currentView = "list";
    currentChild = "";
    scroller.scrollTop = listScroll;
    if (shouldFocusCard) {
      const target = [...listView.querySelectorAll("[data-dataset]")].find((node) => node.dataset.dataset === lastCardName)
        || listView.querySelector("[data-dataset]");
      target?.focus({ preventScroll: true });
    }
  }

  function setView(child) {
    // Re-activating the same page should not throw away its scroll position.
    if (child === currentChild && currentView) return;
    if (applyDialog.open) closeApply(false);
    if (child) showDetail(child);
    else showList();
  }

  function clearInvalid() {
    applyForm.querySelectorAll(".is-invalid").forEach((node) => node.classList.remove("is-invalid"));
    applyForm.querySelectorAll("[aria-invalid]").forEach((node) => node.removeAttribute("aria-invalid"));
    applyScopes.classList.remove("is-invalid");
  }

  function markInvalid(element, message, group = false) {
    element.classList.add("is-invalid");
    element.setAttribute("aria-invalid", "true");
    if (group) applyScopes.classList.add("is-invalid");
    return { element, message };
  }

  function validate() {
    const errors = [];
    if (!applyReason.value.trim()) errors.push(markInvalid(applyReason, "请填写申请事由。"));
    if (!scopeInputs.some((input) => input.checked)) errors.push(markInvalid(scopeInputs[0], "请至少选择一个使用范围。", true));
    if (!applyStart.value) errors.push(markInvalid(applyStart, "请选择使用开始日期。"));
    if (!applyEnd.value) errors.push(markInvalid(applyEnd, "请选择使用结束日期。"));
    if (applyStart.value && applyEnd.value && applyEnd.value < applyStart.value) {
      errors.push(markInvalid(applyEnd, "结束日期不能早于开始日期。"));
    }
    if (!applyName.value.trim()) errors.push(markInvalid(applyName, "请填写申请人姓名。"));
    if (!applyUnit.value.trim()) errors.push(markInvalid(applyUnit, "请填写申请人单位。"));
    const contact = applyContact.value.trim();
    const validContact = /^1[3-9]\d{9}$/.test(contact) || /^0\d{2,3}-?\d{7,8}$/.test(contact) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
    if (!contact) errors.push(markInvalid(applyContact, "请填写联系方式。"));
    else if (!validContact) errors.push(markInvalid(applyContact, "请填写有效的手机号、座机或邮箱。"));
    return errors;
  }

  function clearFeedback() {
    applyFeedback.textContent = "";
  }

  function openApply(trigger) {
    if (!currentDataset || applyDialog.open) return;
    requestId += 1;
    busy = false;
    applyTrigger = trigger instanceof HTMLElement ? trigger : document.activeElement;
    restoreApplyFocus = true;
    applyForm.reset();
    clearInvalid();
    clearFeedback();
    applyForm.hidden = false;
    applySuccess.hidden = true;
    applySubmit.disabled = false;
    applySubmit.textContent = "提交申请";
    applyDataset.textContent = `申请数据集：${currentDataset.name}`;
    const today = localISODate();
    applyStart.min = today;
    applyEnd.min = today;
    applyDialog.showModal();
    applyReason.focus({ preventScroll: true });
  }

  function closeApply(restoreFocus = true) {
    restoreApplyFocus = restoreFocus;
    requestId += 1;
    busy = false;
    if (applyDialog.open) applyDialog.close();
  }

  function showSuccess() {
    applyForm.hidden = true;
    applySuccess.hidden = false;
    applySuccessTitle.focus({ preventScroll: true });
  }

  document.addEventListener("click", (event) => {
    const card = event.target.closest("[data-dataset]");
    if (card) {
      event.preventDefault();
      lastCardName = card.dataset.dataset;
      pendingFocus = "detail";
      page.navigate("datasets", card.dataset.dataset);
      return;
    }
    if (event.target.closest("[data-dataset-back]")) {
      event.preventDefault();
      pendingFocus = "card";
      page.navigate("datasets", "");
    }
  });

  document.querySelector("#openDatasetApply").addEventListener("click", (event) => openApply(event.currentTarget));
  document.querySelector("#closeDatasetApply").addEventListener("click", () => closeApply(true));
  document.querySelector("#cancelDatasetApply").addEventListener("click", () => closeApply(true));
  document.querySelector("#finishDatasetApply").addEventListener("click", () => closeApply(true));

  applyDialog.addEventListener("cancel", () => {
    restoreApplyFocus = true;
    requestId += 1;
    busy = false;
  });
  applyDialog.addEventListener("close", () => {
    if (restoreApplyFocus && applyTrigger?.isConnected) applyTrigger.focus({ preventScroll: true });
    applyTrigger = null;
  });

  applyForm.addEventListener("input", (event) => {
    if (event.target.matches("input, textarea")) {
      event.target.classList.remove("is-invalid");
      event.target.removeAttribute("aria-invalid");
    }
    clearFeedback();
  });
  applyForm.addEventListener("change", () => {
    if (scopeInputs.some((input) => input.checked)) {
      applyScopes.classList.remove("is-invalid");
      scopeInputs.forEach((input) => {
        input.classList.remove("is-invalid");
        input.removeAttribute("aria-invalid");
      });
    }
    clearFeedback();
  });
  applyStart.addEventListener("change", () => {
    applyEnd.min = applyStart.value || localISODate();
    if (applyStart.value && applyEnd.value && applyEnd.value < applyStart.value) applyEnd.value = "";
  });

  applyForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    clearInvalid();
    clearFeedback();
    const errors = validate();
    if (errors.length) {
      applyFeedback.textContent = errors[0].message;
      errors[0].element.focus({ preventScroll: false });
      return;
    }

    const version = ++requestId;
    busy = true;
    applySubmit.disabled = true;
    applySubmit.textContent = "提交中…";
    const application = {
      dataset: { id: currentDataset?.id, name: currentDataset?.name },
      reason: applyReason.value.trim(),
      scopes: scopeInputs.filter((input) => input.checked).map((input) => input.value),
      otherScope: applyOtherScope.value.trim(),
      startDate: applyStart.value,
      endDate: applyEnd.value,
      applicant: {
        name: applyName.value.trim(),
        unit: applyUnit.value.trim(),
        contact: applyContact.value.trim(),
      },
      appliedAt: new Date().toISOString(),
    };

    try {
      if (typeof window.BaigeRequestDatasetAccess === "function") await window.BaigeRequestDatasetAccess(application);
      else await new Promise((resolve) => setTimeout(resolve, 350));
      if (version !== requestId || !applyDialog.open) return;
      busy = false;
      showSuccess();
    } catch {
      if (version !== requestId) return;
      busy = false;
      applySubmit.disabled = false;
      applySubmit.textContent = "提交申请";
      applyFeedback.textContent = "提交失败，请稍后重试。";
    }
  });

  page.onDeactivate(() => closeApply(false));
  page.onActivate(({ child }) => setView(child));
})();
