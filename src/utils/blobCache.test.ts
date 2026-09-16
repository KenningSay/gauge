import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// The cache exists so a board with thirty copies of the same image fetches
// it once; these tests are about the refcount, so the network layer is
// mocked and only call counts matter.
const fetchBlob = vi.fn(async (_path: string) => new Blob(['x']))
vi.mock('../api/webdav', () => ({ fetchBlob: (p: string) => fetchBlob(p) }))

const { acquireBlobUrl, releaseBlobUrl, clearBlobCache } = await import('./blobCache')

let created: string[] = []
let revoked: string[] = []

beforeEach(() => {
  fetchBlob.mockClear()
  created = []
  revoked = []
  let n = 0
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:test/${++n}`
      created.push(url)
      return url
    }),
    revokeObjectURL: vi.fn((u: string) => revoked.push(u)),
  })
})

afterEach(() => {
  clearBlobCache()
  vi.unstubAllGlobals()
})

describe('blobCache', () => {
  it('fetches once and revokes on the last release', async () => {
    const url = await acquireBlobUrl('/a.png')
    expect(fetchBlob).toHaveBeenCalledTimes(1)
    releaseBlobUrl('/a.png')
    expect(revoked).toContain(url)
  })

  it('shares one fetch between concurrent acquirers', async () => {
    const [a, b] = await Promise.all([acquireBlobUrl('/a.png'), acquireBlobUrl('/a.png')])
    expect(a).toBe(b)
    expect(fetchBlob).toHaveBeenCalledTimes(1)
  })

  it('keeps the blob alive while another holder remains', async () => {
    const url = await acquireBlobUrl('/a.png')
    await acquireBlobUrl('/a.png')

    releaseBlobUrl('/a.png')
    expect(revoked).not.toContain(url)

    releaseBlobUrl('/a.png')
    expect(revoked).toContain(url)
  })

  it('re-fetches after the entry was fully released', async () => {
    await acquireBlobUrl('/a.png')
    releaseBlobUrl('/a.png')
    await acquireBlobUrl('/a.png')
    expect(fetchBlob).toHaveBeenCalledTimes(2)
  })

  it('does not leave a dead entry behind a failed fetch', async () => {
    fetchBlob.mockRejectedValueOnce(new Error('404'))
    await expect(acquireBlobUrl('/missing.png')).rejects.toThrow('404')

    // A later acquire must actually retry rather than replay the rejection
    // forever — otherwise one flaky load poisons the pin until reload.
    const url = await acquireBlobUrl('/missing.png')
    expect(url).toMatch(/^blob:/)
    expect(fetchBlob).toHaveBeenCalledTimes(2)
  })

  it('releasing an unknown path is a no-op, not a crash', () => {
    expect(() => releaseBlobUrl('/never-acquired.png')).not.toThrow()
  })
})

describe('unbalanced release', () => {
  it('ignores a second release for the same acquire', async () => {
    // One acquire, two releases: an image pin unmounting mid-fetch used to
    // do exactly this, which revoked the blob a later mount was using.
    const url = await acquireBlobUrl('/a.png')
    releaseBlobUrl('/a.png')
    releaseBlobUrl('/a.png')

    revoked.length = 0
    const again = await acquireBlobUrl('/a.png')
    expect(again).toMatch(/^blob:/)
    expect(revoked).not.toContain(again)
    expect(url).not.toBe(again)
  })
})
