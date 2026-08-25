import { Info, X } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { useUiStore } from '../store/useUiStore'
import { detectViewerKind } from '../api/types'
import { useAuthorizedUrl } from '../hooks/useAuthorizedUrl'
import { formatSize, formatDate, extensionOf } from '../utils/format'
import styles from './PropertiesPanel.module.css'

function PropertiesThumb({ path, name }: { path: string; name: string }) {
  const { url } = useAuthorizedUrl(path)
  if (!url) return <div className={styles.thumb} />
  return (
    <div className={styles.thumb}>
      <img src={url} alt={name} />
    </div>
  )
}

export function PropertiesPanel() {
  const open = useUiStore((s) => s.propertiesOpen)
  const toggleProperties = useUiStore((s) => s.toggleProperties)
  const selected = useFileStore((s) => s.selected)
  const entries = useFileStore((s) => s.entries)
  const currentPath = useFileStore((s) => s.currentPath)

  if (!open) return null

  const selectedEntries = entries.filter((e) => selected.has(e.path))
  const entry = selectedEntries.length === 1 ? selectedEntries[0] : null
  const isImage = entry ? detectViewerKind(entry) === 'image' : false

  return (
    <>
      <div className={styles.backdrop} onClick={toggleProperties} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <div className={styles.title} style={{ marginBottom: 0 }}>Свойства</div>
          <button className={styles.closeBtn} onClick={toggleProperties} aria-label="Закрыть свойства">
            <X size={16} />
          </button>
        </div>

        {selectedEntries.length === 0 && (
          <>
            <div className={styles.emptyState}>
              <Info size={28} style={{ marginBottom: 10, opacity: 0.5 }} />
              <div>Ничего не выбрано</div>
            </div>
          </>
        )}

        {selectedEntries.length > 1 && (
          <>
            <div className={styles.name}>{selectedEntries.length} объектов выбрано</div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Общий размер</span>
              <span className={styles.rowValue}>
                {formatSize(selectedEntries.reduce((sum, e) => sum + e.size, 0), false)}
              </span>
            </div>
            <div className={styles.row}>
              <span className={styles.rowLabel}>Расположение</span>
              <span className={styles.rowValue}>{currentPath}</span>
            </div>
          </>
        )}

        {entry && (
          <>
            {isImage && <PropertiesThumb path={entry.path} name={entry.name} />}
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
          </>
        )}
      </div>
    </>
  )
}
