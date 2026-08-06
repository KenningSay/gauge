import { create } from 'zustand'
import type { FileEntry } from '../api/types'
import * as webdav from '../api/webdav'
import { useUiStore } from './useUiStore'

export type SortKey = 'name' | 'size' | 'modified' | 'type'
export type ViewMode = 'list' | 'grid'

interface ContextMenuState {
  x: number
  y: number
  entry: FileEntry | null
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

  navigate: (path: string) => Promise<void>
  refresh: () => Promise<void>
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
  uploadFiles: (files: FileList | File[]) => Promise<void>
  deleteEntries: (entries: FileEntry[]) => Promise<void>
  moveEntries: (entries: FileEntry[], destDir: string) => Promise<void>
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

export const useFileStore = create<FileStore>((set, get) => ({
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

  navigate: async (path) => {
    set({ currentPath: path, selected: new Set(), lastSelectedIndex: null, selectionMode: false, loading: true, error: null })
    try {
      const entries = await webdav.list(path)
      const { sortKey, sortDir } = get()
      set({ entries: sortEntries(entries, sortKey, sortDir), loading: false })
    } catch (e) {
      set({ loading: false, error: errMsg(e) })
    }
  },

  refresh: async () => {
    await get().navigate(get().currentPath)
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
    const crawl = async (path: string, depth: number) => {
      if (depth > 8) return
      let children: FileEntry[]
      try {
        children = await webdav.list(path)
      } catch {
        return
      }
      for (const child of children) {
        all.push(child)
        if (child.isDir) await crawl(child.path, depth + 1)
      }
    }
    try {
      await crawl('/', 0)
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
    try {
      await webdav.mkdir(get().currentPath, name)
      await get().refresh()
      useUiStore.getState().pushToast(`Папка «${name}» создана`)
      set({ searchIndex: null })
    } catch (e) {
      useUiStore.getState().pushToast(`Не удалось создать папку: ${errMsg(e)}`, 'error')
    }
  },

  uploadFiles: async (files) => {
    const list = Array.from(files)
    try {
      for (const f of list) {
        await webdav.uploadFile(get().currentPath, f)
      }
      await get().refresh()
      useUiStore.getState().pushToast(list.length === 1 ? `Загружен «${list[0].name}»` : `Загружено файлов: ${list.length}`)
      set({ searchIndex: null })
    } catch (e) {
      useUiStore.getState().pushToast(`Ошибка загрузки: ${errMsg(e)}`, 'error')
    }
  },

  deleteEntries: async (entries) => {
    try {
      for (const entry of entries) {
        await webdav.deleteEntry(entry)
      }
      set({ selected: new Set() })
      await get().refresh()
      useUiStore.getState().pushToast(entries.length === 1 ? `«${entries[0].name}» удалён` : `Удалено объектов: ${entries.length}`)
      set({ searchIndex: null })
    } catch (e) {
      useUiStore.getState().pushToast(`Ошибка удаления: ${errMsg(e)}`, 'error')
    }
  },

  moveEntries: async (entries, destDir) => {
    try {
      for (const entry of entries) {
        await webdav.moveEntry(entry, destDir)
      }
      await get().refresh()
      useUiStore.getState().pushToast(entries.length === 1 ? `«${entries[0].name}» перемещён` : `Перемещено объектов: ${entries.length}`)
      set({ searchIndex: null })
    } catch (e) {
      useUiStore.getState().pushToast(`Ошибка перемещения: ${errMsg(e)}`, 'error')
    }
  },
}))
