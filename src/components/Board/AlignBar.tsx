// The align palette, borrowed from Illustrator and pared down to what a
// board actually needs.
//
// Appears only with two or more pins selected, because that is the only
// time any of it means anything. Placed at the top centre, clear of the
// formatting bar (which floats over the note it belongs to) and of the
// toolbar at the bottom.
//
// Distribute needs three pins; with two it is a no-op, so those buttons
// are disabled rather than hidden — a control that appears and disappears
// as you add to a selection is harder to aim at than one that greys out.

import { createPortal } from 'react-dom'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
} from 'lucide-react'
import { useBoardStore } from '../../store/useBoardStore'
import {
  alignRects,
  distributeRects,
  packRects,
  type AlignEdge,
  type DistributeAxis,
  type Rect,
} from '../../utils/alignOps'
import styles from './AlignBar.module.css'

const GAP_STEP = 20

export function AlignBar() {
  const board = useBoardStore((s) => s.board)
  const selected = useBoardStore((s) => s.selected)
  const movePins = useBoardStore((s) => s.movePins)

  if (!board || selected.size < 2) return null

  const rects: Rect[] = board.pins
    .filter((p) => selected.has(p.id))
    .map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }))

  const apply = (moves: ReturnType<typeof alignRects>) => {
    if (moves.length) movePins(moves)
  }

  const align = (edge: AlignEdge) => apply(alignRects(rects, edge))
  const distribute = (axis: DistributeAxis) => apply(distributeRects(rects, axis))
  const pack = (axis: DistributeAxis) => apply(packRects(rects, axis, GAP_STEP))

  const canDistribute = rects.length >= 3

  // Rendered into <body>, not into the canvas. `position: fixed` inside an
  // element that has a transform is positioned against THAT element, not
  // the viewport — and the board's world layer is one big transform, so a
  // fixed bar placed inside it slid off screen with the pan.
  return createPortal(
    <div className={styles.bar} role="toolbar" aria-label="Выравнивание">
      <span className={styles.count}>{selected.size}</span>

      <div className={styles.group}>
        <button className={styles.btn} title="По левому краю" onClick={() => align('left')}>
          <AlignStartVertical size={16} />
        </button>
        <button className={styles.btn} title="По центру по горизонтали" onClick={() => align('hcenter')}>
          <AlignCenterVertical size={16} />
        </button>
        <button className={styles.btn} title="По правому краю" onClick={() => align('right')}>
          <AlignEndVertical size={16} />
        </button>
      </div>

      <div className={styles.sep} />

      <div className={styles.group}>
        <button className={styles.btn} title="По верхнему краю" onClick={() => align('top')}>
          <AlignStartHorizontal size={16} />
        </button>
        <button className={styles.btn} title="По центру по вертикали" onClick={() => align('vcenter')}>
          <AlignCenterHorizontal size={16} />
        </button>
        <button className={styles.btn} title="По нижнему краю" onClick={() => align('bottom')}>
          <AlignEndHorizontal size={16} />
        </button>
      </div>

      <div className={styles.sep} />

      <div className={styles.group}>
        <button
          className={styles.btn}
          title={
            canDistribute
              ? 'Равные промежутки по горизонтали (крайние на месте)'
              : 'Нужно хотя бы три карточки'
          }
          disabled={!canDistribute}
          onClick={() => distribute('horizontal')}
        >
          <AlignHorizontalSpaceAround size={16} />
        </button>
        <button
          className={styles.btn}
          title={
            canDistribute
              ? 'Равные промежутки по вертикали (крайние на месте)'
              : 'Нужно хотя бы три карточки'
          }
          disabled={!canDistribute}
          onClick={() => distribute('vertical')}
        >
          <AlignVerticalSpaceAround size={16} />
        </button>
      </div>

      <div className={styles.sep} />

      <div className={styles.group}>
        <button
          className={styles.textBtn}
          title={`Сдвинуть вплотную в ряд, промежуток ${GAP_STEP}px`}
          onClick={() => pack('horizontal')}
        >
          В ряд
        </button>
        <button
          className={styles.textBtn}
          title={`Сдвинуть вплотную в столбец, промежуток ${GAP_STEP}px`}
          onClick={() => pack('vertical')}
        >
          В столбец
        </button>
      </div>
    </div>,
    document.body,
  )
}
