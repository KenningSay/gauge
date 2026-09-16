// The template library: every note style, rendered as a real miniature of
// itself rather than a name in a list. Clicking one drops that note on the
// board; clicking one with a note selected restyles that note instead,
// which is what you usually want once something is already there.

import { useMemo } from 'react'
import type { DecorKind, NoteStyle, NoteTexture } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useUiStore } from '../../store/useUiStore'
import { DecorPreview } from './pins/DecorPreview'
import { HUD_STYLES, STYLE_CLASS, hudClass, hudPlateClass, readableOn } from './pins/noteStyles'
import { makeNotePin } from '../../utils/boardPinFactories'
import { MAX_DECOR_PER_NOTE, nextFreeSlot } from '../../utils/decorGeo'
import pins from './pins/Pins.module.css'
import styles from './TemplatePanel.module.css'

// Our own drag type: the canvas accepts a drop only when it sees this, so
// a file dragged in from the OS and a template dragged from the panel can
// never be confused for one another.
export const TEMPLATE_MIME = 'application/x-gauge-note-style'

// Decorations travel under their own type too, so a note style and a
// paperclip can never be mistaken for each other on drop.
export const DECOR_MIME = 'application/x-gauge-decor'

export const DECOR_ITEMS: Array<{ id: DecorKind; label: string; color: string }> = [
  { id: 'clip', label: 'Скрепка', color: '#cbd5e1' },
  { id: 'pushpin', label: 'Кнопка', color: '#f87171' },
  { id: 'star', label: 'Звезда', color: '#fbbf24' },
  { id: 'heart', label: 'Сердце', color: '#fb7185' },
  { id: 'arrow', label: 'Стрелка', color: '#e8eae6' },
  { id: 'chevron', label: 'Шеврон', color: '#2dd4bf' },
  { id: 'bracketCorner', label: 'Уголок', color: '#e8eae6' },
  { id: 'ribbonCorner', label: 'Лента', color: '#f97316' },
  { id: 'barcodeTag', label: 'Бирка', color: '#e8eae6' },
  { id: 'dot', label: 'Индикатор', color: '#4ade80' },
  { id: 'gear', label: 'Шестерня', color: '#cbd5e1' },
  { id: 'target', label: 'Прицел', color: '#2dd4bf' },
  { id: 'lightning', label: 'Молния', color: '#fbbf24' },
  { id: 'dpad', label: 'Крестовина', color: '#e8eae6' },
  { id: 'recycle', label: 'Цикл', color: '#4ade80' },
  { id: 'warnTriangle', label: 'Внимание', color: '#fbbf24' },
  { id: 'hazardStrip', label: 'Разметка', color: '#f97316' },
  { id: 'waveLine', label: 'Сигнал', color: '#2dd4bf' },
  { id: 'segBar', label: 'Шкала', color: '#4ade80' },
  { id: 'screw', label: 'Винт', color: '#a8a6a0' },
  { id: 'circuit', label: 'Дорожка', color: '#4ade80' },
  { id: 'crosshair', label: 'Визир', color: '#e8eae6' },
  { id: 'diamondStack', label: 'Ромбы', color: '#e8eae6' },
  { id: 'wifi', label: 'Сигнал Wi-Fi', color: '#2dd4bf' },
]

// The moving ones, kept in their own list so the panel can offer them as
// their own section — you go looking for "something that moves", not for
// "a circle" and then hope it turns out to spin.
export const ANIMATED_DECOR_ITEMS: Array<{ id: DecorKind; label: string; color: string }> = [
  { id: 'pulseRing', label: 'Пульс', color: '#fbbf24' },
  { id: 'soundWave', label: 'Эквалайзер', color: '#2dd4bf' },
  { id: 'orbit', label: 'Орбита', color: '#fbbf24' },
  { id: 'radar', label: 'Радар', color: '#4ade80' },
  { id: 'spinnerArc', label: 'Загрузка', color: '#e8eae6' },
  { id: 'blinkDot', label: 'Мигалка', color: '#f97316' },
  { id: 'scanBox', label: 'Сканер', color: '#2dd4bf' },
  { id: 'loadDots', label: 'Точки', color: '#e8eae6' },
  { id: 'heartbeat', label: 'Пульсометр', color: '#4ade80' },
  { id: 'gearSpin', label: 'Шестерня', color: '#cbd5e1' },
  { id: 'progressRing', label: 'Прогресс', color: '#fbbf24' },
  { id: 'dataFall', label: 'Поток', color: '#4ade80' },
]

const ALL_DECOR = [...DECOR_ITEMS, ...ANIMATED_DECOR_ITEMS]

export function decorById(id: string): { kind: DecorKind; color: string } | null {
  const found = ALL_DECOR.find((d) => d.id === id)
  return found ? { kind: found.id, color: found.color } : null
}

// Everything the canvas needs to build the dropped note without importing
// the panel's own layout.
export function templateById(id: string): { style: NoteStyle; color: string; texture?: NoteTexture } | null {
  for (const group of GROUPS) {
    const found = group.items.find((i) => i.id === id)
    if (found) return { style: found.id, color: found.color, texture: found.texture }
  }
  return null
}

interface TemplateDef {
  id: NoteStyle
  label: string
  // What the preview says, kept short enough to read at thumbnail size.
  sample: string
  color: string
  texture?: NoteTexture
}

// Grouped the way you'd look for them: plain paper first, then bound pads,
// then things stuck to the board, then the loud graphic ones.
const GROUPS: Array<{ title: string; items: TemplateDef[] }> = [
  {
    title: 'Бумага',
    items: [
      { id: 'sticky', label: 'Стикер', sample: 'Заметка', color: '#fbbf24' },
      { id: 'paper', label: 'Листок', sample: 'Заметка', color: '#f4f1e8' },
      { id: 'torn', label: 'Оторванный', sample: 'Заметка', color: '#f7e9c9' },
      { id: 'lined', label: 'В линейку', sample: 'Заметка', color: '#fdfaf0', texture: 'plain' },
    ],
  },
  {
    title: 'Блокноты',
    items: [
      { id: 'spiral', label: 'Пружина сверху', sample: 'План', color: '#f6e7c1' },
      { id: 'spiralSide', label: 'Пружина сбоку', sample: 'План', color: '#eef3f7' },
      { id: 'clip', label: 'На скрепке', sample: 'Задача', color: '#fde2e4' },
      { id: 'clipboard', label: 'Планшет', sample: 'Чек-лист', color: '#f2efe6' },
    ],
  },
  {
    title: 'Приклеено',
    items: [
      { id: 'tape', label: 'Скотч', sample: 'Идея', color: '#ffe9a8' },
      { id: 'tapeCorners', label: 'Скотч по углам', sample: 'Идея', color: '#d9f2ea' },
      { id: 'tag', label: 'Ярлык', sample: 'Метка', color: '#e7ddff' },
    ],
  },
  {
    title: 'Карточки',
    items: [
      { id: 'card', label: 'Карточка', sample: 'Раздел', color: '#facc15' },
      { id: 'folder', label: 'Папка', sample: 'Коллекция', color: '#86efac' },
      { id: 'doubleFrame', label: 'Двойная рамка', sample: 'Важное', color: '#e9d5ff' },
      { id: 'bolted', label: 'На заклёпках', sample: 'Важное', color: '#fecaca' },
      { id: 'dashed', label: 'Черновик', sample: 'Черновик', color: '#e2e8f0' },
    ],
  },
  {
    // The monochrome set from the reference sheets: these ignore the note
    // colour for their plate and use it as the accent instead, so the
    // swatches here are the accent, not the background.
    title: 'HUD / киберпанк',
    items: [
      { id: 'hud', label: 'Панель', sample: 'STATUS', color: '#2dd4bf' },
      { id: 'hudBracket', label: 'Уголки', sample: 'TARGET', color: '#e8eae6' },
      { id: 'terminal', label: 'Терминал', sample: '> run', color: '#4ade80' },
      { id: 'hazard', label: 'Разметка', sample: 'WARNING', color: '#fbbf24' },
      { id: 'scan', label: 'Скан-линии', sample: 'SIGNAL', color: '#60a5fa' },
      { id: 'dither', label: 'Дизеринг', sample: 'NOISE', color: '#e8eae6' },
      { id: 'barcode', label: 'Штрихкод', sample: 'ID-4471', color: '#e8eae6' },
      { id: 'chip', label: 'Статус', sample: 'ONLINE', color: '#4ade80' },
    ],
  },
  {
    // The outlined frames — the ones the sheets draw as a line rather than
    // as a filled plate.
    title: 'HUD / рамки',
    items: [
      { id: 'vrFrame', label: 'VR-рамка', sample: 'SYSTEM', color: '#fbbf24' },
      { id: 'roundFrame', label: 'Скруглённая', sample: 'READOUT', color: '#2dd4bf' },
      { id: 'hexFrame', label: 'Гекс', sample: 'NODE', color: '#e8eae6' },
      { id: 'octagon', label: 'Октагон', sample: 'START', color: '#4ade80' },
      { id: 'callout', label: 'Выноска', sample: 'DETAIL', color: '#f97316' },
      { id: 'arrowTab', label: 'Стрелка', sample: 'NEXT', color: '#fbbf24' },
    ],
  },
  {
    title: 'HUD / панели',
    items: [
      { id: 'vrPanel', label: 'Боковая шкала', sample: 'POWER', color: '#fbbf24' },
      { id: 'labelBar', label: 'Плашка', sample: 'SECTION', color: '#2dd4bf' },
      { id: 'stripeBar', label: 'Полосы', sample: 'CAUTION', color: '#f97316' },
      { id: 'waveform', label: 'Осциллограмма', sample: 'AUDIO', color: '#4ade80' },
      { id: 'meter', label: 'Индикаторы', sample: 'LEVELS', color: '#4ade80' },
      { id: 'pixelWindow', label: 'Пиксель-окно', sample: 'MENU', color: '#a7f3d0' },
      { id: 'screwPlate', label: 'На винтах', sample: 'PANEL', color: '#cbd5e1' },
      { id: 'stencil', label: 'Трафарет', sample: 'CARGO', color: '#fbbf24' },
    ],
  },
  {
    title: 'Ленты и выноски',
    items: [
      { id: 'ribbon', label: 'Лента', sample: 'Заголовок', color: '#fca5a5' },
      { id: 'banner', label: 'Баннер', sample: 'Шаг', color: '#fdba74' },
      { id: 'numbered', label: 'С номером', sample: 'Шаг 1', color: '#bfdbfe' },
      { id: 'bubble', label: 'Реплика', sample: 'Комментарий', color: '#fef08a' },
      { id: 'capsule', label: 'Капсула', sample: 'Статус', color: '#c7d2fe' },
    ],
  },
]


export function TemplatePanel() {
  const board = useBoardStore((s) => s.board)
  const selected = useBoardStore((s) => s.selected)
  const addPin = useBoardStore((s) => s.addPin)
  const updatePin = useBoardStore((s) => s.updatePin)
  const setActivePin = useBoardStore((s) => s.setActivePin)
  const selectOnly = useBoardStore((s) => s.selectOnly)
  const pushToast = useUiStore((s) => s.pushToast)

  // One selected note means "restyle this one"; anything else means "add a
  // new note in this style".
  const restyleTarget = useMemo(() => {
    if (selected.size !== 1) return null
    const id = Array.from(selected)[0]
    const pin = board?.pins.find((p) => p.id === id)
    return pin && pin.type === 'note' ? pin : null
  }, [selected, board])

  // Pins a decoration onto a note. Used by the click path; the drop path
  // lives in the canvas, which knows where the pointer was.
  const attachTo = (pinId: string | undefined, kind: DecorKind) => {
    if (!pinId) {
      pushToast('Сначала выбери заметку, к которой прицепить', 'info')
      return
    }
    const pin = useBoardStore.getState().board?.pins.find((p) => p.id === pinId)
    if (!pin || pin.type !== 'note') return
    const def = decorById(kind)!
    const existing = pin.decor ?? []
    if (existing.length >= MAX_DECOR_PER_NOTE) {
      pushToast(`Больше ${MAX_DECOR_PER_NOTE} штучек на одну заметку — хватит`, 'info')
      return
    }
    // Clicking the same glyph repeatedly used to stack every copy on the
    // top-left corner, where a dozen of them looked like one and only the
    // top one could be grabbed. Each click now takes the next free spot
    // around the note's edge.
    const slot = nextFreeSlot(existing)
    const next = [
      ...existing,
      { id: crypto.randomUUID(), kind, corner: 'tl' as const, color: def.color, ...slot },
    ]
    updatePin(pinId, 'decor', next)
  }

  const apply = (def: TemplateDef) => {
    if (restyleTarget) {
      updatePin(restyleTarget.id, 'style', def.id)
      if (def.texture) updatePin(restyleTarget.id, 'texture', def.texture)
      return
    }
    if (!board) return
    const vp = board.viewport
    const z = board.pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
    const pin = makeNotePin(
      { x: Math.round(vp.x + 120), y: Math.round(vp.y + 120), z },
      '',
      def.color,
    )
    const styled = { ...pin, style: def.id, ...(def.texture ? { texture: def.texture } : {}) }
    addPin(styled)
    selectOnly(styled.id)
    // Straight into typing, same as every other way of creating a note.
    setActivePin(styled.id)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        {restyleTarget ? 'Применить к выбранной заметке' : 'Клик добавит заметку на доску'}
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Анимации — перетащи на заметку</div>
        <div className={styles.decorGrid}>
          {ANIMATED_DECOR_ITEMS.map((d) => (
            <button
              key={d.id}
              className={styles.decorCell}
              title={`${d.label} — перетащи на заметку`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DECOR_MIME, d.id)
                e.dataTransfer.setData('text/plain', d.label)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => attachTo(restyleTarget?.id, d.id)}
            >
              <span className={styles.decorGlyph} style={{ color: d.color }}>
                <DecorPreview kind={d.id} />
              </span>
              <span className={styles.cellLabel}>{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group}>
        <div className={styles.groupTitle}>Штучки — перетащи на заметку</div>
        <div className={styles.decorGrid}>
          {DECOR_ITEMS.map((d) => (
            <button
              key={d.id}
              className={styles.decorCell}
              title={`${d.label} — перетащи на заметку`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(DECOR_MIME, d.id)
                e.dataTransfer.setData('text/plain', d.label)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              // Clicking pins it to the selected note, for when dragging is
              // awkward — on a touchpad, or on a phone.
              onClick={() => attachTo(restyleTarget?.id, d.id)}
            >
              <span className={styles.decorGlyph} style={{ color: d.color }}>
                <DecorPreview kind={d.id} />
              </span>
              <span className={styles.cellLabel}>{d.label}</span>
            </button>
          ))}
        </div>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className={styles.group}>
          <div className={styles.groupTitle}>{group.title}</div>
          <div className={styles.grid}>
            {group.items.map((def) => (
              <button
                key={def.id}
                className={styles.cell}
                title={def.label}
                onClick={() => apply(def)}
                // Dragged onto the board, a template lands where you drop
                // it. The payload is just the style id under our own MIME
                // type, so a drop from anywhere else can't be mistaken for
                // one of these.
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TEMPLATE_MIME, def.id)
                  e.dataTransfer.setData('text/plain', def.label)
                  e.dataTransfer.effectAllowed = 'copy'
                }}
              >
                <div className={styles.previewBox}>
                  <div
                    className={`${pins.root} ${STYLE_CLASS[def.id]} ${
                      HUD_STYLES.has(def.id) ? hudClass : ''
                    } ${styles.preview}`}
                    style={{
                      background: def.color,
                      // Same split as the real pin: HUD plates take the
                      // colour as an accent, everything else as text.
                      color: HUD_STYLES.has(def.id) ? def.color : readableOn(def.color),
                    }}
                  >
                    {/* The preview is the real markup, so it needs the
                        real plate layer too — without it a HUD style
                        previews as a bare coloured rectangle. */}
                    {HUD_STYLES.has(def.id) && <span className={hudPlateClass} aria-hidden />}
                    <div className={styles.previewText}>{def.sample}</div>
                  </div>
                </div>
                <span className={styles.cellLabel}>{def.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
