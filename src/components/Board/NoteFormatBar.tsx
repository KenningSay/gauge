// The formatting bar that floats above a selected note.
//
// Everything about a note's text that isn't the text itself lives here:
// typeface, size, weight and slant, decoration, case, both alignments,
// leading and tracking. It sits above the note in screen coordinates
// rather than inside the zoomed world layer, so it stays the same size
// whatever the zoom is — a toolbar that shrinks with the board is useless
// at 30%.

import { useEffect, useRef, useState } from 'react'
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
  Minus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Scaling,
  Strikethrough,
  Underline,
  Type,
} from 'lucide-react'
import type { NotePin as NotePinT, TextAlign, TextVAlign } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import {
  BASE_NOTE_FONT_SIZE,
  FONT_BY_ID,
  FONT_GROUPS,
  HUD_STYLES,
  NOTE_FONTS,
  readableOn,
} from './pins/noteStyles'
import {
  clampFontSize,
  clampLetterSpacing,
  clampLineHeight,
  fitFontSize,
  hasTextFormat,
  stepFontSize,
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
  // guessed size would place it wrongly the moment it did — including its
  // height, which changes when the "more" row opens or closes.
  useEffect(() => {
    if (barRef.current) {
      setDims({ w: barRef.current.offsetWidth, h: barRef.current.offsetHeight })
    }
  }, [pin.id, pin.font, pin.fontSize, more])

  const set = (field: string, value: unknown) => updatePin(pin.id, field, value)
  // Clicking the active option again clears it, so there is always a way
  // back to "whatever the style says" without hunting for a reset.
  const toggle = (field: string, value: unknown, current: unknown) =>
    set(field, current === value ? undefined : value)

  const size = effectiveSize(pin)
  const lineHeight = pin.lineHeight ?? 1.55
  const tracking = pin.letterSpacing ?? 0
  const font = pin.font ?? (HUD_STYLES.has(pin.style ?? 'sticky') ? 'mono' : 'default')

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

  const alignBtn = (value: TextAlign, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${pin.align === value ? styles.on : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pin.align === value}
      onClick={() => toggle('align', value, pin.align)}
    >
      {icon}
    </button>
  )

  const valignBtn = (value: TextVAlign, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${pin.valign === value ? styles.on : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={pin.valign === value}
      onClick={() => toggle('valign', value, pin.valign)}
    >
      {icon}
    </button>
  )

  const markBtn = (field: 'bold' | 'italic' | 'underline' | 'strike' | 'uppercase', icon: React.ReactNode, label: string) => (
    <button
      type="button"
      className={`${styles.btn} ${pin[field] ? styles.on : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={Boolean(pin[field])}
      onClick={() => set(field, pin[field] ? undefined : true)}
    >
      {icon}
    </button>
  )

  return (
    <div
      ref={barRef}
      className={styles.bar}
      style={{ left, top }}
      // The bar lives over the canvas: without this, touching it starts a
      // marquee or deselects the very note being formatted.
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
    >
      <div className={styles.row}>
        <select
          className={styles.select}
          value={font}
          title="Шрифт"
          aria-label="Шрифт"
          style={{ fontFamily: FONT_BY_ID.get(font)?.css }}
          onChange={(e) => set('font', e.target.value === 'default' ? undefined : e.target.value)}
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
            onClick={() => set('fontSize', stepFontSize(size, -1))}
          >
            <Minus size={13} />
          </button>
          <input
            className={styles.num}
            type="number"
            min={8}
            max={200}
            value={size}
            aria-label="Размер текста"
            onChange={(e) => set('fontSize', clampFontSize(Number(e.target.value)))}
          />
          <button
            type="button"
            className={styles.step}
            aria-label="Больше"
            onClick={() => set('fontSize', stepFontSize(size, 1))}
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
            set('textColor', undefined)
          }}
        >
          <Baseline size={15} />
          <span
            className={styles.colorSwatch}
            style={{ background: pin.textColor ?? readableOn(pin.color) }}
          />
          <input
            className={styles.colorInput}
            type="color"
            aria-label="Цвет текста"
            value={pin.textColor ?? readableOn(pin.color)}
            onChange={(e) => set('textColor', e.target.value)}
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
              value={lineHeight}
              aria-label="Межстрочный интервал"
              onChange={(e) => set('lineHeight', clampLineHeight(Number(e.target.value)))}
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
              value={tracking}
              aria-label="Межбуквенный интервал"
              onChange={(e) => set('letterSpacing', clampLetterSpacing(Number(e.target.value)))}
            />
          </div>

          <button
            type="button"
            className={styles.btn}
            title="Подогнать размер под рамку"
            aria-label="Подогнать размер под рамку"
            onClick={fitToBox}
          >
            <Scaling size={15} />
          </button>

          {hasTextFormat(pin) && (
            <>
              <div className={styles.sep} />
              <button
                type="button"
                className={styles.btn}
                title="Сбросить форматирование"
                aria-label="Сбросить форматирование"
                onClick={() => {
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
