// The same glyphs the notes wear, drawn plain for the panel's grid — the
// pinned version is offset onto a corner and sometimes mirrored, which is
// wrong for a thumbnail.

import type { DecorKind } from '../../../api/board'
import { DecorGlyph } from './NoteDecor'

export function DecorPreview({ kind }: { kind: DecorKind }) {
  return (
    <span style={{ display: 'block', width: 22, height: 22 }}>
      <DecorGlyph kind={kind} />
    </span>
  )
}
