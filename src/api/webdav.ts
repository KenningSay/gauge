import type { FileEntry } from './types'

const ROOT = '/dav/'
const AUTH = 'Basic ' + btoa('alex:Cocacolla98')

function joinPath(dir: string, name: string): string {
  return (dir.endsWith('/') ? dir : dir + '/') + name
}

function davUrl(path: string): string {
  const clean = path.replace(/^\/+/, '')
  return ROOT + clean
}

async function request(path: string, init: RequestInit & { headers?: Record<string, string> } = {}) {
  const res = await fetch(davUrl(path), {
    ...init,
    headers: {
      Authorization: AUTH,
      ...(init.headers ?? {}),
    },
  })
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
    const href = decodeURIComponent(extText(r, 'href'))
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

export function fileUrl(path: string): string {
  return davUrl(path) + `?_auth=${encodeURIComponent(AUTH)}`
}

export function authorizedFetchUrl(path: string): string {
  return davUrl(path)
}

export const AUTH_HEADER = AUTH

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
