import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getStorageInfo, setCredentials, clearCredentials, UnauthorizedError } from './webdav'

function mockResponse(status: number, body: string) {
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: 'Mock',
    text: async () => body,
    json: async () => JSON.parse(body),
  }
}

const EMPTY_PROP = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:"><D:response><D:href>/dav/</D:href>
<D:propstat><D:prop></D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>
</D:response></D:multistatus>`

const QUOTA_PROP = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/</d:href>
<d:propstat><d:prop>
  <d:quota-available-bytes>750</d:quota-available-bytes>
  <d:quota-used-bytes>250</d:quota-used-bytes>
</d:prop><d:status>HTTP/1.1 200 OK</d:status></d:propstat>
</d:response></d:multistatus>`

describe('getStorageInfo', () => {
  const fetchMock = vi.fn()
  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    setCredentials('u', 'p')
  })
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
    clearCredentials()
  })

  it('uses RFC 4331 quota props when the server has them', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(207, QUOTA_PROP))
    expect(await getStorageInfo()).toEqual({ total: 1000, used: 250, available: 750 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to /.gauge/storage.json when quota props are empty (nginx)', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(207, EMPTY_PROP))
      .mockResolvedValueOnce(mockResponse(200, '{"total":100,"used":12,"available":83,"updated":"x"}'))
    expect(await getStorageInfo()).toEqual({ total: 100, used: 12, available: 83 })
    expect(fetchMock.mock.calls[1][0]).toBe('/dav/.gauge/storage.json')
  })

  it('returns null when neither source exists', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(207, EMPTY_PROP))
      .mockResolvedValueOnce(mockResponse(404, 'not found'))
    expect(await getStorageInfo()).toBeNull()
  })

  it('rejects a malformed storage.json instead of showing nonsense', async () => {
    fetchMock
      .mockResolvedValueOnce(mockResponse(207, EMPTY_PROP))
      .mockResolvedValueOnce(mockResponse(200, '{"total":0,"used":"a"}'))
    expect(await getStorageInfo()).toBeNull()
  })

  it('still surfaces a 401', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(401, ''))
    await expect(getStorageInfo()).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
