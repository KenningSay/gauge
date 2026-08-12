// Plain `DataTransfer.files` flattens a dropped folder into something
// unusable (browsers don't recurse into it) — reading a folder drop requires
// the older, unstandardized-but-universally-supported File System Entries
// API (`webkitGetAsEntry`/`createReader`). This walks it into a flat list of
// {relPath, file}, where relPath is the segment chain including the dropped
// folder's own name, e.g. ["Проекты", "sub", "note.md"]. File/folder names
// come straight from the OS via the browser (already correct Unicode), never
// touched by a shell, so this can't reproduce the encoding-corruption bug —
// see gauge_file_manager_project memory, incident 2026-08-12.

export interface DroppedFile {
  relPath: string[]
  file: File
}

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  const all: FileSystemEntry[] = []
  return new Promise((resolve, reject) => {
    const readBatch = () => {
      // readEntries only returns up to ~100 results per call — must loop
      // until it returns empty to get everything in a large folder.
      reader.readEntries((batch) => {
        if (!batch.length) { resolve(all); return }
        all.push(...batch)
        readBatch()
      }, reject)
    }
    readBatch()
  })
}

async function walk(entry: FileSystemEntry, prefix: string[]): Promise<DroppedFile[]> {
  const path = [...prefix, entry.name]
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject))
    return [{ relPath: path, file }]
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry
    const children = await readAllEntries(dirEntry.createReader())
    const results: DroppedFile[] = []
    for (const child of children) {
      results.push(...await walk(child, path))
    }
    return results
  }
  return []
}

// Returns null when the browser doesn't support the Entries API (caller
// should fall back to the plain `.files` flat-upload path in that case).
export async function collectDroppedEntries(dataTransfer: DataTransfer): Promise<DroppedFile[] | null> {
  const items = Array.from(dataTransfer.items ?? [])
  if (!items.length) return null
  const getters = items
    .filter((it) => it.kind === 'file')
    .map((it) => it.webkitGetAsEntry?.())
  if (getters.some((e) => e === undefined)) return null // API unsupported
  const entries = getters.filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return null

  const results: DroppedFile[] = []
  for (const entry of entries) {
    results.push(...await walk(entry, []))
  }
  return results
}

export function hasDirectory(dropped: DroppedFile[]): boolean {
  return dropped.some((d) => d.relPath.length > 1)
}
