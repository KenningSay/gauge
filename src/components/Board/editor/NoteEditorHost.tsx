// The editor a note opens into.
//
// A real editor (Tiptap, on ProseMirror) rather than anything hand-built:
// focus, selection, undo, composition input and the mobile keyboard are
// problems that library has spent years on. Bold is bold on the screen, not
// asterisks around the word.
//
// What is stored is still the note's markdown string, so the note reader,
// search, the AI and Obsidian-linked files see exactly what they always
// have. A note the editor would not give back unchanged — a formula, a
// table, raw HTML — is opened as plain text instead (see roundtrip.ts); it
// is never rewritten behind the person's back.
//
// This file is loaded on demand, the first time a note is opened for
// editing: reading a board does not pay for the editor.

import { useEffect, useMemo, useRef } from 'react'
import { Editor, EditorContent, useEditor } from '@tiptap/react'
import { createNoteExtensions } from './noteExtensions'
import { visualEditAllowed } from './roundtrip'
import { registerNoteEditor, safeFocus } from './noteEditorRegistry'
import styles from '../pins/Pins.module.css'

export interface NoteEditorProps {
  pinId: string
  value: string
  // The note is a view onto a vault file, which gets written back as-is.
  linked: boolean
  onChange: (markdown: string) => void
  onEscape: () => void
  // Focus left the editor; `to` is where it went.
  onBlur: (to: HTMLElement | null) => void
  className?: string
  style?: React.CSSProperties
  // The element whose height the note's auto-grow measures.
  domRef: (el: HTMLElement | null) => void
}

// Can the visual editor take this note and give it back unchanged?
function canEditVisually(text: string, linked: boolean): boolean {
  const probe = new Editor({
    extensions: createNoteExtensions(),
    content: text,
    contentType: 'markdown',
  })
  try {
    return visualEditAllowed(text, probe.getMarkdown(), linked)
  } catch {
    return false
  } finally {
    probe.destroy()
  }
}

export default function NoteEditorHost(props: NoteEditorProps) {
  // Decided once, when the note opens: a note must not switch editors under
  // the cursor as it is typed into.
  const visual = useMemo(() => canEditVisually(props.value, props.linked), []) // eslint-disable-line react-hooks/exhaustive-deps
  return visual ? <VisualEditor {...props} /> : <SourceEditor {...props} />
}

function VisualEditor({ pinId, value, onChange, onEscape, onBlur, className, style, domRef }: NoteEditorProps) {
  const extensions = useMemo(() => createNoteExtensions(), [])
  const callbacks = useRef({ onChange, onEscape, onBlur })
  callbacks.current = { onChange, onEscape, onBlur }
  // What this editor last wrote out, so a prop that merely echoes it does
  // not reset the document (and the caret with it).
  const emitted = useRef(value)

  const editor = useEditor({
    extensions,
    content: value,
    contentType: 'markdown',
    // No `autofocus` option: it focuses from inside the library's own startup,
    // which races with the markdown being loaded. See safeFocus.
    editorProps: {
      attributes: {
        class: `${styles.noteMarkdown} ${styles.noteProse}`,
        'aria-label': 'Текст заметки',
        spellcheck: 'false',
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          callbacks.current.onEscape()
          return true
        }
        return false
      },
    },
    onUpdate: ({ editor: ed }) => {
      // No trailing blank lines: the editor keeps an empty paragraph after a
      // list or a rule to type into, which is not part of the note.
      const md = ed.getMarkdown().replace(/\n+$/, '')
      emitted.current = md
      callbacks.current.onChange(md)
    },
    onBlur: ({ event }) => callbacks.current.onBlur((event as FocusEvent).relatedTarget as HTMLElement | null),
  })

  useEffect(() => (editor ? registerNoteEditor(pinId, editor) : undefined), [pinId, editor])

  // Caret at the end, not the start: the editor is often opened by typing a
  // first character, and the rest of the word has to follow it.
  useEffect(() => {
    if (!editor) return
    const id = requestAnimationFrame(() => safeFocus(editor, 'end'))
    return () => cancelAnimationFrame(id)
  }, [editor])

  // The note changed from outside while it was open (a linked file loaded).
  useEffect(() => {
    if (!editor || value === emitted.current) return
    emitted.current = value
    editor.commands.setContent(value, { contentType: 'markdown' })
  }, [editor, value])

  return (
    <div ref={domRef} className={className} style={style}>
      <EditorContent editor={editor} />
    </div>
  )
}

// The plain-text fallback, and the editor for notes the visual one cannot
// hold. Deliberately dumb: what is in the box is what is stored.
function SourceEditor({ value, onChange, onEscape, onBlur, className, style, domRef }: NoteEditorProps) {
  return (
    <div ref={domRef} className={className} style={{ ...style, display: 'flex', flexDirection: 'column' }}>
      <span
        className={styles.sourceBadge}
        title="В заметке есть формулы, таблицы или разметка, которую визуальный редактор не умеет: она открыта как текст, чтобы ничего не потерять."
      >
        Текстовый режим
      </span>
      <textarea
        className={styles.sourceArea}
        value={value}
        autoFocus
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
        onBlur={(e) => onBlur(e.relatedTarget as HTMLElement | null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            onEscape()
          }
        }}
      />
    </div>
  )
}
