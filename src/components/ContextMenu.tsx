import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye, Pencil, Download, Trash2, FolderOpen, Copy, Scissors, CopyPlus } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { useUiStore } from '../store/useUiStore'
import { downloadEntry } from '../utils/download'
import styles from './ContextMenu.module.css'

export function ContextMenu() {
  const contextMenu = useFileStore((s) => s.contextMenu)
  const closeContextMenu = useFileStore((s) => s.closeContextMenu)
  const openViewer = useFileStore((s) => s.openViewer)
  const navigate = useFileStore((s) => s.navigate)
  const startRename = useFileStore((s) => s.startRename)
  const deleteEntries = useFileStore((s) => s.deleteEntries)
  const copyToClipboard = useFileStore((s) => s.copyToClipboard)
  const cutToClipboard = useFileStore((s) => s.cutToClipboard)
  const duplicateEntry = useFileStore((s) => s.duplicateEntry)
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const ref = useRef<HTMLDivElement>(null)
  // Clamped into the viewport post-render (useLayoutEffect runs before
  // paint, so no flash at the wrong position) — raw click/kebab coordinates
  // could place the menu partly off-screen near an edge.
  const [adjusted, setAdjusted] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!contextMenu) return
    const handler = () => closeContextMenu()
    window.addEventListener('click', handler)
    window.addEventListener('contextmenu', handler)
    return () => {
      window.removeEventListener('click', handler)
      window.removeEventListener('contextmenu', handler)
    }
  }, [contextMenu, closeContextMenu])

  useLayoutEffect(() => {
    if (!contextMenu || !ref.current) { setAdjusted(null); return }
    const rect = ref.current.getBoundingClientRect()
    const margin = 8
    // Clamp to the right/bottom edge first, THEN re-clamp to the margin —
    // doing it the other order around, if rect is wider/taller than the
    // viewport minus margins, produces a negative value and pushes the menu
    // off the opposite (left/top) edge instead of just fitting as best it can.
    const left = Math.max(margin, Math.min(contextMenu.x, window.innerWidth - rect.width - margin))
    const top = Math.max(margin, Math.min(contextMenu.y, window.innerHeight - rect.height - margin))
    setAdjusted({ left, top })
  }, [contextMenu])

  if (!contextMenu || !contextMenu.entry) return null
  const entry = contextMenu.entry

  const style: React.CSSProperties = adjusted ?? { left: contextMenu.x, top: contextMenu.y }

  return (
    <div className={styles.menu} style={style} ref={ref} onClick={(e) => e.stopPropagation()}>
      {entry.isDir ? (
        <button className={styles.item} onClick={() => { navigate(entry.path); closeContextMenu() }}>
          <FolderOpen size={16} /> Открыть
        </button>
      ) : (
        <button className={styles.item} onClick={() => { openViewer(entry); closeContextMenu() }}>
          <Eye size={16} /> Просмотр
        </button>
      )}
      <button className={styles.item} onClick={() => { startRename(entry.path); closeContextMenu() }}>
        <Pencil size={16} /> Переименовать
      </button>
      <button className={styles.item} onClick={() => { copyToClipboard([entry]); closeContextMenu() }}>
        <Copy size={16} /> Копировать
      </button>
      <button className={styles.item} onClick={() => { cutToClipboard([entry]); closeContextMenu() }}>
        <Scissors size={16} /> Вырезать
      </button>
      <button className={styles.item} onClick={() => { duplicateEntry(entry); closeContextMenu() }}>
        <CopyPlus size={16} /> Дублировать
      </button>
      {!entry.isDir && (
        <button className={styles.item} onClick={() => { downloadEntry(entry.path, entry.name); closeContextMenu() }}>
          <Download size={16} /> Скачать
        </button>
      )}
      <div className={styles.sep} />
      <button
        className={`${styles.item} ${styles.danger}`}
        onClick={async () => {
          closeContextMenu()
          const ok = await confirmDialog(`Удалить «${entry.name}»? Это необратимо.`)
          if (ok) await deleteEntries([entry])
        }}
      >
        <Trash2 size={16} /> Удалить
      </button>
    </div>
  )
}
