// Freehand ink: turning a list of pointer samples into something that
// looks drawn rather than plotted, and keeping it inside a pin that can be
// moved and resized like everything else on the board.
//
// Points live NORMALISED (0..1) relative to the pin's box. That is what
// makes a drawing survive a resize — the same trick the note decorations
// use. It also means adding a stroke that sticks out of the current box
// has to grow the box and re-normalise everything already in it, which is
// what growToFit does.

import type { InkStroke } from '../api/board'

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

// Below this a "stroke" is a click, not a line.
export const MIN_STROKE_POINTS = 2
// Padding around ink so a thick line is not clipped by its own pin.
export const INK_PADDING = 12

// Drops samples that are closer together than `min` board units. A pointer
// emits far more points than a line needs — at 120Hz a slow hand produces
// hundreds of samples a centimetre apart, which bloats the board file and
// makes the smoothing wobble.
export function simplify(points: number[], min = 2): number[] {
  if (points.length <= 4) return [...points]
  const out = [points[0], points[1]]
  let lastX = points[0]
  let lastY = points[1]
  for (let i = 2; i < points.length - 2; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    if (Math.hypot(x - lastX, y - lastY) < min) continue
    out.push(x, y)
    lastX = x
    lastY = y
  }
  // The last sample always survives: it is where the pointer actually
  // stopped, and dropping it visibly shortens the stroke.
  out.push(points[points.length - 2], points[points.length - 1])
  return out
}

// The bounding box of every point in every stroke, in whatever coordinate
// space the points are given.
export function strokesBounds(strokes: Array<{ points: number[] }>): Box | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let seen = false
  for (const s of strokes) {
    for (let i = 0; i < s.points.length - 1; i += 2) {
      seen = true
      minX = Math.min(minX, s.points[i])
      maxX = Math.max(maxX, s.points[i])
      minY = Math.min(minY, s.points[i + 1])
      maxY = Math.max(maxY, s.points[i + 1])
    }
  }
  if (!seen) return null
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export function normalise(points: number[], box: Box): number[] {
  const out: number[] = []
  // A box with no extent in one axis (a perfectly straight line) would
  // divide by zero; everything collapses to the middle of that axis.
  const w = box.w || 1
  const h = box.h || 1
  for (let i = 0; i < points.length - 1; i += 2) {
    out.push((points[i] - box.x) / w, (points[i + 1] - box.y) / h)
  }
  return out
}

export function denormalise(points: number[], box: Box): number[] {
  const out: number[] = []
  for (let i = 0; i < points.length - 1; i += 2) {
    out.push(box.x + points[i] * box.w, box.y + points[i + 1] * box.h)
  }
  return out
}

// Adds a stroke (in world coordinates) to a pin's existing strokes (in
// normalised coordinates), returning both the new box and every stroke
// re-normalised against it.
export function growToFit(
  pinBox: Box,
  existing: InkStroke[],
  incomingWorld: number[],
  style: { color: string; width: number },
  padding = INK_PADDING,
): { box: Box; strokes: InkStroke[] } {
  const existingWorld = existing.map((s) => ({ ...s, points: denormalise(s.points, pinBox) }))
  const incoming = { points: incomingWorld, ...style }
  const all = [...existingWorld, incoming]

  const raw = strokesBounds(all)
  if (!raw) return { box: pinBox, strokes: existing }
  const box: Box = {
    x: raw.x - padding,
    y: raw.y - padding,
    w: raw.w + padding * 2,
    h: raw.h + padding * 2,
  }
  return {
    box,
    strokes: all.map((s) => ({ ...s, points: normalise(s.points, box) })),
  }
}

// The one path segment that appears when a new sample arrives.
//
// strokePath() rebuilds the whole `d` string, which is O(n) per sample and
// therefore O(n^2) over a stroke — fine for 60 samples, not fine for the
// 500 a slow deliberate line produces. While drawing, the canvas appends
// instead, and the result is identical (see the test that checks exactly
// that).
//
// `points` must already include the new sample. Returns '' when there is
// not yet enough to draw.
export function appendSegment(points: number[]): string {
  const n = points.length
  if (n < 6) return ''
  // Control point is the sample before last; the segment ends at the
  // midpoint between it and the newest sample.
  const cx = points[n - 4]
  const cy = points[n - 3]
  const mx = (points[n - 4] + points[n - 2]) / 2
  const my = (points[n - 3] + points[n - 1]) / 2
  return `Q ${cx} ${cy} ${mx} ${my}`
}

// The curve WITHOUT the closing line to the final sample.
//
// This is the form the live stroke is built in, because a closing segment
// would have to be removed again on the next sample. strokePath() adds
// the close; the two differ by exactly that one segment, which is why the
// canvas starts from this one and appends.
export function strokeBody(points: number[]): string {
  if (points.length < 2) return ''
  let d = `M ${points[0]} ${points[1]}`
  for (let i = 2; i < points.length - 2; i += 2) {
    const cx = points[i]
    const cy = points[i + 1]
    const mx = (points[i] + points[i + 2]) / 2
    const my = (points[i + 1] + points[i + 3]) / 2
    d += ` Q ${cx} ${cy} ${mx} ${my}`
  }
  return d
}

// An SVG path through the points, smoothed.
//
// Each segment is a quadratic curve whose control point is the sample and
// whose end point is the midpoint to the next sample. Joining raw samples
// with straight lines produces visible facets on any curve; this is the
// cheapest fix that looks hand-drawn, and unlike a spline it needs no
// lookahead, so the line can be drawn while it is still being made.
export function strokePath(points: number[]): string {
  if (points.length < 4) {
    if (points.length < 2) return ''
    // A single sample: a dot, drawn as a zero-length line so the round
    // linecap renders it.
    return `M ${points[0]} ${points[1]} L ${points[0]} ${points[1]}`
  }
  let d = `M ${points[0]} ${points[1]}`
  for (let i = 2; i < points.length - 2; i += 2) {
    const cx = points[i]
    const cy = points[i + 1]
    const mx = (points[i] + points[i + 2]) / 2
    const my = (points[i + 1] + points[i + 3]) / 2
    d += ` Q ${cx} ${cy} ${mx} ${my}`
  }
  d += ` L ${points[points.length - 2]} ${points[points.length - 1]}`
  return d
}
