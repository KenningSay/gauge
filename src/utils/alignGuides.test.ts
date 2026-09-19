import { describe, it, expect } from 'vitest'
import { boundingBox, computeAlignSnap, nearbyRects, type Rect } from './alignGuides'

const box = (x: number, y: number, w = 100, h = 60): Rect => ({ x, y, w, h })

describe('computeAlignSnap', () => {
  it('pulls a nearly-aligned left edge into line', () => {
    const moving = box(103, 300)
    const { dx, dy } = computeAlignSnap(moving, [box(100, 100)], 8)
    expect(dx).toBe(-3)
    expect(dy).toBe(0)
  })

  it('leaves a box alone when nothing is within the threshold', () => {
    const { dx, dy, guides } = computeAlignSnap(box(140, 300), [box(100, 100)], 8)
    expect({ dx, dy, guides }).toEqual({ dx: 0, dy: 0, guides: [] })
  })

  it('aligns centres, not just edges', () => {
    // Moving centre x = 205+50 = 255; target centre x = 200+50 = 250.
    const { dx } = computeAlignSnap(box(205, 300), [box(200, 100)], 8)
    expect(dx).toBe(-5)
  })

  it('prefers the closest alignment when several are in range', () => {
    // Left edge is 6 away, right edge of the other box is 1 away.
    const { dx } = computeAlignSnap(box(199, 300, 100, 60), [box(100, 100, 100, 60)], 8)
    expect(dx).toBe(1)
  })

  it('snaps both axes independently', () => {
    const { dx, dy } = computeAlignSnap(box(102, 98), [box(100, 100)], 8)
    expect({ dx, dy }).toEqual({ dx: -2, dy: 2 })
  })

  it('draws the guide where the card LANDS, spanning both boxes', () => {
    const { guides } = computeAlignSnap(box(103, 300), [box(100, 100)], 8)
    const vertical = guides.find((g) => g.axis === 'x')!
    expect(vertical.pos).toBe(100)
    // From the top of the upper box to the bottom of the dragged one.
    expect(vertical.start).toBe(100)
    expect(vertical.end).toBe(360)
  })

  it('extends one guide across every box sharing that line', () => {
    const others = [box(100, 100), box(100, 500)]
    const { guides } = computeAlignSnap(box(103, 300), others, 8)
    const vertical = guides.find((g) => g.axis === 'x')!
    expect(vertical.start).toBe(100)
    expect(vertical.end).toBe(560)
  })

  it('does nothing with an empty board or a zero threshold', () => {
    expect(computeAlignSnap(box(0, 0), [], 8).guides).toEqual([])
    expect(computeAlignSnap(box(103, 300), [box(100, 100)], 0).guides).toEqual([])
  })
})

describe('boundingBox', () => {
  it('wraps several rectangles', () => {
    expect(boundingBox([box(0, 0, 100, 100), box(200, 50, 100, 100)])).toEqual({
      x: 0,
      y: 0,
      w: 300,
      h: 150,
    })
  })

  it('returns null for nothing', () => {
    expect(boundingBox([])).toBeNull()
  })
})

describe('nearbyRects', () => {
  it('keeps neighbours within the radius and drops the distant ones', () => {
    const moving = box(0, 0, 100, 100)
    const near = box(150, 0, 100, 100)
    const far = box(5000, 0, 100, 100)
    expect(nearbyRects(moving, [near, far], 200)).toEqual([near])
  })

  it('counts an overlapping box as near', () => {
    const moving = box(0, 0, 100, 100)
    const overlapping = box(50, 50, 100, 100)
    expect(nearbyRects(moving, [overlapping], 10)).toEqual([overlapping])
  })
})
