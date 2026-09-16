
// Op-log for board undo/redo. The store holds `{ board, history }` and
// every user action goes through pushOp — which returns the new history
// AND the board with the op already applied. Undo/redo move the cursor and
// apply/revert the ops that cross it.
//
// Ops are deltas, not snapshots (see §3 of the handoff). applyOp and
// revertOp are pure functions returning a new Board — never mutate — so
// Zustand's referential-equality re-rendering works without any extra
// bookkeeping in the store.

import type { Board, BoardHistory, Edge, Op, Pin } from '../api/board'

// Returns a new Board with `op` applied forward. Never mutates its input.
export function applyOp(board: Board, op: Op): Board {
  switch (op.type) {
    case 'addPin':
      return { ...board, pins: [...board.pins, op.pin] }

    case 'removePin':
      return { ...board, pins: board.pins.filter((p) => p.id !== op.pin.id) }

    case 'movePin':
      return updatePin(board, op.id, (p) => ({ ...p, x: op.to.x, y: op.to.y }))

    case 'resizePin':
      return updatePin(board, op.id, (p) => ({ ...p, w: op.to.w, h: op.to.h }))

    case 'updatePin':
      return updatePin(board, op.id, (p) => ({ ...p, [op.field]: op.to } as Pin))

    case 'reorderPin':
      return updatePin(board, op.id, (p) => ({ ...p, z: op.to }))

    case 'addEdge':
      return { ...board, edges: [...(board.edges ?? []), op.edge] }

    case 'removeEdge':
      return { ...board, edges: (board.edges ?? []).filter((e) => e.id !== op.edge.id) }

    case 'updateEdge':
      return updateEdge(board, op.id, (e) => ({ ...e, [op.field]: op.to }) as Edge)
  }
}

function updateEdge(board: Board, id: string, fn: (e: Edge) => Edge): Board {
  return { ...board, edges: (board.edges ?? []).map((e) => (e.id === id ? fn(e) : e)) }
}

// Returns a new Board with `op` undone. Every op must be self-invertible
// without knowing the state that preceded it — that's the whole reason
// ops carry both `from` and `to` instead of just the new value.
export function revertOp(board: Board, op: Op): Board {
  switch (op.type) {
    case 'addPin':
      return { ...board, pins: board.pins.filter((p) => p.id !== op.pin.id) }

    case 'removePin':
      return { ...board, pins: [...board.pins, op.pin] }

    case 'movePin':
      return updatePin(board, op.id, (p) => ({ ...p, x: op.from.x, y: op.from.y }))

    case 'resizePin':
      return updatePin(board, op.id, (p) => ({ ...p, w: op.from.w, h: op.from.h }))

    case 'updatePin':
      return updatePin(board, op.id, (p) => ({ ...p, [op.field]: op.from } as Pin))

    case 'reorderPin':
      return updatePin(board, op.id, (p) => ({ ...p, z: op.from }))

    case 'addEdge':
      return { ...board, edges: (board.edges ?? []).filter((e) => e.id !== op.edge.id) }

    case 'removeEdge':
      return { ...board, edges: [...(board.edges ?? []), op.edge] }

    case 'updateEdge':
      return updateEdge(board, op.id, (e) => ({ ...e, [op.field]: op.from }) as Edge)
  }
}

function updatePin(board: Board, id: string, fn: (p: Pin) => Pin): Board {
  // Only clone the pin that changed — a 500-pin board shouldn't churn 500
  // objects for a single move. If no pin matched, return the same board
  // reference so React skips the re-render entirely.
  let changed = false
  const pins = board.pins.map((p) => {
    if (p.id !== id) return p
    changed = true
    return fn(p)
  })
  return changed ? { ...board, pins } : board
}

// Appends an op to the log, dropping any redo tail (a new action after an
// undo invalidates whatever had been undone — standard editor behaviour).
// cursor advances so the new op counts as applied.
export function pushOp(history: BoardHistory, op: Op): BoardHistory {
  const trimmed = history.ops.slice(0, history.cursor)
  return { ops: [...trimmed, op], cursor: trimmed.length + 1 }
}

// Moves the cursor back one step and returns the board with that op
// reverted. No-op (returns the same references) at the start of history,
// so the store can call it unconditionally.
export function undo(board: Board, history: BoardHistory): { board: Board; history: BoardHistory } {
  if (history.cursor === 0) return { board, history }
  const op = history.ops[history.cursor - 1]
  return {
    board: revertOp(board, op),
    history: { ops: history.ops, cursor: history.cursor - 1 },
  }
}

export function redo(board: Board, history: BoardHistory): { board: Board; history: BoardHistory } {
  if (history.cursor >= history.ops.length) return { board, history }
  const op = history.ops[history.cursor]
  return {
    board: applyOp(board, op),
    history: { ops: history.ops, cursor: history.cursor + 1 },
  }
}

// Manual "сжать историю" from board settings. Keeps the most recent
// `keepOps` operations that are still ahead of the cursor, and throws away
// anything already undone — a redo tail the user has decided they don't
// want. If history is shorter than keepOps, returns it unchanged.
//
// Not automatic: history is unbounded by design (the user picked that), and
// pruning silently would surprise someone who expects Ctrl+Z to keep
// working after a hundred small moves.
export function pruneHistory(history: BoardHistory, keepOps: number): BoardHistory {
  // Nothing undone yet — the whole log is still live, so only trim the
  // oldest if it's longer than the limit.
  if (history.cursor === history.ops.length) {
    if (history.ops.length <= keepOps) return history
    const kept = history.ops.slice(-keepOps)
    return { ops: kept, cursor: kept.length }
  }
  // There is a redo tail. Everything past the cursor is discarded, and the
  // live portion is trimmed from the front if needed.
  const live = history.ops.slice(0, history.cursor)
  if (live.length <= keepOps) {
    return { ops: live, cursor: live.length }
  }
  const kept = live.slice(-keepOps)
  return { ops: kept, cursor: kept.length }
}

// Counts how many bytes the history file would take on disk, roughly —
// used only by the settings dialog to show "история: ~1.2 МБ" so the user
// can decide whether to prune.
export function estimateHistoryBytes(history: BoardHistory): number {
  // JSON.stringify is the honest answer but expensive on a large log; a
  // length-of-JSON proxy is accurate to within ~10% and cheap enough to
  // call on every render of the settings panel.
  return JSON.stringify(history).length
}