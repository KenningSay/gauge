// The editor a note opens into.
//
// A note's formatting lives in its text as inline tags, and a textarea can
// only show those tags. This is a contenteditable element in which the
// tags are real elements instead — the colour, size and typeface show up as
// you work and nothing like `<span style=…>` is ever visible.
//
// `plaintext-only` rather than a free contenteditable: it keeps the browser
// from inventing markup of its own (pasted rich text, `<div>` per line,
// `<b>` from a shortcut), gives a plain `\n` for Enter, and leaves typing,
// IME composition and undo to the browser, which matters on a phone. The
// stored string is read back from the DOM after every input.

import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { editorShortcut } from '../../../utils/editorShortcuts'
import {
  domPointAtPlain,
  normalizeNote,
  parseNote,
  plainOffsetOf,
  plainToString,
  readFrom,
  renderInto,
  stringToPlain,
  styleAtPlain,
} from '../../../utils/noteEditorDom'
import { registerNoteEditor, type NoteEditorHandle } from './noteEditorRegistry'

interface Props {
  pinId: string
  value: string
  onChange: (text: string) => void
  onEscape: () => void
  onBlur: (e: React.FocusEvent<HTMLDivElement>) => void
  className?: string
  style?: React.CSSProperties
  editorRef?: React.MutableRefObject<HTMLDivElement | null>
}

interface PlainSel {
  start: number
  end: number
}

export function NoteEditor({ pinId, value, onChange, onEscape, onBlur, className, style, editorRef }: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  // The text the DOM currently shows. A prop change that merely echoes our
  // own onChange must not rebuild the DOM, or the caret jumps on every key.
  const written = useRef<string | null>(null)
  const lastSel = useRef<PlainSel>({ start: 0, end: 0 })
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const setRoot = (el: HTMLDivElement | null) => {
    rootRef.current = el
    if (editorRef) editorRef.current = el
  }

  const readSel = (): PlainSel | null => {
    const root = rootRef.current
    const sel = root?.ownerDocument.getSelection()
    if (!root || !sel || sel.rangeCount === 0) return null
    const r = sel.getRangeAt(0)
    if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null
    return {
      start: plainOffsetOf(root, r.startContainer, r.startOffset),
      end: plainOffsetOf(root, r.endContainer, r.endOffset),
    }
  }

  const writeSel = (s: PlainSel) => {
    const root = rootRef.current
    const sel = root?.ownerDocument.getSelection()
    if (!root || !sel) return
    const a = domPointAtPlain(root, s.start)
    const b = domPointAtPlain(root, s.end)
    const range = root.ownerDocument.createRange()
    range.setStart(a.node, a.offset)
    range.setEnd(b.node, b.offset)
    sel.removeAllRanges()
    sel.addRange(range)
    lastSel.current = s
  }

  const handle = useMemo<NoteEditorHandle>(() => {
    const text = () => written.current ?? ''
    const plainSel = () => readSel() ?? lastSel.current
    return {
      getText: text,
      getSelection() {
        const t = text()
        const { marks } = parseNote(t)
        const p = plainSel()
        if (p.start === p.end) {
          const at = plainToString(marks, p.end, 'end')
          return { start: at, end: at }
        }
        return {
          start: plainToString(marks, p.start, 'start'),
          end: plainToString(marks, p.end, 'end'),
        }
      },
      apply(result) {
        const root = rootRef.current
        if (!root) return
        // Selection first, in plain offsets of the text as it was handed
        // over: normalising may add or drop tags, never visible characters.
        const { marks } = parseNote(result.text)
        const sel = {
          start: stringToPlain(marks, result.start),
          end: stringToPlain(marks, result.end),
        }
        const next = normalizeNote(result.text)
        renderInto(root, next)
        written.current = next
        writeSel(sel)
        onChangeRef.current(next)
      },
      styleAtSelection() {
        const p = plainSel()
        const at = p.start === p.end ? Math.max(0, p.start - 1) : p.start
        return styleAtPlain(parseNote(text()).nodes, at)
      },
      focus() {
        rootRef.current?.focus()
      },
    }
    // The helpers only read refs, so one handle serves the whole lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => registerNoteEditor(pinId, handle), [pinId, handle])

  // Content comes from the prop only when it did not come from us.
  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root || value === written.current) return
    renderInto(root, value)
    written.current = value
  }, [value])

  // Keep the last selection the editor had: moving focus to the formatting
  // bar clears it from the document, and the bar still needs to know what
  // was selected.
  useEffect(() => {
    const doc = rootRef.current?.ownerDocument
    if (!doc) return
    const onSel = () => {
      const s = readSel()
      if (s) lastSel.current = s
    }
    doc.addEventListener('selectionchange', onSel)
    return () => doc.removeEventListener('selectionchange', onSel)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onInput = () => {
    const root = rootRef.current
    if (!root) return
    const raw = readFrom(root)
    const next = normalizeNote(raw)
    if (next !== raw) {
      // Enter inside a coloured word, or a deletion that emptied a span:
      // bring the string and the DOM back in line without moving the caret.
      const sel = readSel()
      renderInto(root, next)
      if (sel) writeSel(sel)
    }
    written.current = next
    onChangeRef.current(next)
  }

  return (
    <div
      ref={setRoot}
      className={className}
      style={style}
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      role="textbox"
      aria-multiline="true"
      aria-label="Текст заметки"
      spellCheck={false}
      onInput={onInput}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onEscape()
          return
        }
        const { start, end } = handle.getSelection()
        const edit = editorShortcut(e, handle.getText(), start, end)
        if (edit) {
          e.preventDefault()
          handle.apply(edit)
        }
      }}
    />
  )
}
