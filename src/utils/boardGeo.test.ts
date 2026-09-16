import { describe, it, expect } from 'vitest'
import { rectsIntersect, pointInRect, boundsOf, resolvePush, type Rect } from './boardGeo'

const r = (x: number, y: number, w = 100, h = 100): Rect => ({ x, y, w, h })

describe('rectsIntersect', () => {
  it('detects overlap', () => {
    expect(rectsIntersect(r(0, 0), r(50, 50))).toBe(true)
  })

  it('separated rects do not intersect', () => {
    expect(rectsIntersect(r(0, 0), r(200, 0))).toBe(false)
  })

  it('edge-touching rects do not count as overlapping', () => {
    // Exactly adjacent: a pin dropped flush against another shouldn't
    // trigger a push, or every neat grid layout would shove itself apart.
    expect(rectsIntersect(r(0, 0), r(100, 0))).toBe(false)
  })
})

describe('pointInRect', () => {
  it('inside', () => expect(pointInRect(50, 50, r(0, 0))).toBe(true))
  it('outside', () => expect(pointInRect(150, 50, r(0, 0))).toBe(false))
})

describe('boundsOf', () => {
  it('returns null for an empty list', () => {
    expect(boundsOf([])).toBeNull()
  })

  it('wraps every rect', () => {
    expect(boundsOf([r(0, 0), r(200, 100, 50, 50)])).toEqual({ x: 0, y: 0, w: 250, h: 150 })
  })
})

describe('resolvePush', () => {
  it('leaves non-overlapping neighbours alone', () => {
    const moves = resolvePush([{ id: 'a', ...r(500, 500) }], r(0, 0), 16)
    expect(moves).toEqual([])
  })

  it('pushes an overlapping neighbour clear of the placed pin', () => {
    const other = { id: 'a', ...r(40, 0) }
    const placed = r(0, 0)
    const moves = resolvePush([other], placed, 16)
    expect(moves).toHaveLength(1)

    const moved = { ...other, x: moves[0].x, y: moves[0].y }
    expect(rectsIntersect(placed, moved)).toBe(false)
  })

  it('resolves a chain — the pushed pin pushes its own neighbour', () => {
    // Three pins in a row, each overlapping the next. Placing on the first
    // has to ripple all the way through, not just displace the middle one
    // into the third.
    const others = [
      { id: 'a', ...r(40, 0) },
      { id: 'b', ...r(80, 0) },
    ]
    const placed = r(0, 0)
    const moves = resolvePush(others, placed, 16)

    const byId = new Map(moves.map((m) => [m.id, m]))
    const final = others.map((o) => {
      const m = byId.get(o.id)
      return { ...o, x: m?.x ?? o.x, y: m?.y ?? o.y }
    })

    for (const f of final) expect(rectsIntersect(placed, f)).toBe(false)
    expect(rectsIntersect(final[0], final[1])).toBe(false)
  })

  it('is idempotent — running it on an already-resolved layout moves nothing', () => {
    const others = [{ id: 'a', ...r(40, 0) }]
    const placed = r(0, 0)
    const first = resolvePush(others, placed, 16)
    const settled = others.map((o) => {
      const m = first.find((x) => x.id === o.id)
      return { ...o, x: m?.x ?? o.x, y: m?.y ?? o.y }
    })
    expect(resolvePush(settled, placed, 16)).toEqual([])
  })

  it('terminates on a dense pile instead of spinning on the iteration cap', () => {
    // 30 pins stacked nearly on top of each other is the pathological case
    // for a chain-reaction push; it must return, and the result must not
    // leave anything still overlapping the placed pin.
    const others = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, ...r(i * 2, i * 2) }))
    const placed = r(0, 0)
    const moves = resolvePush(others, placed, 8)
    const byId = new Map(moves.map((m) => [m.id, m]))
    for (const o of others) {
      const m = byId.get(o.id)
      const final = { ...o, x: m?.x ?? o.x, y: m?.y ?? o.y }
      expect(rectsIntersect(placed, final)).toBe(false)
    }
  })
})
