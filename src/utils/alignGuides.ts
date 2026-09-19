// Alignment guides: the lines that appear while you drag a card past its
// neighbours, and the small pull that lands it exactly level with them.
//
// Why this exists: the board could snap to a grid, and that is a different
// thing. A grid aligns everything to an abstraction nobody can see; guides
// align a card to the cards it is actually next to, which is what "put
// these two in a row" means. The board's own note asked for lines that
// show up only when something is near, and that stick.
//
// Pure on purpose — the canvas hands it rectangles and gets back an offset
// plus the lines to draw. No DOM, no store, so the geometry can be tested
// without a browser.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface Guide {
  // 'x' is a VERTICAL line at a constant x (left/centre/right alignment);
  // 'y' is a horizontal one. Named for the coordinate it fixes.
  axis: 'x' | 'y'
  pos: number
  // How far the line runs along the other axis: from the topmost edge
  // involved to the bottommost, so it visibly connects the cards it is
  // talking about instead of crossing the whole board.
  start: number
  end: number
}

export interface AlignSnap {
  dx: number
  dy: number
  guides: Guide[]
}

// Which points on a box can line up with which. Edges and centres only:
// thirds and quarters produce a thicket of lines that mean nothing.
function xAnchors(r: Rect): number[] {
  return [r.x, r.x + r.w / 2, r.x + r.w]
}

function yAnchors(r: Rect): number[] {
  return [r.y, r.y + r.h / 2, r.y + r.h]
}

interface Best {
  delta: number
  pos: number
  partners: Rect[]
}

// The closest alignment within the threshold, and every other box that
// shares it. Ties go to the first found, which is the nearest in the
// caller's ordering.
function bestAlignment(
  movingAnchors: number[],
  others: Rect[],
  anchorsOf: (r: Rect) => number[],
  threshold: number,
): Best | null {
  let best: Best | null = null
  for (const other of others) {
    for (const target of anchorsOf(other)) {
      for (const mine of movingAnchors) {
        const diff = target - mine
        if (Math.abs(diff) > threshold) continue
        if (!best || Math.abs(diff) < Math.abs(best.delta)) {
          best = { delta: diff, pos: target, partners: [other] }
        }
      }
    }
  }
  if (!best) return null
  // Collect everyone sitting on the winning line — the guide should span
  // all of them, not just the one that happened to be closest.
  const pos = best.pos
  best.partners = others.filter((o) => anchorsOf(o).some((a) => Math.abs(a - pos) < 0.5))
  return best
}

// `moving` is the bounding box of whatever is being dragged (one pin, or
// the whole selection). `threshold` is in world units — the caller divides
// its pixel threshold by the zoom, so the pull feels the same at any zoom.
export function computeAlignSnap(
  moving: Rect,
  others: Rect[],
  threshold: number,
): AlignSnap {
  if (threshold <= 0 || others.length === 0) return { dx: 0, dy: 0, guides: [] }

  const bx = bestAlignment(xAnchors(moving), others, xAnchors, threshold)
  const by = bestAlignment(yAnchors(moving), others, yAnchors, threshold)

  const dx = bx?.delta ?? 0
  const dy = by?.delta ?? 0
  // The snapped box, because a guide has to be drawn where the card is
  // going to land, not where the cursor currently holds it.
  const landed: Rect = { ...moving, x: moving.x + dx, y: moving.y + dy }

  const guides: Guide[] = []
  if (bx) {
    const tops = [landed.y, ...bx.partners.map((p) => p.y)]
    const bottoms = [landed.y + landed.h, ...bx.partners.map((p) => p.y + p.h)]
    guides.push({
      axis: 'x',
      pos: bx.pos,
      start: Math.min(...tops),
      end: Math.max(...bottoms),
    })
  }
  if (by) {
    const lefts = [landed.x, ...by.partners.map((p) => p.x)]
    const rights = [landed.x + landed.w, ...by.partners.map((p) => p.x + p.w)]
    guides.push({
      axis: 'y',
      pos: by.pos,
      start: Math.min(...lefts),
      end: Math.max(...rights),
    })
  }
  return { dx, dy, guides }
}

// Bounding box of several rectangles — a multi-pin drag aligns as one
// block, the way a group behaves in any design tool.
export function boundingBox(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.w)
    maxY = Math.max(maxY, r.y + r.h)
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Only boxes near enough to matter. A board can hold hundreds of pins and
// the guide search is O(pins × 9); more to the point, a line drawn to a
// card two screens away is noise, not help.
export function nearbyRects(moving: Rect, all: Rect[], radius: number): Rect[] {
  return all.filter((r) => {
    const gapX = Math.max(r.x - (moving.x + moving.w), moving.x - (r.x + r.w), 0)
    const gapY = Math.max(r.y - (moving.y + moving.h), moving.y - (r.y + r.h), 0)
    return gapX <= radius && gapY <= radius
  })
}
