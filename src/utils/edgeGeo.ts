// Geometry for the connections between pins.
//
// Curves are cubic Béziers whose control points stick straight out of the
// port they leave from — the shape node editors (Blender, Blueprints,
// n8n) all use, because it reads as "this leaves here and arrives there"
// no matter how the two boxes are arranged. A straight line between two
// box centres can't do that: it changes meaning as soon as the boxes move
// past each other.

import type { Edge, PortSide, Pin } from '../api/board'

export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

// Where a port sits on a pin, in world coordinates.
export function portPoint(rect: Rect, side: PortSide): Point {
  switch (side) {
    case 'top':
      return { x: rect.x + rect.w / 2, y: rect.y }
    case 'bottom':
      return { x: rect.x + rect.w / 2, y: rect.y + rect.h }
    case 'left':
      return { x: rect.x, y: rect.y + rect.h / 2 }
    case 'right':
      return { x: rect.x + rect.w, y: rect.y + rect.h / 2 }
  }
}

function normal(side: PortSide): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
    case 'right':
      return { x: 1, y: 0 }
  }
}

// How far the curve leaves the port before bending. Scales with the gap so
// short connections don't loop wildly and long ones don't go limp, with a
// floor that keeps the exit direction readable even between touching pins.
function reach(a: Point, b: Point): number {
  const dist = Math.hypot(b.x - a.x, b.y - a.y)
  return Math.max(40, Math.min(dist * 0.45, 220))
}

export function edgePath(from: Point, fromSide: PortSide, to: Point, toSide: PortSide): string {
  const r = reach(from, to)
  const n1 = normal(fromSide)
  const n2 = normal(toSide)
  const c1 = { x: from.x + n1.x * r, y: from.y + n1.y * r }
  const c2 = { x: to.x + n2.x * r, y: to.y + n2.y * r }
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`
}

// Picks the pair of sides that gives the shortest, least crossed route
// between two pins. Without this every connection would leave from the
// same side and loop around the card when you drag it to the other side.
export function bestSides(a: Rect, b: Rect): { from: PortSide; to: PortSide } {
  const dx = b.x + b.w / 2 - (a.x + a.w / 2)
  const dy = b.y + b.h / 2 - (a.y + a.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { from: 'right', to: 'left' } : { from: 'left', to: 'right' }
  }
  return dy >= 0 ? { from: 'bottom', to: 'top' } : { from: 'top', to: 'bottom' }
}

export function pinRect(pin: Pin, override?: Partial<Rect>): Rect {
  return {
    x: override?.x ?? pin.x,
    y: override?.y ?? pin.y,
    w: override?.w ?? pin.w,
    h: override?.h ?? pin.h,
  }
}

export interface ResolvedEdge {
  edge: Edge
  from: Point
  to: Point
  path: string
  // Midpoint of the curve, for the label and the hit target.
  mid: Point
}

// Turns stored edges into drawable curves, dropping any whose endpoints no
// longer exist. `rects` lets the caller pass live positions during a drag
// so the curve follows the pin instead of snapping at the end.
export function resolveEdges(edges: Edge[], rects: Map<string, Rect>): ResolvedEdge[] {
  const out: ResolvedEdge[] = []
  for (const edge of edges) {
    const a = rects.get(edge.from.pinId)
    const b = rects.get(edge.to.pinId)
    if (!a || !b) continue
    const sides = bestSides(a, b)
    const from = portPoint(a, sides.from)
    const to = portPoint(b, sides.to)
    out.push({
      edge,
      from,
      to,
      path: edgePath(from, sides.from, to, sides.to),
      mid: bezierMid(from, sides.from, to, sides.to),
    })
  }
  return out
}

// The curve's own midpoint (t=0.5), not the midpoint of the straight line —
// on a strongly bent connection those are far apart, and a label pinned to
// the wrong one floats off the wire.
export function bezierMid(from: Point, fromSide: PortSide, to: Point, toSide: PortSide): Point {
  const r = reach(from, to)
  const n1 = normal(fromSide)
  const n2 = normal(toSide)
  const c1 = { x: from.x + n1.x * r, y: from.y + n1.y * r }
  const c2 = { x: to.x + n2.x * r, y: to.y + n2.y * r }
  return {
    x: (from.x + 3 * c1.x + 3 * c2.x + to.x) / 8,
    y: (from.y + 3 * c1.y + 3 * c2.y + to.y) / 8,
  }
}
