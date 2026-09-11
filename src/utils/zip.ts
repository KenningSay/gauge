// Minimal ZIP writer, store-only (no compression), used to hand the browser
// one file when several are selected. No dependency: a real zip library
// would pull in a compressor this app has no use for — the vault is mostly
// already-compressed media, and DEFLATE on it costs CPU for ~0% saving.
//
// Everything is assembled as Blob parts rather than one big ArrayBuffer:
// the file bodies stay as the Blobs that came off the network (the browser
// may keep those on disk), so only one file's bytes are ever in the JS heap
// at a time — while its CRC is being computed.

export interface ZipInput {
  /** Path inside the archive, '/'-separated. */
  name: string
  blob: Blob
  modified?: Date
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ZIP stores mtime as the MS-DOS packed pair: 2-second resolution, epoch
// 1980. Anything older than that can't be represented at all, so it clamps
// rather than writing a negative year field.
function dosDateTime(d: Date): { time: number; date: number } {
  const safe = Number.isNaN(d.getTime()) || d.getFullYear() < 1980 ? new Date(1980, 0, 1) : d
  return {
    time: ((safe.getHours() << 11) | (safe.getMinutes() << 5) | (safe.getSeconds() >> 1)) & 0xffff,
    date: (((safe.getFullYear() - 1980) << 9) | ((safe.getMonth() + 1) << 5) | safe.getDate()) & 0xffff,
  }
}

interface CentralRecord {
  nameBytes: Uint8Array
  crc: number
  size: number
  offset: number
  time: number
  date: number
  isDir: boolean
}

// Bit 11 (0x0800) tells the reader the name is UTF-8. Without it, names are
// read as the archiver's local codepage — which mangles every Cyrillic
// filename in this vault on a Windows unzip.
const FLAG_UTF8 = 0x0800

function localHeader(r: CentralRecord): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(30 + r.nameBytes.length))
  const view = new DataView(buf.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true) // version needed: 2.0 (store + folders)
  view.setUint16(6, FLAG_UTF8, true)
  view.setUint16(8, 0, true) // method: store
  view.setUint16(10, r.time, true)
  view.setUint16(12, r.date, true)
  view.setUint32(14, r.crc, true)
  view.setUint32(18, r.size, true) // compressed
  view.setUint32(22, r.size, true) // uncompressed
  view.setUint16(26, r.nameBytes.length, true)
  view.setUint16(28, 0, true) // extra field length
  buf.set(r.nameBytes, 30)
  return buf
}

function centralHeader(r: CentralRecord): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(46 + r.nameBytes.length))
  const view = new DataView(buf.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true) // version made by
  view.setUint16(6, 20, true) // version needed
  view.setUint16(8, FLAG_UTF8, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, r.time, true)
  view.setUint16(14, r.date, true)
  view.setUint32(16, r.crc, true)
  view.setUint32(20, r.size, true)
  view.setUint32(24, r.size, true)
  view.setUint16(28, r.nameBytes.length, true)
  view.setUint16(30, 0, true) // extra
  view.setUint16(32, 0, true) // comment
  view.setUint16(34, 0, true) // disk number
  view.setUint16(36, 0, true) // internal attrs
  // External attrs: the high 16 bits are Unix st_mode, which is what every
  // Unix unzip actually reads. 0o755 for directories, 0o644 for files, plus
  // the DOS directory bit in the low byte for Windows.
  view.setUint32(38, r.isDir ? (0o040755 << 16) | 0x10 : 0o100644 << 16, true)
  view.setUint32(42, r.offset, true)
  buf.set(r.nameBytes, 46)
  return buf
}

function endOfCentralDirectory(count: number, cdSize: number, cdOffset: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(22))
  const view = new DataView(buf.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, count, true)
  view.setUint16(10, count, true)
  view.setUint32(12, cdSize, true)
  view.setUint32(16, cdOffset, true)
  view.setUint16(20, 0, true) // comment length
  return buf
}

/** Largest archive this writer can address — past it, ZIP needs the Zip64 extensions. */
export const ZIP_MAX_BYTES = 0xffffffff

export class ZipTooLargeError extends Error {}

/**
 * Builds a store-only ZIP. `dirs` are entry names for folders that would
 * otherwise leave no trace (empty ones) — a non-empty folder needs no
 * record of its own, every unzip creates it from its children's paths.
 * `onFileDone` fires after each input is read, for progress reporting.
 */
export async function createZip(
  inputs: ZipInput[],
  dirs: string[] = [],
  onFileDone?: (input: ZipInput) => void,
): Promise<Blob> {
  const encoder = new TextEncoder()
  const parts: BlobPart[] = []
  const central: CentralRecord[] = []
  let offset = 0

  for (const dir of dirs) {
    const record: CentralRecord = {
      nameBytes: encoder.encode(dir.endsWith('/') ? dir : dir + '/'),
      crc: 0,
      size: 0,
      offset,
      isDir: true,
      ...dosDateTime(new Date()),
    }
    const header = localHeader(record)
    parts.push(header)
    offset += header.length
    central.push(record)
  }

  for (const input of inputs) {
    const bytes = new Uint8Array(await input.blob.arrayBuffer())
    const record: CentralRecord = {
      nameBytes: encoder.encode(input.name),
      crc: crc32(bytes),
      size: bytes.length,
      offset,
      isDir: false,
      ...dosDateTime(input.modified ?? new Date()),
    }
    const header = localHeader(record)
    parts.push(header)
    // The Blob, not `bytes` — pushing the Uint8Array would copy the whole
    // file into the archive Blob's own backing store a second time.
    parts.push(input.blob)
    offset += header.length + record.size
    central.push(record)
    if (offset > ZIP_MAX_BYTES) {
      throw new ZipTooLargeError('Архив больше 4 ГБ — нужен Zip64')
    }
    onFileDone?.(input)
  }

  const cdOffset = offset
  let cdSize = 0
  for (const record of central) {
    const header = centralHeader(record)
    parts.push(header)
    cdSize += header.length
  }
  parts.push(endOfCentralDirectory(central.length, cdSize, cdOffset))

  return new Blob(parts, { type: 'application/zip' })
}
