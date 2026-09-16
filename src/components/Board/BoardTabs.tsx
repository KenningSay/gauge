import { useState } from 'react'
import { Plus, X, Pencil, Trash2 } from 'lucide-react'
import type { BoardMeta } from '../../api/board'
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
  onCreate: () => void
  onOpenExisting: (id: string) => void
}

export function BoardTabs({
  boards,
  openIds,
  activeId,
  onActivate,
  onClose,
  onRename,
  onDelete,
  onCreate,
  onOpenExisting,
}: Props) {
  const [menuFor, setMenuFor] = useState<string | null>(null)

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
                setMenuFor(b.id)
              }}
            >
              <span className={styles.tabName}>{b.name}</span>
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
              {menuFor === b.id && (
                <TabMenu
                  onClose={() => setMenuFor(null)}
                  onRename={() => {
                    setMenuFor(null)
                    onRename(b.id, b.name)
                  }}
                  onDelete={() => {
                    setMenuFor(null)
                    onDelete(b.id, b.name)
                  }}
                />
              )}
            </div>
          )
        })}
        <button className={styles.addBtn} onClick={onCreate} title="Создать доску">
          <Plus size={15} />
        </button>
      </div>

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
    </div>
  )
}

function TabMenu({
  onClose,
  onRename,
  onDelete,
}: {
  onClose: () => void
  onRename: () => void
  onDelete: () => void
}) {
  return (
    <>
      <div className={styles.menuBackdrop} onClick={onClose} />
      <div className={styles.menu} onClick={(e) => e.stopPropagation()}>
        <button className={styles.menuItem} onClick={onRename}>
          <Pencil size={13} /> Переименовать
        </button>
        <button className={`${styles.menuItem} ${styles.menuItemDanger}`} onClick={onDelete}>
          <Trash2 size={13} /> Удалить
        </button>
      </div>
    </>
  )
}
