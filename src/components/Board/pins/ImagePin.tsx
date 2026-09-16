import { useCallback, useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { ImagePin as ImagePinT } from '../../../api/board'
import { acquireBlobUrl, releaseBlobUrl } from '../../../utils/blobCache'
import { useFileStore } from '../../../store/useFileStore'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

export function ImagePin({ pin }: { pin: ImagePinT }) {
  const { activated, registerDoubleClick } = usePinActivation()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const openFileViewer = useFileStore((s) => s.openViewer)


  const openInViewer = useCallback(() => {
    openFileViewer({
      name: pin.fileName,
      path: pin.assetPath,
      isDir: false,
      size: pin.fileSize,
      modified: pin.updatedAt,
      contentType: pin.mimeType,
    })
    return true
  }, [openFileViewer, pin.fileName, pin.assetPath, pin.fileSize, pin.updatedAt, pin.mimeType])

  useEffect(() => {
    registerDoubleClick(openInViewer)
    return () => registerDoubleClick(null)
  }, [registerDoubleClick, openInViewer])

  useEffect(() => {
    let cancelled = false
    acquireBlobUrl(pin.assetPath)
      .then((u) => {
        // No release here when cancelled: the cleanup below already did it.
        // Releasing twice for one acquire drove the refcount past zero and
        // revoked a URL another mount was still using — under StrictMode's
        // mount/unmount/mount that happens on every image pin, and the
        // <img> ended up pointing at a revoked blob (blank pin, no error).
        if (cancelled) return
        setUrl(u)
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
      releaseBlobUrl(pin.assetPath)
    }
  }, [pin.assetPath])

  if (failed) {
    return (
      <div className={styles.mediaPlaceholder}>
        <ImageOff size={28} />
      </div>
    )
  }

  if (!url) {
    return <div className={styles.mediaPlaceholder}>Загрузка…</div>
  }

  return (
    <img
      className={`${styles.media} ${activated ? styles.mediaActive : ''}`}
      src={url}
      alt={pin.description || pin.fileName}
      draggable={false}
    />
  )
}

