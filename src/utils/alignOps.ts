// Align and distribute, the way a vector editor does it.
//
// The board already snaps a card to its neighbour while you drag it, which
// handles two or three cards. Six cards that must share an edge, or five
// that must sit at equal intervals, is not a dragging problem: you cannot
// hand-place the fifth one to the same pixel as the first, and the eye
// catches the error immediately. This is the operation Illustrator puts in
// its Align palette, and it is the one thing the board still made you do
// by hand.
//
// Pure functions over rectangles — no store, no DOM.

export interface Rect {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export type AlignEdge = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type DistributeAxis = 'horizontal' | 'vertical'

export interface Move {
  id: string
  x: number
  y: number
}

function bounds(rects: Rect[]) {
  return {
    minX: Math.min(...rects.map((r) => r.x)),
    maxX: Math.max(...rects.map((r) => r.x + r.w)),
    minY: Math.min(...rects.map((r) => r.y)),
    maxY: Math.max(...rects.map((r) => r.y + r.h)),
  }
}

// Aligns to the bounding box of the selection itself, not to the board or
// to the first-clicked item. That is what every tool does by default, and
// it is the only rule where nothing moves if the cards are already aligned.
export function alignRects(rects: Rect[], edge: AlignEdge): Move[] {
  if (rects.length < 2) return []
  const b = bounds(rects)
  const moves: Move[] = []
  for (const r of rects) {
    let { x, y } = r
    switch (edge) {
      case 'left':
        x = b.minX
        break
      case 'right':
        x = b.maxX - r.w
        break
      case 'hcenter':
        x = (b.minX + b.maxX) / 2 - r.w / 2
        break
      case 'top':
        y = b.minY
        break
      case 'bottom':
        y = b.maxY - r.h
        break
      case 'vcenter':
        y = (b.minY + b.maxY) / 2 - r.h / 2
        break
    }
    const rx = Math.round(x)
    const ry = Math.round(y)
    if (rx !== Math.round(r.x) || ry !== Math.round(r.y)) moves.push({ id: r.id, x: rx, y: ry })
  }
  return moves
}

// Equal GAPS between neighbours, not equal centres. With cards of
// different widths — which is every real board — equal centres leaves
// gaps of visibly different sizes, and the gap is what the eye reads as
// rhythm. The outermost two cards stay put and define the span.
export function distributeRects(rects: Rect[], axis: DistributeAxis): Move[] {
  if (rects.length < 3) return []
  const horizontal = axis === 'horizontal'
  const sorted = [...rects].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const span = horizontal ? last.x + last.w - first.x : last.y + last.h - first.y
  const used = sorted.reduce((sum, r) => sum + (horizontal ? r.w : r.h), 0)
  const gap = (span - used) / (sorted.length - 1)

  const moves: Move[] = []
  let cursor = horizontal ? first.x : first.y
  for (const r of sorted) {
    const target = Math.round(cursor)
    const current = Math.round(horizontal ? r.x : r.y)
    if (target !== current) {
      moves.push({
        id: r.id,
        x: horizontal ? target : Math.round(r.x),
        y: horizontal ? Math.round(r.y) : target,
      })
    }
    cursor += (horizontal ? r.w : r.h) + gap
  }
  return moves
}

// Sets every gap to the SAME given size, packing the cards up against the
// first one. Distribute keeps the overall span; this one changes it, which
// is what you want when the cards are scattered rather than merely uneven.
export function packRects(rects: Rect[], axis: DistributeAxis, gap: number): Move[] {
  if (rects.length < 2) return []
  const horizontal = axis === 'horizontal'
  const sorted = [...rects].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const moves: Move[] = []
  let cursor = horizontal ? sorted[0].x : sorted[0].y
  for (const r of sorted) {
    const target = Math.round(cursor)
    const current = Math.round(horizontal ? r.x : r.y)
    if (target !== current) {
      moves.push({
        id: r.id,
        x: horizontal ? target : Math.round(r.x),
        y: horizontal ? Math.round(r.y) : target,
      })
    }
    cursor += (horizontal ? r.w : r.h) + gap
  }
  return moves
}
