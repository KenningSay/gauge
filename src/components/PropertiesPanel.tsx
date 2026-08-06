import { Info } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { useUiStore } from '../store/useUiStore'
import { detectViewerKind } from '../api/types'
import { authorizedFetchUrl } from '../api/webdav'
import { formatSize, formatDate, extensionOf } from '../utils/format'
import styles from './PropertiesPanel.module.css'

export function PropertiesPanel() {
  const open = useUiStore((s) => s.propertiesOpen)
  const selected = useFileStore((s) => s.selected)
  const entries = useFileStore((s) => s.entries)
  const currentPath = useFileStore((s) => s.currentPath)

  if (!open) return null

  const selectedEntries = entries.filter((e) => selected.has(e.path))

  if (selectedEntries.length === 0) {
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Свойства</div>
        <div className={styles.emptyState}>
          <Info size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
          <div>Ничего не выбрано</div>
        </div>
      </div>
    )
  }

  if (selectedEntries.length > 1) {
    const totalSize = selectedEntries.reduce((sum, e) => sum + e.size, 0)
    return (
      <div className={styles.panel}>
        <div className={styles.title}>Свойства</div>
        <div className={styles.name}>{selectedEntries.length} объектов выбрано</div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Общий размер</span>
          <span className={styles.rowValue}>{formatSize(totalSize, false)}</span>
        </div>
        <div className={styles.row}>
          <span className={styles.rowLabel}>Расположение</span>
          <span className={styles.rowValue}>{currentPath}</span>
        </div>
      </div>
    )
  }

  const entry = selectedEntries[0]
  const isImage = detectViewerKind(entry) === 'image'

  return (
    <div className={styles.panel}>
      <div className={styles.title}>Свойства</div>
      {isImage && (
        <div className={styles.thumb}>
          <img src={authorizedFetchUrl(entry.path)} alt={entry.name} />
        </div>
      )}
      <div className={styles.name}>{entry.name}</div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Тип</span>
        <span className={styles.rowValue}>{entry.isDir ? 'Папка' : (extensionOf(entry.name) || 'Файл')}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Размер</span>
        <span className={styles.rowValue}>{formatSize(entry.size, entry.isDir)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Изменён</span>
        <span className={styles.rowValue}>{formatDate(entry.modified)}</span>
      </div>
      <div className={styles.row}>
        <span className={styles.rowLabel}>Путь</span>
        <span className={styles.rowValue}>{entry.path}</span>
      </div>
      {entry.contentType && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>MIME</span>
          <span className={styles.rowValue}>{entry.contentType}</span>
        </div>
      )}
    </div>
  )
}
