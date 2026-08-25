import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Download, Loader2 } from 'lucide-react'
import { useFileStore } from '../../store/useFileStore'
import { detectViewerKind } from '../../api/types'
import { useAuthorizedUrl } from '../../hooks/useAuthorizedUrl'
import { downloadEntry } from '../../utils/download'
import { ImageViewer } from './ImageViewer'
import { VideoViewer } from './VideoViewer'
import { AudioViewer } from './AudioViewer'
import { TextViewer } from './TextViewer'
import { GenericViewer } from './GenericViewer'
import styles from './ViewerModal.module.css'

const BLOB_KINDS = new Set(['image', 'video', 'audio', 'pdf'])

export function ViewerModal() {
  const entry = useFileStore((s) => s.viewerEntry)
  const close = useFileStore((s) => s.closeViewer)
  const viewNext = useFileStore((s) => s.viewNext)

  // kind/path computed null-safe so the hook call below stays unconditional
  // (rules of hooks) ahead of the `if (!entry) return null` below. Text/none
  // kinds fetch their own content elsewhere, so pass null to skip the blob
  // fetch for those.
  const kind = entry ? detectViewerKind(entry) : null
  const needsBlob = kind !== null && BLOB_KINDS.has(kind)
  const { url: src, loading } = useAuthorizedUrl(needsBlob && entry ? entry.path : null)

  useEffect(() => {
    if (!entry) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowLeft') viewNext(-1)
      if (e.key === 'ArrowRight') viewNext(1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [entry, close, viewNext])

  if (!entry) return null

  const isText = kind === 'text'

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.header} onClick={(e) => e.stopPropagation()}>
        <span className={styles.title}>{entry.name}</span>
        <div className={styles.spacer} />
        <button className={styles.iconBtn} onClick={() => downloadEntry(entry.path, entry.name)} title="Скачать">
          <Download size={17} />
        </button>
        <button className={styles.iconBtn} onClick={close} title="Закрыть (Esc)">
          <X size={18} />
        </button>
      </div>

      <div className={styles.body} onClick={(e) => isText && e.stopPropagation()}>
        {!isText && (
          <button className={`${styles.navBtn} ${styles.navPrev}`} onClick={(e) => { e.stopPropagation(); viewNext(-1) }}>
            <ChevronLeft size={22} />
          </button>
        )}

        {needsBlob && loading && (
          <div className={styles.loading}><Loader2 size={28} className="spin" /></div>
        )}
        {kind === 'image' && src && <ImageViewer src={src} alt={entry.name} />}
        {kind === 'video' && src && <VideoViewer src={src} />}
        {kind === 'audio' && src && <AudioViewer src={src} name={entry.name} />}
        {kind === 'text' && <TextViewer entry={entry} />}
        {kind === 'pdf' && src && (
          <iframe src={src} title={entry.name} style={{ width: '90%', height: '100%', border: 'none', borderRadius: 10, background: '#fff' }} />
        )}
        {kind === 'none' && <GenericViewer entry={entry} />}

        {!isText && (
          <button className={`${styles.navBtn} ${styles.navNext}`} onClick={(e) => { e.stopPropagation(); viewNext(1) }}>
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </div>
  )
}
