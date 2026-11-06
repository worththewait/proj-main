(() => {
  'use strict';

  const vendor = new URL('../assets/vendor/proofread/', document.currentScript.src);
  const formats = ['txt', 'md', 'pdf', 'doc', 'docx', 'xls', 'xlsx'];
  const scripts = new Map();

  function extension(name) {
    return /\.([^.]+)$/.exec(name)?.[1].toLowerCase() || '';
  }

  function loadScript(name) {
    if (scripts.has(name)) return scripts.get(name);
    const script = document.createElement('script');
    script.src = new URL(name, vendor).href;
    const ready = new Promise((resolve, reject) => {
      script.onload = resolve;
      script.onerror = () => {
        scripts.delete(name);
        script.remove();
        reject(new Error('文件读取组件加载失败，请刷新后重试。'));
      };
    });
    scripts.set(name, ready);
    document.head.append(script);
    return ready;
  }

  async function read(file) {
    const ext = extension(file.name);
    if (!formats.includes(ext)) throw new Error('请选择 TXT、MD、PDF、Word 或 Excel 文件。');
    if (!file.size) throw new Error('文件没有可校对的文字，请检查后重新上传。');

    let text;
    if (ext === 'txt' || ext === 'md') {
      text = await file.text();
    } else {
      const bytes = await file.arrayBuffer();
      if (ext === 'pdf') {
        text = await window.BaigeProofreadPdf.read(bytes);
      } else {
        await loadScript('xlsx.full.min.js');
        if (ext === 'docx') await loadScript('mammoth.browser.min.js');
        if (ext === 'doc') await loadScript('legacy-word.js');
        try {
          text = await window.BaigeProofreadOffice.read(ext, bytes);
        } catch {
          throw new Error('无法读取文件正文，请检查文件格式或解除密码保护后重试。');
        }
      }
    }

    if (!text.trim()) throw new Error('文件没有可校对的文字，请检查后重新上传。');
    return text;
  }

  window.BaigeProofreadFile = {
    accept: formats.map(ext => '.' + ext).join(','),
    extension,
    read,
  };
})();
