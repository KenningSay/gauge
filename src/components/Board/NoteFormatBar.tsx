// The formatting bar that floats above a selected note.
//
// Everything about a note's text that isn't the text itself lives here:
// typeface, size, weight and slant, decoration, case, both alignments,
// leading and tracking. It sits above the note in screen coordinates
// rather than inside the zoomed world layer, so it stays the same size
// whatever the zoom is — a toolbar that shrinks with the board is useless
// at 30%.
//
// Two modes, and the bar says which. While the note is open for editing and
// part of its text is selected, every control changes that selection and
// nothing else. With no selection — or with the note merely selected on the
// board — the same controls change the note as a whole.
//
// The pattern for talking to the editor is the one its own documentation
// gives: a button never takes focus (mousedown is cancelled), and a command
// is `editor.chain().focus().…run()`. Focus staying in the editor is what
// keeps the selection alive across clicks, so a size can be stepped up five
// times without selecting the word again.

import { useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/core'
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
import { useEditorSnapshot, useNoteEditor } from './editor/noteEditorRegistry'
import {
  clampFontSize,
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

// What the bar needs to know about the selection, read through the editor's
// own subscription so the bar re-renders on selection changes and not on
// every keystroke elsewhere.
interface EditorView {
  frag: boolean
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  upper: boolean
  color: string | null
  fontSize: number | null
  fontId: string | null
  tracking: number | null
  align: string | null
  lineHeight: number | null
  inTaskList: boolean
}

function readEditor(ed: Editor): EditorView {
  const ts = ed.getAttributes('textStyle') as Record<string, unknown>
  const block = ed.getAttributes(ed.isActive('heading') ? 'heading' : 'paragraph') as Record<string, unknown>
  const px = typeof ts.fontSize === 'string' ? parseInt(ts.fontSize, 10) : NaN
  return {
    frag: !ed.state.selection.empty,
    bold: ed.isActive('bold'),
    italic: ed.isActive('italic'),
    underline: ed.isActive('underline'),
    strike: ed.isActive('strike'),
    upper: Boolean(ts.upper),
    color: typeof ts.color === 'string' && ts.color ? ts.color : null,
    fontSize: Number.isFinite(px) ? px : null,
    fontId: typeof ts.fontId === 'string' ? ts.fontId : null,
    tracking: typeof ts.letterSpacing === 'number' ? ts.letterSpacing : null,
    align: typeof block.textAlign === 'string' ? block.textAlign : null,
    lineHeight: typeof block.lineHeight === 'number' ? block.lineHeight : null,
    // Alignment inside a task list does not survive being written back to
    // markdown, so it is not offered there.
    inTaskList: ed.isActive('taskList'),
  }
}

// A number box that can be typed into. The old one applied every keystroke as
// it came: typing "24" first produced "2", which was clamped to the minimum 8
// and written back into the box, so the next key made it "84". The box now
// keeps what is typed as text and applies it when it is committed — Enter or
// leaving the box — while the arrow keys and the browser's spinner, which
// change the value in one step, apply immediately.
function NumberField({
  value,
  onCommit,
  onDone,
  className,
  ariaLabel,
  min,
  max,
  step,
  disabled,
}: {
  value: number
  // `step` is true for an arrow key or the spinner: one nudge in a row of them,
  // which must leave focus where it is so the next one lands.
  onCommit: (n: number, step: boolean) => void
  // Called after Enter or Escape, to hand focus back to the editor.
  onDone: () => void
  className: string
  ariaLabel: string
  min: number
  max: number
  step?: number
  disabled?: boolean
}) {
  const [text, setText] = useState<string | null>(null)
  const shown = text ?? String(value)

  const commit = () => {
    if (text === null) return
    const n = Number(text)
    setText(null)
    if (text.trim() !== '' && Number.isFinite(n)) onCommit(n, false)
  }

  return (
    <input
      className={className}
      type="number"
      min={min}
      max={max}
      step={step}
      value={shown}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={(e) => {
        const native = e.nativeEvent as InputEvent
        // Typing and deleting are held until commit; the spinner and the
        // arrow keys carry no inputType and are one deliberate step.
        if (native.inputType) setText(e.target.value)
        else {
          setText(null)
          const n = Number(e.target.value)
          if (Number.isFinite(n)) onCommit(n, true)
        }
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
          onDone()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setText(null)
          onDone()
        }
      }}
    />
  )
}

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

  // Measured rather than assumed, and watched rather than measured once:
  // the bar wraps on a narrow canvas, and its size changes with the "more"
  // row, with the mode label that appears while a note is being edited and
  // with the width of whatever the font list currently shows.
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

  const editor = useNoteEditor(pin.id)
  // The note is open but has no visual editor: either it is still loading or
  // it was opened as plain text. Controls that edit the text itself have
  // nothing to work on then, and writing to the stored text would be undone by
  // the draft the text box is showing.
  const editing = useBoardStore((s) => s.activePinId === pin.id)
  const textBusy = editing && !editor
  const backToEditor = () => editor?.commands.focus()
  const view = useEditorSnapshot(editor, readEditor)
  // A fragment is being edited: the editor is open and something is selected.
  const frag = Boolean(editor && view?.frag)

  const set = (field: string, value: unknown) => updatePin(pin.id, field, value)
  // Clicking the active option again clears it, so there is always a way
  // back to "whatever the style says" without hunting for a reset.
  const toggle = (field: string, value: unknown, current: unknown) =>
    set(field, current === value ? undefined : value)

  const size = effectiveSize(pin)
  const lineHeight = pin.lineHeight ?? 1.55
  const tracking = pin.letterSpacing ?? 0
  const noteFont = pin.font ?? (HUD_STYLES.has(pin.style ?? 'sticky') ? 'mono' : 'default')
  const noteColor = pin.textColor ?? readableOn(pin.color)

  // What the controls show: the selection's own value when a fragment is
  // selected, falling back to the note's, so nothing reads as blank.
  const shownFont = frag ? (view?.fontId ?? noteFont) : noteFont
  const shownSize = frag ? (view?.fontSize ?? size) : size
  const shownColor = frag ? (view?.color ?? noteColor) : noteColor
  const shownLineHeight = frag ? (view?.lineHeight ?? lineHeight) : lineHeight
  const shownTracking = frag ? (view?.tracking ?? tracking) : tracking
  const shownAlign = frag ? view?.align : pin.align
  const blockOk = !(frag && view?.inTaskList)

  // Above the note by preference; below it when the note is near the top
  // edge, so the bar can never end up off-screen where it can't be used.
  const barHeight = dims.h || BAR_HEIGHT
  const above = rect.y - barHeight - GAP >= 0
  const top = above ? rect.y - barHeight - GAP : Math.min(rect.y + rect.h + GAP, container.h - barHeight - 4)
  const half = (dims.w || 320) / 2
  const left = Math.min(Math.max(rect.x + rect.w / 2, half + 8), Math.max(half + 8, container.w - half - 8))

  // Every editor command starts here. `focus()` puts the caret back where it
  // was; a button that never took focus loses nothing by it.
  const run = () => editor!.chain().focus()

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

  // Lists work on the block the caret is in, whether or not anything is
  // selected; with the note only selected on the board (no editor), there is
  // no caret, so the whole text gets the prefix.
  const applyList = (kind: 'bullet' | 'numbered') => {
    if (textBusy) return
    if (editor) {
      if (kind === 'bullet') run().toggleBulletList().run()
      else run().toggleOrderedList().run()
      return
    }
    set('text', toggleListPrefix(pin.text, 0, pin.text.length, kind).text)
  }

  const applyFont = (id: string) => {
    if (frag) run().setMark('textStyle', { fontId: id === 'default' ? null : id }).removeEmptyTextStyle().run()
    else set('font', id === 'default' ? undefined : id)
  }

  // Commands from a step keep focus where it is; the rest return it to the editor.
  const chain = (step: boolean) => (step ? editor!.chain() : run())

  const applySize = (px: number, step = false) => {
    const v = clampFontSize(px)
    if (frag) chain(step).setFontSize(`${v}px`).run()
    else set('fontSize', v)
  }

  const applyColor = (hex: string | null) => {
    if (frag) {
      if (hex) run().setColor(hex).run()
      else run().unsetColor().removeEmptyTextStyle().run()
    } else set('textColor', hex ?? undefined)
  }

  const applyAlign = (value: TextAlign) => {
    if (frag) {
      if (view?.align === value) run().unsetTextAlign().run()
      else run().setTextAlign(value).run()
    } else toggle('align', value, pin.align)
  }

  const applyLineHeight = (value: number, step = false) => {
    const v = clampLineHeight(value)
    if (frag) chain(step).updateAttributes('paragraph', { lineHeight: v }).updateAttributes('heading', { lineHeight: v }).run()
    else set('lineHeight', v)
  }

  const applyTracking = (value: number, step = false) => {
    const v = clampLetterSpacing(value)
    if (frag) chain(step).setMark('textStyle', { letterSpacing: v === 0 ? null : v }).removeEmptyTextStyle().run()
    else set('letterSpacing', v)
  }

  const applyMark = (field: 'bold' | 'italic' | 'underline' | 'strike' | 'uppercase') => {
    if (!frag) {
      set(field, pin[field] ? undefined : true)
      return
    }
    if (field === 'bold') run().toggleBold().run()
    else if (field === 'italic') run().toggleItalic().run()
    else if (field === 'underline') run().toggleUnderline().run()
    else if (field === 'strike') run().toggleStrike().run()
    else run().setMark('textStyle', { upper: view?.upper ? null : true }).removeEmptyTextStyle().run()
  }

  const markActive = (field: 'bold' | 'italic' | 'underline' | 'strike' | 'uppercase'): boolean => {
    if (!frag) return Boolean(pin[field])
    if (field === 'uppercase') return Boolean(view?.upper)
    return Boolean(view?.[field])
  }

  const resetFormatting = () => {
    if (frag) {
      run()
        .unsetMark('textStyle')
        .unsetMark('underline')
        .unsetMark('bold')
        .unsetMark('italic')
        .unsetMark('strike')
        .unsetTextAlign()
        .run()
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
  }

  // A button that must never take focus from the editor.
  const noFocus = (e: React.MouseEvent) => e.preventDefault()

  const alignBtn = (value: TextAlign, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${shownAlign === value ? styles.on : ''}`}
      title={blockOk ? label : `${label} — не работает внутри списка задач`}
      aria-label={label}
      aria-pressed={shownAlign === value}
      disabled={!blockOk}
      onMouseDown={noFocus}
      onClick={() => applyAlign(value)}
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
      onMouseDown={noFocus}
      onClick={() => toggle('valign', value, pin.valign)}
    >
      {icon}
    </button>
  )

  const markBtn = (field: 'bold' | 'italic' | 'underline' | 'strike' | 'uppercase', icon: React.ReactNode, label: string) => {
    const active = markActive(field)
    return (
      <button
        type="button"
        className={`${styles.btn} ${active ? styles.on : ''}`}
        title={label}
        aria-label={label}
        aria-pressed={active}
        onMouseDown={noFocus}
        onClick={() => applyMark(field)}
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
      // A press on the bar's padding, a separator or a label is not on a
      // focusable element, so the browser moves focus to the nearest one that
      // is — the board — and the editor closes with the selection. Only the
      // fields need to take focus.
      onMouseDown={(e) => {
        const t = e.target as HTMLElement
        if (!t.closest('input, select')) e.preventDefault()
      }}
      // Escape in one of the bar's own fields hands focus back to the editor.
      onKeyDown={(e) => {
        if (e.key === 'Escape' && (e.target as HTMLElement).closest('input, select')) {
          e.preventDefault()
          e.stopPropagation()
          backToEditor()
        }
      }}
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
          onChange={(e) => applyFont(e.target.value)}
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
            onMouseDown={noFocus}
            onClick={() => applySize(stepFontSize(shownSize, -1))}
          >
            <Minus size={13} />
          </button>
          <NumberField
            className={styles.num}
            min={8}
            max={200}
            value={shownSize}
            ariaLabel="Размер текста"
            onCommit={applySize}
            onDone={backToEditor}
          />
          <button
            type="button"
            className={styles.step}
            aria-label="Больше"
            onMouseDown={noFocus}
            onClick={() => applySize(stepFontSize(shownSize, 1))}
          >
            <Plus size={13} />
          </button>
        </div>

        <div className={styles.sep} />

        {/* Text colour. It was only ever in the context menu's colour
            submenu, three levels in, which is why it read as "you still
            can't colour the text" — the feature existed, nothing pointed at
            it. Right-click puts it back to automatic. */}
        <label
          className={styles.colorBtn}
          title="Цвет текста (правый клик — автоматически)"
          onContextMenu={(e) => {
            e.preventDefault()
            applyColor(null)
          }}
        >
          <Baseline size={15} />
          <span className={styles.colorSwatch} style={{ background: shownColor }} />
          <input
            className={styles.colorInput}
            type="color"
            aria-label="Цвет текста"
            value={shownColor}
            onChange={(e) => applyColor(e.target.value)}
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

        <button
          type="button"
          className={styles.btn}
          title="Маркированный список"
          aria-label="Маркированный список"
          disabled={textBusy}
          onMouseDown={noFocus}
          onClick={() => applyList('bullet')}
        >
          <List size={15} />
        </button>
        <button
          type="button"
          className={styles.btn}
          title="Нумерованный список"
          aria-label="Нумерованный список"
          disabled={textBusy}
          onMouseDown={noFocus}
          onClick={() => applyList('numbered')}
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
          onMouseDown={noFocus}
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
            <NumberField
              className={styles.num}
              step={0.05}
              min={0.8}
              max={3}
              value={shownLineHeight}
              ariaLabel="Межстрочный интервал"
              disabled={!blockOk}
              onCommit={applyLineHeight}
              onDone={backToEditor}
            />
          </div>

          <div className={styles.stepper} title="Межбуквенный интервал, сотые em">
            <span className={styles.stepIcon}><Type size={14} /></span>
            <NumberField
              className={styles.num}
              step={1}
              min={-10}
              max={50}
              value={shownTracking}
              ariaLabel="Межбуквенный интервал"
              onCommit={applyTracking}
              onDone={backToEditor}
            />
          </div>

          <button
            type="button"
            className={styles.btn}
            title={frag ? 'Подогнать размер под рамку — только для всей заметки' : 'Подогнать размер под рамку'}
            aria-label="Подогнать размер под рамку"
            disabled={frag}
            onMouseDown={noFocus}
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
                onMouseDown={noFocus}
                onClick={resetFormatting}
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
