import { useEffect, useRef, useState } from 'react'
import type React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import { rehypeNoteHighlight } from '../../../utils/noteHighlight'
import { FileText, AlertCircle } from 'lucide-react'
import type { NotePin as NotePinT } from '../../../api/board'
import { BASE_NOTE_FONT_SIZE, FONT_BY_ID, HUD_STYLES, STYLE_CLASS, readableOn } from './noteStyles'
import { editorShortcut } from '../../../utils/editorShortcuts'
import { bumpReaction, removeReaction, textFormatStyle } from '../../../utils/textFormat'
import { getTextContent, putTextContent } from '../../../api/webdav'
import { useBoardStore } from '../../../store/useBoardStore'
import { usePinActivation } from '../PinShell'
import { NoteDecor } from './NoteDecor'
import { MermaidBlock } from './MermaidBlock'
import { KatexBlock } from './KatexBlock'
import styles from './Pins.module.css'
import shell from '../PinShell.module.css'



// Module-level constants: passing fresh array literals would make
// react-markdown rebuild its processor on every keystroke.
const REMARK_PLUGINS = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [rehypeNoteHighlight] as never[]

const MARKDOWN_COMPONENTS = {
  // Three things arrive as <code>, and only one of them is code.
  //
  // remark-math marks a formula as `code.language-math.math-inline` (or
  // .math-display) with the raw TeX as its text — that is the shape
  // rehype-katex looks for, and the reason the first attempt at this
  // matched on <span> and silently did nothing.
  code({ className, children, ...props }: { className?: string; children?: React.ReactNode }) {
    if (className?.includes('math-display')) {
      return <KatexBlock tex={String(children).trim()} display />
    }
    if (className?.includes('math-inline')) {
      return <KatexBlock tex={String(children).trim()} display={false} />
    }
    if (className?.includes('language-mermaid')) {
      return <MermaidBlock chart={String(children).trimEnd()} />
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    )
  },
  // Links in a note open in a new tab — following one in place would
  // navigate the whole board away.
  a({ href, children }: { href?: string; children?: React.ReactNode }) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
}

// Bottom-left, just inside the note. The row used to hang at bottom:-12px,
// i.e. outside the pin, where .root's overflow:hidden cut every chip in
// half — which is what the chips looked like on screen.
const DEFAULT_REACTIONS_POS = { x: 0.04, y: 0.97 }

// Pointer travel that turns a click on a chip into a drag of the whole row.
const REACTION_DRAG_SLOP = 4

export function NotePin({ pin }: { pin: NotePinT }) {
  const { activated, setActivated } = usePinActivation()
  const updatePin = useBoardStore((s) => s.updatePin)
  const zoom = useBoardStore((s) => s.board?.viewport.zoom ?? 1)
  // True between "this pointer travelled far enough to be a drag" and the
  // click that follows it, so that click can be swallowed.
  const draggedRef = useRef(false)
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

  // Drags the whole reaction row by any one of its chips: no extra handle
  // to find, and a plain click still counts up because the drag only
  // starts after REACTION_DRAG_SLOP pixels of travel.
  //
  // Position is committed to the store once, on release — a write per
  // pointermove would be an undo step and an autosave wake-up per pixel.
  const beginReactionDrag = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return
    const row = e.currentTarget.parentElement as HTMLElement | null
    if (!row) return
    const startX = e.clientX
    const startY = e.clientY
    const from = pin.reactionsPos ?? DEFAULT_REACTIONS_POS
    let moved = false
    let next = from

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      if (!moved && Math.hypot(dx, dy) < REACTION_DRAG_SLOP) return
      moved = true
      draggedRef.current = true
      // Screen pixels -> board units -> fraction of this note's own size,
      // so the row keeps its place when the note is resized or the canvas
      // is zoomed.
      next = {
        x: Math.min(1, Math.max(0, from.x + dx / zoom / pin.w)),
        y: Math.min(1, Math.max(0, from.y + dy / zoom / pin.h)),
      }
      row.style.left = `${next.x * 100}%`
      row.style.top = `${next.y * 100}%`
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      if (moved) updatePin(pin.id, 'reactionsPos', next)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const style = pin.style ?? 'sticky'
  const isHud = HUD_STYLES.has(style)
  // A heads-up panel set in a humanist sans looks like a mistake, so the
  // HUD family defaults to mono — but an explicit choice still wins.
  const font = pin.font ?? (isHud ? 'mono' : 'default')
  // Applied to the rendered markdown and to the textarea alike, so what you
  // type looks like what you get. It has to go on those two elements rather
  // than on the wrapper: .noteBody sets its own font-size, and inheritance
  // would lose to it.
  const textStyle = textFormatStyle(pin)
  const fontDef = FONT_BY_ID.get(font)
  if (fontDef) textStyle.fontFamily = fontDef.css
  // A script face at 16px reads as a footnote beside a grotesque at 16px,
  // so the faces that are drawn small get a nudge — but only until the
  // note is given a size of its own, which must then win outright.
  if (fontDef?.scale && pin.fontSize === undefined) {
    textStyle.fontSize = Math.round(BASE_NOTE_FONT_SIZE * fontDef.scale)
  }

  return (
    <div
      // Decorations measure themselves against this element, and find it by
      // the attribute rather than by walking up a fixed number of parents.
      data-decor-host=""
      className={`${styles.root} ${STYLE_CLASS[style]} ${isHud ? styles.hudBase : ''}`}
      style={{
        background: hexWithOpacity(pin.color, pin.opacity),
        borderRadius: 'var(--radius-md)',
        // Set on the wrapper so the markdown view and the textarea inherit
        // the same colour — they used to disagree, and the editor inherited
        // the app's light text, i.e. white on a yellow sticky note.
        // On the HUD styles the note's colour is the accent (brackets,
        // stripes, indicator), not the text colour — the plate is dark and
        // the text is set light in CSS.
        color: isHud ? pin.color : (pin.textColor ?? readableOn(pin.color)),
      }}
    >
      {/* The HUD styles paint on their own layer rather than on the note,
          so a chamfered plate can't clip what is pinned to its corners. */}
      {isHud && <span className={styles.hudPlate} aria-hidden />}
      {activated ? (
        <textarea
          ref={areaRef}
          className={styles.noteEditor}
          style={textStyle}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              setDraft(pin.text)
              setActivated(false)
              return
            }
            const edit = editorShortcut(e, draft, e.currentTarget.selectionStart, e.currentTarget.selectionEnd)
            if (edit) {
              e.preventDefault()
              setDraft(edit.text)
              // The selection has to be restored after React has written
              // the new value, or the caret jumps to the end.
              const el = e.currentTarget
              requestAnimationFrame(() => el.setSelectionRange(edit.start, edit.end))
            }
          }}
        />
      ) : (
        <div
          className={styles.noteBody}
          data-note-body=""
          data-texture={pin.texture}
          data-valign={pin.valign}
          style={textStyle}
          onDoubleClick={() => setActivated(true)}
        >
          <div className={styles.noteMarkdown}>
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              rehypePlugins={REHYPE_PLUGINS}
              components={MARKDOWN_COMPONENTS}
            >
              {pin.text || '_Пустая заметка_'}
            </ReactMarkdown>
          </div>
        </div>
      )}
      {pin.reactions && pin.reactions.length > 0 && (
        <div
          className={styles.reactions}
          style={{
            left: `${(pin.reactionsPos?.x ?? DEFAULT_REACTIONS_POS.x) * 100}%`,
            top: `${(pin.reactionsPos?.y ?? DEFAULT_REACTIONS_POS.y) * 100}%`,
          }}
        >
          {pin.reactions.map((r) => (
            <button
              key={r.emoji}
              type="button"
              className={styles.reaction}
              title={`${r.emoji} ×${r.count} — клик добавляет, Shift+клик убирает, правый клик снимает совсем`}
              // Must not reach the pin underneath, or every count bumped
              // is also a note dragged a pixel and an editor opened.
              onPointerDown={(e) => {
                e.stopPropagation()
                beginReactionDrag(e)
              }}
              onDoubleClick={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                // A click that was really a drag must not also bump the
                // count — the pointerup that ends a drag still fires one.
                if (draggedRef.current) {
                  draggedRef.current = false
                  return
                }
                // Shift as well as Alt: on Linux the window manager takes
                // Alt+click for itself (it drags the window), so a chip
                // that only listened for Alt could be counted up and never
                // down — which is exactly how one of these reached 15.
                const down = e.altKey || e.shiftKey
                updatePin(pin.id, 'reactions', bumpReaction(pin.reactions, r.emoji, down ? -1 : 1))
              }}
              // Right-click clears the mark outright. Undoing a count of 15
              // one click at a time is not an interaction, it is a chore.
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                updatePin(pin.id, 'reactions', removeReaction(pin.reactions, r.emoji))
              }}
            >
              <span>{r.emoji}</span>
              {r.count > 1 && <span className={styles.reactionCount}>{r.count}</span>}
            </button>
          ))}
        </div>
      )}

      {pin.decor && pin.decor.length > 0 && (
        <NoteDecor pinId={pin.id} items={pin.decor} accent={pin.color} />
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

// Compose the note background: pin color at pin opacity over the board's
// background, so a semi-transparent note still reads as a solid sticker.
function hexWithOpacity(hex: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100))
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}