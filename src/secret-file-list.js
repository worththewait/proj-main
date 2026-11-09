(() => {
  "use strict";

  const { escapeHtml } = window.BaigeUI;
  const labels = {
    detecting: "检测中",
    passed: "已通过",
    hit: "涉密可疑",
    submitted: "审核中",
    approved: "审核通过",
    stored: "已入库",
    rejected: "已驳回",
    failed: "失败",
    draft: "—",
  };
  const label = code => Object.hasOwn(labels, code) ? labels[code] : labels.failed;
  const head = '<thead><tr><th scope="col">文件名</th><th scope="col">上传时间</th><th scope="col">文档状态</th><th scope="col">操作</th></tr></thead>';
  const canView = code => ["passed", "approved", "stored"].includes(code);

  function status(code, eyeMarkup = "") {
    const safeCode = Object.hasOwn(labels, code) ? code : "failed";
    return `<div class="secret-file-state"><span class="secret-file-badge" data-status="${safeCode}">${label(safeCode)}</span>${eyeMarkup}</div>`;
  }

  function time(value) {
    if (!value) return "—";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2}(?::\d{2})?)?$/u.test(value)) {
      return `<span title="${value}">${value.slice(0, 16)}</span>`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.valueOf())) return "—";
    const pad = part => String(part).padStart(2, "0");
    const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    return `<time datetime="${escapeHtml(date.toISOString())}" title="${day} ${clock}:${pad(date.getSeconds())}">${day} ${clock}</time>`;
  }

  window.BaigeSecretFileList = Object.freeze({ head, status, time, label, canView });
})();
