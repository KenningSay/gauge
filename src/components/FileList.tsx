import { useState, useRef, useEffect } from 'react'
import { Folder, Image, Video, Music, FileText, FileCode, File as FileIcon, Inbox, MoreVertical } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { detectViewerKind, type FileEntry } from '../api/types'
import { useAuthorizedUrl } from '../hooks/useAuthorizedUrl'
import { formatSize, formatDate, extensionOf } from '../utils/format'
import { isCoarsePointer } from '../utils/device'
import { collectDroppedEntries } from '../utils/dropFolder'
import styles from './FileList.module.css'

const CODE_EXT = new Set(['js', 'jsx', 'ts', 'tsx', 'py', 'sh', 'json', 'html', 'css', 'yml', 'yaml'])

function EntryIcon({ entry, size = 20 }: { entry: FileEntry; size?: number }) {
  if (entry.isDir) return <Folder size={size} color="var(--signal)" />
  const kind = detectViewerKind(entry)
  const ext = entry.name.split('.').pop()?.toLowerCase() ?? ''
  if (kind === 'image') return <Image size={size} color="var(--tick)" />
  if (kind === 'video') return <Video size={size} color="var(--tick)" />
  if (kind === 'audio') return <Music size={size} color="var(--tick)" />
  if (kind === 'text' && CODE_EXT.has(ext)) return <FileCode size={size} color="var(--text-dim)" />
  if (kind === 'text') return <FileText size={size} color="var(--text-dim)" />
  return <FileIcon size={size} color="var(--text-faint)" />
}

function isImage(entry: FileEntry) {
  return detectViewerKind(entry) === 'image'
}

function GridThumb({ entry }: { entry: FileEntry }) {
  const { url } = useAuthorizedUrl(entry.path)
  if (!url) return <EntryIcon entry={entry} size={30} />
  return <img src={url} loading="lazy" alt={entry.name} />
}

export function FileList() {
  const entries = useFileStore((s) => s.entries)
  const loading = useFileStore((s) => s.loading)
  const error = useFileStore((s) => s.error)
  const viewMode = useFileStore((s) => s.viewMode)
  const sortKey = useFileStore((s) => s.sortKey)
  const sortDir = useFileStore((s) => s.sortDir)
  const setSort = useFileStore((s) => s.setSort)
  const selected = useFileStore((s) => s.selected)
  const selectionMode = useFileStore((s) => s.selectionMode)
  const selectOnly = useFileStore((s) => s.selectOnly)
  const toggleSelect = useFileStore((s) => s.toggleSelect)
  const selectRange = useFileStore((s) => s.selectRange)
  const clearSelection = useFileStore((s) => s.clearSelection)
  const enterSelectionMode = useFileStore((s) => s.enterSelectionMode)
  const navigate = useFileStore((s) => s.navigate)
  const openViewer = useFileStore((s) => s.openViewer)
  const openContextMenu = useFileStore((s) => s.openContextMenu)
  const currentPath = useFileStore((s) => s.currentPath)
  const uploadFiles = useFileStore((s) => s.uploadFiles)
  const uploadEntries = useFileStore((s) => s.uploadEntries)
  const moveEntries = useFileStore((s) => s.moveEntries)
  const renamingPath = useFileStore((s) => s.renamingPath)
  const commitRename = useFileStore((s) => s.commitRename)
  const cancelRename = useFileStore((s) => s.cancelRename)
  const silentRefresh = useFileStore((s) => s.silentRefresh)
  // With several items selected, a per-row kebab acting on just that one row
  // is misleading — the toolbar's bulk actions (copy/cut/delete) are what
  // apply to the actual selection once there's more than one.
  const multiSelected = selected.size > 1

  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [dropZoneActive, setDropZoneActive] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const longPressFired = useRef(false)
  // Unmounting the focused rename <input> (on commit or cancel) fires a
  // native blur, which would otherwise re-run commitRename a second time via
  // onBlur below. Set right before the deliberate commit/cancel, consumed by
  // that resulting blur.
  const skipRenameBlur = useRef(false)

  // Live updates: WebDAV/nginx has no push mechanism, so this polls the
  // current folder every few seconds — silentRefresh() is a no-op re-render
  // if nothing changed. Paused while the tab isn't visible (e.g. another
  // browser tab or app is focused) to avoid pointless requests.
  useEffect(() => {
    const POLL_MS = 8000
    let id: number | null = null
    const start = () => {
      if (id !== null) return
      id = window.setInterval(() => { silentRefresh() }, POLL_MS)
    }
    const stop = () => {
      if (id === null) return
      window.clearInterval(id)
      id = null
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') { silentRefresh(); start() }
      else stop()
    }
    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [currentPath, silentRefresh])

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.isDir) navigate(entry.path)
    else openViewer(entry)
  }

  const handleClick = (e: React.MouseEvent, entry: FileEntry) => {
    if (longPressFired.current) { longPressFired.current = false; return }
    if (e.shiftKey) { selectRange(entry.path); return }
    if (e.ctrlKey || e.metaKey) { toggleSelect(entry.path); return }
    // Already in multi-select mode (started via long-press on touch) — a
    // plain tap keeps adding/removing items instead of opening them.
    if (selectionMode) { toggleSelect(entry.path); return }
    // Touch screens have no double-tap convention worth relying on — a plain
    // tap should open the item directly, same as a desktop double-click.
    if (isCoarsePointer()) { handleDoubleClick(entry); return }
    selectOnly(entry.path)
  }

  const handleTouchStart = (entry: FileEntry) => {
    longPressFired.current = false
    pressTimer.current = window.setTimeout(() => {
      longPressFired.current = true
      if (navigator.vibrate) navigator.vibrate(15)
      enterSelectionMode(entry.path)
    }, 480)
  }
  const cancelLongPress = () => {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current)
      pressTimer.current = null
    }
  }

  const handleKebab = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    if (!selected.has(entry.path)) selectOnly(entry.path)
    const rect = e.currentTarget.getBoundingClientRect()
    openContextMenu(rect.right, rect.bottom, entry)
  }

  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const paths = selected.has(entry.path) ? Array.from(selected) : [entry.path]
    e.dataTransfer.setData('application/x-gauge-paths', JSON.stringify(paths))
    e.dataTransfer.effectAllowed = 'move'
  }

  // Dropped folders can't be read via plain `dataTransfer.files` (browsers
  // don't recurse into them) — try the File System Entries API first, which
  // walks subfolders and preserves each file's real path; fall back to the
  // flat file list only if that API isn't available.
  const uploadDropped = async (e: React.DragEvent, targetDir?: string) => {
    const dropped = await collectDroppedEntries(e.dataTransfer)
    if (dropped && dropped.length) {
      await uploadEntries(dropped, targetDir)
      return
    }
    if (e.dataTransfer.files.length) {
      await uploadFiles(e.dataTransfer.files, targetDir)
    }
  }

  const handleRowDrop = async (e: React.DragEvent, targetDir: FileEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverPath(null)
    const internal = e.dataTransfer.getData('application/x-gauge-paths')
    if (internal) {
      const paths = new Set<string>(JSON.parse(internal))
      const moving = entries.filter((en) => paths.has(en.path) && en.path !== targetDir.path)
      if (moving.length) await moveEntries(moving, targetDir.path)
      return
    }
    await uploadDropped(e, targetDir.path)
  }

  const handleZoneDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropZoneActive(false)
    await uploadDropped(e)
  }

  if (error) {
    return (
      <div className={styles.empty}>
        <Inbox size={40} />
        <div>Ошибка: {error}</div>
      </div>
    )
  }

  if (!loading && entries.length === 0) {
    return (
      <div
        className={styles.scroller}
        onDragOver={(e) => { e.preventDefault(); setDropZoneActive(true) }}
        onDragLeave={() => setDropZoneActive(false)}
        onDrop={handleZoneDrop}
      >
        {dropZoneActive && <div className={styles.dropOverlay}>Отпустите файлы, чтобы загрузить</div>}
        <div className={styles.empty}>
          <Inbox size={40} />
          <div>Пусто</div>
        </div>
      </div>
    )
  }

  const SortArrow = ({ col }: { col: typeof sortKey }) =>
    sortKey === col ? <span>{sortDir === 1 ? ' ▲' : ' ▼'}</span> : null

  return (
    <div
      className={styles.scroller}
      onClick={clearSelection}
      onDragOver={(e) => { e.preventDefault(); setDropZoneActive(true) }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropZoneActive(false) }}
      onDrop={handleZoneDrop}
    >
      {dropZoneActive && <div className={styles.dropOverlay}>Отпустите файлы, чтобы загрузить в {currentPath}</div>}

      {viewMode === 'list' ? (
        <table className={styles.table}>
          <thead>
            <tr className={styles.headRow}>
              <th onClick={(e) => { e.stopPropagation(); setSort('name') }}>Имя<SortArrow col="name" /></th>
              <th className={styles.dateCol} onClick={(e) => { e.stopPropagation(); setSort('modified') }}>Изменён<SortArrow col="modified" /></th>
              <th onClick={(e) => { e.stopPropagation(); setSort('size') }}>Размер<SortArrow col="size" /></th>
              <th className={styles.typeCol} onClick={(e) => { e.stopPropagation(); setSort('type') }}>Тип<SortArrow col="type" /></th>
              <th className={styles.kebabCol} />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.path}
                className={`${styles.row} ${selected.has(entry.path) ? styles.selected : ''} ${dragOverPath === entry.path ? styles.dragOver : ''}`}
                draggable
                onClick={(e) => { e.stopPropagation(); handleClick(e, entry) }}
                onDoubleClick={() => handleDoubleClick(entry)}
                onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!selected.has(entry.path)) selectOnly(entry.path); openContextMenu(e.clientX, e.clientY, entry) }}
                onDragStart={(e) => handleDragStart(e, entry)}
                onDragOver={(e) => { if (entry.isDir) { e.preventDefault(); e.stopPropagation(); setDragOverPath(entry.path) } }}
                onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOverPath(null) }}
                onDrop={(e) => entry.isDir && handleRowDrop(e, entry)}
                onTouchStart={() => handleTouchStart(entry)}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
              >
                <td>
                  <div className={styles.nameCell}>
                    <EntryIcon entry={entry} />
                    {renamingPath === entry.path ? (
                      <input
                        autoFocus
                        className={styles.renameInput}
                        defaultValue={entry.name}
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { skipRenameBlur.current = true; commitRename(entry, (e.target as HTMLInputElement).value) }
                          if (e.key === 'Escape') { skipRenameBlur.current = true; cancelRename() }
                        }}
                        onBlur={(e) => {
                          if (skipRenameBlur.current) { skipRenameBlur.current = false; return }
                          commitRename(entry, e.target.value)
                        }}
                      />
                    ) : (
                      <span>{entry.name}</span>
                    )}
                  </div>
                </td>
                <td className={`${styles.dimCell} ${styles.dateCol}`}>{formatDate(entry.modified)}</td>
                <td className={styles.dimCell}>{formatSize(entry.size, entry.isDir)}</td>
                <td className={`${styles.dimCell} ${styles.typeCol}`}>{entry.isDir ? 'Папка' : extensionOf(entry.name) || '—'}</td>
                <td className={styles.kebabCol}>
                  {!multiSelected && (
                    <button className={styles.kebabBtn} onClick={(e) => handleKebab(e, entry)}>
                      <MoreVertical size={16} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className={styles.grid}>
          {entries.map((entry) => (
            <div
              key={entry.path}
              className={`${styles.gridItem} ${selected.has(entry.path) ? styles.selected : ''} ${dragOverPath === entry.path ? styles.dragOver : ''}`}
              draggable
              onClick={(e) => { e.stopPropagation(); handleClick(e, entry) }}
              onDoubleClick={() => handleDoubleClick(entry)}
              onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); if (!selected.has(entry.path)) selectOnly(entry.path); openContextMenu(e.clientX, e.clientY, entry) }}
              onDragStart={(e) => handleDragStart(e, entry)}
              onDragOver={(e) => { if (entry.isDir) { e.preventDefault(); e.stopPropagation(); setDragOverPath(entry.path) } }}
              onDragLeave={() => setDragOverPath(null)}
              onDrop={(e) => entry.isDir && handleRowDrop(e, entry)}
              onTouchStart={() => handleTouchStart(entry)}
              onTouchEnd={cancelLongPress}
              onTouchMove={cancelLongPress}
            >
              {!multiSelected && (
                <button className={styles.gridKebab} onClick={(e) => handleKebab(e, entry)}>
                  <MoreVertical size={15} />
                </button>
              )}
              <div className={styles.gridThumb}>
                {isImage(entry) ? <GridThumb entry={entry} /> : <EntryIcon entry={entry} size={30} />}
              </div>
              <div className={styles.gridName}>{entry.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
