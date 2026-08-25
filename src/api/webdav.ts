import type { FileEntry } from './types'

const ROOT = '/dav/'

// Credentials are provided at runtime by the login screen (see useAuthStore),
// never hardcoded — nothing secret ships in this bundle.
let authHeader: string | null = null

export function setCredentials(username: string, password: string) {
  authHeader = 'Basic ' + btoa(`${username}:${password}`)
}

export function clearCredentials() {
  authHeader = null
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

function davUrl(path: string): string {
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

// Historically <img>/<video>/<audio>/<iframe> src used credentials embedded
// straight in the URL (`authorizedFetchUrl`, now removed) since those tags
// can't carry a custom Authorization header — but that meant every visible
// thumbnail/preview had the real WebDAV username and password sitting in
// plaintext in a DOM attribute for as long as it was on screen: visible in
// devtools, scrapeable by any extension with DOM access, and logged in
// plaintext by anything that logs request URLs. Fetching the bytes with a
// real Authorization header (same as every other call in this file) and
// handing the browser a local `blob:` URL instead gets the same visual
// result with the credentials never touching a URL at all. See
// `src/hooks/useAuthorizedUrl.ts` (display) and `src/utils/download.ts`
// (downloads) for the two ways this gets used. Fixed 2026-08-25, ahead of
// this project going public — this mattered a lot less as a same-origin,
// single-user, never-published tool than it does the moment strangers with
// their own WebDAV logins start using it.
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

    const relative = href.replace(/^.*\/dav\//, '').replace(/\/$/, '')
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

// XHR, not fetch(): `fetch()` has no upload-progress event at all (only
// download/response progress via a readable response body) — the only
// standard browser API that reports PUT/POST body upload progress is
// `XMLHttpRequest.upload.onprogress`. Everything else in this file can stay
// on fetch/request() because nothing else uploads a body large enough for
// progress to matter. Duplicates request()'s 401/error handling locally
// since that helper is fetch-based and can't be reused here.
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
// collection (directory) — without it, MOVE/COPY/DELETE on a directory 400s
// outright (verified live 2026-08-25: identical MOVE request, only
// difference the trailing slash, 400 vs 201). Matters for BOTH sides of a
// MOVE/COPY, not just the source: a destination missing the slash 400s too.
function asDavPath(path: string, isDir: boolean): string {
  if (!isDir) return path
  return path.endsWith('/') ? path : path + '/'
}

// Old comment here claimed "DELETE on a non-empty directory fails" and drove
// a recursive list-then-delete-every-child implementation (one WebDAV round
// trip per file, sequential). Verified live against the real backend
// 2026-08-25 — that claim was simply wrong (or true of some older config):
// nginx's dav module deletes a non-empty collection recursively server-side
// in one request, same as a filesystem `rm -rf`.
export async function deleteEntry(entry: FileEntry): Promise<void> {
  await deleteFile(asDavPath(entry.path, entry.isDir))
}

export class AlreadyExistsError extends Error {}

// `Overwrite: F` (RFC 4918 §10.6) — without it, MOVE/COPY default to
// Overwrite: T and would SILENTLY replace whatever's already sitting at the
// destination with no confirmation. Verified live: nginx respects it and
// returns 412 Precondition Failed without touching the existing item, which
// is remapped here to a specific, catchable error instead of a generic
// WebDavError so the UI can show "already exists" instead of a raw HTTP code.
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

// Old comment here claimed "MOVE/COPY only work on files", which drove a
// recursive copy-then-delete implementation for directories: one COPY/MKCOL
// request per file/subfolder (sequential), then a second full recursive
// delete pass on the original — slow, and NOT atomic (a failure partway
// through a big folder could leave a partial duplicate at the destination
// with the original only partly deleted). Verified live against the real
// backend 2026-08-25 — that claim was also wrong: nginx's dav module handles
// MOVE/COPY on a whole collection recursively, server-side, in one request,
// same as every other WebDAV server. Files and directories now take the
// exact same one-request path (mind the trailing-slash requirement above,
// though — a real, live-caught bug on the first pass at this rewrite).
export async function renameEntry(entry: FileEntry, newName: string): Promise<void> {
  const parent = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/'
  await moveOrCopy('MOVE', entry.path, joinPath(parent, newName), entry.isDir)
}

export async function moveEntry(entry: FileEntry, destDir: string): Promise<void> {
  await moveOrCopy('MOVE', entry.path, joinPath(destDir, entry.name), entry.isDir)
}

// Native COPY, same one-request deal as MOVE above — powers the "Duplicate"
// command. `destName` lets the caller pick the new name directly (e.g.
// "file (копия).ext") instead of copying in place under the same name, which
// would just 412 against itself.
export async function copyEntry(entry: FileEntry, destDir: string, destName: string): Promise<void> {
  await moveOrCopy('COPY', entry.path, joinPath(destDir, destName), entry.isDir)
}
