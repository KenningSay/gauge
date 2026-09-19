// Frames: which pins a frame owns, and how to lay them out inside it.
//
// Membership is geometric. A pin belongs to a frame when its centre is
// inside that frame — centre, not overlap, because "half in" has to
// resolve one way or the other and the centre is the rule a person can
// predict by looking. Nothing is stored on either side, so a pin dragged
// out is out, and undo cannot leave a frame remembering a pin that moved.
//
// Pure geometry; the canvas and the store bring the pins.

export interface Box {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export const FRAME_DEFAULT_PADDING = 28
// Room for the title strip along the top.
export const FRAME_HEADER = 34
const FRAME_GAP = 20

function centreOf(b: { x: number; y: number; w: number; h: number }) {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 }
}

export function isInsideFrame(
  pin: { x: number; y: number; w: number; h: number },
  frame: { x: number; y: number; w: number; h: number },
): boolean {
  const c = centreOf(pin)
  return c.x >= frame.x && c.x <= frame.x + frame.w && c.y >= frame.y && c.y <= frame.y + frame.h
}

// Everything the frame owns. Other frames are excluded: nesting frames is
// a separate feature with its own questions (who moves whom, what does
// "lay out" mean for a frame inside a frame), and half-implementing it
// would be worse than not having it.
export function pinsInFrame<T extends Box & { type?: string }>(
  frame: Box,
  pins: T[],
): T[] {
  return pins.filter(
    (p) => p.id !== frame.id && p.type !== 'frame' && isInsideFrame(p, frame),
  )
}

// A frame that wraps the given pins with room to breathe, plus the header.
export function frameAround(
  boxes: Array<{ x: number; y: number; w: number; h: number }>,
  padding = FRAME_DEFAULT_PADDING,
): { x: number; y: number; w: number; h: number } | null {
  if (boxes.length === 0) return null
  const minX = Math.min(...boxes.map((b) => b.x))
  const minY = Math.min(...boxes.map((b) => b.y))
  const maxX = Math.max(...boxes.map((b) => b.x + b.w))
  const maxY = Math.max(...boxes.map((b) => b.y + b.h))
  return {
    x: minX - padding,
    y: minY - padding - FRAME_HEADER,
    w: maxX - minX + padding * 2,
    h: maxY - minY + padding * 2 + FRAME_HEADER,
  }
}

export interface LayoutResult {
  moves: Array<{ id: string; x: number; y: number }>
  // The frame may need to grow to fit the rows; it never shrinks below
  // what the caller already has.
  frame: { w: number; h: number }
}

// Lays the contents out on a grid: equal gaps, rows aligned, columns
// aligned. This is the "красиво выравнивалось без кривых и дрожащих
// линий" from the board — hand-nudged cards are never quite level, and no
// amount of care with a mouse makes them so.
//
// Cards keep their own sizes (a board where everything is forced to one
// size is a spreadsheet), so a row is as tall as its tallest card and the
// next row starts below it.
export function layoutInFrame(
  frame: Box,
  contents: Box[],
  padding = FRAME_DEFAULT_PADDING,
  gap = FRAME_GAP,
): LayoutResult {
  if (contents.length === 0) return { moves: [], frame: { w: frame.w, h: frame.h } }

  // Reading order of where things already are, so a tidy-up rearranges as
  // little as possible: things stay roughly where the user put them.
  const ordered = [...contents].sort((a, b) => {
    const rowA = Math.round(a.y / 40)
    const rowB = Math.round(b.y / 40)
    return rowA - rowB || a.x - b.x
  })

  const innerLeft = frame.x + padding
  const innerTop = frame.y + FRAME_HEADER + padding
  const available = Math.max(frame.w - padding * 2, Math.max(...ordered.map((c) => c.w)))

  const moves: LayoutResult['moves'] = []
  let cursorX = innerLeft
  let cursorY = innerTop
  let rowHeight = 0

  for (const item of ordered) {
    // Wrap when the card would cross the frame's right edge — but never
    // wrap the first card of a row, or a card wider than the frame would
    // loop forever.
    if (cursorX > innerLeft && cursorX + item.w > innerLeft + available) {
      cursorX = innerLeft
      cursorY += rowHeight + gap
      rowHeight = 0
    }
    moves.push({ id: item.id, x: Math.round(cursorX), y: Math.round(cursorY) })
    cursorX += item.w + gap
    rowHeight = Math.max(rowHeight, item.h)
  }

  const neededH = cursorY + rowHeight + padding - frame.y
  return {
    moves: moves.filter((m) => {
      const original = contents.find((c) => c.id === m.id)!
      return Math.round(original.x) !== m.x || Math.round(original.y) !== m.y
    }),
    frame: { w: frame.w, h: Math.max(frame.h, Math.round(neededH)) },
  }
}
