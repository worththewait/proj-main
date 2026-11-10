(() => {
  "use strict";

  const failed = auditReason => ({ auditStatus: "failed", keywords: [], auditReason });
  const scannedText = new WeakMap();

  async function inspect(file) {
    if (typeof file?.name !== "string" || !file.name.trim()) {
      return failed("未找到待核查的文档，请重新选择文件。");
    }

    try {
      const text = await window.BaigeProofreadFile.read(file);
      if (typeof text !== "string" || !text.trim()) {
        return failed("未读取到文档正文，请检查文件后重新上传。");
      }
      const keywords = window.BaigeProofreadTool.scanSecret(file.name, text);
      scannedText.set(file, text);
      return { auditStatus: keywords.length ? "hit" : "passed", keywords };
    } catch {
      return failed("无法核查文档正文，请确认文件可正常打开后重新上传。");
    }
  }

  function transition(current, next) {
    return (current === "hit" && next === "submitted")
      || (current === "submitted" && (next === "approved" || next === "rejected"));
  }

  function parse(file, auditStatus) {
    if (auditStatus !== "passed" && auditStatus !== "approved") throw new Error("文件通过涉密审查后才能解析。");
    const text = scannedText.get(file);
    scannedText.delete(file);
    const blocks = text?.split(/\r?\n/u).filter(line => line.trim());
    if (!blocks?.length) throw new Error("没有可解析的正文，请重新上传。");
    return blocks.length;
  }

  window.BaigeTranslateAudit = Object.freeze({ inspect, transition, parse });
})();
