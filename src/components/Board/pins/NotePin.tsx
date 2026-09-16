import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { NotePin as NotePinT } from '../../../api/board'
import { useBoardStore } from '../../../store/useBoardStore'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'
import shell from '../PinShell.module.css'

export function NotePin({ pin }: { pin: NotePinT }) {
  const { activated, setActivated } = usePinActivation()
  const updatePin = useBoardStore((s) => s.updatePin)
  const [draft, setDraft] = useState(pin.text)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const areaRef = useRef<HTMLTextAreaElement | null>(null)

  // Sync drafts when the pin's stored text changes from outside (undo,
  // AI "apply", remote save) — but only while the user isn't editing, or
  // we'd clobber their in-progress keystrokes.
  useEffect(() => {
    if (!activated) setDraft(pin.text)
  }, [pin.text, activated])

  useEffect(() => {
    if (activated) areaRef.current?.focus()
  }, [activated])

  const commit = () => {
    if (draftRef.current !== pin.text) updatePin(pin.id, 'text', draftRef.current)
    setActivated(false)
  }

  // Editing ends in more ways than a blur: clicking the canvas deactivates
  // the pin, which unmounts the textarea before any blur fires, and an
  // undo or a navigation can take it away entirely. Both used to throw the
  // draft away silently. The ref is what makes this safe to run from a
  // cleanup, where the closed-over `draft` would be a stale render's copy.
  const commitRef = useRef(() => {})
  commitRef.current = () => {
    if (draftRef.current !== pin.text) updatePin(pin.id, 'text', draftRef.current)
  }

  useEffect(() => {
    if (!activated) return
    return () => commitRef.current()
  }, [activated])

  return (
    <div
      className={styles.root}
      style={{
        background: hexWithOpacity(pin.color, pin.opacity),
        borderRadius: 'var(--radius-md)',
        // Set on the wrapper so the markdown view and the textarea inherit
        // the same colour — they used to disagree, and the editor inherited
        // the app's light text, i.e. white on a yellow sticky note.
        color: pin.textColor ?? readableOn(pin.color),
      }}
    >
      {activated ? (
        <textarea
          ref={areaRef}
          className={styles.noteEditor}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(pin.text)
              setActivated(false)
            }
          }}
        />
      ) : (
        <div
          className={styles.noteBody}
          data-texture={pin.texture}
          onDoubleClick={() => setActivated(true)}
        >
          <div className={styles.noteMarkdown}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{pin.text || '_Пустая заметка_'}</ReactMarkdown>
          </div>
        </div>
      )}
      <span
        className={shell.tongue}
        style={{ display: 'none' }}
        aria-hidden
      />
    </div>
  )
}

// Black or white, whichever reads better on the given background. Uses the
// WCAG relative-luminance formula rather than a naive average: a saturated
// yellow and a saturated blue have very different perceived brightness at
// the same "average" RGB.
export function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.45 ? '#16150f' : '#f4f3ef'
}

// Compose the note background: pin color at pin opacity over the board's
// background, so a semi-transparent note still reads as a solid sticker.
function hexWithOpacity(hex: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100))
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}