import { useState } from 'react'
import { Folder, Image, Video, Music, FileText, FileCode, File as FileIcon, Inbox } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { detectViewerKind, type FileEntry } from '../api/types'
import { authorizedFetchUrl } from '../api/webdav'
import { formatSize, formatDate, extensionOf } from '../utils/format'
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

export function FileList() {
  const entries = useFileStore((s) => s.entries)
  const loading = useFileStore((s) => s.loading)
  const error = useFileStore((s) => s.error)
  const viewMode = useFileStore((s) => s.viewMode)
  const sortKey = useFileStore((s) => s.sortKey)
  const sortDir = useFileStore((s) => s.sortDir)
  const setSort = useFileStore((s) => s.setSort)
  const selected = useFileStore((s) => s.selected)
  const selectOnly = useFileStore((s) => s.selectOnly)
  const toggleSelect = useFileStore((s) => s.toggleSelect)
  const selectRange = useFileStore((s) => s.selectRange)
  const clearSelection = useFileStore((s) => s.clearSelection)
  const navigate = useFileStore((s) => s.navigate)
  const openViewer = useFileStore((s) => s.openViewer)
  const openContextMenu = useFileStore((s) => s.openContextMenu)
  const currentPath = useFileStore((s) => s.currentPath)
  const uploadFiles = useFileStore((s) => s.uploadFiles)
  const moveEntries = useFileStore((s) => s.moveEntries)
  const renamingPath = useFileStore((s) => s.renamingPath)
  const commitRename = useFileStore((s) => s.commitRename)
  const cancelRename = useFileStore((s) => s.cancelRename)

  const [dragOverPath, setDragOverPath] = useState<string | null>(null)
  const [dropZoneActive, setDropZoneActive] = useState(false)

  const handleClick = (e: React.MouseEvent, entry: FileEntry) => {
    if (e.shiftKey) selectRange(entry.path)
    else if (e.ctrlKey || e.metaKey) toggleSelect(entry.path)
    else selectOnly(entry.path)
  }

  const handleDoubleClick = (entry: FileEntry) => {
    if (entry.isDir) navigate(entry.path)
    else openViewer(entry)
  }

  const handleDragStart = (e: React.DragEvent, entry: FileEntry) => {
    const paths = selected.has(entry.path) ? Array.from(selected) : [entry.path]
    e.dataTransfer.setData('application/x-gauge-paths', JSON.stringify(paths))
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleRowDrop = async (e: React.DragEvent, targetDir: FileEntry) => {
    e.preventDefault()
    setDragOverPath(null)
    const internal = e.dataTransfer.getData('application/x-gauge-paths')
    if (internal) {
      const paths: string[] = JSON.parse(internal)
      const moving = entries.filter((en) => paths.includes(en.path) && en.path !== targetDir.path)
      if (moving.length) await moveEntries(moving, targetDir.path)
      return
    }
    if (e.dataTransfer.files.length) {
      await uploadFiles(e.dataTransfer.files)
    }
  }

  const handleZoneDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDropZoneActive(false)
    if (e.dataTransfer.files.length) {
      await uploadFiles(e.dataTransfer.files)
    }
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
              <th onClick={(e) => { e.stopPropagation(); setSort('modified') }}>Изменён<SortArrow col="modified" /></th>
              <th onClick={(e) => { e.stopPropagation(); setSort('size') }}>Размер<SortArrow col="size" /></th>
              <th>Тип</th>
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
                onDragOver={(e) => { if (entry.isDir) { e.preventDefault(); setDragOverPath(entry.path) } }}
                onDragLeave={() => setDragOverPath(null)}
                onDrop={(e) => entry.isDir && handleRowDrop(e, entry)}
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
                          if (e.key === 'Enter') commitRename(entry, (e.target as HTMLInputElement).value)
                          if (e.key === 'Escape') cancelRename()
                        }}
                        onBlur={(e) => commitRename(entry, e.target.value)}
                      />
                    ) : (
                      <span>{entry.name}</span>
                    )}
                  </div>
                </td>
                <td className={styles.dimCell}>{formatDate(entry.modified)}</td>
                <td className={styles.dimCell}>{formatSize(entry.size, entry.isDir)}</td>
                <td className={styles.dimCell}>{entry.isDir ? 'Папка' : extensionOf(entry.name) || '—'}</td>
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
              onDragOver={(e) => { if (entry.isDir) { e.preventDefault(); setDragOverPath(entry.path) } }}
              onDragLeave={() => setDragOverPath(null)}
              onDrop={(e) => entry.isDir && handleRowDrop(e, entry)}
            >
              <div className={styles.gridThumb}>
                {isImage(entry) ? (
                  <img src={authorizedFetchUrl(entry.path)} loading="lazy" alt={entry.name} />
                ) : (
                  <EntryIcon entry={entry} size={30} />
                )}
              </div>
              <div className={styles.gridName}>{entry.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
