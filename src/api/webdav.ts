import type { FileEntry } from './types'

const ROOT = '/dav/'

// btoa() only accepts Latin1 (code points 0-255) and throws
// InvalidCharacterError on anything else — a real problem for a login form
// where username/password can be Cyrillic or any other non-ASCII text.
// Basic Auth (RFC 7617) allows a UTF-8 credential charset, so this encodes
// the UTF-8 bytes rather than the raw JS string.
function toBase64Utf8(str: string): string {
  const bytes = new TextEncoder().encode(str)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

// Credentials are provided at runtime by the login screen (see useAuthStore),
// never hardcoded — nothing secret ships in this bundle. Never written to
// IndexedDB/localStorage either — see swAuth.ts for how the service worker
// gets at this without the credential ever leaving memory.
let authHeader: string | null = null

export function setCredentials(username: string, password: string) {
  authHeader = 'Basic ' + toBase64Utf8(`${username}:${password}`)
}

export function clearCredentials() {
  authHeader = null
}

export function getAuthHeader(): string | null {
  return authHeader
}

// Fires only when a 401 arrives mid-session (credentials revoked/changed
// server-side, or a stale session) — not on an explicit logout or a failed
// login attempt, both of which already update useAuthStore themselves with
// their own, more specific message. Without this, a mid-session 401 cleared
// this module's own authHeader but left useAuthStore.authenticated (and the
// session in sessionStorage) untouched, so the UI stayed stuck showing a
// broken file manager instead of returning to the login screen.
type UnauthorizedListener = () => void
const unauthorizedListeners: UnauthorizedListener[] = []

export function onUnauthorized(listener: UnauthorizedListener): void {
  unauthorizedListeners.push(listener)
}

export class UnauthorizedError extends Error {}

export class WebDavError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

function joinPath(dir: string, name: string): string {
  return (dir.endsWith('/') ? dir : dir + '/') + name
}

export function parentPath(path: string): string {
  return path.substring(0, path.lastIndexOf('/')) || '/'
}

// Exported for video/audio playback: a real, credential-free same-origin
// URL that the service worker (public/gauge-sw.js) authenticates in-flight,
// as opposed to fetching the whole file into a blob: URL. See ViewerModal.tsx.
export class InvalidPathError extends Error {}

// A single path segment (a folder/file name) coming straight from user
// input — not a full path, which legitimately contains '/'. Rejects
// anything that could act as a path-traversal segment or otherwise isn't a
// real name. davUrl() below independently rejects '.'/'..' in ANY path
// passed to it too, as the last line of defense regardless of where a bad
// segment came from — this one exists to reject it earlier, right where the
// user typed it, with a clearer message than davUrl()'s exception would give.
export function isValidName(name: string): boolean {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..') return false
  if (/[/\\]/.test(trimmed)) return false
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f]/.test(trimmed)) return false
  return true
}

export function davUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  const segments = clean.split('/')
  // '.'/'..' segments survive encodeURIComponent unchanged (neither
  // character needs escaping), and the browser's own URL resolution then
  // collapses them BEFORE the request is sent — a folder or rename named
  // e.g. "../../etc" could walk the resulting request straight out of
  // /dav/ and onto a completely different path on the same origin.
  if (segments.some((s) => s === '.' || s === '..')) {
    throw new InvalidPathError(`Недопустимый путь: «${path}»`)
  }
  // Percent-encode each segment (preserving '/' as separators). Needed for
  // more than just correctness: the Destination header on MOVE/COPY must be
  // a plain ByteString per the Fetch spec, and a raw non-Latin1 character
  // (e.g. Cyrillic) there throws a TypeError before the request is even
  // sent — this crashed every rename/move once the destination path had a
  // Cyrillic segment, which in this vault is nearly always.
  const encoded = segments.map(encodeURIComponent).join('/')
  return ROOT + encoded
}

// <img>/<video>/<audio> can't carry a custom Authorization header, so
// display/download fetch the bytes with a real header here and hand the
// browser a blob: URL instead of embedding creds in a plain URL. See
// src/hooks/useAuthorizedUrl.ts and src/utils/download.ts.
export async function fetchBlob(path: string): Promise<Blob> {
  const res = await request(path, { method: 'GET' })
  return res.blob()
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  if (!authHeader) throw new UnauthorizedError('Not authenticated')
  const res = await fetch(davUrl(path), {
    ...init,
    headers: {
      Authorization: authHeader,
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    clearCredentials()
    // Only for a 401 arriving mid-session — see onUnauthorized's own
    // comment for why an explicit logout or a failed login must not also
    // go through this path.
    unauthorizedListeners.forEach((fn) => fn())
    throw new UnauthorizedError(`WebDAV ${init.method ?? 'GET'} ${path} -> 401`)
  }
  // 404 used to be tolerated here for every method — meant a MOVE off a
  // clipboard entry that no longer exists, or a DELETE on an already-gone
  // file, silently reported success instead of the no-op it actually was;
  // worse, a GET of a missing file would hand the caller a 404 error page's
  // body as if it were the real file content. Nothing in this codebase
  // actually depends on 404 being treated as OK.
  if (!res.ok && res.status !== 207) {
    throw new WebDavError(`WebDAV ${init.method ?? 'GET'} ${path} -> ${res.status} ${res.statusText}`, res.status)
  }
  return res
}

function extText(el: Element, tag: string): string {
  const node = el.getElementsByTagNameNS('DAV:', tag)[0] ?? el.getElementsByTagName(tag)[0]
  return node?.textContent?.trim() ?? ''
}

export async function list(path: string): Promise<FileEntry[]> {
  const res = await request(path, {
    method: 'PROPFIND',
    headers: { Depth: '1' },
  })
  if (res.status !== 207) {
    throw new WebDavError(`WebDAV PROPFIND ${path} -> ${res.status} (expected 207 Multi-Status)`, res.status)
  }
  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  if (doc.querySelector('parsererror')) {
    throw new WebDavError(`WebDAV PROPFIND ${path} -> response body is not valid XML`, res.status)
  }
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'))
    .concat(Array.from(doc.getElementsByTagName('response')))
  // Even an empty folder's PROPFIND still returns its own self-entry — zero
  // <response> elements at all means something upstream (a captive portal,
  // a misconfigured proxy, an auth gateway) served something that merely
  // *looks* like a 207 without being one, which would otherwise render as a
  // silently empty folder instead of the real problem.
  if (responses.length === 0) {
    throw new WebDavError(`WebDAV PROPFIND ${path} -> 207 response had no <response> elements`, res.status)
  }

  const seen = new Set<string>()
  const entries: FileEntry[] = []

  for (const r of responses) {
    const rawHref = extText(r, 'href')
    let href: string
    try {
      href = decodeURIComponent(rawHref)
    } catch {
      // Filename bytes on disk aren't valid UTF-8 (e.g. a legacy
      // Windows-1251 name) — skip this one entry instead of failing
      // the whole listing (and, if this is the root listing, the login).
      console.warn(`Gauge: skipping entry with malformed href: ${rawHref}`)
      continue
    }
    if (seen.has(href)) continue
    seen.add(href)

    const relative = (href.startsWith(ROOT) ? href.slice(ROOT.length) : href).replace(/\/$/, '')
    const normalizedCurrent = path.replace(/^\/+|\/+$/g, '')
    if (relative === normalizedCurrent) continue // skip self entry

    const isDir = r.getElementsByTagNameNS('DAV:', 'collection').length > 0
      || r.getElementsByTagName('collection').length > 0
    const name = relative.split('/').pop() ?? relative
    const sizeStr = extText(r, 'getcontentlength')
    const modified = extText(r, 'getlastmodified')
    const contentType = extText(r, 'getcontenttype')

    entries.push({
      name,
      path: '/' + relative,
      isDir,
      size: sizeStr ? parseInt(sizeStr, 10) : 0,
      modified,
      contentType,
    })
  }

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })
  return entries
}

export async function getTextContent(path: string): Promise<string> {
  const res = await request(path, { method: 'GET' })
  return res.text()
}

export async function putTextContent(path: string, content: string): Promise<void> {
  await request(path, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    body: content,
  })
}

export class UploadCancelledError extends Error {}

// XHR, not fetch(): fetch() has no upload-progress event, only
// XMLHttpRequest.upload.onprogress does. Duplicates request()'s 401/error
// handling since that helper is fetch-based.
export function uploadFile(
  dirPath: string,
  file: File,
  onProgress?: (loadedBytes: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (!authHeader) return Promise.reject(new UnauthorizedError('Not authenticated'))
  if (signal?.aborted) return Promise.reject(new UploadCancelledError())
  const target = joinPath(dirPath, file.name)
  const auth = authHeader
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', davUrl(target))
    xhr.setRequestHeader('Authorization', auth)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded)
    }
    xhr.onload = () => {
      if (xhr.status === 401) {
        clearCredentials()
        reject(new UnauthorizedError(`WebDAV PUT ${target} -> 401`))
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(file.size)
        resolve()
        return
      }
      reject(new WebDavError(`WebDAV PUT ${target} -> ${xhr.status} ${xhr.statusText}`, xhr.status))
    }
    xhr.onerror = () => reject(new WebDavError(`WebDAV PUT ${target} -> network error`, 0))
    xhr.onabort = () => reject(new UploadCancelledError())
    signal?.addEventListener('abort', () => xhr.abort())
    xhr.send(file)
  })
}

export async function mkdir(dirPath: string, name: string): Promise<void> {
  try {
    await request(joinPath(dirPath, name) + '/', { method: 'MKCOL' })
  } catch (e) {
    // 405 = MKCOL on a path that already has something there (nginx dav
    // module's way of saying "exists") — fine when creating the same parent
    // folder for several dropped files/nested entries.
    if (e instanceof WebDavError && e.status === 405) return
    throw e
  }
}

export async function deleteFile(path: string): Promise<void> {
  await request(path, { method: 'DELETE' })
}

// nginx's dav module requires a trailing slash to address a path as a
// collection — missing it 400s a MOVE/COPY/DELETE on a directory, on either
// side of the request.
function asDavPath(path: string, isDir: boolean): string {
  if (!isDir) return path
  return path.endsWith('/') ? path : path + '/'
}

// nginx's dav module deletes a non-empty collection recursively server-side
// in one request, same as `rm -rf` — no need to list-and-delete children.
export async function deleteEntry(entry: FileEntry): Promise<void> {
  await deleteFile(asDavPath(entry.path, entry.isDir))
}

export class AlreadyExistsError extends Error {}

// Overwrite: F (RFC 4918 §10.6) — MOVE/COPY default to Overwrite: T, which
// would silently replace whatever's at the destination. nginx returns 412
// without touching the existing item; remapped to a specific error so the
// UI can show "already exists" instead of a raw HTTP code.
async function moveOrCopy(method: 'MOVE' | 'COPY', from: string, to: string, isDir: boolean): Promise<void> {
  try {
    await request(asDavPath(from, isDir), {
      method,
      headers: { Destination: davUrl(asDavPath(to, isDir)), Overwrite: 'F' },
    })
  } catch (e) {
    if (e instanceof WebDavError && e.status === 412) {
      throw new AlreadyExistsError(`${to} already exists`)
    }
    throw e
  }
}

// nginx's dav module handles MOVE/COPY on a whole collection recursively,
// server-side, in one request — files and directories take the same path.
export async function renameEntry(entry: FileEntry, newName: string): Promise<void> {
  await moveOrCopy('MOVE', entry.path, joinPath(parentPath(entry.path), newName), entry.isDir)
}

export async function moveEntry(entry: FileEntry, destDir: string): Promise<void> {
  await moveOrCopy('MOVE', entry.path, joinPath(destDir, entry.name), entry.isDir)
}

// destName lets the caller pick the copy's name (e.g. "file (копия).ext")
// instead of colliding with the original.
export async function copyEntry(entry: FileEntry, destDir: string, destName: string): Promise<void> {
  await moveOrCopy('COPY', entry.path, joinPath(destDir, destName), entry.isDir)
}
