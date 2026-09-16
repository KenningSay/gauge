import { describe, it, expect } from 'vitest'
import { applyOp, revertOp, pushOp, undo, redo, pruneHistory } from './boardHistory'
import type { Board, BoardHistory, NotePin, Op, Pin } from '../api/board'

function note(id: string, over: Partial<NotePin> = {}): NotePin {
  return {
    id,
    type: 'note',
    x: 0,
    y: 0,
    w: 200,
    h: 160,
    z: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    text: 'hello',
    color: '#fbbf24',
    opacity: 90,
    texture: 'plain',
    ...over,
  }
}

function board(pins: Pin[]): Board {
  return {
    id: 'b1',
    name: 'test',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    viewport: { x: 0, y: 0, zoom: 1 },
    settings: {
      snapEnabled: false,
      snapStep: 8,
      gridVisible: true,
      backgroundColor: '#1B1A18',
      backgroundTexture: 'plain',
    },
    pins,
    customActions: [],
  }
}

function history(ops: Op[], cursor = ops.length): BoardHistory {
  return { ops, cursor }
}

// Every op has to survive a round trip: apply then revert must land back on
// the board you started with. That property is what Ctrl+Z actually relies
// on, so it's tested per op type rather than through the store.
describe('applyOp / revertOp round trip', () => {
  const cases: Array<{ name: string; start: Board; op: Op }> = [
    { name: 'addPin', start: board([]), op: { type: 'addPin', pin: note('p1') } },
    { name: 'removePin', start: board([note('p1')]), op: { type: 'removePin', pin: note('p1') } },
    {
      name: 'movePin',
      start: board([note('p1', { x: 10, y: 20 })]),
      op: { type: 'movePin', id: 'p1', from: { x: 10, y: 20 }, to: { x: 99, y: 99 } },
    },
    {
      name: 'resizePin',
      start: board([note('p1', { w: 200, h: 160 })]),
      op: { type: 'resizePin', id: 'p1', from: { w: 200, h: 160 }, to: { w: 400, h: 300 } },
    },
    {
      name: 'updatePin',
      start: board([note('p1', { text: 'before' })]),
      op: { type: 'updatePin', id: 'p1', field: 'text', from: 'before', to: 'after' },
    },
    {
      name: 'reorderPin',
      start: board([note('p1', { z: 1 })]),
      op: { type: 'reorderPin', id: 'p1', from: 1, to: 7 },
    },
  ]

  for (const { name, start, op } of cases) {
    it(`${name} applies and reverts`, () => {
      const applied = applyOp(start, op)
      expect(applied).not.toBe(start)
      const reverted = revertOp(applied, op)
      expect(reverted.pins).toEqual(start.pins)
    })
  }

  it('applies the actual change, not just a copy', () => {
    const b = applyOp(board([note('p1', { x: 10, y: 20 })]), {
      type: 'movePin',
      id: 'p1',
      from: { x: 10, y: 20 },
      to: { x: 99, y: 5 },
    })
    expect(b.pins[0]).toMatchObject({ x: 99, y: 5 })
  })
})

describe('pushOp', () => {
  it('appends and advances the cursor', () => {
    const h = pushOp(history([]), { type: 'addPin', pin: note('p1') })
    expect(h.ops).toHaveLength(1)
    expect(h.cursor).toBe(1)
  })

  it('drops the redo tail — a new action after an undo forks history', () => {
    const ops: Op[] = [
      { type: 'addPin', pin: note('p1') },
      { type: 'addPin', pin: note('p2') },
      { type: 'addPin', pin: note('p3') },
    ]
    const h = pushOp(history(ops, 1), { type: 'addPin', pin: note('p9') })
    expect(h.ops.map((o) => (o.type === 'addPin' ? o.pin.id : ''))).toEqual(['p1', 'p9'])
    expect(h.cursor).toBe(2)
  })
})

describe('undo / redo boundaries', () => {
  it('undo at the start of history is a no-op and keeps references', () => {
    const b = board([note('p1')])
    const h = history([{ type: 'addPin', pin: note('p1') }], 0)
    const r = undo(b, h)
    expect(r.board).toBe(b)
    expect(r.history).toBe(h)
  })

  it('redo at the end of history is a no-op and keeps references', () => {
    const b = board([note('p1')])
    const h = history([{ type: 'addPin', pin: note('p1') }])
    const r = redo(b, h)
    expect(r.board).toBe(b)
    expect(r.history).toBe(h)
  })

  it('undo then redo returns the same board state', () => {
    const start = board([note('p1', { x: 0, y: 0 })])
    const op: Op = { type: 'movePin', id: 'p1', from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }
    const moved = applyOp(start, op)
    const h = pushOp(history([]), op)

    const undone = undo(moved, h)
    expect(undone.board.pins[0]).toMatchObject({ x: 0, y: 0 })
    expect(undone.history.cursor).toBe(0)

    const redone = redo(undone.board, undone.history)
    expect(redone.board.pins[0]).toMatchObject({ x: 50, y: 50 })
    expect(redone.history.cursor).toBe(1)
  })
})

describe('pruneHistory', () => {
  const ops = (n: number): Op[] =>
    Array.from({ length: n }, (_, i) => ({ type: 'addPin', pin: note(`p${i}`) }) as Op)

  it('returns the same object when nothing is undone and the log fits', () => {
    const h = history(ops(3))
    expect(pruneHistory(h, 10)).toBe(h)
  })

  it('keeps the newest ops when the log is longer than the limit', () => {
    const h = pruneHistory(history(ops(10)), 3)
    expect(h.ops).toHaveLength(3)
    expect(h.cursor).toBe(3)
    expect(h.ops.map((o) => (o.type === 'addPin' ? o.pin.id : ''))).toEqual(['p7', 'p8', 'p9'])
  })

  it('discards the redo tail entirely', () => {
    const h = pruneHistory(history(ops(10), 4), 10)
    expect(h.ops).toHaveLength(4)
    expect(h.cursor).toBe(4)
  })

  it('discards the redo tail and trims the front together', () => {
    const h = pruneHistory(history(ops(10), 6), 2)
    expect(h.ops.map((o) => (o.type === 'addPin' ? o.pin.id : ''))).toEqual(['p4', 'p5'])
    expect(h.cursor).toBe(2)
  })
})

describe('edge ops', () => {
  const edge = { id: 'e1', from: { pinId: 'a', side: 'right' as const }, to: { pinId: 'b', side: 'left' as const } }

  it('adds and reverts a connection', () => {
    const b = board([note('a'), note('b')])
    const added = applyOp(b, { type: 'addEdge', edge })
    expect(added.edges).toEqual([edge])
    expect(revertOp(added, { type: 'addEdge', edge }).edges).toEqual([])
  })

  it('removes and restores a connection', () => {
    const b = { ...board([note('a'), note('b')]), edges: [edge] }
    const removed = applyOp(b, { type: 'removeEdge', edge })
    expect(removed.edges).toEqual([])
    expect(revertOp(removed, { type: 'removeEdge', edge }).edges).toEqual([edge])
  })

  it('updates a field and puts the old value back', () => {
    const b = { ...board([note('a'), note('b')]), edges: [edge] }
    const op = { type: 'updateEdge' as const, id: 'e1', field: 'label', from: undefined, to: 'зависит от' }
    const labelled = applyOp(b, op)
    expect(labelled.edges?.[0].label).toBe('зависит от')
    expect(revertOp(labelled, op).edges?.[0].label).toBeUndefined()
  })

  it('handles a board saved before connections existed', () => {
    // Older board files have no `edges` key at all; applying an op must not
    // throw on the undefined.
    const legacy = board([note('a')])
    delete (legacy as { edges?: unknown }).edges
    expect(applyOp(legacy, { type: 'addEdge', edge }).edges).toEqual([edge])
  })
})
