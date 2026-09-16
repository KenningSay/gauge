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
    if (draft !== pin.text) updatePin(pin.id, 'text', draft)
    setActivated(false)
  }

  return (
    <div
      className={styles.root}
      style={{
        background: hexWithOpacity(pin.color, pin.opacity),
        borderRadius: 'var(--radius-md)',
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

// Compose the note background: pin color at pin opacity over the board's
// background, so a semi-transparent note still reads as a solid sticker.
function hexWithOpacity(hex: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100))
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}