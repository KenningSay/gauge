import { create } from 'zustand'
import type { FileEntry } from '../api/types'
import * as webdav from '../api/webdav'

export type SortKey = 'name' | 'size' | 'modified'
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

  sortKey: SortKey
  sortDir: 1 | -1
  viewMode: ViewMode

  viewerEntry: FileEntry | null
  commandPaletteOpen: boolean
  contextMenu: ContextMenuState | null
  renamingPath: string | null

  navigate: (path: string) => Promise<void>
  refresh: () => Promise<void>
  setSort: (key: SortKey) => void
  setViewMode: (mode: ViewMode) => void

  selectOnly: (path: string) => void
  toggleSelect: (path: string) => void
  selectRange: (path: string) => void
  clearSelection: () => void

  openViewer: (entry: FileEntry) => void
  closeViewer: () => void
  viewNext: (dir: 1 | -1) => void

  openCommandPalette: () => void
  closeCommandPalette: () => void

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

function sortEntries(entries: FileEntry[], key: SortKey, dir: 1 | -1): FileEntry[] {
  const sorted = [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    let cmp = 0
    if (key === 'name') cmp = a.name.localeCompare(b.name, undefined, { numeric: true })
    if (key === 'size') cmp = a.size - b.size
    if (key === 'modified') cmp = new Date(a.modified).getTime() - new Date(b.modified).getTime()
    return cmp * dir
  })
  return sorted
}

export const useFileStore = create<FileStore>((set, get) => ({
  currentPath: '/',
  entries: [],
  loading: false,
  error: null,

  selected: new Set(),
  lastSelectedIndex: null,

  sortKey: 'name',
  sortDir: 1,
  viewMode: 'list',

  viewerEntry: null,
  commandPaletteOpen: false,
  contextMenu: null,
  renamingPath: null,

  navigate: async (path) => {
    set({ currentPath: path, selected: new Set(), loading: true, error: null })
    try {
      const entries = await webdav.list(path)
      const { sortKey, sortDir } = get()
      set({ entries: sortEntries(entries, sortKey, sortDir), loading: false })
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) })
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
      return { selected: next, lastSelectedIndex: idx }
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

  clearSelection: () => set({ selected: new Set(), lastSelectedIndex: null }),

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

  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),

  openContextMenu: (x, y, entry) => set({ contextMenu: { x, y, entry } }),
  closeContextMenu: () => set({ contextMenu: null }),

  startRename: (path) => set({ renamingPath: path }),
  cancelRename: () => set({ renamingPath: null }),
  commitRename: async (entry, newName) => {
    set({ renamingPath: null })
    if (!newName || newName === entry.name) return
    await webdav.renameEntry(entry, newName)
    await get().refresh()
  },

  createFolder: async (name) => {
    await webdav.mkdir(get().currentPath, name)
    await get().refresh()
  },

  uploadFiles: async (files) => {
    const list = Array.from(files)
    for (const f of list) {
      await webdav.uploadFile(get().currentPath, f)
    }
    await get().refresh()
  },

  deleteEntries: async (entries) => {
    for (const entry of entries) {
      await webdav.deleteEntry(entry)
    }
    set({ selected: new Set() })
    await get().refresh()
  },

  moveEntries: async (entries, destDir) => {
    for (const entry of entries) {
      await webdav.moveEntry(entry, destDir)
    }
    await get().refresh()
  },
}))
