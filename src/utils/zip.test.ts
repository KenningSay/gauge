import { describe, it, expect } from 'vitest'
import { crc32, createZip } from './zip'

function bytesOf(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

async function readZip(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer())
}

// Offset of the End Of Central Directory record — fixed 22 bytes from the
// end, since this writer never emits an archive comment.
function eocdOffset(view: DataView): number {
  return view.byteLength - 22
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(bytesOf('123456789'))).toBe(0xcbf43926)
  })

  it('is 0 for empty input', () => {
    expect(crc32(new Uint8Array(0))).toBe(0)
  })
})

describe('createZip', () => {
  it('writes a readable central directory for each entry', async () => {
    const zip = await createZip([
      { name: 'a.txt', blob: new Blob(['hello']) },
      { name: 'папка/b.txt', blob: new Blob(['мир']) },
    ], ['папка'])
    const view = await readZip(zip)
    const eocd = eocdOffset(view)

    expect(view.getUint32(eocd, true)).toBe(0x06054b50)
    // 2 files + 1 explicit directory entry
    expect(view.getUint16(eocd + 10, true)).toBe(3)
    expect(view.getUint32(0, true)).toBe(0x04034b50)

    const cdOffset = view.getUint32(eocd + 16, true)
    const cdSize = view.getUint32(eocd + 12, true)
    expect(cdOffset + cdSize).toBe(eocd)
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50)
  })

  it('flags names as UTF-8 so Cyrillic survives', async () => {
    const zip = await createZip([{ name: 'отчёт.txt', blob: new Blob(['x']) }])
    const view = await readZip(zip)
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
    const nameLen = view.getUint16(26, true)
    const name = new TextDecoder().decode(new Uint8Array(view.buffer, 30, nameLen))
    expect(name).toBe('отчёт.txt')
  })

  it('stores content uncompressed with a matching CRC and size', async () => {
    const content = 'gauge'
    const zip = await createZip([{ name: 'a.txt', blob: new Blob([content]) }])
    const view = await readZip(zip)
    expect(view.getUint16(8, true)).toBe(0) // method: store
    expect(view.getUint32(14, true)).toBe(crc32(bytesOf(content)))
    expect(view.getUint32(18, true)).toBe(content.length)
    expect(view.getUint32(22, true)).toBe(content.length)

    const dataStart = 30 + view.getUint16(26, true) + view.getUint16(28, true)
    const stored = new TextDecoder().decode(new Uint8Array(view.buffer, dataStart, content.length))
    expect(stored).toBe(content)
  })

  it('reports each file as it is read', async () => {
    const done: string[] = []
    await createZip(
      [
        { name: 'a.txt', blob: new Blob(['1']) },
        { name: 'b.txt', blob: new Blob(['2']) },
      ],
      [],
      (input) => done.push(input.name),
    )
    expect(done).toEqual(['a.txt', 'b.txt'])
  })

  it('marks directory entries as directories', async () => {
    const zip = await createZip([], ['пустая'])
    const view = await readZip(zip)
    const cdOffset = view.getUint32(eocdOffset(view) + 16, true)
    const nameLen = view.getUint16(cdOffset + 28, true)
    const name = new TextDecoder().decode(new Uint8Array(view.buffer, cdOffset + 46, nameLen))
    expect(name).toBe('пустая/')
    // Low byte of external attrs carries the DOS directory bit.
    expect(view.getUint32(cdOffset + 38, true) & 0x10).toBe(0x10)
  })
})
