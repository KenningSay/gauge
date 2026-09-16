// Finding something on a board that has grown past what fits on screen.
//
// The board is an infinite canvas: a note written three months ago is
// somewhere off to the left at a zoom you have never used. Panning around
// looking for it is the one thing the canvas is bad at, and it is the
// thing a canvas makes you do most.

import type { Pin } from '../api/board'

// Every pin type carries its text under a different name, and some carry
// it under several. Read them defensively rather than switching on the
// type: a new pin kind should show up in search the day it is added, not
// the day someone remembers to add it here.
const TEXT_FIELDS = ['text', 'title', 'label', 'url', 'fileName', 'sourcePath', 'description'] as const

export function searchableText(pin: Pin): string {
  const loose = pin as unknown as Record<string, unknown>
  const parts: string[] = [pin.type]
  for (const field of TEXT_FIELDS) {
    const value = loose[field]
    if (typeof value === 'string' && value) parts.push(value)
  }
  return parts.join(' ')
}

// Case- and diacritic-insensitive, so "ЗАМЕТКА" finds "заметка" and a
// query typed without ё finds text written with it.
function fold(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').normalize('NFKD').replace(/[̀-ͯ]/g, '')
}

export interface Match {
  id: string
  // Where to centre the viewport, in board coordinates.
  cx: number
  cy: number
}

// Matches in reading order — top to bottom, then left to right — because
// "next match" should walk the board the way the eye does, not the way the
// pins happen to sit in the file.
export function findMatches(pins: Pin[], query: string): Match[] {
  const q = fold(query.trim())
  if (q.length === 0) return []
  return pins
    .filter((p) => fold(searchableText(p)).includes(q))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((p) => ({ id: p.id, cx: p.x + p.w / 2, cy: p.y + p.h / 2 }))
}

// Wraps at both ends: the match after the last is the first again. A search
// that stops dead at the end of the list makes you reopen it to start over.
export function stepMatch(current: number, total: number, dir: 1 | -1): number {
  if (total <= 0) return 0
  return (current + dir + total) % total
}

// The viewport that puts a point in the middle of the canvas, at the zoom
// already in use — jumping to a match should not also change how far in
// you are looking.
export function centreOn(
  cx: number,
  cy: number,
  zoom: number,
  container: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: Math.round(cx - container.w / 2 / zoom),
    y: Math.round(cy - container.h / 2 / zoom),
  }
}
