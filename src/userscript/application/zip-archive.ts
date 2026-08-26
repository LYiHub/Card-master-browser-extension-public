export type ZipArchiveEntry = {
  name: string;
  data: Uint8Array;
};

const LOCAL_FILE_SIGNATURE = 0x04034b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const UTF8_FLAG = 0x0800;
const STORE_METHOD = 0;
const DEFLATE_METHOD = 8;
const MAX_ENTRY_COUNT = 4_096;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ENTRY_BYTES = 64 * 1024 * 1024;
const MAX_EXPANDED_BYTES = 256 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 200;

function crcTable() {
  return Array.from({ length: 256 }, (_, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  });
}

const CRC_TABLE = crcTable();

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concatBytes(parts: readonly Uint8Array[]) {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function writableBytes(size: number) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function dosTimestamp(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function safeEntryName(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (
    !normalized ||
    normalized.split('/').some((segment) => segment === '..')
  ) {
    throw new Error(`ZIP 条目路径无效：${value}`);
  }
  return normalized;
}

export function createZipArchive(entries: readonly ZipArchiveEntry[]) {
  if (entries.length > MAX_ENTRY_COUNT) {
    throw new Error(`ZIP 条目数量不能超过 ${MAX_ENTRY_COUNT}。`);
  }
  let expandedBytes = 0;
  for (const entry of entries) {
    if (entry.data.byteLength > MAX_ENTRY_BYTES) {
      throw new Error('ZIP 单个条目超过 64 MB 安全上限。');
    }
    expandedBytes += entry.data.byteLength;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('ZIP 总大小超过 256 MB 安全上限。');
    }
  }
  const encoder = new TextEncoder();
  const timestamp = dosTimestamp();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const name = encoder.encode(safeEntryName(entry.name));
    const data = entry.data;
    const crc = crc32(data);
    const local = writableBytes(30);
    local.view.setUint32(0, LOCAL_FILE_SIGNATURE, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, UTF8_FLAG, true);
    local.view.setUint16(8, STORE_METHOD, true);
    local.view.setUint16(10, timestamp.time, true);
    local.view.setUint16(12, timestamp.date, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.byteLength, true);
    local.view.setUint32(22, data.byteLength, true);
    local.view.setUint16(26, name.byteLength, true);
    local.view.setUint16(28, 0, true);
    localParts.push(local.bytes, name, data);

    const central = writableBytes(46);
    central.view.setUint32(0, CENTRAL_FILE_SIGNATURE, true);
    central.view.setUint16(4, 20, true);
    central.view.setUint16(6, 20, true);
    central.view.setUint16(8, UTF8_FLAG, true);
    central.view.setUint16(10, STORE_METHOD, true);
    central.view.setUint16(12, timestamp.time, true);
    central.view.setUint16(14, timestamp.date, true);
    central.view.setUint32(16, crc, true);
    central.view.setUint32(20, data.byteLength, true);
    central.view.setUint32(24, data.byteLength, true);
    central.view.setUint16(28, name.byteLength, true);
    central.view.setUint16(30, 0, true);
    central.view.setUint16(32, 0, true);
    central.view.setUint16(34, 0, true);
    central.view.setUint16(36, 0, true);
    central.view.setUint32(38, 0, true);
    central.view.setUint32(42, localOffset, true);
    centralParts.push(central.bytes, name);
    localOffset += local.bytes.byteLength + name.byteLength + data.byteLength;
  }

  const centralDirectory = concatBytes(centralParts);
  const end = writableBytes(22);
  end.view.setUint32(0, END_OF_CENTRAL_DIRECTORY_SIGNATURE, true);
  end.view.setUint16(4, 0, true);
  end.view.setUint16(6, 0, true);
  end.view.setUint16(8, entries.length, true);
  end.view.setUint16(10, entries.length, true);
  end.view.setUint32(12, centralDirectory.byteLength, true);
  end.view.setUint32(16, localOffset, true);
  end.view.setUint16(20, 0, true);
  return concatBytes([...localParts, centralDirectory, end.bytes]);
}

function endOfCentralDirectory(view: DataView) {
  const earliest = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= earliest; offset -= 1) {
    if (view.getUint32(offset, true) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error('无法读取 ZIP 中央目录。');
}

function exactArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function requireRange(
  view: DataView,
  offset: number,
  length: number,
  description: string,
) {
  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > view.byteLength
  ) {
    throw new Error(`ZIP ${description}超出归档边界。`);
  }
}

async function inflateRaw(data: Uint8Array) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('当前浏览器不支持读取压缩 ZIP。');
  }
  const stream = new Blob([exactArrayBuffer(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipArchive(data: Uint8Array) {
  if (data.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error('ZIP 归档超过 256 MB 安全上限。');
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const endOffset = endOfCentralDirectory(view);
  if (
    view.getUint16(endOffset + 4, true) !== 0 ||
    view.getUint16(endOffset + 6, true) !== 0
  ) {
    throw new Error('不支持多磁盘 ZIP 归档。');
  }
  const entryCount = view.getUint16(endOffset + 10, true);
  if (entryCount > MAX_ENTRY_COUNT) {
    throw new Error(`ZIP 条目数量不能超过 ${MAX_ENTRY_COUNT}。`);
  }
  const centralDirectorySize = view.getUint32(endOffset + 12, true);
  let cursor = view.getUint32(endOffset + 16, true);
  requireRange(view, cursor, centralDirectorySize, '中央目录');
  if (cursor + centralDirectorySize > endOffset) {
    throw new Error('ZIP 中央目录与结束记录重叠。');
  }
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let expandedBytes = 0;

  for (let index = 0; index < entryCount; index += 1) {
    requireRange(view, cursor, 46, '中央目录条目');
    if (view.getUint32(cursor, true) !== CENTRAL_FILE_SIGNATURE) {
      throw new Error('ZIP 中央目录条目损坏。');
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const expectedCrc = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const uncompressedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    if (flags & 1) throw new Error('不支持加密 ZIP 归档。');
    if (flags & 0x08) throw new Error('不支持使用数据描述符的 ZIP 条目。');
    if (uncompressedSize > MAX_ENTRY_BYTES) {
      throw new Error('ZIP 单个条目超过 64 MB 安全上限。');
    }
    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error('ZIP 解压后总大小超过 256 MB 安全上限。');
    }
    if (
      compressedSize > 0 &&
      uncompressedSize / compressedSize > MAX_COMPRESSION_RATIO
    ) {
      throw new Error('ZIP 条目压缩比超过安全上限。');
    }
    requireRange(
      view,
      cursor + 46,
      nameLength + extraLength + commentLength,
      '条目元数据',
    );
    const name = safeEntryName(
      decoder.decode(data.subarray(cursor + 46, cursor + 46 + nameLength)),
    );
    if (entries.has(name)) throw new Error(`ZIP 条目重复：${name}`);
    requireRange(view, localOffset, 30, `条目头：${name}`);
    if (view.getUint32(localOffset, true) !== LOCAL_FILE_SIGNATURE) {
      throw new Error(`ZIP 条目损坏：${name}`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const contentOffset = localOffset + 30 + localNameLength + localExtraLength;
    requireRange(view, contentOffset, compressedSize, `条目内容：${name}`);
    const compressed = data.subarray(
      contentOffset,
      contentOffset + compressedSize,
    );
    const content =
      method === STORE_METHOD
        ? new Uint8Array(compressed)
        : method === DEFLATE_METHOD
          ? await inflateRaw(compressed)
          : null;
    if (!content) throw new Error(`ZIP 条目使用了不支持的压缩方式：${name}`);
    if (content.byteLength !== uncompressedSize) {
      throw new Error(`ZIP 条目长度不一致：${name}`);
    }
    if (crc32(content) !== expectedCrc) {
      throw new Error(`ZIP 条目校验失败：${name}`);
    }
    entries.set(name, content);
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}
