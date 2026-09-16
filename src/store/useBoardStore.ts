import { create } from 'zustand'
import type {
  Board,
  BoardHistory,
  ChatLog,
  CustomAction,
  Edge,
  Pin,
  Viewport,
} from '../api/board'
import * as boardApi from '../api/board'
import {
  PreconditionFailedError,
  WebDavError,
} from '../api/webdav'
import { useUiStore } from './useUiStore'
import {
  applyOp,
  pruneHistory as pruneHistoryOp,
  pushOp,
  redo as redoOp,
  undo as undoOp,
} from '../utils/boardHistory'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error'

interface BoardState {
  board: Board | null
  etag: string | null
  history: BoardHistory
  chat: ChatLog
  selected: Set<string>
  // Which pin is currently in text-edit mode, if any. UI state, not board
  // data — it lives here rather than inside the pin component so the
  // keyboard (Enter, or just typing) and pin creation can put a pin into
  // edit mode without reaching into it.
  activePinId: string | null

  saveState: SaveState
  saveError: string | null

  loadBoard: (id: string) => Promise<void>
  unloadBoard: () => void
  reloadFromServer: () => Promise<void>

  selectOnly: (id: string) => void
  toggleSelect: (id: string) => void
  selectMany: (ids: string[]) => void
  clearSelection: () => void
  setActivePin: (id: string | null) => void

  addPin: (pin: Pin) => void
  addEdge: (edge: Edge) => void
  removeEdges: (ids: string[]) => void
  updateEdge: (id: string, field: string, value: unknown) => void
  removePins: (ids: string[]) => void
  movePins: (moves: Array<{ id: string; x: number; y: number }>) => void
  resizePin: (id: string, size: { w: number; h: number }) => void
  updatePin: (id: string, field: string, value: unknown) => void
  reorderPin: (id: string, z: number) => void
  setViewport: (v: Viewport) => void

  setBoardName: (name: string) => void
  setBoardSettings: (settings: Partial<Board['settings']>) => void
  setCustomActions: (actions: CustomAction[]) => void

  undo: () => void
  redo: () => void
  shrinkHistory: (keepOps: number) => void

  setChat: (chat: ChatLog) => void

  flushSave: () => Promise<void>
  overwriteServer: () => Promise<void>
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
const SAVE_DEBOUNCE_MS = 500
let saveInFlight: Promise<void> | null = null
let saveQueued = false

export const useBoardStore = create<BoardState>((set, get) => {
  function scheduleSave() {
    set({ saveState: 'dirty' })
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void runSave()
    }, SAVE_DEBOUNCE_MS)
  }

  async function runSave() {
    if (saveInFlight) {
      saveQueued = true
      return saveInFlight
    }
    const { board, etag, history, chat } = get()
    if (!board) return
    if (get().saveState === 'conflict') return

    set({ saveState: 'saving', saveError: null })
    saveInFlight = (async () => {
      try {
        const stat = await boardApi.saveBoard(board, etag)
        await boardApi.saveHistory(board.id, history)
        await boardApi.saveChat(board.id, chat)
        set({ etag: stat.etag, saveState: 'saved', saveError: null })
        setTimeout(() => {
          if (get().saveState === 'saved') set({ saveState: 'idle' })
        }, 1500)
      } catch (e) {
        if (e instanceof PreconditionFailedError) {
          set({ saveState: 'conflict', saveError: 'Доска изменена в другом месте' })
        } else if (e instanceof WebDavError) {
          set({ saveState: 'error', saveError: `Ошибка сохранения: ${e.status}` })
        } else {
          set({ saveState: 'error', saveError: e instanceof Error ? e.message : String(e) })
        }
      } finally {
        saveInFlight = null
        if (saveQueued && get().saveState !== 'conflict') {
          saveQueued = false
          void runSave()
        }
      }
    })()
    return saveInFlight
  }

  return {
    board: null,
    etag: null,
    history: { ops: [], cursor: 0 },
    chat: { messages: [] },
    selected: new Set(),
    activePinId: null,

    saveState: 'idle',
    saveError: null,

    loadBoard: async (id) => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      try {
        await boardApi.bootstrap()
        const loaded = await boardApi.loadBoard(id)
        if (!loaded) {
          throw new Error(`Доска ${id} не найдена`)
        }
        const [history, chat] = await Promise.all([
          boardApi.loadHistory(id),
          boardApi.loadChat(id),
        ])
        set({
          board: loaded.board,
          etag: loaded.etag,
          history,
          chat,
          selected: new Set(),
          saveState: 'idle',
          saveError: null,
        })
      } catch (e) {
        set({ saveState: 'error', saveError: e instanceof Error ? e.message : String(e) })
        throw e
      }
    },

    unloadBoard: () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      set({
        board: null,
        etag: null,
        history: { ops: [], cursor: 0 },
        chat: { messages: [] },
        selected: new Set(),
        saveState: 'idle',
        saveError: null,
      })
    },

    reloadFromServer: async () => {
      const { board } = get()
      if (!board) return
      await get().loadBoard(board.id)
    },

    selectOnly: (id) => set({ selected: new Set([id]) }),
    toggleSelect: (id) =>
      set((s) => {
        const next = new Set(s.selected)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return { selected: next }
      }),
    selectMany: (ids) => set({ selected: new Set(ids) }),
    clearSelection: () => set({ selected: new Set() }),

    setActivePin: (id) => set({ activePinId: id }),

    addPin: (pin) => {
      const { board, history } = get()
      if (!board) return
      const op = { type: 'addPin' as const, pin }
      set({
        board: applyOp(board, op),
        history: pushOp(history, op),
      })
      scheduleSave()
    },

    addEdge: (edge) => {
      const { board, history } = get()
      if (!board) return
      // Refuse a duplicate in the same direction and a self-link: both are
      // easy to produce by dropping a connection back where it started,
      // and neither draws as anything but a smudge.
      if (edge.from.pinId === edge.to.pinId) return
      const exists = (board.edges ?? []).some(
        (e) => e.from.pinId === edge.from.pinId && e.to.pinId === edge.to.pinId,
      )
      if (exists) return
      const op = { type: 'addEdge' as const, edge }
      set({ board: applyOp(board, op), history: pushOp(history, op) })
      scheduleSave()
    },

    removeEdges: (ids) => {
      const { board, history } = get()
      if (!board) return
      const doomed = (board.edges ?? []).filter((e) => ids.includes(e.id))
      if (doomed.length === 0) return
      let next = board
      let hist = history
      for (const edge of doomed) {
        const op = { type: 'removeEdge' as const, edge }
        next = applyOp(next, op)
        hist = pushOp(hist, op)
      }
      set({ board: next, history: hist })
      scheduleSave()
    },

    updateEdge: (id, field, value) => {
      const { board, history } = get()
      if (!board) return
      const edge = (board.edges ?? []).find((e) => e.id === id)
      if (!edge) return
      const before = (edge as unknown as Record<string, unknown>)[field]
      if (before === value) return
      const op = { type: 'updateEdge' as const, id, field, from: before, to: value }
      set({ board: applyOp(board, op), history: pushOp(history, op) })
      scheduleSave()
    },

    removePins: (ids) => {
      const { board, history } = get()
      if (!board) return
      let newBoard = board
      let newHistory = history
      const toRemove = ids
        .map((id) => board.pins.find((p) => p.id === id))
        .filter((p): p is Pin => !!p)
      // Connections die with the pins they attach to, as their own ops, so
      // undoing the delete brings the connections back too. Left behind,
      // they'd be edges anchored to nothing.
      const orphanedEdges = (board.edges ?? []).filter(
        (e) => ids.includes(e.from.pinId) || ids.includes(e.to.pinId),
      )
      for (const edge of orphanedEdges) {
        const op = { type: 'removeEdge' as const, edge }
        newBoard = applyOp(newBoard, op)
        newHistory = pushOp(newHistory, op)
      }
      for (const pin of toRemove) {
        const op = { type: 'removePin' as const, pin }
        newBoard = applyOp(newBoard, op)
        newHistory = pushOp(newHistory, op)
      }
      set({ board: newBoard, history: newHistory })
      const remainingSelection = new Set(get().selected)
      for (const id of ids) remainingSelection.delete(id)
      set({ selected: remainingSelection })
      scheduleSave()
    },

    movePins: (moves) => {
      const { board, history } = get()
      if (!board) return
      let newBoard = board
      let newHistory = history
      for (const m of moves) {
        const pin = board.pins.find((p) => p.id === m.id)
        if (!pin) continue
        if (pin.x === m.x && pin.y === m.y) continue
        const op = {
          type: 'movePin' as const,
          id: m.id,
          from: { x: pin.x, y: pin.y },
          to: { x: m.x, y: m.y },
        }
        newBoard = applyOp(newBoard, op)
        newHistory = pushOp(newHistory, op)
      }
      if (newBoard === board) return
      set({ board: newBoard, history: newHistory })
      scheduleSave()
    },

    resizePin: (id, size) => {
      const { board, history } = get()
      if (!board) return
      const pin = board.pins.find((p) => p.id === id)
      if (!pin) return
      if (pin.w === size.w && pin.h === size.h) return
      const op = {
        type: 'resizePin' as const,
        id,
        from: { w: pin.w, h: pin.h },
        to: { w: size.w, h: size.h },
      }
      set({ board: applyOp(board, op), history: pushOp(history, op) })
      scheduleSave()
    },

    updatePin: (id, field, value) => {
      const { board, history } = get()
      if (!board) return
      const pin = board.pins.find((p) => p.id === id)
      if (!pin) return
      const from = (pin as unknown as Record<string, unknown>)[field]
      if (from === value) return
      const op = { type: 'updatePin' as const, id, field, from, to: value }
      set({ board: applyOp(board, op), history: pushOp(history, op) })
      scheduleSave()
    },

    reorderPin: (id, z) => {
      const { board, history } = get()
      if (!board) return
      const pin = board.pins.find((p) => p.id === id)
      if (!pin) return
      if (pin.z === z) return
      const op = { type: 'reorderPin' as const, id, from: pin.z, to: z }
      set({ board: applyOp(board, op), history: pushOp(history, op) })
      scheduleSave()
    },

    setViewport: (v) => {
      const { board } = get()
      if (!board) return
      set({ board: { ...board, viewport: v } })
      scheduleSave()
    },

    setBoardName: (name) => {
      const { board } = get()
      if (!board) return
      set({ board: { ...board, name } })
      scheduleSave()
    },

    setBoardSettings: (patch) => {
      const { board } = get()
      if (!board) return
      set({ board: { ...board, settings: { ...board.settings, ...patch } } })
      scheduleSave()
    },

    setCustomActions: (actions) => {
      const { board } = get()
      if (!board) return
      set({ board: { ...board, customActions: actions } })
      scheduleSave()
    },

    undo: () => {
      const { board, history } = get()
      if (!board) return
      const next = undoOp(board, history)
      if (next.board === board && next.history === history) return
      set({ board: next.board, history: next.history })
      scheduleSave()
    },

    redo: () => {
      const { board, history } = get()
      if (!board) return
      const next = redoOp(board, history)
      if (next.board === board && next.history === history) return
      set({ board: next.board, history: next.history })
      scheduleSave()
    },

    shrinkHistory: (keepOps) => {
      const { history } = get()
      const pruned = pruneHistoryOp(history, keepOps)
      if (pruned === history) return
      set({ history: pruned })
      scheduleSave()
    },

    setChat: (chat) => {
      set({ chat })
      scheduleSave()
    },

    flushSave: async () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      await runSave()
    },

    overwriteServer: async () => {
      const { board } = get()
      if (!board) return
      const stat = await boardApi.saveBoard(board, null)
      set({ etag: stat.etag, saveState: 'saved', saveError: null })
      setTimeout(() => {
        if (get().saveState === 'saved') set({ saveState: 'idle' })
      }, 1500)
      useUiStore.getState().pushToast('Локальная версия перезаписала серверную')
    },
  }
})