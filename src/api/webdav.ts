import type { FileEntry } from './types'

const ROOT = '/dav/'

// Credentials are provided at runtime by the login screen (see useAuthStore),
// never hardcoded — nothing secret ships in this bundle.
let authHeader: string | null = null
let rawUsername = ''
let rawPassword = ''

export function setCredentials(username: string, password: string) {
  rawUsername = username
  rawPassword = password
  authHeader = 'Basic ' + btoa(`${username}:${password}`)
}

export function clearCredentials() {
  authHeader = null
  rawUsername = ''
  rawPassword = ''
}

export class UnauthorizedError extends Error {}

function joinPath(dir: string, name: string): string {
  return (dir.endsWith('/') ? dir : dir + '/') + name
}

function davUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  return ROOT + clean
}

// Plain <img>/<video>/<audio>/<iframe> loads can't carry a custom
// Authorization header, so those use credentials embedded in the URL instead
// (same-origin only). All programmatic calls (PROPFIND/GET text/PUT/etc.) go
// through request() below and use a real header.
export function authorizedFetchUrl(path: string): string {
  if (!rawUsername) return davUrl(path)
  const user = encodeURIComponent(rawUsername)
  const pass = encodeURIComponent(rawPassword)
  return `${location.protocol}//${user}:${pass}@${location.host}${davUrl(path)}`
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
    throw new Error(`WebDAV ${init.method ?? 'GET'} ${path} -> ${res.status} ${res.statusText}`)
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

export async function uploadFile(dirPath: string, file: File): Promise<void> {
  const target = joinPath(dirPath, file.name)
  await request(target, {
    method: 'PUT',
    body: file,
  })
}

export async function mkdir(dirPath: string, name: string): Promise<void> {
  await request(joinPath(dirPath, name) + '/', { method: 'MKCOL' })
}

export async function deleteFile(path: string): Promise<void> {
  await request(path, { method: 'DELETE' })
}

// nginx dav module quirk: DELETE on a non-empty directory fails, and even an
// empty directory needs a trailing slash. MOVE/COPY only work on files.
export async function deleteEntry(entry: FileEntry): Promise<void> {
  if (!entry.isDir) {
    await deleteFile(entry.path)
    return
  }
  const children = await list(entry.path)
  for (const child of children) {
    await deleteEntry(child)
  }
  await deleteFile(entry.path.endsWith('/') ? entry.path : entry.path + '/')
}

async function copyFileRaw(from: string, to: string): Promise<void> {
  await request(from, {
    method: 'COPY',
    headers: { Destination: davUrl(to) },
  })
}

async function moveFileRaw(from: string, to: string): Promise<void> {
  await request(from, {
    method: 'MOVE',
    headers: { Destination: davUrl(to) },
  })
}

async function copyDirRecursive(entry: FileEntry, destPath: string): Promise<void> {
  await mkdir(destPath.substring(0, destPath.lastIndexOf('/')) || '/', entry.name)
  const children = await list(entry.path)
  for (const child of children) {
    const childDest = joinPath(destPath, child.name)
    if (child.isDir) {
      await copyDirRecursive(child, childDest)
    } else {
      await copyFileRaw(child.path, childDest)
    }
  }
}

export async function renameEntry(entry: FileEntry, newName: string): Promise<void> {
  const parent = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/'
  const dest = joinPath(parent, newName)
  if (!entry.isDir) {
    await moveFileRaw(entry.path, dest)
    return
  }
  await copyDirRecursive(entry, dest)
  await deleteEntry(entry)
}

export async function moveEntry(entry: FileEntry, destDir: string): Promise<void> {
  const dest = joinPath(destDir, entry.name)
  if (!entry.isDir) {
    await moveFileRaw(entry.path, dest)
    return
  }
  await copyDirRecursive(entry, dest)
  await deleteEntry(entry)
}
