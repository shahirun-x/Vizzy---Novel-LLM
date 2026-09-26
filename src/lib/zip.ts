export interface ZipEntry {
  path: string;
  data: string | Uint8Array;
}

const encoder = new TextEncoder();

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value, true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validateArchivePath(path: string) {
  const segments = path.split("/");
  if (
    !path ||
    path.startsWith("/") ||
    path.includes("\\") ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(`Unsafe ZIP entry path: ${path || "(empty)"}`);
  }
}

function copyInto(target: Uint8Array, offset: number, source: Uint8Array) {
  target.set(source, offset);
  return offset + source.length;
}

/** Creates a portable ZIP archive using the uncompressed STORE method. */
export function createStoreZip(entries: ZipEntry[]) {
  if (!entries.length) throw new Error("A ZIP archive requires at least one entry.");
  const seen = new Set<string>();
  const prepared = entries.map((entry) => {
    validateArchivePath(entry.path);
    if (seen.has(entry.path)) throw new Error(`Duplicate ZIP entry: ${entry.path}`);
    seen.add(entry.path);
    const name = encoder.encode(entry.path);
    const data = typeof entry.data === "string" ? encoder.encode(entry.data) : entry.data;
    return { name, data, crc: crc32(data), offset: 0 };
  });

  const localSize = prepared.reduce((total, entry) => total + 30 + entry.name.length + entry.data.length, 0);
  const centralSize = prepared.reduce((total, entry) => total + 46 + entry.name.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);
  let offset = 0;

  for (const entry of prepared) {
    entry.offset = offset;
    writeUint32(view, offset, 0x04034b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 0x0800);
    writeUint16(view, offset + 8, 0);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, 0x0021);
    writeUint32(view, offset + 14, entry.crc);
    writeUint32(view, offset + 18, entry.data.length);
    writeUint32(view, offset + 22, entry.data.length);
    writeUint16(view, offset + 26, entry.name.length);
    writeUint16(view, offset + 28, 0);
    offset = copyInto(output, offset + 30, entry.name);
    offset = copyInto(output, offset, entry.data);
  }

  const centralOffset = offset;
  for (const entry of prepared) {
    writeUint32(view, offset, 0x02014b50);
    writeUint16(view, offset + 4, 20);
    writeUint16(view, offset + 6, 20);
    writeUint16(view, offset + 8, 0x0800);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, 0);
    writeUint16(view, offset + 14, 0x0021);
    writeUint32(view, offset + 16, entry.crc);
    writeUint32(view, offset + 20, entry.data.length);
    writeUint32(view, offset + 24, entry.data.length);
    writeUint16(view, offset + 28, entry.name.length);
    writeUint16(view, offset + 30, 0);
    writeUint16(view, offset + 32, 0);
    writeUint16(view, offset + 34, 0);
    writeUint16(view, offset + 36, 0);
    writeUint32(view, offset + 38, 0);
    writeUint32(view, offset + 42, entry.offset);
    offset = copyInto(output, offset + 46, entry.name);
  }

  writeUint32(view, offset, 0x06054b50);
  writeUint16(view, offset + 4, 0);
  writeUint16(view, offset + 6, 0);
  writeUint16(view, offset + 8, prepared.length);
  writeUint16(view, offset + 10, prepared.length);
  writeUint32(view, offset + 12, centralSize);
  writeUint32(view, offset + 16, centralOffset);
  writeUint16(view, offset + 20, 0);
  return output;
}
