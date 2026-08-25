import { create } from 'zustand'
import type { FileEntry } from '../api/types'
import * as webdav from '../api/webdav'
import { useUiStore } from './useUiStore'
import type { DroppedFile } from '../utils/dropFolder'
import { runPool, throwIfAnyFailed, CancelledError } from '../utils/pool'

export type SortKey = 'name' | 'size' | 'modified' | 'type'
export type ViewMode = 'list' | 'grid'

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry | null
}

export interface UploadProgress {
  filesTotal: number
  filesDone: number
  bytesTotal: number
  bytesLoaded: number
}

// An in-app clipboard, not the real OS one — there's no way to put "a
// WebDAV file" on the system clipboard, so copy/cut/paste here means
// remembering a set of entries and a mode, then acting on them against
// whatever folder is open when paste happens.
export interface ClipboardState {
  entries: FileEntry[]
  mode: 'copy' | 'cut'
}

interface FileStore {
  currentPath: string
  entries: FileEntry[]
  loading: boolean
  error: string | null

  selected: Set<string>
  lastSelectedIndex: number | null
  selectionMode: boolean

  sortKey: SortKey
  sortDir: 1 | -1
  viewMode: ViewMode

  viewerEntry: FileEntry | null
  commandPaletteOpen: boolean
  contextMenu: ContextMenuState | null
  renamingPath: string | null

  searchIndex: FileEntry[] | null
  indexBuilding: boolean

  uploadProgress: UploadProgress | null
  uploadAbortController: AbortController | null

  clipboard: ClipboardState | null

  navigate: (path: string) => Promise<void>
  refresh: () => Promise<void>
  silentRefresh: () => Promise<void>
  setSort: (key: SortKey) => void
  setViewMode: (mode: ViewMode) => void

  selectOnly: (path: string) => void
  toggleSelect: (path: string) => void
  selectRange: (path: string) => void
  clearSelection: () => void
  enterSelectionMode: (path: string) => void
  selectAll: () => void

  moveCursor: (dir: 1 | -1) => void
  activateCursor: () => void
  goUp: () => void

  openViewer: (entry: FileEntry) => void
  closeViewer: () => void
  viewNext: (dir: 1 | -1) => void

  openCommandPalette: () => void
  closeCommandPalette: () => void
  buildSearchIndex: () => Promise<void>

  openContextMenu: (x: number, y: number, entry: FileEntry | null) => void
  closeContextMenu: () => void

  startRename: (path: string) => void
  cancelRename: () => void
  commitRename: (entry: FileEntry, newName: string) => Promise<void>

  createFolder: (name: string) => Promise<void>
  uploadFiles: (files: FileList | File[], targetDir?: string) => Promise<void>
  uploadEntries: (dropped: DroppedFile[], targetDir?: string) => Promise<void>
  cancelUpload: () => void
  deleteEntries: (entries: FileEntry[]) => Promise<void>
  moveEntries: (entries: FileEntry[], destDir: string) => Promise<void>

  copyToClipboard: (entries: FileEntry[]) => void
  cutToClipboard: (entries: FileEntry[]) => void
  pasteClipboard: () => Promise<void>
  duplicateEntry: (entry: FileEntry) => Promise<void>
}

function typeKey(entry: FileEntry): string {
  if (entry.isDir) return ''
  const parts = entry.name.split('.')
  return parts.length > 1 ? parts.pop()!.toLowerCase() : ''
}

function sortEntries(entries: FileEntry[], key: SortKey, dir: 1 | -1): FileEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let cmp = 0
    if (key === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true })
    if (key === 'size') cmp = a.size - b.size
    if (key === 'modified') cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime()
    if (key === 'type') {
      cmp = typeKey(a).localeCompare(typeKey(b))
      if (cmp === 0) cmp = a.name.localeCompare(b.name, undefined, { numeric: true })
    }
    return cmp * dir
  })
  return sorted
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

// "file.txt" + 1 -> "file (копия).txt", +2 -> "file (копия 2).txt", ... —
// same convention as every desktop file manager's paste-into-same-folder.
export function withCopySuffix(name: string, n: number): string {
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && dot < name.length - 1
  const stem = hasExt ? name.slice(0, dot) : name
  const ext = hasExt ? name.slice(dot) : ''
  const suffix = n === 1 ? ' (копия)' : ` (копия ${n})`
  return `${stem}${suffix}${ext}`
}

// Tries the original name first, then "(копия)", "(копия 2)", ... until one
// doesn't collide (AlreadyExistsError, see webdav.ts). Shared by
// pasteClipboard's copy mode and duplicateEntry.
export async function copyWithAutoRename(entry: FileEntry, destDir: string): Promise<void> {
  for (let n = 0; n <= 50; n++) {
    const name = n === 0 ? entry.name : withCopySuffix(entry.name, n)
    try {
      await webdav.copyEntry(entry, destDir, name)
      return
    } catch (e) {
      if (e instanceof webdav.AlreadyExistsError) continue
      throw e
    }
  }
  throw new Error(`Не удалось подобрать свободное имя для «${entry.name}»`)
}

// Aggregates per-file upload progress (each callback reports cumulative
// bytes for that one file) into one combined figure, keyed by File object
// since runPool's workers only ever see the item, not its index. Store
// updates are throttled to ~12/sec — unthrottled XHR progress events from
// several concurrent uploads were enough re-renders to jank the row list.
function makeUploadTracker(set: (p: Partial<FileStore>) => void, fileSizes: number[]) {
  const filesTotal = fileSizes.length
  const bytesTotal = fileSizes.reduce((a, b) => a + b, 0)
  const loadedByFile = new Map<File, number>()
  let bytesLoaded = 0
  let filesDone = 0
  let lastPush = 0
  const push = (force = false) => {
    const now = performance.now()
    if (!force && now - lastPush < 80) return
    lastPush = now
    set({ uploadProgress: { filesTotal, filesDone, bytesTotal, bytesLoaded } })
  }
  push(true)
  return {
    onProgress: (file: File, loaded: number) => {
      bytesLoaded += loaded - (loadedByFile.get(file) ?? 0)
      loadedByFile.set(file, loaded)
      push()
    },
    onDone: (file: File) => {
      const size = file.size
      bytesLoaded += size - (loadedByFile.get(file) ?? 0)
      loadedByFile.set(file, size)
      filesDone++
      push(true)
    },
    clear: () => set({ uploadProgress: null }),
  }
}

// Shared shape behind uploadFiles/uploadEntries/deleteEntries/moveEntries:
// run the op, toast success or failure, then always refresh + invalidate the
// search index regardless of outcome. `extraCleanup` covers the one-off bits
// each caller still needs in `finally` (clearing an upload tracker, clearing
// selection after a delete).
async function runBulkOp(
  set: (p: Partial<FileStore>) => void,
  get: () => FileStore,
  run: () => Promise<string>,
  errorPrefix: string,
  extraCleanup?: () => void,
): Promise<void> {
  try {
    useUiStore.getState().pushToast(await run())
  } catch (e) {
    if (e instanceof CancelledError) {
      const p = get().uploadProgress
      useUiStore.getState().pushToast(
        p ? `Загрузка отменена — успели загрузить ${p.filesDone} из ${p.filesTotal}` : 'Отменено',
        'info',
      )
    } else {
      useUiStore.getState().pushToast(`${errorPrefix}: ${errMsg(e)}`, 'error')
    }
  } finally {
    extraCleanup?.()
    await get().refresh()
    set({ searchIndex: null })
  }
}

// Cheap fingerprint good enough to detect additions/removals/renames/edits
// without a deep compare — order-independent since the two sides may come
// from separately-sorted listings.
function entriesFingerprint(entries: FileEntry[]): string {
  return entries
    .map((e) => `${e.path}|${e.size}|${e.modified}`)
    .sort()
    .join('\n')
}

export const useFileStore = create<FileStore>((set, get) => {
  // Guards against out-of-order async responses: navigate() bumps this on
  // every call, silentRefresh() just reads it. If a response resolves after
  // a newer navigate()/silentRefresh() has superseded it, it's discarded
  // instead of clobbering the current (correct) listing.
  let requestGen = 0

  return {
  currentPath: '/',
  entries: [],
  loading: false,
  error: null,

  selected: new Set(),
  lastSelectedIndex: null,
  selectionMode: false,

  sortKey: 'name',
  sortDir: 1,
  viewMode: 'list',

  viewerEntry: null,
  commandPaletteOpen: false,
  contextMenu: null,
  renamingPath: null,

  searchIndex: null,
  indexBuilding: false,

  uploadProgress: null,
  uploadAbortController: null,

  clipboard: null,

  navigate: async (path) => {
    const gen = ++requestGen
    set({ currentPath: path, selected: new Set(), lastSelectedIndex: null, selectionMode: false, loading: true, error: null })
    try {
      const entries = await webdav.list(path)
      if (gen !== requestGen) return // superseded by a newer navigate() before this resolved
      const { sortKey, sortDir } = get()
      set({ entries: sortEntries(entries, sortKey, sortDir), loading: false })
    } catch (e) {
      if (gen !== requestGen) return
      set({ loading: false, error: errMsg(e) })
    }
  },

  refresh: async () => {
    await get().navigate(get().currentPath)
  },

  // Background poll for live updates from other sessions/devices — unlike
  // refresh()/navigate(), doesn't touch loading/selection/scroll state, and
  // only triggers a re-render when the listing actually changed, so it can
  // run silently every few seconds without disrupting whatever the user is
  // doing (renaming, dragging, viewing a file, etc).
  silentRefresh: async () => {
    const gen = requestGen // don't bump: a background poll shouldn't supersede a real navigate()
    const { currentPath, entries: prevEntries, sortKey, sortDir } = get()
    try {
      const fresh = await webdav.list(currentPath)
      if (gen !== requestGen) return // user navigated away while this was in flight
      if (entriesFingerprint(fresh) !== entriesFingerprint(prevEntries)) {
        set({ entries: sortEntries(fresh, sortKey, sortDir), searchIndex: null })
      }
    } catch {
      // Transient poll failure (e.g. a momentary network blip) shouldn't
      // surface as a UI error — the next tick will retry.
    }
  },

  setSort: (key) => {
    const { sortKey, sortDir, entries } = get()
    const newDir = sortKey === key ? (sortDir * -1 as 1 | -1) : 1
    set({ sortKey: key, sortDir: newDir, entries: sortEntries(entries, key, newDir) })
  },

  setViewMode: (mode) => set({ viewMode: mode }),

  selectOnly: (path) => {
    const idx = get().entries.findIndex((e) => e.path === path)
    set({ selected: new Set([path]), lastSelectedIndex: idx })
  },

  toggleSelect: (path) => {
    const idx = get().entries.findIndex((e) => e.path === path)
    set((s) => {
      const next = new Set(s.selected)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return { selected: next, lastSelectedIndex: idx, selectionMode: next.size > 0 && s.selectionMode }
    })
  },

  enterSelectionMode: (path) => {
    const idx = get().entries.findIndex((e) => e.path === path)
    set({ selected: new Set([path]), lastSelectedIndex: idx, selectionMode: true })
  },

  selectAll: () => {
    const { entries } = get()
    set({
      selected: new Set(entries.map((e) => e.path)),
      lastSelectedIndex: entries.length - 1,
      selectionMode: true,
    })
  },

  selectRange: (path) => {
    const { entries, lastSelectedIndex } = get()
    const idx = entries.findIndex((e) => e.path === path)
    if (lastSelectedIndex === null) {
      get().selectOnly(path)
      return
    }
    const [start, end] = [lastSelectedIndex, idx].sort((a, b) => a - b)
    const range = entries.slice(start, end + 1).map((e) => e.path)
    set({ selected: new Set(range) })
  },

  clearSelection: () => set({ selected: new Set(), lastSelectedIndex: null, selectionMode: false }),

  moveCursor: (dir) => {
    const { entries, lastSelectedIndex } = get()
    if (entries.length === 0) return
    const next = lastSelectedIndex === null
      ? (dir === 1 ? 0 : entries.length - 1)
      : Math.min(entries.length - 1, Math.max(0, lastSelectedIndex + dir))
    set({ selected: new Set([entries[next].path]), lastSelectedIndex: next })
  },

  activateCursor: () => {
    const { entries, lastSelectedIndex, navigate, openViewer } = get()
    if (lastSelectedIndex === null) return
    const entry = entries[lastSelectedIndex]
    if (!entry) return
    if (entry.isDir) navigate(entry.path)
    else openViewer(entry)
  },

  goUp: () => {
    const { currentPath, navigate } = get()
    if (currentPath === '/') return
    const parts = currentPath.split('/').filter(Boolean)
    parts.pop()
    navigate('/' + parts.join('/'))
  },

  openViewer: (entry) => set({ viewerEntry: entry }),
  closeViewer: () => set({ viewerEntry: null }),
  viewNext: (dir) => {
    const { entries, viewerEntry } = get()
    if (!viewerEntry) return
    const viewable = entries.filter((e) => !e.isDir)
    const idx = viewable.findIndex((e) => e.path === viewerEntry.path)
    if (idx === -1) return
    const nextIdx = (idx + dir + viewable.length) % viewable.length
    set({ viewerEntry: viewable[nextIdx] })
  },

  openCommandPalette: () => {
    set({ commandPaletteOpen: true })
    if (!get().searchIndex && !get().indexBuilding) get().buildSearchIndex()
  },
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  buildSearchIndex: async () => {
    set({ indexBuilding: true })
    const all: FileEntry[] = []
    // Lists each depth level with bounded concurrency, then recurses into
    // the next — N sequential PROPFIND round trips for N folders made ⌘K
    // search noticeably slow to open on a real vault. Pushing into the
    // shared `all` array from concurrent workers is safe: JS has no true
    // parallelism, so `.push()` between awaits can't race.
    const crawlLevel = async (dirs: string[], depth: number) => {
      if (depth > 8 || !dirs.length) return
      const nextDirs: string[] = []
      await runPool(dirs, 4, async (dir) => {
        let children: FileEntry[]
        try {
          children = await webdav.list(dir)
        } catch {
          return
        }
        for (const child of children) {
          all.push(child)
          if (child.isDir) nextDirs.push(child.path)
        }
      })
      await crawlLevel(nextDirs, depth + 1)
    }
    try {
      await crawlLevel(['/'], 0)
      set({ searchIndex: all, indexBuilding: false })
    } catch {
      set({ indexBuilding: false })
    }
  },

  openContextMenu: (x, y, entry) => set({ contextMenu: { x, y, entry } }),
  closeContextMenu: () => set({ contextMenu: null }),

  startRename: (path) => set({ renamingPath: path }),
  cancelRename: () => set({ renamingPath: null }),
  commitRename: async (entry, newName) => {
    set({ renamingPath: null })
    if (!newName || newName === entry.name) return
    if (!webdav.isValidName(newName)) {
      useUiStore.getState().pushToast(`Недопустимое имя: «${newName}»`, 'error')
      return
    }
    try {
      await webdav.renameEntry(entry, newName)
      await get().refresh()
      useUiStore.getState().pushToast(`Переименовано в «${newName}»`)
      set({ searchIndex: null })
    } catch (e) {
      useUiStore.getState().pushToast(`Не удалось переименовать: ${errMsg(e)}`, 'error')
    }
  },

  createFolder: async (name) => {
    if (!webdav.isValidName(name)) {
      useUiStore.getState().pushToast(`Недопустимое имя: «${name}»`, 'error')
      return
    }
    try {
      await webdav.mkdir(get().currentPath, name)
      await get().refresh()
      useUiStore.getState().pushToast(`Папка «${name}» создана`)
      set({ searchIndex: null })
    } catch (e) {
      useUiStore.getState().pushToast(`Не удалось создать папку: ${errMsg(e)}`, 'error')
    }
  },

  uploadFiles: async (files, targetDir) => {
    const list = Array.from(files)
    const base = targetDir ?? get().currentPath
    const tracker = makeUploadTracker(set, list.map((f) => f.size))
    const controller = new AbortController()
    set({ uploadAbortController: controller })
    await runBulkOp(set, get, async () => {
      const result = await runPool(list, 3, (f) =>
        webdav.uploadFile(base, f, (loaded) => tracker.onProgress(f, loaded), controller.signal).then(() => tracker.onDone(f)),
        controller.signal,
      )
      throwIfAnyFailed(result, list.length)
      return list.length === 1 ? `Загружен «${list[0].name}»` : `Загружено файлов: ${list.length}`
    }, 'Ошибка загрузки', () => { tracker.clear(); set({ uploadAbortController: null }) })
  },

  // Handles drag-and-drop of whole folders (see src/utils/dropFolder.ts):
  // dropped[].relPath includes every intermediate folder name, so first
  // create each distinct ancestor directory (shallowest first) before
  // uploading any file into it.
  uploadEntries: async (dropped, targetDir) => {
    const base = targetDir ?? get().currentPath
    const tracker = makeUploadTracker(set, dropped.map((d) => d.file.size))
    const controller = new AbortController()
    set({ uploadAbortController: controller })
    await runBulkOp(set, get, async () => {
      const dirPaths = new Set<string>()
      for (const { relPath } of dropped) {
        for (let i = 1; i < relPath.length; i++) {
          dirPaths.add(relPath.slice(0, i).join('/'))
        }
      }
      const sortedDirs = Array.from(dirPaths).sort(
        (a, b) => a.split('/').length - b.split('/').length,
      )
      for (const dir of sortedDirs) {
        if (controller.signal.aborted) throw new CancelledError()
        const slash = dir.lastIndexOf('/')
        const parent = slash === -1 ? base : `${base}/${dir.slice(0, slash)}`
        const name = slash === -1 ? dir : dir.slice(slash + 1)
        await webdav.mkdir(parent, name)
      }
      const result = await runPool(dropped, 3, ({ relPath, file }) => {
        const dirPart = relPath.slice(0, -1).join('/')
        const targetDir = dirPart ? `${base}/${dirPart}` : base
        return webdav.uploadFile(targetDir, file, (loaded) => tracker.onProgress(file, loaded), controller.signal).then(() => tracker.onDone(file))
      }, controller.signal)
      throwIfAnyFailed(result, dropped.length)
      return dropped.length === 1 ? `Загружен «${dropped[0].file.name}»` : `Загружено файлов: ${dropped.length}`
    }, 'Ошибка загрузки', () => { tracker.clear(); set({ uploadAbortController: null }) })
  },

  cancelUpload: () => {
    get().uploadAbortController?.abort()
  },

  deleteEntries: async (entries) => {
    await runBulkOp(set, get, async () => {
      const result = await runPool(entries, 3, (entry) => webdav.deleteEntry(entry))
      throwIfAnyFailed(result, entries.length)
      return entries.length === 1 ? `«${entries[0].name}» удалён` : `Удалено объектов: ${entries.length}`
    }, 'Ошибка удаления', () => set({ selected: new Set() }))
  },

  moveEntries: async (entries, destDir) => {
    await runBulkOp(set, get, async () => {
      const result = await runPool(entries, 3, (entry) => webdav.moveEntry(entry, destDir))
      throwIfAnyFailed(result, entries.length)
      return entries.length === 1 ? `«${entries[0].name}» перемещён` : `Перемещено объектов: ${entries.length}`
    }, 'Ошибка перемещения')
  },

  copyToClipboard: (entries) => {
    if (!entries.length) return
    set({ clipboard: { entries, mode: 'copy' } })
    useUiStore.getState().pushToast(
      entries.length === 1 ? `«${entries[0].name}» скопирован — Ctrl+V, чтобы вставить` : `Скопировано объектов: ${entries.length} — Ctrl+V, чтобы вставить`,
      'info',
    )
  },

  cutToClipboard: (entries) => {
    if (!entries.length) return
    set({ clipboard: { entries, mode: 'cut' } })
    useUiStore.getState().pushToast(
      entries.length === 1 ? `«${entries[0].name}» вырезан — Ctrl+V, чтобы переместить` : `Вырезано объектов: ${entries.length} — Ctrl+V, чтобы переместить`,
      'info',
    )
  },

  pasteClipboard: async () => {
    const clip = get().clipboard
    if (!clip || !clip.entries.length) return
    const destDir = get().currentPath
    const { entries, mode } = clip
    try {
      if (mode === 'copy') {
        const result = await runPool(entries, 3, (entry) => copyWithAutoRename(entry, destDir))
        throwIfAnyFailed(result, entries.length)
        useUiStore.getState().pushToast(entries.length === 1 ? `«${entries[0].name}» вставлен` : `Вставлено объектов: ${entries.length}`)
      } else {
        const result = await runPool(entries, 3, (entry) => webdav.moveEntry(entry, destDir))
        // Only drop what actually moved — a naive "cut is one-shot, always
        // clear" left the WHOLE original selection in the clipboard after a
        // partial failure, so a retry re-attempted entries that had already
        // moved (failing on their now-gone source) right alongside the ones
        // that genuinely still needed moving.
        const succeededPaths = new Set(result.succeeded.map((e) => e.path))
        const remaining = entries.filter((e) => !succeededPaths.has(e.path))
        set({ clipboard: remaining.length ? { entries: remaining, mode: 'cut' } : null })
        throwIfAnyFailed(result, entries.length)
        useUiStore.getState().pushToast(entries.length === 1 ? `«${entries[0].name}» перемещён` : `Перемещено объектов: ${entries.length}`)
      }
    } catch (e) {
      const msg = e instanceof webdav.AlreadyExistsError
        ? 'Объект с таким именем уже есть в этой папке'
        : errMsg(e)
      useUiStore.getState().pushToast(`Не удалось вставить: ${msg}`, 'error')
    } finally {
      await get().refresh()
      set({ searchIndex: null })
    }
  },

  duplicateEntry: async (entry) => {
    const destDir = webdav.parentPath(entry.path)
    try {
      await copyWithAutoRename(entry, destDir)
      useUiStore.getState().pushToast(`«${entry.name}» продублирован`)
    } catch (e) {
      useUiStore.getState().pushToast(`Не удалось продублировать: ${errMsg(e)}`, 'error')
    } finally {
      await get().refresh()
      set({ searchIndex: null })
    }
  },
  }
})
