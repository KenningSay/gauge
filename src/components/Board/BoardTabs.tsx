import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, X, Pencil, Trash2, MoreVertical, History, Undo2, Redo2 } from 'lucide-react'
import type { BoardMeta } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { BoardSettings } from './BoardSettings'
import styles from './BoardTabs.module.css'

interface Props {
  boards: BoardMeta[]
  openIds: string[]
  activeId: string | null
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onRename: (id: string, currentName: string) => void
  onDelete: (id: string, name: string) => void
  onHistory: (id: string, name: string) => void
  onCreate: () => void
  onOpenExisting: (id: string) => void
}

// Where the tab menu was asked for: the board it belongs to plus the point
// on screen it should hang from. Screen coordinates, because the menu is
// rendered in a portal (see TabMenu).
interface MenuState {
  id: string
  name: string
  x: number
  y: number
}

export function BoardTabs({
  boards,
  openIds,
  activeId,
  onActivate,
  onClose,
  onRename,
  onDelete,
  onHistory,
  onCreate,
  onOpenExisting,
}: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null)

  // Undo/redo as buttons, not only Ctrl+Z/Ctrl+Shift+Z: a tablet with no
  // keyboard attached had no way to reach either one.
  const undo = useBoardStore((s) => s.undo)
  const redo = useBoardStore((s) => s.redo)
  const history = useBoardStore((s) => s.history)
  const canUndo = history.cursor > 0
  const canRedo = history.cursor < history.ops.length

  const openBoards = openIds
    .map((id) => boards.find((b) => b.id === id))
    .filter((b): b is BoardMeta => !!b)

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs}>
        {openBoards.map((b) => {
          const active = b.id === activeId
          return (
            <div
              key={b.id}
              className={`${styles.tab} ${active ? styles.tabActive : ''}`}
              onClick={() => onActivate(b.id)}
              onContextMenu={(e) => {
                e.preventDefault()
                setMenu({ id: b.id, name: b.name, x: e.clientX, y: e.clientY })
              }}
            >
              <span className={styles.tabName}>{b.name}</span>
              {/* Renaming and deleting used to live behind a right click and
                  nothing else, which is invisible on a first look and simply
                  absent on touch. The button is the discoverable way in; the
                  right click still works. */}
              <button
                className={styles.tabMenu}
                onClick={(e) => {
                  e.stopPropagation()
                  const r = e.currentTarget.getBoundingClientRect()
                  setMenu({ id: b.id, name: b.name, x: r.left, y: r.bottom + 4 })
                }}
                aria-label="Меню доски"
                title="Переименовать или удалить"
              >
                <MoreVertical size={13} />
              </button>
              <button
                className={styles.tabClose}
                onClick={(e) => {
                  e.stopPropagation()
                  onClose(b.id)
                }}
                aria-label="Закрыть вкладку"
              >
                <X size={12} />
              </button>
            </div>
          )
        })}
        <button className={styles.addBtn} onClick={onCreate} title="Создать доску">
          <Plus size={15} />
        </button>
      </div>

      {activeId && (
        <div className={styles.historyBtns}>
          <button
            className={styles.iconBtn}
            disabled={!canUndo}
            onClick={() => undo()}
            title="Отменить (Ctrl+Z)"
            aria-label="Отменить"
          >
            <Undo2 size={16} />
          </button>
          <button
            className={styles.iconBtn}
            disabled={!canRedo}
            onClick={() => redo()}
            title="Повторить (Ctrl+Shift+Z)"
            aria-label="Повторить"
          >
            <Redo2 size={16} />
          </button>
        </div>
      )}

      {boards.length > 0 && (
        <select
          className={styles.existingSelect}
          value=""
          onChange={(e) => {
            if (e.target.value) {
              onOpenExisting(e.target.value)
              e.target.value = ''
            }
          }}
          title="Открыть доску"
        >
          <option value="">Все доски…</option>
          {boards
            .filter((b) => !openIds.includes(b.id))
            .map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
        </select>
      )}

      <BoardSettings />

      {menu && (
        <TabMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          onRename={() => {
            const m = menu
            setMenu(null)
            onRename(m.id, m.name)
          }}
          onDelete={() => {
            const m = menu
            setMenu(null)
            onDelete(m.id, m.name)
          }}
          onHistory={() => {
            const m = menu
            setMenu(null)
            onHistory(m.id, m.name)
          }}
        />
      )}
    </div>
  )
}

// Portal + fixed positioning, for the same reason BoardSettings does it: the
// tab strip is overflow:hidden (it scrolls sideways once there are several
// boards), and a menu positioned inside a tab was clipped away to nothing —
// the right click "worked", it just drew the menu where nobody could see it.
function TabMenu({
  x,
  y,
  onClose,
  onRename,
  onDelete,
  onHistory,
}: {
  x: number
  y: number
  onClose: () => void
  onRename: () => void
  onDelete: () => void
  onHistory: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState({ x, y })

  // Flip back inside the window when the tab sits near an edge.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.max(8, Math.min(x, window.innerWidth - r.width - 8))
    const ny = y + r.height > window.innerHeight - 8 ? Math.max(8, y - r.height - 8) : y
    setPos({ x: nx, y: ny })
  }, [x, y])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <>
      <div
        className={styles.menuBackdrop}
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault()
          onClose()
        }}
      />
      <div
        className={styles.menu}
        ref={ref}
        style={{ top: pos.y, left: pos.x }}
        onClick={(e) => e.stopPropagation()}
      >
        <button className={styles.menuItem} onClick={onRename}>
          <Pencil size={13} /> Переименовать
        </button>
        <button className={styles.menuItem} onClick={onHistory}>
          <History size={13} /> История версий
        </button>
        <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={onDelete}>
          <Trash2 size={13} /> Удалить
        </button>
      </div>
    </>,
    document.body,
  )
}
