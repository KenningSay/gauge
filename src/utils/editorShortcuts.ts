// The keyboard shortcuts inside a note's editor.
//
// Kept apart from the component so the mapping can be tested without
// mounting a textarea, and so the note editor and any future editor agree
// on what Ctrl+B does.

import { isKey, hasMod } from './keys'
import { toggleWrap, togglePrefix, type WrapResult } from './textFormat'

// Returns the edit to apply, or null when the key isn't one of ours — in
// which case the caller must let the keystroke through untouched.
export function editorShortcut(
  e: React.KeyboardEvent | KeyboardEvent,
  text: string,
  start: number,
  end: number,
): WrapResult | null {
  if (!hasMod(e)) return null
  // Layout-independent: on a russian layout Ctrl+B arrives as "и".
  if (e.shiftKey) {
    // Ctrl+Shift+X is the conventional strikethrough, and the list and
    // quote toggles follow the same shifted family.
    if (isKey(e, 'x')) return toggleWrap(text, start, end, '~~')
    if (isKey(e, '8') || e.code === 'Digit8') return togglePrefix(text, start, end, '- ')
    if (isKey(e, '7') || e.code === 'Digit7') return togglePrefix(text, start, end, '1. ')
    if (isKey(e, 'c')) return togglePrefix(text, start, end, '- [ ] ')
    if (isKey(e, '.') || e.code === 'Period') return togglePrefix(text, start, end, '> ')
    return null
  }
  if (isKey(e, 'b')) return toggleWrap(text, start, end, '**')
  if (isKey(e, 'i')) return toggleWrap(text, start, end, '_')
  if (isKey(e, 'e')) return toggleWrap(text, start, end, '`')
  if (isKey(e, 'k')) {
    // A link needs the caret inside the url, not around the label — the
    // label is usually already selected and the url is what you paste.
    const selected = text.slice(start, end)
    const next = `${text.slice(0, start)}[${selected}]()${text.slice(end)}`
    const caret = start + selected.length + 3
    return { text: next, start: caret, end: caret }
  }
  return null
}
