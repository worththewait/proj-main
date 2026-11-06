(function () {
  'use strict';

  const compoundSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const zipSignature = [0x50, 0x4b, 0x03, 0x04];
  const wordNamespaces = new Set([
    'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
    'http://purl.oclc.org/ooxml/wordprocessingml/main',
  ]);

  function hasSignature(bytes, signature) {
    return signature.every((value, index) => bytes[index] === value);
  }

  function combine(parts) {
    return parts.map(part => part.trim()).filter(Boolean).join('\n\n');
  }

  function readXml(bytes) {
    const doc = new DOMParser().parseFromString(new TextDecoder().decode(bytes), 'application/xml');
    if (doc.getElementsByTagNameNS('*', 'parsererror').length) throw new Error('Invalid Office XML part');
    return doc;
  }

  function readWordPart(bytes) {
    const paragraphs = readXml(bytes).getElementsByTagNameNS('*', 'p');
    const lines = [];
    for (const paragraph of paragraphs) {
      if (!wordNamespaces.has(paragraph.namespaceURI)) continue;
      const runs = paragraph.getElementsByTagNameNS('*', 't');
      const line = Array.from(runs)
        .filter(run => wordNamespaces.has(run.namespaceURI))
        .map(run => run.textContent).join('');
      if (line.trim()) lines.push(line);
    }
    return lines.join('\n');
  }

  async function readDocx(bytes) {
    if (!hasSignature(bytes, zipSignature)) throw new Error('Invalid or encrypted Word package');
    const { CFB } = window.XLSX;
    const container = CFB.read(bytes, { type: 'array' });
    const types = CFB.find(container, '/[Content_Types].xml');
    if (!types?.content) throw new Error('Missing Word package manifest');
    const manifest = readXml(types.content);
    const extraParts = Array.from(manifest.getElementsByTagNameNS('*', 'Override'))
      .filter(entry => /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.(header|footer|footnotes|endnotes|comments)\+xml$/.test(entry.getAttribute('ContentType')))
      .map(entry => {
        const part = CFB.find(container, entry.getAttribute('PartName'));
        if (!part?.content) throw new Error('Missing Word document part');
        return readWordPart(part.content);
      });
    const body = await window.mammoth.extractRawText({ arrayBuffer: bytes.buffer });
    return combine([body.value, ...extraParts]);
  }

  function readSheet(sheet, utils) {
    const cells = Object.keys(sheet).filter(address => /^[A-Z]+[1-9]\d*$/.test(address))
      .map(address => ({ ...utils.decode_cell(address), cell: sheet[address] }))
      .sort((first, second) => first.r - second.r || first.c - second.c);
    const rows = [];
    let previousRow = -1;
    for (const { r, cell } of cells) {
      const value = typeof cell.v === 'string' ? cell.v : cell.w || cell.v;
      const text = value == null && cell.f ? '=' + cell.f : String(value ?? '');
      if (!text.trim()) continue;
      if (r !== previousRow) {
        rows.push([]);
        previousRow = r;
      }
      rows[rows.length - 1].push(text);
    }
    return rows.map(row => row.join('\t')).join('\n');
  }

  function readWorkbook(extension, bytes) {
    const rawBiff = bytes[0] === 0x09 && [0, 2, 4, 8].includes(bytes[1]);
    const signatureMatches = extension === 'xlsx'
      ? hasSignature(bytes, zipSignature)
      : hasSignature(bytes, compoundSignature) || rawBiff;
    if (!signatureMatches) throw new Error('Invalid or encrypted Excel workbook');

    const { read, utils } = window.XLSX;
    const book = read(bytes, { type: 'array', bookFiles: extension === 'xlsx', cellFormula: true });
    if (extension === 'xlsx' && !book.keys?.includes('[Content_Types].xml')) {
      throw new Error('Missing Excel package manifest');
    }
    if (!book.SheetNames.length) throw new Error('Missing worksheets');
    const sections = book.SheetNames.map(name => {
      const content = readSheet(book.Sheets[name], utils);
      return content ? name + '\n' + content : '';
    });
    return combine(sections);
  }

  async function read(extension, arrayBuffer) {
    const bytes = new Uint8Array(arrayBuffer);
    if (extension === 'doc') {
      if (!hasSignature(bytes, compoundSignature)) throw new Error('Invalid Word document');
      return window.BaigeLegacyWord.read(arrayBuffer);
    }
    if (extension === 'docx') return readDocx(bytes);
    if (extension === 'xls' || extension === 'xlsx') return readWorkbook(extension, bytes);
    throw new Error('Unsupported Office file');
  }

  window.BaigeProofreadOffice = { read };
})();
