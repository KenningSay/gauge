import { useEffect, useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { ImagePin as ImagePinT } from '../../../api/board'
import { acquireBlobUrl, releaseBlobUrl } from '../../../utils/blobCache'
import { useFileStore } from '../../../store/useFileStore'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

export function ImagePin({ pin }: { pin: ImagePinT }) {
  const { activated } = usePinActivation()
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const openFileViewer = useFileStore((s) => s.openViewer)

  useEffect(() => {
    let cancelled = false
    acquireBlobUrl(pin.assetPath)
      .then((u) => {
        if (cancelled) {
          releaseBlobUrl(pin.assetPath)
          return
        }
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
      onDoubleClick={(e) => {
        // Double-click is normally intercepted by the shell as
        // "activate". For images the spec says it should open the
        // viewer instead — so we short-circuit before the shell's own
        // dblclick handler sees it.
        e.stopPropagation()
        openFileViewer({
          name: pin.fileName,
          path: pin.assetPath,
          isDir: false,
          size: pin.fileSize,
          modified: pin.updatedAt,
          contentType: pin.mimeType,
        })
      }}
    />
  )
}

