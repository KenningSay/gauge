import { useEffect, useRef } from 'react'
import { Eye, Pencil, Download, Trash2, FolderOpen } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { authorizedFetchUrl } from '../api/webdav'
import styles from './ContextMenu.module.css'

export function ContextMenu() {
  const contextMenu = useFileStore((s) => s.contextMenu)
  const closeContextMenu = useFileStore((s) => s.closeContextMenu)
  const openViewer = useFileStore((s) => s.openViewer)
  const navigate = useFileStore((s) => s.navigate)
  const startRename = useFileStore((s) => s.startRename)
  const deleteEntries = useFileStore((s) => s.deleteEntries)
  const ref = useRef<HTMLDivElement>(null)

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

  if (!contextMenu || !contextMenu.entry) return null
  const entry = contextMenu.entry

  const style: React.CSSProperties = { left: contextMenu.x, top: contextMenu.y }

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
      {!entry.isDir && (
        <a
          className={styles.item}
          style={{ textDecoration: 'none' }}
          href={authorizedFetchUrl(entry.path)}
          download={entry.name}
          onClick={() => closeContextMenu()}
        >
          <Download size={16} /> Скачать
        </a>
      )}
      <div className={styles.sep} />
      <button
        className={`${styles.item} ${styles.danger}`}
        onClick={async () => {
          closeContextMenu()
          if (window.confirm(`Удалить «${entry.name}»?`)) await deleteEntries([entry])
        }}
      >
        <Trash2 size={16} /> Удалить
      </button>
    </div>
  )
}
