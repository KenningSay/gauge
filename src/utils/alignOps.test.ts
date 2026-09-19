import { describe, it, expect } from 'vitest'
import { alignRects, distributeRects, packRects, type Rect } from './alignOps'

const r = (id: string, x: number, y: number, w = 100, h = 60): Rect => ({ id, x, y, w, h })

describe('alignRects', () => {
  const cards = [r('a', 10, 0, 100, 60), r('b', 50, 100, 200, 60), r('c', 30, 200, 60, 60)]

  it('aligns left edges to the leftmost card', () => {
    const moves = alignRects(cards, 'left')
    expect(moves.map((m) => m.x)).toEqual([10, 10])
    expect(moves.map((m) => m.id).sort()).toEqual(['b', 'c'])
  })

  it('aligns right edges, accounting for differing widths', () => {
    const moves = alignRects(cards, 'right')
    // Rightmost edge is b: 50 + 200 = 250.
    expect(moves.find((m) => m.id === 'a')!.x).toBe(150)
    expect(moves.find((m) => m.id === 'c')!.x).toBe(190)
  })

  it('centres horizontally on the selection, not on the board', () => {
    const moves = alignRects(cards, 'hcenter')
    // Bounds 10..250, centre 130.
    expect(moves.find((m) => m.id === 'a')!.x).toBe(80)
    expect(moves.find((m) => m.id === 'c')!.x).toBe(100)
  })

  it('aligns tops and bottoms on the other axis', () => {
    expect(alignRects(cards, 'top').every((m) => m.y === 0)).toBe(true)
    expect(alignRects(cards, 'bottom').map((m) => m.y)).toEqual([200, 200])
  })

  it('reports nothing when the cards are already aligned', () => {
    const lined = [r('a', 10, 0), r('b', 10, 100)]
    expect(alignRects(lined, 'left')).toEqual([])
  })

  it('needs at least two cards', () => {
    expect(alignRects([r('a', 0, 0)], 'left')).toEqual([])
  })
})

describe('distributeRects', () => {
  it('equalises the GAPS between cards of different widths', () => {
    // Span 0..500. Widths 100 + 200 + 100 = 400, so two gaps of 50.
    const cards = [r('a', 0, 0, 100, 60), r('b', 130, 0, 200, 60), r('c', 400, 0, 100, 60)]
    const moves = distributeRects(cards, 'horizontal')
    const b = moves.find((m) => m.id === 'b')!
    expect(b.x).toBe(150)
    // The outer two define the span and must not move.
    expect(moves.find((m) => m.id === 'a')).toBeUndefined()
    expect(moves.find((m) => m.id === 'c')).toBeUndefined()
  })

  it('works vertically too', () => {
    const cards = [r('a', 0, 0, 100, 60), r('b', 0, 100, 100, 100), r('c', 0, 400, 100, 60)]
    const moves = distributeRects(cards, 'vertical')
    // Span 0..460, heights 220, two gaps of 120 -> b at 0+60+120 = 180.
    expect(moves.find((m) => m.id === 'b')!.y).toBe(180)
  })

  it('needs at least three cards — two are trivially distributed', () => {
    expect(distributeRects([r('a', 0, 0), r('b', 300, 0)], 'horizontal')).toEqual([])
  })

  it('leaves already-even cards alone', () => {
    const even = [r('a', 0, 0), r('b', 150, 0), r('c', 300, 0)]
    expect(distributeRects(even, 'horizontal')).toEqual([])
  })
})

describe('packRects', () => {
  it('sets every gap to exactly the requested size', () => {
    const cards = [r('a', 0, 0, 100, 60), r('b', 500, 0, 100, 60), r('c', 900, 0, 100, 60)]
    const moves = packRects(cards, 'horizontal', 20)
    expect(moves.find((m) => m.id === 'b')!.x).toBe(120)
    expect(moves.find((m) => m.id === 'c')!.x).toBe(240)
  })

  it('keeps the first card where it is', () => {
    const cards = [r('a', 33, 0), r('b', 500, 0)]
    const moves = packRects(cards, 'horizontal', 10)
    expect(moves.find((m) => m.id === 'a')).toBeUndefined()
    expect(moves.find((m) => m.id === 'b')!.x).toBe(143)
  })
})
