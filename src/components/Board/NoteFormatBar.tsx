// The formatting bar that floats above a selected note.
//
// Everything about a note's text that isn't the text itself lives here:
// typeface, size, weight and slant, decoration, case, both alignments,
// leading and tracking. It sits above the note in screen coordinates
// rather than inside the zoomed world layer, so it stays the same size
// whatever the zoom is — a toolbar that shrinks with the board is useless
// at 30%.

import { useEffect, useReducer, useRef, useState } from 'react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Baseline,
  Bold,
  CaseUpper,
  Italic,
  List,
  ListOrdered,
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Scaling,
  Strikethrough,
  Underline,
  Type,
} from 'lucide-react'
import type { NoteFont, NotePin as NotePinT, TextAlign, TextVAlign } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import {
  BASE_NOTE_FONT_SIZE,
  FONT_BY_ID,
  FONT_GROUPS,
  HUD_STYLES,
  NOTE_FONTS,
  readableOn,
} from './pins/noteStyles'
import { applySpanStyle, clearSpans, toggleTag, type SpanAlign, type SpanPatch } from '../../utils/inlineSpans'
import { getNoteEditor } from './pins/noteEditorRegistry'
import {
  clampFontSize,
  toggleWrap,
  clampLetterSpacing,
  clampLineHeight,
  fitFontSize,
  hasTextFormat,
  stepFontSize,
  toggleListPrefix,
} from '../../utils/textFormat'
import styles from './NoteFormatBar.module.css'

interface Props {
  pin: NotePinT
  // The note's box on screen, already through the viewport transform.
  rect: { x: number; y: number; w: number; h: number }
  container: { w: number; h: number }
}

// What the size box shows when the note has never been given a size: the
// value the stylesheet is actually using, so stepping up from it lands
// somewhere sensible instead of jumping to 16 first.
function effectiveSize(pin: NotePinT): number {
  if (pin.fontSize !== undefined) return pin.fontSize
  const scale = pin.font ? FONT_BY_ID.get(pin.font)?.scale : undefined
  return Math.round(BASE_NOTE_FONT_SIZE * (scale ?? 1))
}

const BAR_HEIGHT = 44
const GAP = 10

export function NoteFormatBar({ pin, rect, container }: Props) {
  const updatePin = useBoardStore((s) => s.updatePin)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [dims, setDims] = useState({ w: 0, h: BAR_HEIGHT })
  // The bar defaults to its compact row: the rarer controls (vertical align,
  // spacing, fit-to-box, reset) sit behind this instead of stretching the
  // bar wide enough to cover whatever note happens to be next door.
  const [more, setMore] = useState(false)

  // Closed again on every new note: an expanded panel left open from the
  // last note would otherwise widen the bar before anyone asked for it.
  useEffect(() => setMore(false), [pin.id])

  // Measured rather than assumed: the bar wraps on a narrow canvas, and a
  // guessed size would place it wrongly the moment it did. Watched rather
  // than measured once — its size changes with the "more" row, with the
  // mode label that appears while a note is being edited, and with the
  // width of whatever the font list currently shows.
  useEffect(() => {
    const el = barRef.current
    if (!el) return
    const measure = () => {
      setDims((d) => (d.w === el.offsetWidth && d.h === el.offsetHeight ? d : { w: el.offsetWidth, h: el.offsetHeight }))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const set = (field: string, value: unknown) => updatePin(pin.id, field, value)
  // Clicking the active option again clears it, so there is always a way
  // back to "whatever the style says" without hunting for a reset.
  const toggle = (field: string, value: unknown, current: unknown) =>
    set(field, current === value ? undefined : value)

  const size = effectiveSize(pin)
  const lineHeight = pin.lineHeight ?? 1.55
  const tracking = pin.letterSpacing ?? 0
  const noteFont = pin.font ?? (HUD_STYLES.has(pin.style ?? 'sticky') ? 'mono' : 'default')

  // Above the note by preference; below it when the note is near the top
  // edge, so the bar can never end up off-screen where it can't be used.
  const barHeight = dims.h || BAR_HEIGHT
  const above = rect.y - barHeight - GAP >= 0
  const top = above ? rect.y - barHeight - GAP : Math.min(rect.y + rect.h + GAP, container.h - barHeight - 4)
  const half = (dims.w || 320) / 2
  const left = Math.min(Math.max(rect.x + rect.w / 2, half + 8), Math.max(half + 8, container.w - half - 8))

  // Grow the text until it would overflow, then step back one. Measured on
  // the real element rather than on a clone: a clone would have to
  // reproduce the note's padding, its style's own padding overrides, the
  // font that may still be loading and the markdown inside it — and would
  // get one of them wrong. The element is put back the way it was either
  // way, and the committed value is what re-renders it.
  const fitToBox = () => {
    const body = document.querySelector<HTMLElement>(
      `[data-pin-id="${pin.id}"] [data-note-body]`,
    )
    if (!body) return
    const previous = body.style.fontSize
    const best = fitFontSize((px) => {
      body.style.fontSize = `${px}px`
      // One pixel of slack: sub-pixel rounding otherwise reports a box that
      // fits exactly as overflowing, and the answer comes out one step small.
      return body.scrollHeight <= body.clientHeight + 1 && body.scrollWidth <= body.clientWidth + 1
    })
    body.style.fontSize = previous
    set('fontSize', best)
  }

  // Bullet and numbered lists existed only as an editor keyboard shortcut
  // (Ctrl+Shift+8 / Ctrl+Shift+7) — a real feature nobody could find, same
  // problem text colour had before it got a button. Prefixes the current
  // line/selection while actively editing, via the same togglePrefix the
  // shortcut uses; with the note only selected (not open for editing),
  // there is no caret to work from, so it applies to the whole text.
  const applyListPrefix = (kind: 'bullet' | 'numbered') => {
    const ed = getNoteEditor(pin.id)
    if (ed) {
      const { start, end } = ed.getSelection()
      ed.apply(toggleListPrefix(ed.getText(), start, end, kind))
      ed.focus()
      return
    }
    const result = toggleListPrefix(pin.text, 0, pin.text.length, kind)
    set('text', result.text)
  }

  // --- two modes: a selected fragment, or the whole note ----------------
  //
  // While the note is open for editing and part of its text is selected,
  // every control here changes that fragment and nothing else. With no
  // selection — or with the note merely selected on the board — the same
  // controls change the note as a whole, exactly as they always did. The
  // bar says which of the two it is doing, and reads what it shows (the
  // active alignment, the size, the colour) from the selection, so a button
  // never claims a state the selected words do not have.
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    let raf = 0
    const onSel = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(refresh)
    }
    document.addEventListener('selectionchange', onSel)
    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('selectionchange', onSel)
    }
  }, [])

  const editor = getNoteEditor(pin.id)
  const sel = editor?.getSelection()
  const frag = Boolean(editor && sel && sel.start !== sel.end)
  const atSel = frag && editor ? editor.styleAtSelection() : null
  const fragStyle = (atSel?.style ?? {}) as {
    color?: string
    size?: number
    font?: string
    align?: SpanAlign
    lineHeight?: number
    tracking?: number
    upper?: boolean
  }

  // What the controls show: the selection's own value when a fragment is
  // selected, falling back to the note's, so nothing reads as blank.
  const shownFont = frag ? (fragStyle.font ?? noteFont) : noteFont
  const shownSize = frag ? (fragStyle.size ?? size) : size
  const shownLineHeight = frag ? (fragStyle.lineHeight ?? lineHeight) : lineHeight
  const shownTracking = frag ? (fragStyle.tracking ?? tracking) : tracking
  const shownAlign = frag ? fragStyle.align : pin.align
  const shownColor = frag ? (fragStyle.color ?? pin.textColor ?? readableOn(pin.color)) : (pin.textColor ?? readableOn(pin.color))

  // Returns true when the change went to the fragment.
  const styleSelection = (patch: SpanPatch): boolean => {
    if (!editor) return false
    const { start, end } = editor.getSelection()
    if (start === end) return false
    editor.apply(applySpanStyle(editor.getText(), start, end, patch))
    return true
  }

  const clearSelection = () => {
    if (!editor) return
    const { start, end } = editor.getSelection()
    if (start === end) return
    editor.apply(clearSpans(editor.getText(), start, end))
  }

  const MARKS: Record<'bold' | 'italic' | 'underline' | 'strike', [string, string]> = {
    bold: ['**', '**'],
    italic: ['_', '_'],
    underline: ['<u>', '</u>'],
    strike: ['~~', '~~'],
  }

  const markActive = (field: 'bold' | 'italic' | 'underline' | 'strike'): boolean => {
    if (!frag || !editor || !sel) return Boolean(pin[field])
    if (field === 'underline') return Boolean(atSel?.underline)
    const [open, close] = MARKS[field]
    const t = editor.getText()
    const picked = t.slice(sel.start, sel.end)
    return (
      (picked.startsWith(open) && picked.endsWith(close) && picked.length >= open.length + close.length) ||
      (t.slice(0, sel.start).endsWith(open) && t.slice(sel.end).startsWith(close))
    )
  }

  const applyMark = (field: 'bold' | 'italic' | 'underline' | 'strike') => {
    if (!frag || !editor || !sel) {
      set(field, pin[field] ? undefined : true)
      return
    }
    const [open, close] = MARKS[field]
    const t = editor.getText()
    editor.apply(
      open === close ? toggleWrap(t, sel.start, sel.end, open) : toggleTag(t, sel.start, sel.end, open, close),
    )
  }

  const toggleUpper = () => {
    if (frag) styleSelection({ upper: fragStyle.upper ? false : true })
    else set('uppercase', pin.uppercase ? undefined : true)
  }

  const alignBtn = (value: TextAlign, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${shownAlign === value ? styles.on : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={shownAlign === value}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        if (frag) styleSelection({ align: fragStyle.align === value ? null : value })
        else toggle('align', value, pin.align)
      }}
    >
      {icon}
    </button>
  )

  const valignBtn = (value: TextVAlign, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${!frag && pin.valign === value ? styles.on : ''}`}
      title={frag ? `${label} — только для всей заметки` : label}
      aria-label={label}
      aria-pressed={!frag && pin.valign === value}
      disabled={frag}
      onClick={() => toggle('valign', value, pin.valign)}
    >
      {icon}
    </button>
  )

  const markBtn = (field: 'bold' | 'italic' | 'underline' | 'strike' | 'uppercase', icon: React.ReactNode, label: string) => {
    const active = field === 'uppercase' ? (frag ? Boolean(fragStyle.upper) : Boolean(pin.uppercase)) : markActive(field)
    return (
    <button
      type="button"
      className={`${styles.btn} ${active ? styles.on : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      // mousedown must not blur the editor, or the selection is gone
      // before the click lands (same reason as the list buttons below).
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => (field === 'uppercase' ? toggleUpper() : applyMark(field))}
    >
      {icon}
    </button>
    )
  }

  return (
    <div
      ref={barRef}
      data-note-format-bar=""
      className={styles.bar}
      style={{ left, top }}
      // The bar lives over the canvas: without this, touching it starts a
      // marquee or deselects the very note being formatted.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className={styles.row}>
        {/* Only while the note is open for editing: otherwise there is no
            selection to speak of and the bar is plainly about the card. */}
        {editor && (
          <span className={`${styles.mode} ${frag ? styles.modeFrag : ''}`} aria-live="polite">
            {frag ? 'Выделенное' : 'Вся заметка'}
          </span>
        )}
        <select
          className={styles.select}
          value={shownFont}
          title="Шрифт"
          aria-label="Шрифт"
          style={{ fontFamily: FONT_BY_ID.get(shownFont as NoteFont)?.css }}
          onChange={(e) => {
            const id = e.target.value
            if (styleSelection({ font: id === 'default' ? null : id })) return
            set('font', id === 'default' ? undefined : id)
          }}
        >
          {FONT_GROUPS.map((group) => (
            <optgroup key={group} label={group}>
              {NOTE_FONTS.filter((f) => f.group === group).map((f) => (
                <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className={styles.stepper} title="Размер текста">
          <button
            type="button"
            className={styles.step}
            aria-label="Меньше"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (styleSelection({ size: stepFontSize(shownSize, -1) }) ? undefined : set('fontSize', stepFontSize(size, -1)))}
          >
            <Minus size={13} />
          </button>
          <input
            className={styles.num}
            type="number"
            min={8}
            max={200}
            value={shownSize}
            aria-label="Размер текста"
            onChange={(e) => {
              const px = clampFontSize(Number(e.target.value))
              if (!styleSelection({ size: px })) set('fontSize', px)
            }}
          />
          <button
            type="button"
            className={styles.step}
            aria-label="Больше"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => (styleSelection({ size: stepFontSize(shownSize, 1) }) ? undefined : set('fontSize', stepFontSize(size, 1)))}
          >
            <Plus size={13} />
          </button>
        </div>

        <div className={styles.sep} />

        {/* Text colour. It was only ever in the context menu's colour
            submenu, three levels in, which is why it read as "you still
            can't colour the text" — the feature existed, nothing pointed at
            it. Right-click puts it back to automatic. Kept in the primary
            row for the same reason: buried again is buried again. */}
        <label
          className={styles.colorBtn}
          title="Цвет текста (правый клик — автоматически)"
          onContextMenu={(e) => {
            e.preventDefault()
            if (styleSelection({ color: null })) return
            set('textColor', undefined)
          }}
        >
          <Baseline size={15} />
          <span
            className={styles.colorSwatch}
            style={{ background: shownColor }}
          />
          <input
            className={styles.colorInput}
            type="color"
            aria-label="Цвет текста"
            value={shownColor}
            onChange={(e) => {
              if (!styleSelection({ color: e.target.value })) set('textColor', e.target.value)
            }}
          />
        </label>

        <div className={styles.sep} />

        {markBtn('bold', <Bold size={15} />, 'Жирный')}
        {markBtn('italic', <Italic size={15} />, 'Курсив')}
        {markBtn('underline', <Underline size={15} />, 'Подчёркнутый')}

        <div className={styles.sep} />

        {alignBtn('left', <AlignLeft size={15} />, 'По левому краю')}
        {alignBtn('center', <AlignCenter size={15} />, 'По центру')}
        {alignBtn('right', <AlignRight size={15} />, 'По правому краю')}

        <div className={styles.sep} />

        {/* mousedown must not blur the textarea: a blur commits the draft
            and closes the editor before this button's click ever runs,
            so applyListPrefix would find no textarea (or a stale one) to
            work with — the same trick every rich-text toolbar uses to
            keep the caret/selection alive across a toolbar click. */}
        <button
          type="button"
          className={styles.btn}
          title="Маркированный список"
          aria-label="Маркированный список"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyListPrefix('bullet')}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={styles.btn}
          title="Нумерованный список"
          aria-label="Нумерованный список"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyListPrefix('numbered')}
        >
          <ListOrdered size={15} />
        </button>

        <div className={styles.sep} />

        <button
          type="button"
          className={`${styles.btn} ${more ? styles.on : ''}`}
          title={more ? 'Скрыть остальные настройки' : 'Ещё настройки'}
          aria-label={more ? 'Скрыть остальные настройки' : 'Ещё настройки'}
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
        >
          <MoreHorizontal size={15} />
        </button>
      </div>

      {/* Everything reached for occasionally rather than constantly: strike
          and uppercase, justify, vertical align, spacing, fit-to-box, reset.
          Behind one toggle instead of stretched across the top, so the bar
          over a small note stays roughly the note's own width instead of
          six times it. */}
      {more && (
        <div className={styles.row}>
          {markBtn('strike', <Strikethrough size={15} />, 'Зачёркнутый')}
          {markBtn('uppercase', <CaseUpper size={15} />, 'ЗАГЛАВНЫМИ')}

          <div className={styles.sep} />

          {alignBtn('justify', <AlignJustify size={15} />, 'По ширине')}
          {valignBtn('top', <AlignVerticalJustifyStart size={15} />, 'Прижать вверх')}
          {valignBtn('middle', <AlignVerticalJustifyCenter size={15} />, 'По центру по высоте')}
          {valignBtn('bottom', <AlignVerticalJustifyEnd size={15} />, 'Прижать вниз')}

          <div className={styles.sep} />

          <div className={styles.stepper} title="Межстрочный интервал">
            <span className={styles.stepIcon}><Baseline size={14} /></span>
            <input
              className={styles.num}
              type="number"
              step={0.05}
              min={0.8}
              max={3}
              value={shownLineHeight}
              aria-label="Межстрочный интервал"
              onChange={(e) => {
                const v = clampLineHeight(Number(e.target.value))
                if (!styleSelection({ lineHeight: v })) set('lineHeight', v)
              }}
            />
          </div>

          <div className={styles.stepper} title="Межбуквенный интервал, сотые em">
            <span className={styles.stepIcon}><Type size={14} /></span>
            <input
              className={styles.num}
              type="number"
              step={1}
              min={-10}
              max={50}
              value={shownTracking}
              aria-label="Межбуквенный интервал"
              onChange={(e) => {
                const v = clampLetterSpacing(Number(e.target.value))
                if (!styleSelection({ tracking: v })) set('letterSpacing', v)
              }}
            />
          </div>

          <button
            type="button"
            className={styles.btn}
            title={frag ? 'Подогнать размер под рамку — только для всей заметки' : 'Подогнать размер под рамку'}
            aria-label="Подогнать размер под рамку"
            disabled={frag}
            onClick={fitToBox}
          >
            <Scaling size={15} />
          </button>

          {(frag || hasTextFormat(pin)) && (
            <>
              <div className={styles.sep} />
              <button
                type="button"
                className={styles.btn}
                title={frag ? 'Убрать оформление у выделенного' : 'Сбросить форматирование заметки'}
                aria-label={frag ? 'Убрать оформление у выделенного' : 'Сбросить форматирование заметки'}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (frag) {
                    clearSelection()
                    return
                  }
                  for (const f of [
                    'fontSize',
                    'align',
                    'valign',
                    'lineHeight',
                    'letterSpacing',
                    'bold',
                    'italic',
                    'underline',
                    'strike',
                    'uppercase',
                  ]) {
                    set(f, undefined)
                  }
                }}
              >
                <RotateCcw size={15} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
