import { describe, it, expect } from 'vitest'
import { portPoint, bestSides, edgePath, resolveEdges, bezierMid, type Rect } from './edgeGeo'
import type { Edge } from '../api/board'

const rect = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

describe('portPoint', () => {
  it('sits on the middle of each side', () => {
    const r = rect(0, 0, 100, 60)
    expect(portPoint(r, 'top')).toEqual({ x: 50, y: 0 })
    expect(portPoint(r, 'bottom')).toEqual({ x: 50, y: 60 })
    expect(portPoint(r, 'left')).toEqual({ x: 0, y: 30 })
    expect(portPoint(r, 'right')).toEqual({ x: 100, y: 30 })
  })
})

describe('bestSides', () => {
  it('goes right-to-left when the target is to the right', () => {
    expect(bestSides(rect(0, 0), rect(400, 0))).toEqual({ from: 'right', to: 'left' })
  })

  it('flips when the target is to the left', () => {
    expect(bestSides(rect(400, 0), rect(0, 0))).toEqual({ from: 'left', to: 'right' })
  })

  it('switches to vertical when the target is mostly above or below', () => {
    expect(bestSides(rect(0, 0), rect(0, 400))).toEqual({ from: 'bottom', to: 'top' })
    expect(bestSides(rect(0, 400), rect(0, 0))).toEqual({ from: 'top', to: 'bottom' })
  })
})

describe('edgePath', () => {
  it('starts and ends exactly on the two ports', () => {
    const d = edgePath({ x: 10, y: 20 }, 'right', { x: 200, y: 90 }, 'left')
    expect(d.startsWith('M 10 20 C')).toBe(true)
    expect(d.endsWith('200 90')).toBe(true)
  })

  it('leaves the port along its own normal', () => {
    // The first control point has to be to the RIGHT of a right-side port,
    // or the curve doubles back into the card it came from.
    const d = edgePath({ x: 0, y: 0 }, 'right', { x: 300, y: 0 }, 'left')
    const firstControlX = Number(d.split('C ')[1].split(' ')[0])
    expect(firstControlX).toBeGreaterThan(0)
  })

  it('keeps a usable curve even between touching pins', () => {
    // Zero distance would otherwise collapse the control points onto the
    // endpoints and draw a straight stub with no direction.
    const d = edgePath({ x: 0, y: 0 }, 'right', { x: 0, y: 0 }, 'left')
    const firstControlX = Number(d.split('C ')[1].split(' ')[0])
    expect(firstControlX).toBeGreaterThanOrEqual(40)
  })
})

describe('bezierMid', () => {
  it('is the curve midpoint, not the midpoint of the straight line', () => {
    // Both ports face right, so the curve bulges out past both endpoints;
    // its middle must not simply be the average of them.
    const from = { x: 0, y: 0 }
    const to = { x: 0, y: 200 }
    const mid = bezierMid(from, 'right', to, 'right')
    expect(mid.x).toBeGreaterThan(0)
    expect(mid.y).toBeCloseTo(100, 5)
  })
})

describe('resolveEdges', () => {
  const edge = (id: string, from: string, to: string): Edge => ({
    id,
    from: { pinId: from, side: 'right' },
    to: { pinId: to, side: 'left' },
  })

  it('resolves an edge between two known pins', () => {
    const rects = new Map([
      ['a', rect(0, 0)],
      ['b', rect(300, 0)],
    ])
    const out = resolveEdges([edge('e1', 'a', 'b')], rects)
    expect(out).toHaveLength(1)
    expect(out[0].from).toEqual({ x: 100, y: 30 })
    expect(out[0].to).toEqual({ x: 300, y: 30 })
  })

  it('drops edges whose endpoints are gone', () => {
    // A pin deleted while its edge lingers must not throw or draw a wire
    // into the void.
    const rects = new Map([['a', rect(0, 0)]])
    expect(resolveEdges([edge('e1', 'a', 'ghost')], rects)).toEqual([])
  })

  it('re-anchors to the shortest sides when a pin moves past the other', () => {
    const before = resolveEdges(
      [edge('e1', 'a', 'b')],
      new Map([
        ['a', rect(0, 0)],
        ['b', rect(400, 0)],
      ]),
    )
    const after = resolveEdges(
      [edge('e1', 'a', 'b')],
      new Map([
        ['a', rect(400, 0)],
        ['b', rect(0, 0)],
      ]),
    )
    // Stored sides say right→left, but after the swap the curve has to
    // leave from the left instead, or it loops all the way around.
    expect(before[0].from.x).toBe(100)
    expect(after[0].from.x).toBe(400)
  })
})
