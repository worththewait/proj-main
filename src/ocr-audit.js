(() => {
  "use strict";

  const isImage = name => /\.(png|jpe?g)$/i.test(name);
  const isPdf = name => /\.pdf$/i.test(name);

  async function inspect(file) {
    try {
      if (!file.size) throw new Error("文件为空，请重新上传。");
      if (isImage(file.name)) {
        return { auditStatus: "submitted", auditReason: "图片需人工核查，审核通过后自动解析。" };
      }
      const text = isPdf(file.name)
        ? await window.BaigeProofreadPdf.read(await file.arrayBuffer(), { allowEmpty: true })
        : await window.BaigeProofreadFile.read(file);
      if (!text.trim()) {
        return { auditStatus: "submitted", auditReason: "PDF 无可提取的文字层，已转人工核查。" };
      }
      const keywords = window.BaigeProofreadTool.scanSecret(file.name, text);
      return { auditStatus: keywords.length ? "hit" : "passed", keywords, sourceText: text };
    } catch (error) {
      return { auditStatus: "failed", auditReason: error.message || "无法核查文件，请检查后重新上传。" };
    }
  }

  window.BaigeOcrAudit = Object.freeze({ inspect, isImage, isPdf });
})();
