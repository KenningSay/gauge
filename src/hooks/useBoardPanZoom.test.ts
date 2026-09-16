import { describe, it, expect } from 'vitest'
import { normalizeWheel } from './useBoardPanZoom'

// Only the delta normalisation is unit-testable here; the rest of the hook
// is pointer plumbing that needs a real element.
const wheel = (over: Partial<WheelEvent>): WheelEvent =>
  ({ deltaMode: 0, deltaX: 0, deltaY: 0, ...over }) as WheelEvent

describe('normalizeWheel', () => {
  it('passes pixel deltas through untouched', () => {
    expect(normalizeWheel(wheel({ deltaY: 120 }), 800)).toEqual({ dx: 0, dy: 120 })
  })

  it('scales line deltas up to pixels', () => {
    // The Firefox case: a physical mouse wheel reports 3 *lines*, not 100
    // pixels. Treated as pixels it pans the board three pixels a notch and
    // zooms by a factor of 0.994, which reads as "the wheel does nothing".
    expect(normalizeWheel(wheel({ deltaY: 3, deltaMode: 1 }), 800)).toEqual({ dx: 0, dy: 48 })
  })

  it('scales page deltas by the viewport height', () => {
    expect(normalizeWheel(wheel({ deltaY: 1, deltaMode: 2 }), 800)).toEqual({ dx: 0, dy: 800 })
  })

  it('never scales a page delta by zero on an unmeasured container', () => {
    expect(normalizeWheel(wheel({ deltaY: 1, deltaMode: 2 }), 0).dy).toBe(1)
  })

  it('normalises both axes', () => {
    expect(normalizeWheel(wheel({ deltaX: 2, deltaY: -3, deltaMode: 1 }), 800)).toEqual({
      dx: 32,
      dy: -48,
    })
  })

  it('keeps the sign, so direction is never inverted', () => {
    expect(normalizeWheel(wheel({ deltaY: -3, deltaMode: 1 }), 800).dy).toBeLessThan(0)
  })
})
