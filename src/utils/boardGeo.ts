// Geometry for board pins. Two jobs: hit-testing (does the mouse land on
// this pin, is this pin inside the Alt-drag selection rectangle) and the
// "капля в воду" drop animation (a newly placed pin pushes overlapping
// pins out of the way, and they push their neighbors in turn, until no
// rects intersect).

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
}

export function pointInRect(px: number, py: number, r: Rect): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h
}

// Rect enclosing all the given rects — used to frame the viewport after
// "AI: покажи все пины про X", so the matched pins are all visible at once.
export function boundsOf(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    if (r.x < minX) minX = r.x
    if (r.y < minY) minY = r.y
    if (r.x + r.w > maxX) maxX = r.x + r.w
    if (r.y + r.h > maxY) maxY = r.y + r.h
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Minimal translation to separate b from a, or null if they don't overlap.
// Pushes along the axis where the overlap is smaller — the shortest way
// out of a rectangle intersection is always along the axis with less
// penetration, so this produces the "just enough to not touch" move the
// drop animation needs.
//
// Direction is away from a's center, so a pin on the left of the dropped
// pin goes further left, one below goes further down, etc. Sign(0) === 0
// would silently produce a zero push if the centers were exactly aligned
// on the push axis — the fallback to the other axis handles the one case
// where that matters (both centers coincide), and the caller's iteration
// cap absorbs any residual ties.
function pushOut(a: Rect, b: Rect, gap: number): { dx: number; dy: number } | null {
  const acx = a.x + a.w / 2
  const acy = a.y + a.h / 2
  const bcx = b.x + b.w / 2
  const bcy = b.y + b.h / 2

  const overlapX = (a.w / 2 + b.w / 2 + gap) - Math.abs(bcx - acx)
  const overlapY = (a.h / 2 + b.h / 2 + gap) - Math.abs(bcy - acy)

  if (overlapX <= 0 || overlapY <= 0) return null

  if (overlapX < overlapY) {
    const sign = bcx === acx ? 1 : Math.sign(bcx - acx)
    return { dx: sign * overlapX, dy: 0 }
  }
  const sign = bcy === acy ? 1 : Math.sign(bcy - acy)
  return { dx: 0, dy: sign * overlapY }
}

// Runs the chain reaction: `placed` is the freshly dropped rect, `others`
// are the existing pins. Returns only the ones that actually moved, with
// their new top-left positions. Untouched pins are omitted so the caller
// doesn't write a "move" op for every pin on a busy board.
//
// The iteration cap is a safety net, not a real limit: with well-separated
// pins the whole thing converges in 2–3 passes. It exists to bound the
// pathological case where a ring of tightly packed pins can't be resolved
// (each push un-resolves another pair) — better to leave a couple of
// visible overlaps than to spin forever.
export function resolvePush(
  others: Array<{ id: string } & Rect>,
  placed: Rect,
  gap: number,
): Array<{ id: string; x: number; y: number }> {
  const MAX_ITER = 500
  const pos = new Map<string, { x: number; y: number }>()
  for (const o of others) pos.set(o.id, { x: o.x, y: o.y })

  const queue: Rect[] = [{ x: placed.x, y: placed.y, w: placed.w, h: placed.h }]
  let iter = 0

  while (queue.length > 0 && iter < MAX_ITER) {
    iter++
    const pusher = queue.shift()!
    for (const other of others) {
      const cur = pos.get(other.id)!
      const target: Rect = { x: cur.x, y: cur.y, w: other.w, h: other.h }
      const push = pushOut(pusher, target, gap)
      if (!push) continue
      cur.x += push.dx
      cur.y += push.dy
      // The moved rect becomes a pusher itself, so the displacement can
      // ripple outward — the "chain reaction" the spec calls for.
      queue.push({ x: cur.x, y: cur.y, w: other.w, h: other.h })
    }
  }

  const result: Array<{ id: string; x: number; y: number }> = []
  for (const o of others) {
    const cur = pos.get(o.id)!
    if (cur.x !== o.x || cur.y !== o.y) {
      result.push({ id: o.id, x: cur.x, y: cur.y })
    }
  }
  return result
}