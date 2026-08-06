import { File as FileIcon, Download } from 'lucide-react'
import type { FileEntry } from '../../api/types'
import { authorizedFetchUrl } from '../../api/webdav'
import { formatSize } from '../../utils/format'
import styles from './MediaViewer.module.css'

export function GenericViewer({ entry }: { entry: FileEntry }) {
  return (
    <div className={styles.audioWrap}>
      <div className={styles.audioIcon} style={{ background: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.3)' }}>
        <FileIcon size={44} color="var(--tick)" />
      </div>
      <div style={{ textAlign: 'center' }}>
        <div className="mono" style={{ fontSize: 16 }}>{entry.name}</div>
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginTop: 4 }}>{formatSize(entry.size, false)}</div>
      </div>
      <a
        href={authorizedFetchUrl(entry.path)}
        download={entry.name}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px',
          borderRadius: 999, border: '1px solid rgba(255,255,255,0.14)',
          background: 'rgba(255,255,255,0.08)', color: '#e8eae6', textDecoration: 'none',
        }}
      >
        <Download size={16} /> Скачать файл
      </a>
    </div>
  )
}
