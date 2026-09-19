// Regression tests for the write that thought it was safe.
//
// putTextContentConditional used to rely entirely on the server answering
// 412 to an If-Match it did not match. The live nginx WebDAV module does
// not implement that: it returns 204 and overwrites. Two clients therefore
// clobbered each other silently for an hour and a board's worth of work
// went with it. These tests pin the client-side check that replaced it —
// in particular that a mismatched ETag is caught even when the server
// happily reports success.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  putTextContentConditional,
  setCredentials,
  clearCredentials,
  PreconditionFailedError,
} from './webdav'

function propfindXml(etag: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/f.json</D:href>
    <D:propstat><D:prop>
      <D:getetag>${etag}</D:getetag>
      <D:getlastmodified>Fri, 19 Sep 2026 14:07:30 GMT</D:getlastmodified>
    </D:prop></D:propstat>
  </D:response>
</D:multistatus>`
}

function res(opts: { status?: number; body?: string }) {
  const status = opts.status ?? 207
  return {
    status,
    ok: status >= 200 && status < 300,
    statusText: 'Mock',
    text: async () => opts.body ?? '',
    blob: async () => new Blob([opts.body ?? '']),
  }
}

// A server that behaves exactly like the real one: PROPFIND reports the
// current etag, PUT always succeeds regardless of If-Match.
function mockServer(currentEtag: string | null) {
  const calls: Array<{ method: string; ifMatch?: string }> = []
  const fetchMock = vi.fn(async (_url: string, init: RequestInit & { headers?: Record<string, string> }) => {
    const method = init.method ?? 'GET'
    calls.push({ method, ifMatch: init.headers?.['If-Match'] })
    if (method === 'PROPFIND') {
      if (currentEtag === null) return res({ status: 404 })
      return res({ status: 207, body: propfindXml(currentEtag) })
    }
    if (method === 'PUT') return res({ status: 204 })
    return res({ status: 200 })
  })
  return { fetchMock, calls }
}

describe('putTextContentConditional', () => {
  beforeEach(() => setCredentials('alex', 'pw'))
  afterEach(() => {
    clearCredentials()
    vi.unstubAllGlobals()
  })

  it('refuses to write when the file changed since it was loaded, even though the server would accept the PUT', async () => {
    const { fetchMock, calls } = mockServer('"someone-elses-write"')
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      putTextContentConditional('/f.json', '{"mine":true}', '"what-i-loaded"'),
    ).rejects.toBeInstanceOf(PreconditionFailedError)

    // The decisive assertion: no PUT was ever sent. The old code sent it
    // and trusted a 412 that never came.
    expect(calls.some((c) => c.method === 'PUT')).toBe(false)
  })

  it('writes when the etag still matches', async () => {
    const { fetchMock, calls } = mockServer('"unchanged"')
    vi.stubGlobal('fetch', fetchMock)

    const stat = await putTextContentConditional('/f.json', 'body', '"unchanged"')

    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
    expect(stat.etag).toBe('"unchanged"')
  })

  it('still sends If-Match, so a server that does enforce it closes the race completely', async () => {
    const { fetchMock, calls } = mockServer('"unchanged"')
    vi.stubGlobal('fetch', fetchMock)

    await putTextContentConditional('/f.json', 'body', '"unchanged"')

    expect(calls.find((c) => c.method === 'PUT')?.ifMatch).toBe('"unchanged"')
  })

  it('treats a file that no longer exists as writable rather than a conflict', async () => {
    const { fetchMock, calls } = mockServer(null)
    vi.stubGlobal('fetch', fetchMock)

    await putTextContentConditional('/f.json', 'body', '"loaded-before-it-was-deleted"')

    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
  })

  it('does not check at all when no etag is supplied, so an explicit overwrite still works', async () => {
    const { fetchMock, calls } = mockServer('"someone-elses-write"')
    vi.stubGlobal('fetch', fetchMock)

    await putTextContentConditional('/f.json', 'body', null)

    expect(calls.filter((c) => c.method === 'PUT')).toHaveLength(1)
    expect(calls.find((c) => c.method === 'PUT')?.ifMatch).toBeUndefined()
  })

  it('surfaces a real 412 as a conflict if the server ever starts enforcing it', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit & { headers?: Record<string, string> }) => {
      const method = init.method ?? 'GET'
      if (method === 'PROPFIND') return res({ status: 207, body: propfindXml('"unchanged"') })
      if (method === 'PUT') return res({ status: 412 })
      return res({ status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      putTextContentConditional('/f.json', 'body', '"unchanged"'),
    ).rejects.toBeInstanceOf(PreconditionFailedError)
  })
})
