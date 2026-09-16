// Where the small things pinned to a note sit.
//
// A decoration's position is stored as a fraction of the note's own box
// rather than in pixels, so it keeps its place when the note is resized —
// a paperclip hooked over the top-right corner stays on the corner instead
// of drifting into the middle of a card that got wider.

import type { Decor, DecorCorner } from '../api/board'

export const DEFAULT_DECOR_SIZE = 30
export const MIN_DECOR_SIZE = 14
export const MAX_DECOR_SIZE = 160

// Pinning more than this to one note is never deliberate — it's a button
// held down — and every one of them is saved to the board file.
export const MAX_DECOR_PER_NOTE = 24

const CORNER_POS: Record<DecorCorner, { x: number; y: number }> = {
  tl: { x: 0, y: 0 },
  tr: { x: 1, y: 0 },
  bl: { x: 0, y: 1 },
  br: { x: 1, y: 1 },
}

// Decorations saved before they could be moved have no x/y — they sat on
// the corner they were dropped on, which is exactly fraction 0 or 1.
export function decorPos(d: Decor): { x: number; y: number } {
  const fallback = CORNER_POS[d.corner] ?? CORNER_POS.tl
  return { x: d.x ?? fallback.x, y: d.y ?? fallback.y }
}

export function decorSize(d: Decor): number {
  return clampSize(d.size ?? DEFAULT_DECOR_SIZE)
}

export function clampSize(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DECOR_SIZE
  return Math.round(Math.min(MAX_DECOR_SIZE, Math.max(MIN_DECOR_SIZE, n)))
}

// A decoration may hang over the edge — that's the whole look — but not so
// far that it parts company with the note it belongs to.
export function clampPos(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.min(1.15, Math.max(-0.15, Math.round(n * 1000) / 1000))
}

// Which way the glyph faces: always "inward", so a clip on the right edge
// hooks right and one on the left hooks left. Derived from where it
// actually is rather than from the corner it was first dropped on, so it
// stays right after being dragged across the card.
export function decorFlip(d: Decor): { x: boolean; y: boolean } {
  const p = decorPos(d)
  return { x: p.x > 0.5, y: p.y > 0.5 }
}

// Candidate positions for a decoration added by *clicking* the panel
// rather than dropping it somewhere: corners first, then edge midpoints,
// then the quarter points. Clicking the same glyph five times used to
// stack five copies on the top-left corner, where they looked like one.
const SLOTS: Array<{ x: number; y: number }> = [
  { x: 0, y: 0 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: 0.5, y: 0 },
  { x: 1, y: 0.5 },
  { x: 0.5, y: 1 },
  { x: 0, y: 0.5 },
  { x: 0.25, y: 0 },
  { x: 0.75, y: 0 },
  { x: 1, y: 0.25 },
  { x: 1, y: 0.75 },
  { x: 0.75, y: 1 },
  { x: 0.25, y: 1 },
  { x: 0, y: 0.75 },
  { x: 0, y: 0.25 },
]

const MIN_GAP = 0.12

export function nextFreeSlot(existing: Decor[]): { x: number; y: number } {
  const taken = existing.map(decorPos)
  const free = SLOTS.find((s) =>
    taken.every((t) => Math.hypot(t.x - s.x, t.y - s.y) >= MIN_GAP),
  )
  if (free) return free
  // Every slot is spoken for: step diagonally inward so the extras are at
  // least visibly separate rather than exactly on top of one another.
  const n = existing.length
  const step = ((n % 8) + 1) / 12
  return { x: clampPos(step), y: clampPos(step) }
}
