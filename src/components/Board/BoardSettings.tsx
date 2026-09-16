// Board settings popover: the grid, the background, snapping, and the
// history size. The settings themselves already existed in the board file
// and in the store — there was simply no way to reach them from the UI, so
// every board was stuck on the defaults it was created with.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Settings, X } from 'lucide-react'
import type { NoteTexture } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useUiStore } from '../../store/useUiStore'
import { estimateHistoryBytes } from '../../utils/boardHistory'
import { formatSize } from '../../utils/format'
import styles from './BoardSettings.module.css'

const TEXTURES: Array<{ id: NoteTexture; label: string }> = [
  { id: 'plain', label: 'Пусто' },
  { id: 'dots', label: 'Точки' },
  { id: 'grid', label: 'Клетка' },
  { id: 'ruled', label: 'Линейка' },
  { id: 'graph', label: 'Миллиметровка' },
]

const BG_COLORS = ['#1b1a18', '#12171c', '#181423', '#101a15', '#e8eae6']

export function BoardSettings() {
  const [open, setOpen] = useState(false)
  const board = useBoardStore((s) => s.board)
  const history = useBoardStore((s) => s.history)
  const setBoardSettings = useBoardStore((s) => s.setBoardSettings)
  const shrinkHistory = useBoardStore((s) => s.shrinkHistory)
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const pushToast = useUiStore((s) => s.pushToast)
  const popRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  // Rendered in a portal with fixed positioning: the tab strip this button
  // lives in has overflow:hidden (it scrolls horizontally when there are
  // many boards), which clipped the popover away entirely.
  useLayoutEffect(() => {
    if (!open) return
    const r = triggerRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
  }, [open])

  // Close on an outside click or Escape, like every other popover here.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node
      if (popRef.current?.contains(t) || triggerRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!board) return null
  const s = board.settings

  const handleShrink = async () => {
    const ok = await confirmDialog(
      `Оставить последние 100 действий и удалить остальные? Отменить их (Ctrl+Z) после этого будет нельзя.`,
    )
    if (!ok) return
    shrinkHistory(100)
    pushToast('История сжата')
  }

  return (
    <div className={styles.wrap}>
      <button
        ref={triggerRef}
        className={`${styles.trigger} ${open ? styles.triggerActive : ''}`}
        onClick={() => setOpen((v) => !v)}
        title="Настройки доски"
        aria-label="Настройки доски"
        aria-expanded={open}
      >
        <Settings size={16} />
      </button>

      {open && pos && createPortal(
        <div className={styles.popover} ref={popRef} style={{ top: pos.top, right: pos.right }}>
          <div className={styles.head}>
            <span className={styles.title}>Настройки доски</span>
            <button className={styles.close} onClick={() => setOpen(false)} aria-label="Закрыть">
              <X size={14} />
            </button>
          </div>

          <div className={styles.row}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={s.gridVisible}
                onChange={(e) => setBoardSettings({ gridVisible: e.target.checked })}
              />
              Показывать сетку
            </label>
          </div>

          <div className={styles.section}>
            <div className={styles.label}>Фон</div>
            <div className={styles.chips}>
              {TEXTURES.map((t) => (
                <button
                  key={t.id}
                  className={`${styles.chip} ${s.backgroundTexture === t.id ? styles.chipActive : ''}`}
                  onClick={() => setBoardSettings({ backgroundTexture: t.id })}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className={styles.swatches}>
              {BG_COLORS.map((c) => (
                <button
                  key={c}
                  className={`${styles.swatch} ${s.backgroundColor.toLowerCase() === c ? styles.swatchActive : ''}`}
                  style={{ background: c }}
                  title={c}
                  aria-label={`Фон ${c}`}
                  onClick={() => setBoardSettings({ backgroundColor: c })}
                />
              ))}
              <label className={styles.swatchCustom} title="Свой цвет">
                <input
                  type="color"
                  value={s.backgroundColor}
                  onChange={(e) => setBoardSettings({ backgroundColor: e.target.value })}
                />
              </label>
            </div>
          </div>

          <div className={styles.section}>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={s.snapEnabled}
                onChange={(e) => setBoardSettings({ snapEnabled: e.target.checked })}
              />
              Притягивать к сетке
            </label>
            <div className={styles.sliderRow}>
              <span className={styles.label}>Шаг</span>
              <input
                type="range"
                min={4}
                max={64}
                step={4}
                value={s.snapStep}
                disabled={!s.snapEnabled}
                onChange={(e) => setBoardSettings({ snapStep: Number(e.target.value) })}
              />
              <span className={styles.value}>{s.snapStep}px</span>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.label}>История</div>
            <div className={styles.historyRow}>
              <span className={styles.value}>
                {history.ops.length} действий · ~{formatSize(estimateHistoryBytes(history), false)}
              </span>
              <button
                className={styles.smallBtn}
                onClick={handleShrink}
                disabled={history.ops.length <= 100}
              >
                Сжать
              </button>
            </div>
          </div>

          <div className={styles.footNote}>
            Пины: {board.pins.length}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
