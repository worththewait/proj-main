// WordExtractor's OLE text reader, with local OLE streams supplied by SheetJS.
const WordOleExtractor = require('word-extractor/lib/word-ole-extractor');

class BrowserWordExtractor extends WordOleExtractor {
  documentStream(document, name) {
    const entry = globalThis.XLSX.CFB.find(document, '/' + name);
    if (!entry?.content) throw new Error('Missing Word stream: ' + name);
    return Promise.resolve(Buffer.from(entry.content));
  }

  streamBuffer(buffer) {
    return Promise.resolve(buffer);
  }
}

async function read(arrayBuffer) {
  const extractor = new BrowserWordExtractor();
  const container = globalThis.XLSX.CFB.read(new Uint8Array(arrayBuffer), { type: 'array' });
  const main = await extractor.documentStream(container, 'WordDocument');
  if (main.length < 0x1aa || (main.readUInt16LE(0x0a) & 0x8100)) {
    throw new Error('Invalid or encrypted Word document');
  }
  const document = await extractor.extractWordDocument(container, main);
  const options = { filterUnicode: false };
  return [
    document.getBody(options),
    document.getHeaders({ ...options, includeFooters: false }),
    document.getFooters(options),
    document.getFootnotes(options),
    document.getEndnotes(options),
    document.getAnnotations(options),
    document.getTextboxes(options),
  ].map(text => text.trim()).filter(Boolean).join('\n\n');
}

module.exports = { read };
