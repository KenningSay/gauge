// How the formatting bar reaches the editor of the note it is showing.
//
// The bar floats over the board, outside the note, so it cannot be handed
// the editor as a prop. The editor registers itself here when it opens and
// the bar subscribes — it re-renders when an editor appears or goes away,
// and from then on drives it directly through its commands. A type-only
// import of the editor: this file is part of the main bundle, the editor
// itself is not.

import { useRef, useSyncExternalStore } from 'react'
import type { Editor } from '@tiptap/core'

const editors = new Map<string, Editor>()
const listeners = new Set<() => void>()

const emit = () => listeners.forEach((l) => l())
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function registerNoteEditor(pinId: string, editor: Editor): () => void {
  editors.set(pinId, editor)
  emit()
  return () => {
    // Only remove our own entry: a note re-opened quickly registers the new
    // editor before the old effect's cleanup runs.
    if (editors.get(pinId) === editor) {
      editors.delete(pinId)
      emit()
    }
  }
}

export function useNoteEditor(pinId: string): Editor | null {
  return useSyncExternalStore(subscribe, () => editors.get(pinId) ?? null)
}

// A snapshot of whatever the bar needs to read from an editor, kept fresh as
// the editor's selection and content change. Hand-rolled rather than the
// library's own hook so that the main bundle never imports the editor
// library — only this file's types.
//
// `read` is called on every editor transaction; the result is compared
// field by field and the previous object is kept when nothing changed, which
// is what lets the bar skip a render on keystrokes that do not affect it.
export function useEditorSnapshot<T extends object>(editor: Editor | null, read: (ed: Editor) => T | null): T | null {
  const cache = useRef<{ editor: Editor | null; value: T | null; version: number }>({ editor: null, value: null, version: -1 })
  const versionRef = useRef(0)

  const subscribeEditor = (notify: () => void) => {
    if (!editor) return () => {}
    const bump = () => {
      versionRef.current += 1
      notify()
    }
    editor.on('transaction', bump)
    editor.on('selectionUpdate', bump)
    return () => {
      editor.off('transaction', bump)
      editor.off('selectionUpdate', bump)
    }
  }

  const getSnapshot = (): T | null => {
    const c = cache.current
    if (c.editor === editor && c.version === versionRef.current) return c.value
    const next = editor ? read(editor) : null
    const same =
      c.editor === editor &&
      c.value !== null &&
      next !== null &&
      (Object.keys(next) as (keyof T)[]).every((k) => c.value![k] === next[k])
    cache.current = { editor, value: same ? c.value : next, version: versionRef.current }
    return cache.current.value
  }

  return useSyncExternalStore(subscribeEditor, getSnapshot)
}
