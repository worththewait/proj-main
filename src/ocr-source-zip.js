/* Store original file bytes in a single ZIP so browsers only start one download. */
(() => {
  "use strict";

  const UTF8 = 0x0800;
  const DOS_DATE = 0x0021; // 1980-01-01
  const MAX_SIZE = 0xffffffff;
  const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return crc;
  });

  function checksum(bytes) {
    let crc = MAX_SIZE;
    for (const byte of bytes) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
    return (crc ^ MAX_SIZE) >>> 0;
  }

  function uniqueName(name, used) {
    const safe = name.replace(/[\\/:*?"<>|]/g, "_").replace(/[. ]+$/, "") || "文件";
    const extension = safe.match(/\.[^.]+$/)?.[0] || "";
    const stem = safe.slice(0, safe.length - extension.length);
    let candidate = safe;
    let index = 2;
    while (used.has(candidate.normalize("NFC").toLowerCase())) {
      candidate = `${stem} (${index++})${extension}`;
    }
    used.add(candidate.normalize("NFC").toLowerCase());
    return candidate;
  }

  async function create(files) {
    if (files.length >= 0xffff) throw new RangeError("所选文件过多，请分批下载");
    const encoder = new TextEncoder();
    const names = new Set();
    const entries = [];
    const directory = [];
    let offset = 0;
    let directorySize = 0;

    for (const { name, blob } of files) {
      const filename = encoder.encode(uniqueName(name, names));
      const entrySize = 30 + filename.length + blob.size;
      const directoryEntrySize = 46 + filename.length;
      if (filename.length > 0xffff || offset + entrySize + directorySize + directoryEntrySize + 22 >= MAX_SIZE) {
        throw new RangeError("所选文件过大，请分批下载");
      }
      const crc = checksum(new Uint8Array(await blob.arrayBuffer()));

      const entry = new DataView(new ArrayBuffer(30)); // Local file header
      entry.setUint32(0, 0x04034b50, true);
      entry.setUint16(4, 20, true);
      entry.setUint16(6, UTF8, true);
      entry.setUint16(12, DOS_DATE, true);
      entry.setUint32(14, crc, true);
      entry.setUint32(18, blob.size, true);
      entry.setUint32(22, blob.size, true);
      entry.setUint16(26, filename.length, true);
      entries.push(entry.buffer, filename, blob);

      const central = new DataView(new ArrayBuffer(46)); // Central directory entry
      central.setUint32(0, 0x02014b50, true);
      central.setUint16(4, 20, true);
      central.setUint16(6, 20, true);
      central.setUint16(8, UTF8, true);
      central.setUint16(14, DOS_DATE, true);
      central.setUint32(16, crc, true);
      central.setUint32(20, blob.size, true);
      central.setUint32(24, blob.size, true);
      central.setUint16(28, filename.length, true);
      central.setUint32(42, offset, true);
      directory.push(central.buffer, filename);

      offset += entrySize;
      directorySize += directoryEntrySize;
    }

    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, directorySize, true);
    end.setUint32(16, offset, true);
    return new Blob([...entries, ...directory, end.buffer], { type: "application/zip" });
  }

  window.BaigeOcrSourceZip = Object.freeze({ create });
})();
