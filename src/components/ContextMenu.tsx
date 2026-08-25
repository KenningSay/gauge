import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Eye, Pencil, Download, Trash2, FolderOpen } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { useUiStore } from '../store/useUiStore'
import { authorizedFetchUrl } from '../api/webdav'
import styles from './ContextMenu.module.css'

export function ContextMenu() {
  const contextMenu = useFileStore((s) => s.contextMenu)
  const closeContextMenu = useFileStore((s) => s.closeContextMenu)
  const openViewer = useFileStore((s) => s.openViewer)
  const navigate = useFileStore((s) => s.navigate)
  const startRename = useFileStore((s) => s.startRename)
  const deleteEntries = useFileStore((s) => s.deleteEntries)
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const ref = useRef<HTMLDivElement>(null)
  // Menu was positioned straight from the click/kebab coordinates with no
  // bounds check — right-clicking (or tapping the kebab, which sits at the
  // row's right edge) near the bottom-right of the screen rendered the menu
  // partly or fully off-screen and unusable, worst on the mobile kebab menu
  // this project specifically added. Measured post-render and clamped into
  // the viewport instead; useLayoutEffect runs before paint so there's no
  // visible flash at the wrong position first. Found + fixed 2026-08-25.
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
    const left = Math.min(Math.max(margin, contextMenu.x), window.innerWidth - rect.width - margin)
    const top = Math.min(Math.max(margin, contextMenu.y), window.innerHeight - rect.height - margin)
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
          const ok = await confirmDialog(`Удалить «${entry.name}»? Это необратимо.`)
          if (ok) await deleteEntries([entry])
        }}
      >
        <Trash2 size={16} /> Удалить
      </button>
    </div>
  )
}
