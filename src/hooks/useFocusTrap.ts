import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'

// Keeps Tab/Shift+Tab cycling inside the container while `active`, focuses
// the first focusable element on open, and restores focus to whatever had
// it before on close — the three things every modal (Dialog, ContextMenu,
// CommandPalette, ViewerModal) needs and none of them had.
export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  const previouslyFocused = useRef<Element | null>(null)
  const prevActive = useRef(false)

  // Captured during render, not inside the effect below: the modal's own
  // content (e.g. an <input autoFocus>) steals focus as part of the same
  // commit that mounts it, which happens before a plain useEffect runs —
  // by then document.activeElement is already the modal's own input, not
  // whatever the user actually had focused beforehand. This ref-during-
  // render pattern only ever writes on the active-flag's actual transition,
  // so it stays idempotent if React re-invokes render without committing.
  if (active !== prevActive.current) {
    if (active) previouslyFocused.current = document.activeElement
    prevActive.current = active
  }

  useEffect(() => {
    if (!active) return
    const container = ref.current
    const focusables = () => Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])

    const first = focusables()[0]
    ;(first ?? container)?.focus()

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const firstEl = items[0]
      const lastEl = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault()
        lastEl.focus()
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault()
        firstEl.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      const prev = previouslyFocused.current
      if (prev instanceof HTMLElement) prev.focus()
    }
  }, [active])

  return ref
}
