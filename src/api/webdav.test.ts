import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  parentPath,
  davUrl,
  list,
  setCredentials,
  clearCredentials,
  getAuthHeader,
  onUnauthorized,
  UnauthorizedError,
  AlreadyExistsError,
  InvalidPathError,
  isValidName,
  uploadFile,
  UploadCancelledError,
  mkdir,
  WebDavError,
  renameEntry,
  deleteFile,
} from './webdav'
import type { FileEntry } from './types'

function mockResponse(opts: { status?: number; body?: string; ok?: boolean }) {
  const status = opts.status ?? 207
  return {
    status,
    ok: opts.ok ?? (status >= 200 && status < 300),
    statusText: 'Mock',
    text: async () => opts.body ?? '',
    blob: async () => new Blob([opts.body ?? '']),
  }
}

const PROPFIND_XML = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">
  <D:response>
    <D:href>/dav/Test/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/Test/%D0%A4%D0%BE%D1%82%D0%BE/</D:href>
    <D:propstat><D:prop><D:resourcetype><D:collection/></D:resourcetype></D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/Test/notes.txt</D:href>
    <D:propstat><D:prop>
      <D:resourcetype/>
      <D:getcontentlength>1234</D:getcontentlength>
      <D:getlastmodified>Tue, 25 Aug 2026 12:00:00 GMT</D:getlastmodified>
      <D:getcontenttype>text/plain</D:getcontenttype>
    </D:prop></D:propstat>
  </D:response>
  <D:response>
    <D:href>/dav/Test/%FF%FE-bad.txt</D:href>
    <D:propstat><D:prop><D:resourcetype/></D:prop></D:propstat>
  </D:response>
</D:multistatus>`

describe('parentPath', () => {
  it('returns the parent of a nested path', () => {
    expect(parentPath('/Foo/Bar/baz.txt')).toBe('/Foo/Bar')
  })
  it('returns root for a top-level path', () => {
    expect(parentPath('/baz.txt')).toBe('/')
  })
})

describe('davUrl', () => {
  it('percent-encodes each segment but preserves slashes', () => {
    expect(davUrl('/Фото/файл.txt')).toBe('/dav/%D0%A4%D0%BE%D1%82%D0%BE/%D1%84%D0%B0%D0%B9%D0%BB.txt')
  })
  it('strips leading slashes before prefixing the dav root', () => {
    expect(davUrl('///a/b')).toBe('/dav/a/b')
  })

  it('rejects a "." or ".." segment anywhere in the path', () => {
    expect(() => davUrl('/Vault/../../etc/passwd')).toThrow(InvalidPathError)
    expect(() => davUrl('/Vault/./x')).toThrow(InvalidPathError)
    expect(() => davUrl('..')).toThrow(InvalidPathError)
  })
})

describe('isValidName', () => {
  it('accepts an ordinary name, including Cyrillic', () => {
    expect(isValidName('Фото 2026.jpg')).toBe(true)
  })
  it('rejects "." and ".."', () => {
    expect(isValidName('.')).toBe(false)
    expect(isValidName('..')).toBe(false)
  })
  it('rejects a name containing a path separator', () => {
    expect(isValidName('a/b')).toBe(false)
    expect(isValidName('a\\b')).toBe(false)
  })
  it('rejects empty or whitespace-only names', () => {
    expect(isValidName('')).toBe(false)
    expect(isValidName('   ')).toBe(false)
  })
})

describe('list()', () => {
  beforeEach(() => {
    setCredentials('alex', 'pw')
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ body: PROPFIND_XML })))
  })
  afterEach(() => {
    clearCredentials()
    vi.unstubAllGlobals()
  })

  it('parses entries, skips the self entry, decodes percent-encoded Cyrillic names', async () => {
    const entries = await list('/Test')
    const names = entries.map((e) => e.name)
    expect(names).toContain('Фото')
    expect(names).toContain('notes.txt')
    expect(names).not.toContain('Test') // self entry excluded
  })

  it('sorts directories before files', async () => {
    const entries = await list('/Test')
    expect(entries[0].isDir).toBe(true)
  })

  it('reads size/modified/contentType off the file entry', async () => {
    const entries = await list('/Test')
    const file = entries.find((e: FileEntry) => e.name === 'notes.txt')!
    expect(file.size).toBe(1234)
    expect(file.isDir).toBe(false)
    expect(file.contentType).toBe('text/plain')
  })

  it('skips an entry with a malformed (non-UTF-8) href instead of throwing', async () => {
    const entries = await list('/Test')
    // The %FF%FE entry is not valid UTF-8 — decodeURIComponent throws, entry
    // dropped, the rest of the listing (Фото + notes.txt) still comes through.
    expect(entries).toHaveLength(2)
  })

  it('clears credentials and throws UnauthorizedError on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 401, ok: false })))
    await expect(list('/Test')).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('throws UnauthorizedError immediately if not logged in, without calling fetch', async () => {
    clearCredentials()
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await expect(list('/Test')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('throws instead of returning an empty listing when the body is not valid XML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 207, body: '<html>not xml at all <broken' })))
    await expect(list('/Test')).rejects.toBeInstanceOf(WebDavError)
  })

  it('throws instead of returning an empty listing on a 200 that is not really a 207', async () => {
    // e.g. a captive portal or misconfigured proxy serving a 200 HTML page.
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 200, ok: true, body: '<html>nope</html>' })))
    await expect(list('/Test')).rejects.toBeInstanceOf(WebDavError)
  })

  it('throws on a well-formed but response-less XML body instead of a silent empty folder', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 207, body: '<D:multistatus xmlns:D="DAV:"></D:multistatus>' })))
    await expect(list('/Test')).rejects.toBeInstanceOf(WebDavError)
  })
})

describe('setCredentials', () => {
  afterEach(() => clearCredentials())

  it('does not throw on non-Latin1 (e.g. Cyrillic) username/password', () => {
    expect(() => setCredentials('Александр', 'пароль123')).not.toThrow()
    expect(getAuthHeader()).toMatch(/^Basic /)
  })

  it('produces a Basic header that round-trips back to the original UTF-8 credentials', () => {
    setCredentials('Александр', 'пароль123')
    const b64 = getAuthHeader()!.slice('Basic '.length)
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    expect(new TextDecoder().decode(bytes)).toBe('Александр:пароль123')
  })
})

describe('request() error handling', () => {
  beforeEach(() => setCredentials('alex', 'pw'))
  afterEach(() => { clearCredentials(); vi.unstubAllGlobals() })

  it('throws WebDavError on 404 instead of treating it as success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 404, ok: false })))
    await expect(deleteFile('/Test/gone.txt')).rejects.toBeInstanceOf(WebDavError)
  })

  it('notifies onUnauthorized listeners on a 401, exactly once per request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 401, ok: false })))
    const listener = vi.fn()
    onUnauthorized(listener)
    await expect(deleteFile('/Test/x.txt')).rejects.toBeInstanceOf(UnauthorizedError)
    expect(listener).toHaveBeenCalledTimes(1)
  })
})

describe('mkdir', () => {
  beforeEach(() => setCredentials('alex', 'pw'))
  afterEach(() => clearCredentials())

  it('tolerates a 405 (already exists) as success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 405, ok: false })))
    await expect(mkdir('/Test', 'existing')).resolves.toBeUndefined()
    vi.unstubAllGlobals()
  })

  it('rethrows other errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 500, ok: false })))
    await expect(mkdir('/Test', 'x')).rejects.toBeInstanceOf(WebDavError)
    vi.unstubAllGlobals()
  })
})

describe('renameEntry / moveOrCopy', () => {
  beforeEach(() => setCredentials('alex', 'pw'))
  afterEach(() => clearCredentials())

  it('adds a trailing slash to both source and Destination for a directory', async () => {
    const fetchSpy = vi.fn(async (_url: string, _init?: RequestInit & { headers: Record<string, string> }) => mockResponse({ status: 204, ok: true }))
    vi.stubGlobal('fetch', fetchSpy)
    const dir: FileEntry = { name: 'Old', path: '/Test/Old', isDir: true, size: 0, modified: '', contentType: '' }
    await renameEntry(dir, 'New')
    const [url, init] = fetchSpy.mock.calls[0]
    expect(url).toBe('/dav/Test/Old/')
    expect(init!.headers.Destination).toBe('/dav/Test/New/')
    vi.unstubAllGlobals()
  })

  it('maps a 412 response to AlreadyExistsError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => mockResponse({ status: 412, ok: false })))
    const file: FileEntry = { name: 'a.txt', path: '/Test/a.txt', isDir: false, size: 0, modified: '', contentType: '' }
    await expect(renameEntry(file, 'b.txt')).rejects.toBeInstanceOf(AlreadyExistsError)
    vi.unstubAllGlobals()
  })
})

describe('uploadFile', () => {
  it('rejects immediately with UploadCancelledError if the signal is already aborted, without opening a connection', async () => {
    setCredentials('alex', 'pw')
    const controller = new AbortController()
    controller.abort()
    const file = new File(['x'], 'a.txt')
    await expect(uploadFile('/Test', file, undefined, controller.signal)).rejects.toBeInstanceOf(UploadCancelledError)
    clearCredentials()
  })

  it('rejects with UnauthorizedError when not logged in', async () => {
    clearCredentials()
    const file = new File(['x'], 'a.txt')
    await expect(uploadFile('/Test', file)).rejects.toBeInstanceOf(UnauthorizedError)
  })
})
