// Tracks which boards are open as tabs, and which one is active. Lives in
// its own store (not useBoardStore) because tab state is orthogonal to
// board content — closing a tab doesn't touch the loaded board's data,
// and opening a tab doesn't require the board to be loaded yet.
//
// sessionStorage persistence: "opened these five boards, reloaded, still
// have them" is a real workflow (e.g. working on a set across a day).
// Nothing about which board is open is sensitive enough to need wiping on
// tab close — the boards themselves are on WebDAV under the user's own
// credentials either way.

import { create } from 'zustand'

const TABS_KEY = 'gauge-board-tabs'
const ACTIVE_KEY = 'gauge-board-active'

interface PersistedTabs {
  ids: string[]
  activeId: string | null
}

function loadPersisted(): PersistedTabs {
  try {
    const raw = sessionStorage.getItem(TABS_KEY)
    const ids = raw ? (JSON.parse(raw) as string[]) : []
    const activeId = sessionStorage.getItem(ACTIVE_KEY)
    // Guard against a stale active id that's no longer in the list — can
    // happen if a board was closed in another tab's sessionStorage view
    // (unlikely, but a one-line fix).
    return {
      ids: Array.isArray(ids) ? ids : [],
      activeId: activeId && ids.includes(activeId) ? activeId : ids[0] ?? null,
    }
  } catch {
    return { ids: [], activeId: null }
  }
}

function persist(ids: string[], activeId: string | null) {
  try {
    sessionStorage.setItem(TABS_KEY, JSON.stringify(ids))
    if (activeId) sessionStorage.setItem(ACTIVE_KEY, activeId)
    else sessionStorage.removeItem(ACTIVE_KEY)
  } catch {
    // Private-mode sessionStorage — nothing breaks, tabs just don't
    // survive a reload. Not worth surfacing.
  }
}

interface BoardTabsState {
  openIds: string[]
  activeId: string | null

  openTab: (id: string) => void
  closeTab: (id: string) => void
  setActive: (id: string) => void
  // Called when a board is deleted — removes it from tabs if open.
  removeBoard: (id: string) => void
  // Called on load when the persisted active tab should be re-verified
  // against the actual board list on disk.
  reconcile: (existingIds: string[]) => void
}

const initial = loadPersisted()

export const useBoardTabsStore = create<BoardTabsState>((set, get) => ({
  openIds: initial.ids,
  activeId: initial.activeId,

  openTab: (id) => {
    const { openIds, activeId } = get()
    if (openIds.includes(id)) {
      if (activeId === id) return
      set({ activeId: id })
      persist(openIds, id)
      return
    }
    const nextIds = [...openIds, id]
    set({ openIds: nextIds, activeId: id })
    persist(nextIds, id)
  },

  closeTab: (id) => {
    const { openIds, activeId } = get()
    const idx = openIds.indexOf(id)
    if (idx === -1) return
    const nextIds = openIds.filter((x) => x !== id)
    // If we closed the active tab, activate the one to the left (or right
    // if leftmost). This matches browser tab behaviour and avoids jumping
    // to "first tab" which feels arbitrary on a 10-tab row.
    let nextActive = activeId
    if (activeId === id) {
      const fallbackIdx = Math.max(0, idx - 1)
      nextActive = nextIds[fallbackIdx] ?? null
    }
    set({ openIds: nextIds, activeId: nextActive })
    persist(nextIds, nextActive)
  },

  setActive: (id) => {
    const { openIds } = get()
    if (!openIds.includes(id)) return
    set({ activeId: id })
    persist(openIds, id)
  },

  removeBoard: (id) => {
    get().closeTab(id)
  },

  reconcile: (existingIds) => {
    const existing = new Set(existingIds)
    const { openIds, activeId } = get()
    const nextIds = openIds.filter((id) => existing.has(id))
    let nextActive = activeId
    if (!nextActive || !existing.has(nextActive)) {
      nextActive = nextIds[0] ?? null
    }
    if (
      nextIds.length === openIds.length &&
      nextActive === activeId
    ) {
      return
    }
    set({ openIds: nextIds, activeId: nextActive })
    persist(nextIds, nextActive)
  },
}))