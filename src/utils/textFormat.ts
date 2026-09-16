// Turning the note's formatting fields into CSS, and the editor's
// keyboard shortcuts into markdown.

import type { NoteTextFormat } from '../api/board'

// The sizes the stepper walks through. A free number entry is allowed too,
// but stepping should land on the sizes people actually use rather than
// crawling one pixel at a time.
export const FONT_SIZES = [11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 80, 96] as const

export const MIN_FONT_SIZE = 8
export const MAX_FONT_SIZE = 200

export function clampFontSize(n: number): number {
  if (!Number.isFinite(n)) return 16
  return Math.round(Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, n)))
}

// Step to the next size up or down the list, falling to the nearest listed
// size first when the current one is a number typed by hand.
export function stepFontSize(current: number, dir: 1 | -1): number {
  const sizes = FONT_SIZES as readonly number[]
  if (dir > 0) {
    const next = sizes.find((s) => s > current)
    return clampFontSize(next ?? current + 8)
  }
  const prev = [...sizes].reverse().find((s) => s < current)
  return clampFontSize(prev ?? current - 1)
}

export const MIN_LINE_HEIGHT = 0.8
export const MAX_LINE_HEIGHT = 3

export function clampLineHeight(n: number): number {
  if (!Number.isFinite(n)) return 1.55
  return Math.round(Math.min(MAX_LINE_HEIGHT, Math.max(MIN_LINE_HEIGHT, n)) * 100) / 100
}

export function clampLetterSpacing(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.round(Math.min(50, Math.max(-10, n)))
}

// Only the properties the note actually sets, so a note that has never been
// formatted inherits everything from its style exactly as before.
export function textFormatStyle(f: NoteTextFormat): React.CSSProperties {
  const style: React.CSSProperties = {}
  if (f.fontSize !== undefined) style.fontSize = clampFontSize(f.fontSize)
  if (f.align !== undefined) style.textAlign = f.align
  if (f.lineHeight !== undefined) style.lineHeight = clampLineHeight(f.lineHeight)
  if (f.letterSpacing !== undefined) style.letterSpacing = `${clampLetterSpacing(f.letterSpacing) / 100}em`
  if (f.bold) style.fontWeight = 700
  if (f.italic) style.fontStyle = 'italic'
  if (f.uppercase) style.textTransform = 'uppercase'
  // One property carries both, so they have to be combined rather than
  // assigned — setting strike after underline would drop the underline.
  const lines = [f.underline ? 'underline' : null, f.strike ? 'line-through' : null].filter(Boolean)
  if (lines.length > 0) style.textDecoration = lines.join(' ')
  return style
}

// True when the note carries any formatting of its own — what the "reset"
// button keys off, so it isn't offered when there is nothing to reset.
export function hasTextFormat(f: NoteTextFormat): boolean {
  return (
    f.fontSize !== undefined ||
    f.align !== undefined ||
    f.valign !== undefined ||
    f.lineHeight !== undefined ||
    f.letterSpacing !== undefined ||
    Boolean(f.bold || f.italic || f.underline || f.strike || f.uppercase)
  )
}

// --- markdown shortcuts in the editor ---------------------------------

export interface WrapResult {
  text: string
  start: number
  end: number
}

// Wrap the selection in a marker, or unwrap it if it is already wrapped —
// so Ctrl+B twice leaves the text as it found it rather than producing
// ****bold****.
//
// With nothing selected it inserts the pair and puts the caret between the
// halves, which is what every editor does and what makes the shortcut
// usable before you have typed the word.
export function toggleWrap(text: string, start: number, end: number, marker: string): WrapResult {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)
  const n = marker.length

  // Already wrapped, markers inside the selection: **word** selected whole.
  if (selected.length >= n * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(n, -n)
    return { text: before + inner + after, start, end: start + inner.length }
  }

  // Already wrapped, markers outside the selection: **word** with `word`
  // selected. Selecting by double-click gives exactly this, so it has to
  // work or the toggle only ever un-toggles half the time.
  if (before.endsWith(marker) && after.startsWith(marker)) {
    return {
      text: before.slice(0, -n) + selected + after.slice(n),
      start: start - n,
      end: end - n,
    }
  }

  return {
    text: before + marker + selected + marker + after,
    start: start + n,
    end: end + n,
  }
}

// Wrap each selected line in a prefix — lists, quotes, headings. Toggles
// off when every line already has it.
export function togglePrefix(text: string, start: number, end: number, prefix: string): WrapResult {
  const lineStart = text.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndRaw = text.indexOf('\n', end)
  const lineEnd = lineEndRaw === -1 ? text.length : lineEndRaw
  const block = text.slice(lineStart, lineEnd)
  const lines = block.split('\n')
  const allPrefixed = lines.every((l) => l.startsWith(prefix))
  const next = lines
    .map((l) => (allPrefixed ? l.slice(prefix.length) : prefix + l))
    .join('\n')
  const delta = next.length - block.length
  return {
    text: text.slice(0, lineStart) + next + text.slice(lineEnd),
    start: allPrefixed ? Math.max(lineStart, start - prefix.length) : start + prefix.length,
    end: end + delta,
  }
}

// --- which fonts the context menu offers ------------------------------

// The context menu is a short list, not a catalogue: the full set lives in
// the floating bar's dropdown, where there is room for it. Five entries is
// what fits without the menu needing to scroll for the common case.
export const CONTEXT_FONT_COUNT = 5

// Ranked by what this board actually uses, so the five on offer are the
// five you keep reaching for — not five chosen in advance by someone who
// has never seen your notes. Padded from a default list so a fresh board
// still offers a real choice.
export function frequentFonts(
  used: Array<string | undefined>,
  fallback: string[],
  count = CONTEXT_FONT_COUNT,
): string[] {
  const tally = new Map<string, number>()
  for (const f of used) {
    const id = f ?? 'default'
    tally.set(id, (tally.get(id) ?? 0) + 1)
  }
  const ranked = [...tally.entries()]
    .sort((a, b) => b[1] - a[1] || fallback.indexOf(a[0]) - fallback.indexOf(b[0]))
    .map(([id]) => id)
  const out: string[] = []
  for (const id of [...ranked, ...fallback]) {
    if (!out.includes(id)) out.push(id)
    if (out.length === count) break
  }
  return out
}
