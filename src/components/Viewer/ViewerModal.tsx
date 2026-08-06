import { useEffect } from 'react'
import { X, ChevronLeft, ChevronRight, Download } from 'lucide-react'
import { useFileStore } from '../../store/useFileStore'
import { detectViewerKind } from '../../api/types'
import { authorizedFetchUrl } from '../../api/webdav'
import { ImageViewer } from './ImageViewer'
import { VideoViewer } from './VideoViewer'
import { AudioViewer } from './AudioViewer'
import { TextViewer } from './TextViewer'
import { GenericViewer } from './GenericViewer'
import styles from './ViewerModal.module.css'

export function ViewerModal() {
  const entry = useFileStore((s) => s.viewerEntry)
  const close = useFileStore((s) => s.closeViewer)
  const viewNext = useFileStore((s) => s.viewNext)

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

  const kind = detectViewerKind(entry)
  const src = authorizedFetchUrl(entry.path)
  const isText = kind === 'text'

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.header} onClick={(e) => e.stopPropagation()}>
        <span className={styles.title}>{entry.name}</span>
        <div className={styles.spacer} />
        <a className={styles.iconBtn} href={src} download={entry.name} title="Скачать">
          <Download size={17} />
        </a>
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

        {kind === 'image' && <ImageViewer src={src} alt={entry.name} />}
        {kind === 'video' && <VideoViewer src={src} />}
        {kind === 'audio' && <AudioViewer src={src} name={entry.name} />}
        {kind === 'text' && <TextViewer entry={entry} />}
        {kind === 'pdf' && (
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
