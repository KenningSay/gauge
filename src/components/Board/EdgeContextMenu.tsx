// Right-click menu for a connection. Separate from the pin menu because
// almost nothing is shared: a wire has no layers, no duplicate, no content —
// it has a label, a colour, and a delete.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Tag, Trash2, Palette, ChevronRight, Pipette } from 'lucide-react'
import { useBoardStore } from '../../store/useBoardStore'
import styles from './PinContextMenu.module.css'

// Muted by default: a wire is a relationship, not a focal point. The bright
// options are there for the times when a few connections need to stand out
// from the rest.
const EDGE_COLORS = ['#716f68', '#2dd4bf', '#fbbf24', '#f87171', '#a855f7', '#60a5fa']

interface Props {
  edgeId: string
  screen: { x: number; y: number }
  onClose: () => void
  onLabel: () => void
  onDelete: () => void
}

export function EdgeContextMenu({ edgeId, screen, onClose, onLabel, onDelete }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState(screen)
  const [colorsOpen, setColorsOpen] = useState(false)
  const edge = useBoardStore((s) => (s.board?.edges ?? []).find((e) => e.id === edgeId))
  const updateEdge = useBoardStore((s) => s.updateEdge)

  // Clamp inside the viewport before paint, so a menu opened near the edge
  // of the screen doesn't flash off-screen and jump back.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.min(screen.x, window.innerWidth - r.width - 8),
      y: Math.min(screen.y, window.innerHeight - r.height - 8),
    })
  }, [screen])

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  if (!edge) return null

  return createPortal(
    <div className={styles.menu} ref={ref} style={{ left: pos.x, top: pos.y }}>
      <button
        className={styles.item}
        onClick={() => {
          onLabel()
          onClose()
        }}
      >
        <span className={styles.itemIcon}>
          <Tag size={13} />
        </span>
        {edge.label ? 'Изменить подпись' : 'Подписать связь'}
      </button>

      <div className={styles.submenuWrap}>
        <button className={styles.item} onClick={() => setColorsOpen((v) => !v)} aria-expanded={colorsOpen}>
          <span className={styles.itemIcon}>
            <Palette size={13} />
          </span>
          Цвет
          <span className={styles.submenuChevron}>
            <ChevronRight size={13} />
          </span>
        </button>
        {colorsOpen && (
          <div className={styles.submenu}>
            <div className={styles.swatches}>
              {EDGE_COLORS.map((c) => (
                <button
                  key={c}
                  className={`${styles.swatch} ${(edge.color ?? EDGE_COLORS[0]).toLowerCase() === c ? styles.swatchActive : ''}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={`Цвет ${c}`}
                  onClick={() => updateEdge(edgeId, 'color', c === EDGE_COLORS[0] ? undefined : c)}
                />
              ))}
              <label className={styles.swatchCustom} title="Свой цвет">
                <Pipette size={12} />
                <input
                  type="color"
                  value={edge.color ?? EDGE_COLORS[0]}
                  onChange={(e) => updateEdge(edgeId, 'color', e.target.value)}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      <div className={styles.divider} />

      <button
        className={`${styles.item} ${styles.itemDanger}`}
        onClick={() => {
          onDelete()
          onClose()
        }}
      >
        <span className={styles.itemIcon}>
          <Trash2 size={13} />
        </span>
        Удалить связь
      </button>
    </div>,
    document.body,
  )
}
