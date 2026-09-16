import { describe, it, expect } from 'vitest'
import type { Decor } from '../api/board'
import {
  clampPos,
  clampSize,
  decorFlip,
  decorPos,
  decorSize,
  nextFreeSlot,
  DEFAULT_DECOR_SIZE,
  MAX_DECOR_SIZE,
  MIN_DECOR_SIZE,
} from './decorGeo'

const d = (over: Partial<Decor> = {}): Decor => ({
  id: 'd1',
  kind: 'clip',
  corner: 'tl',
  ...over,
})

describe('decorPos', () => {
  it('uses the stored fraction when there is one', () => {
    expect(decorPos(d({ x: 0.4, y: 0.7 }))).toEqual({ x: 0.4, y: 0.7 })
  })

  it('falls back to the corner for decorations saved before they could move', () => {
    // The whole back-compat contract: old boards stored only a corner, and
    // a corner is exactly fraction 0 or 1.
    expect(decorPos(d({ corner: 'br' }))).toEqual({ x: 1, y: 1 })
    expect(decorPos(d({ corner: 'tr' }))).toEqual({ x: 1, y: 0 })
  })

  it('treats x: 0 as a real position, not as missing', () => {
    // `d.x ?? fallback` rather than `d.x || fallback` — dragging something
    // flush to the left edge must not snap it back to its old corner.
    expect(decorPos(d({ corner: 'br', x: 0, y: 0.5 }))).toEqual({ x: 0, y: 0.5 })
  })
})

describe('clampPos', () => {
  it('allows a little overhang past the edge', () => {
    expect(clampPos(-0.1)).toBe(-0.1)
    expect(clampPos(1.1)).toBe(1.1)
  })

  it('stops a decoration being dragged away from its note', () => {
    expect(clampPos(-5)).toBe(-0.15)
    expect(clampPos(9)).toBe(1.15)
  })

  it('survives NaN instead of writing it to the board file', () => {
    expect(clampPos(Number.NaN)).toBe(0)
  })
})

describe('clampSize', () => {
  it('holds the range', () => {
    expect(clampSize(4)).toBe(MIN_DECOR_SIZE)
    expect(clampSize(9999)).toBe(MAX_DECOR_SIZE)
    expect(clampSize(42.4)).toBe(42)
  })

  it('falls back to the default on nonsense', () => {
    expect(clampSize(Number.NaN)).toBe(DEFAULT_DECOR_SIZE)
  })

  it('defaults a decoration that has no size', () => {
    expect(decorSize(d())).toBe(DEFAULT_DECOR_SIZE)
  })
})

describe('decorFlip', () => {
  it('faces inward from whichever side it is on', () => {
    expect(decorFlip(d({ x: 0.9, y: 0.1 }))).toEqual({ x: true, y: false })
    expect(decorFlip(d({ x: 0.1, y: 0.9 }))).toEqual({ x: false, y: true })
  })

  it('follows the position, not the corner it was dropped on', () => {
    // Dragged from the top-left across to the right: it has to turn round.
    expect(decorFlip(d({ corner: 'tl', x: 0.95, y: 0.5 })).x).toBe(true)
  })
})

describe('nextFreeSlot', () => {
  it('puts the first one on the top-left corner', () => {
    expect(nextFreeSlot([])).toEqual({ x: 0, y: 0 })
  })

  it('never returns a slot that is already occupied', () => {
    // The actual bug: clicking the same glyph repeatedly stacked every
    // copy on one corner, where they read as a single decoration.
    const placed: Decor[] = []
    for (let i = 0; i < 12; i++) {
      const slot = nextFreeSlot(placed)
      for (const p of placed) {
        expect(Math.hypot(decorPos(p).x - slot.x, decorPos(p).y - slot.y)).toBeGreaterThan(0.05)
      }
      placed.push(d({ id: `d${i}`, ...slot }))
    }
    expect(placed).toHaveLength(12)
  })

  it('still returns something once every slot is taken', () => {
    const full = Array.from({ length: 40 }, (_, i) => d({ id: `d${i}`, x: (i % 8) / 8, y: Math.floor(i / 8) / 8 }))
    const slot = nextFreeSlot(full)
    expect(Number.isFinite(slot.x)).toBe(true)
    expect(Number.isFinite(slot.y)).toBe(true)
  })

  it('counts a legacy corner-only decoration as occupying that corner', () => {
    expect(nextFreeSlot([d({ corner: 'tl' })])).not.toEqual({ x: 0, y: 0 })
  })
})
