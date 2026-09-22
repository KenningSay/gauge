import { describe, it, expect } from 'vitest'
import {
  appendSegment,
  denormalise,
  growToFit,
  normalise,
  simplify,
  strokeBody,
  strokePath,
  strokesBounds,
} from './inkGeo'

describe('simplify', () => {
  it('drops samples closer together than the threshold', () => {
    const dense = [0, 0, 0.5, 0, 1, 0, 1.5, 0, 50, 0]
    expect(simplify(dense, 2).length).toBeLessThan(dense.length)
  })

  it('always keeps the first and last sample', () => {
    const points = [0, 0, 0.1, 0.1, 0.2, 0.2, 99, 99]
    const out = simplify(points, 10)
    expect(out.slice(0, 2)).toEqual([0, 0])
    expect(out.slice(-2)).toEqual([99, 99])
  })

  it('leaves a short stroke alone', () => {
    expect(simplify([0, 0, 1, 1])).toEqual([0, 0, 1, 1])
  })
})

describe('strokesBounds', () => {
  it('wraps every point of every stroke', () => {
    const b = strokesBounds([{ points: [0, 0, 10, 5] }, { points: [-4, 2, 6, 20] }])!
    expect(b).toEqual({ x: -4, y: 0, w: 14, h: 20 })
  })

  it('returns null when there is nothing', () => {
    expect(strokesBounds([])).toBeNull()
    expect(strokesBounds([{ points: [] }])).toBeNull()
  })
})

describe('normalise / denormalise', () => {
  const box = { x: 100, y: 200, w: 50, h: 40 }

  it('round-trips a point back to where it started', () => {
    const world = [100, 200, 125, 220, 150, 240]
    expect(denormalise(normalise(world, box), box)).toEqual(world)
  })

  it('maps the box corners to 0 and 1', () => {
    expect(normalise([100, 200, 150, 240], box)).toEqual([0, 0, 1, 1])
  })

  it('survives a box with no extent — a perfectly straight line', () => {
    const flat = { x: 0, y: 5, w: 100, h: 0 }
    expect(() => normalise([0, 5, 100, 5], flat)).not.toThrow()
    expect(normalise([0, 5, 100, 5], flat).every((n) => Number.isFinite(n))).toBe(true)
  })
})

describe('growToFit', () => {
  const style = { color: '#fff', width: 3 }

  it('creates a padded box around the first stroke', () => {
    const { box, strokes } = growToFit({ x: 0, y: 0, w: 0, h: 0 }, [], [10, 10, 30, 40], style, 5)
    expect(box).toEqual({ x: 5, y: 5, w: 30, h: 40 })
    expect(strokes).toHaveLength(1)
    // Normalised, so within 0..1.
    expect(strokes[0].points.every((n) => n >= 0 && n <= 1)).toBe(true)
  })

  it('grows the box for a stroke drawn outside it, keeping the old ink in place', () => {
    const first = growToFit({ x: 0, y: 0, w: 0, h: 0 }, [], [10, 10, 30, 30], style, 5)
    const worldBefore = denormalise(first.strokes[0].points, first.box)

    const second = growToFit(first.box, first.strokes, [200, 200, 220, 220], style, 5)

    expect(second.box.w).toBeGreaterThan(first.box.w)
    // The first stroke must still be drawn where it was drawn.
    const worldAfter = denormalise(second.strokes[0].points, second.box)
    worldAfter.forEach((v, i) => expect(v).toBeCloseTo(worldBefore[i], 6))
  })

  it('keeps every stroke it was given', () => {
    const a = growToFit({ x: 0, y: 0, w: 0, h: 0 }, [], [0, 0, 10, 10], style)
    const b = growToFit(a.box, a.strokes, [20, 20, 30, 30], style)
    const c = growToFit(b.box, b.strokes, [40, 40, 50, 50], style)
    expect(c.strokes).toHaveLength(3)
  })
})

describe('strokePath', () => {
  it('starts with a move and smooths the middle with curves', () => {
    const d = strokePath([0, 0, 10, 10, 20, 0, 30, 10])
    expect(d.startsWith('M 0 0')).toBe(true)
    expect(d).toContain('Q')
  })

  it('renders a single sample as a dot rather than nothing', () => {
    expect(strokePath([5, 5])).toBe('M 5 5 L 5 5')
  })

  it('returns an empty path for no points', () => {
    expect(strokePath([])).toBe('')
  })
})

describe('appendSegment', () => {
  // The property that matters: drawing a stroke sample by sample must end
  // up with exactly the curve a full rebuild would give. The first version
  // of this failed here — it emitted a stray line segment for the second
  // sample that the rebuilt path did not have.
  it('builds the same curve as strokeBody, one sample at a time', () => {
    const samples = [
      [0, 0],
      [10, 4],
      [20, 12],
      [30, 6],
      [40, 18],
      [55, 9],
    ]
    const points: number[] = []
    let incremental = ''
    for (const [x, y] of samples) {
      points.push(x, y)
      if (points.length === 2) incremental = `M ${x} ${y}`
      else {
        const seg = appendSegment(points)
        if (seg) incremental += ` ${seg}`
      }
    }
    expect(incremental).toBe(strokeBody(points))
  })

  it('adds nothing until three samples are in', () => {
    expect(appendSegment([0, 0])).toBe('')
    expect(appendSegment([0, 0, 1, 1])).toBe('')
    expect(appendSegment([0, 0, 1, 1, 2, 2])).toContain('Q')
  })

  it('strokePath is strokeBody plus the closing line', () => {
    const pts = [0, 0, 10, 4, 20, 12, 30, 6]
    expect(strokePath(pts)).toBe(`${strokeBody(pts)} L 30 6`)
  })
})
