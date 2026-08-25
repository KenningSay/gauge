import type { FileEntry } from './types'
import { syncAuthToSW } from '../swAuth'

const ROOT = '/dav/'

// Credentials are provided at runtime by the login screen (see useAuthStore),
// never hardcoded — nothing secret ships in this bundle.
let authHeader: string | null = null

export function setCredentials(username: string, password: string) {
  authHeader = 'Basic ' + btoa(`${username}:${password}`)
  syncAuthToSW(authHeader)
}

export function clearCredentials() {
  authHeader = null
  syncAuthToSW(null)
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
export function davUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  // Percent-encode each segment (preserving '/' as separators). Needed for
  // more than just correctness: the Destination header on MOVE/COPY must be
  // a plain ByteString per the Fetch spec, and a raw non-Latin1 character
  // (e.g. Cyrillic) there throws a TypeError before the request is even
  // sent — this crashed every rename/move once the destination path had a
  // Cyrillic segment, which in this vault is nearly always.
  const encoded = clean.split('/').map(encodeURIComponent).join('/')
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
    throw new UnauthorizedError(`WebDAV ${init.method ?? 'GET'} ${path} -> 401`)
  }
  if (!res.ok && res.status !== 207 && res.status !== 404) {
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
  const xml = await res.text()
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const responses = Array.from(doc.getElementsByTagNameNS('DAV:', 'response'))
    .concat(Array.from(doc.getElementsByTagName('response')))

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

// XHR, not fetch(): fetch() has no upload-progress event, only
// XMLHttpRequest.upload.onprogress does. Duplicates request()'s 401/error
// handling since that helper is fetch-based.
export function uploadFile(
  dirPath: string,
  file: File,
  onProgress?: (loadedBytes: number) => void,
): Promise<void> {
  if (!authHeader) return Promise.reject(new UnauthorizedError('Not authenticated'))
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
