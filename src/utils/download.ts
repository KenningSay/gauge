import type { FileEntry } from '../api/types'
import { fetchBlob, list } from '../api/webdav'
import { createZip, type ZipInput } from './zip'

// Hands a blob to the browser as a download via a throwaway anchor. Revoke
// is deferred a beat — doing it synchronously after `.click()` has raced the
// download starting on some browsers.
function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Fetches the file with a real Authorization header and saves it from an
// in-memory blob, rather than pointing a download link straight at a
// credentialed URL.
export async function downloadEntry(path: string, filename: string): Promise<void> {
  saveBlob(await fetchBlob(path), filename)
}

export interface DownloadPlan {
  /** Files to fetch, with the path each should take inside the archive. */
  files: { entry: FileEntry; zipName: string }[]
  /** Every folder in the selection, so empty ones survive the round trip. */
  dirs: string[]
  totalBytes: number
}

/**
 * Walks the selection into a flat list of files plus the folder names to
 * recreate. Folders are listed depth-first, one PROPFIND per folder — the
 * server has no recursive listing this app can rely on (Depth: infinity is
 * disabled on most nginx dav setups, this one included).
 */
export async function planDownload(entries: FileEntry[], signal?: AbortSignal): Promise<DownloadPlan> {
  const files: DownloadPlan['files'] = []
  const dirs: string[] = []
  let totalBytes = 0

  async function walk(entry: FileEntry, prefix: string): Promise<void> {
    if (signal?.aborted) throw new DownloadCancelledError()
    const zipName = prefix + entry.name
    if (!entry.isDir) {
      files.push({ entry, zipName })
      totalBytes += entry.size
      return
    }
    dirs.push(zipName)
    for (const child of await list(entry.path)) {
      await walk(child, zipName + '/')
    }
  }

  for (const entry of entries) await walk(entry, '')
  return { files, dirs, totalBytes }
}

export class DownloadCancelledError extends Error {}

export interface DownloadProgressReport {
  filesTotal: number
  filesDone: number
  bytesTotal: number
  bytesLoaded: number
}

/**
 * Downloads a selection as one file: the file itself when that's all it is,
 * a ZIP otherwise. Fetching is sequential on purpose — a parallel pool would
 * hold several whole files in memory at once for no real gain, since the
 * bottleneck here is the same single WebDAV host either way.
 */
export async function downloadSelection(
  entries: FileEntry[],
  archiveName: string,
  onProgress?: (report: DownloadProgressReport) => void,
  signal?: AbortSignal,
): Promise<{ filesTotal: number; zipped: boolean }> {
  if (entries.length === 1 && !entries[0].isDir) {
    const only = entries[0]
    onProgress?.({ filesTotal: 1, filesDone: 0, bytesTotal: only.size, bytesLoaded: 0 })
    const blob = await fetchBlob(only.path, signal)
    onProgress?.({ filesTotal: 1, filesDone: 1, bytesTotal: only.size, bytesLoaded: only.size })
    saveBlob(blob, only.name)
    return { filesTotal: 1, zipped: false }
  }

  const { files, dirs, totalBytes } = await planDownload(entries, signal)
  if (files.length === 0 && dirs.length === 0) {
    throw new Error('Нечего скачивать')
  }

  let filesDone = 0
  let bytesLoaded = 0
  const report = () => onProgress?.({ filesTotal: files.length, filesDone, bytesTotal: totalBytes, bytesLoaded })
  report()

  const inputs: ZipInput[] = []
  for (const { entry, zipName } of files) {
    if (signal?.aborted) throw new DownloadCancelledError()
    const blob = await fetchBlob(entry.path, signal)
    inputs.push({ name: zipName, blob, modified: new Date(entry.modified) })
    filesDone++
    // The listing's size is what the progress bar was sized against, so
    // count that rather than blob.size — they agree in practice, and using
    // the declared figure keeps the bar from ever exceeding 100%.
    bytesLoaded += entry.size
    report()
  }

  const zip = await createZip(inputs, dirs)
  if (signal?.aborted) throw new DownloadCancelledError()
  saveBlob(zip, archiveName)
  return { filesTotal: files.length, zipped: true }
}

/** `Отчёты` + 3 selected files -> `Отчёты.zip`; a mixed selection -> the folder it lives in. */
export function archiveNameFor(entries: FileEntry[], currentPath: string): string {
  const base = entries.length === 1
    ? entries[0].name.replace(/\.[^.]+$/, '')
    : currentPath.replace(/\/+$/, '').split('/').pop() || 'gauge'
  return `${base}.zip`
}
