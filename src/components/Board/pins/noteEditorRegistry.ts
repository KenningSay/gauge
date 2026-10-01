// The way the formatting bar reaches the editor of the note it is showing.
//
// The bar floats over the board, outside the note, and used to find the
// editor by querying the DOM for a textarea. The editor is no longer a
// textarea, and what the bar needs from it — the selection, in the units
// the formatting functions work in, and a way to hand back the edited
// text — is not something the DOM can answer anyway.

import type { StyleAt } from '../../../utils/noteEditorDom'
import type { WrapResult } from '../../../utils/textFormat'

export interface NoteEditorHandle {
  // The stored text, tags and all.
  getText(): string
  // Selection as string offsets into getText(). Falls back to the last
  // selection the editor had when it is not the active element — a click on
  // a font list or a colour picker moves focus away from it.
  getSelection(): { start: number; end: number }
  // Replace the text and the selection in one go.
  apply(result: WrapResult): void
  // Formatting of the selected text (or the character before the caret).
  styleAtSelection(): StyleAt
  focus(): void
}

const handles = new Map<string, NoteEditorHandle>()

export function registerNoteEditor(pinId: string, handle: NoteEditorHandle): () => void {
  handles.set(pinId, handle)
  return () => {
    // Only remove our own entry: a note re-opened quickly registers the new
    // handle before the old effect's cleanup runs.
    if (handles.get(pinId) === handle) handles.delete(pinId)
  }
}

export function getNoteEditor(pinId: string): NoteEditorHandle | undefined {
  return handles.get(pinId)
}
