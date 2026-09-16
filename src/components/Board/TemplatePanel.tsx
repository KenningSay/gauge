// The template library: every note style, rendered as a real miniature of
// itself rather than a name in a list. Clicking one drops that note on the
// board; clicking one with a note selected restyles that note instead,
// which is what you usually want once something is already there.

import { useMemo } from 'react'
import type { NoteStyle, NoteTexture } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { makeNotePin } from '../../utils/boardPinFactories'
import pins from './pins/Pins.module.css'
import styles from './TemplatePanel.module.css'

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

const STYLE_CLASS: Record<NoteStyle, string> = {
  sticky: pins.styleSticky,
  paper: pins.stylePaper,
  torn: pins.styleTorn,
  lined: pins.styleLined,
  spiral: pins.styleSpiral,
  spiralSide: pins.styleSpiralSide,
  clip: pins.styleClip,
  clipboard: pins.styleClipboard,
  tape: pins.styleTape,
  tapeCorners: pins.styleTapeCorners,
  card: pins.styleCard,
  folder: pins.styleFolder,
  ribbon: pins.styleRibbon,
  banner: pins.styleBanner,
  numbered: pins.styleNumbered,
  doubleFrame: pins.styleDoubleFrame,
  dashed: pins.styleDashed,
  bolted: pins.styleBolted,
  bubble: pins.styleBubble,
  tag: pins.styleTag,
  capsule: pins.styleCapsule,
}

// Black or white text for the preview, by the same rule the real note uses.
function readableOn(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) > 0.45 ? '#16150f' : '#f4f3ef'
}

export function TemplatePanel() {
  const board = useBoardStore((s) => s.board)
  const selected = useBoardStore((s) => s.selected)
  const addPin = useBoardStore((s) => s.addPin)
  const updatePin = useBoardStore((s) => s.updatePin)
  const setActivePin = useBoardStore((s) => s.setActivePin)
  const selectOnly = useBoardStore((s) => s.selectOnly)

  // One selected note means "restyle this one"; anything else means "add a
  // new note in this style".
  const restyleTarget = useMemo(() => {
    if (selected.size !== 1) return null
    const id = Array.from(selected)[0]
    const pin = board?.pins.find((p) => p.id === id)
    return pin && pin.type === 'note' ? pin : null
  }, [selected, board])

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
              >
                <div className={styles.previewBox}>
                  <div
                    className={`${pins.root} ${STYLE_CLASS[def.id]} ${styles.preview}`}
                    style={{ background: def.color, color: readableOn(def.color) }}
                  >
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
