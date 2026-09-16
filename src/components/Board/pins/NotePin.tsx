import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { FileText, AlertCircle } from 'lucide-react'
import type { NotePin as NotePinT, NoteStyle } from '../../../api/board'
import { getTextContent, putTextContent } from '../../../api/webdav'
import { useBoardStore } from '../../../store/useBoardStore'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'
import shell from '../PinShell.module.css'

// Notes written before styles existed have no `style` and looked like a
// sticky, so that's what absent means.
const STYLE_CLASS: Record<NoteStyle, string> = {
  sticky: styles.styleSticky,
  paper: styles.stylePaper,
  torn: styles.styleTorn,
  lined: styles.styleLined,
  spiral: styles.styleSpiral,
  spiralSide: styles.styleSpiralSide,
  clip: styles.styleClip,
  clipboard: styles.styleClipboard,
  tape: styles.styleTape,
  tapeCorners: styles.styleTapeCorners,
  card: styles.styleCard,
  folder: styles.styleFolder,
  ribbon: styles.styleRibbon,
  banner: styles.styleBanner,
  numbered: styles.styleNumbered,
  doubleFrame: styles.styleDoubleFrame,
  dashed: styles.styleDashed,
  bolted: styles.styleBolted,
  bubble: styles.styleBubble,
  tag: styles.styleTag,
  capsule: styles.styleCapsule,
}

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
    if (!activated) return
    const el = areaRef.current
    if (!el) return
    el.focus()
    // Caret at the end, not the start: the editor is often opened by
    // typing a first character, and the rest of the word has to follow it.
    el.setSelectionRange(el.value.length, el.value.length)
  }, [activated])

  // --- linked vault file ---------------------------------------------
  // A note with a sourcePath is a view onto a real file: the board file
  // keeps the last known text as a cache so the pin renders instantly, but
  // the file wins on load and receives every edit.
  const [linkError, setLinkError] = useState<string | null>(null)

  useEffect(() => {
    if (!pin.sourcePath) return
    let cancelled = false
    void (async () => {
      try {
        const fresh = await getTextContent(pin.sourcePath!)
        if (cancelled) return
        setLinkError(null)
        // Only touch the board when the file actually differs, or every
        // board open would mark the board dirty and trigger a save.
        if (fresh !== pin.text) {
          updatePin(pin.id, 'text', fresh)
          setDraft(fresh)
        }
      } catch (e) {
        if (!cancelled) setLinkError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
    // Deliberately keyed on the path alone: re-reading on every text change
    // would fight the user's own typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin.sourcePath, pin.id])

  const commit = () => {
    const next = draftRef.current
    if (next !== pin.text) {
      updatePin(pin.id, 'text', next)
      if (pin.sourcePath) {
        void putTextContent(pin.sourcePath, next).catch((e) =>
          setLinkError(e instanceof Error ? e.message : String(e)),
        )
      }
    }
    setActivated(false)
  }

  // Editing ends in more ways than a blur: clicking the canvas deactivates
  // the pin, which unmounts the textarea before any blur fires, and an
  // undo or a navigation can take it away entirely. Both used to throw the
  // draft away silently. The ref is what makes this safe to run from a
  // cleanup, where the closed-over `draft` would be a stale render's copy.
  const commitRef = useRef(() => {})
  commitRef.current = () => {
    const next = draftRef.current
    if (next === pin.text) return
    updatePin(pin.id, 'text', next)
    if (pin.sourcePath) {
      void putTextContent(pin.sourcePath, next).catch((e) =>
        setLinkError(e instanceof Error ? e.message : String(e)),
      )
    }
  }

  useEffect(() => {
    if (!activated) return
    return () => commitRef.current()
  }, [activated])

  return (
    <div
      className={`${styles.root} ${STYLE_CLASS[pin.style ?? 'sticky']}`}
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
      {pin.sourcePath && (
        <div
          className={`${styles.noteSource} ${linkError ? styles.noteSourceError : ''}`}
          title={linkError ? `Файл недоступен: ${linkError}` : `Связана с ${pin.sourcePath}`}
        >
          {linkError ? <AlertCircle size={11} /> : <FileText size={11} />}
          <span>{pin.sourcePath.split('/').pop()}</span>
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