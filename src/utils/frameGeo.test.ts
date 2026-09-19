import { describe, it, expect } from 'vitest'
import {
  FRAME_HEADER,
  frameAround,
  isInsideFrame,
  layoutInFrame,
  pinsInFrame,
  type Box,
} from './frameGeo'

const box = (id: string, x: number, y: number, w = 100, h = 60): Box => ({ id, x, y, w, h })

describe('isInsideFrame', () => {
  const frame = { x: 0, y: 0, w: 400, h: 400 }

  it('counts a pin whose centre is inside', () => {
    expect(isInsideFrame({ x: 10, y: 10, w: 100, h: 60 }, frame)).toBe(true)
  })

  it('counts a pin hanging over the edge while its centre is still inside', () => {
    // x 340 + half of 100 = centre at 390, just inside the 400 edge.
    expect(isInsideFrame({ x: 340, y: 10, w: 100, h: 60 }, frame)).toBe(true)
  })

  it('excludes a pin whose centre has left', () => {
    expect(isInsideFrame({ x: 380, y: 10, w: 100, h: 60 }, frame)).toBe(false)
  })
})

describe('pinsInFrame', () => {
  const frame = box('f', 0, 0, 400, 400)

  it('collects what is inside and ignores the frame itself', () => {
    const pins = [box('a', 10, 10), box('b', 1000, 10), { ...frame }]
    expect(pinsInFrame(frame, pins).map((p) => p.id)).toEqual(['a'])
  })

  it('does not swallow another frame sitting inside it', () => {
    const inner = { ...box('inner', 20, 20), type: 'frame' }
    const note = { ...box('note', 40, 40), type: 'note' }
    expect(pinsInFrame(frame, [inner, note]).map((p) => p.id)).toEqual(['note'])
  })
})

describe('frameAround', () => {
  it('wraps the boxes with padding and room for the title', () => {
    const f = frameAround([box('a', 100, 100, 100, 100), box('b', 300, 100, 100, 100)], 20)!
    expect(f.x).toBe(80)
    expect(f.y).toBe(100 - 20 - FRAME_HEADER)
    expect(f.w).toBe(340)
    expect(f.h).toBe(140 + FRAME_HEADER)
  })

  it('returns null for nothing to wrap', () => {
    expect(frameAround([])).toBeNull()
  })
})

describe('layoutInFrame', () => {
  const frame = box('f', 0, 0, 400, 400)

  it('lines cards up in rows with equal gaps', () => {
    const contents = [box('a', 13, 77), box('b', 210, 81)]
    const { moves } = layoutInFrame(frame, contents, 20, 20)
    const a = moves.find((m) => m.id === 'a')!
    const b = moves.find((m) => m.id === 'b')!
    expect(a).toEqual({ id: 'a', x: 20, y: 20 + FRAME_HEADER })
    // Same row, one gap along: the cards end up exactly level.
    expect(b.y).toBe(a.y)
    expect(b.x).toBe(a.x + 100 + 20)
  })

  it('wraps to a new row when the next card would cross the edge', () => {
    const contents = [box('a', 0, 0), box('b', 0, 0), box('c', 0, 0), box('d', 0, 0)]
    const { moves } = layoutInFrame(frame, contents, 20, 20)
    const ys = new Set(moves.map((m) => m.y))
    expect(ys.size).toBe(2)
  })

  it('keeps reading order so a tidy-up does not shuffle everything', () => {
    const contents = [box('right', 300, 10), box('left', 10, 10), box('below', 10, 200)]
    const { moves } = layoutInFrame(frame, contents, 20, 20)
    expect(moves.map((m) => m.id)).toEqual(['left', 'right', 'below'])
  })

  it('grows the frame when the rows need more room, never shrinks it', () => {
    const tall = Array.from({ length: 9 }, (_, i) => box(`p${i}`, 0, 0, 180, 120))
    const { frame: sized } = layoutInFrame(frame, tall, 20, 20)
    expect(sized.h).toBeGreaterThan(frame.h)
    expect(sized.w).toBe(frame.w)
  })

  it('reports no moves for cards already in place', () => {
    const placed = [box('a', 20, 20 + FRAME_HEADER)]
    expect(layoutInFrame(frame, placed, 20, 20).moves).toEqual([])
  })

  it('does not loop on a card wider than the frame', () => {
    const wide = [box('huge', 0, 0, 900, 60), box('small', 0, 0, 100, 60)]
    const { moves } = layoutInFrame(frame, wide, 20, 20)
    expect(moves).toHaveLength(2)
  })

  it('handles an empty frame', () => {
    expect(layoutInFrame(frame, [], 20, 20)).toEqual({ moves: [], frame: { w: 400, h: 400 } })
  })
})
