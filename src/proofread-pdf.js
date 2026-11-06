(() => {
  'use strict';

  const runtimeUrl = new URL('../assets/vendor/pdfjs/pdf-text.bundle.js', document.currentScript.src);
  let loadingRuntime;

  function loadRuntime() {
    if (window.pdfjsLib && window.BaigePdfBinaryDataFactory) return Promise.resolve();
    if (!loadingRuntime) {
      loadingRuntime = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = runtimeUrl.href;
        script.onload = () => {
          if (window.pdfjsLib && window.BaigePdfBinaryDataFactory) resolve();
          else reject(new Error('PDF 解析组件加载失败，请刷新后重试。'));
        };
        script.onerror = () => {
          script.remove();
          reject(new Error('PDF 解析组件加载失败，请刷新后重试。'));
        };
        document.head.append(script);
      }).catch(error => {
        loadingRuntime = null;
        throw error;
      });
    }
    return loadingRuntime;
  }

  async function read(buffer) {
    await loadRuntime();
    let task;
    const pages = [];
    try {
      task = window.pdfjsLib.getDocument({
        data: new Uint8Array(buffer),
        BinaryDataFactory: window.BaigePdfBinaryDataFactory,
        useWorkerFetch: false,
        useWasm: false,
        useSystemFonts: false,
        disableFontFace: true,
        isEvalSupported: false,
        stopAtErrors: true,
      });
      const pdf = await task.promise;
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const text = content.items.map(item => (item.str ?? '') + (item.hasEOL ? '\n' : '')).join('');
        if (text.trim()) pages.push(text.trim());
      }
    } catch (error) {
      if (error.name === 'PasswordException') {
        throw new Error('PDF 已加密，请解除密码保护后重新上传。');
      }
      throw new Error('无法读取 PDF 正文，请检查文件后重新上传。');
    } finally {
      await task?.destroy().catch(() => {});
    }
    if (!pages.length) throw new Error('未读取到正文，请上传文字型 PDF 或先通过 OCR 识别。');
    return pages.join('\n\n');
  }

  window.BaigeProofreadPdf = Object.freeze({read});
})();
