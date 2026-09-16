import { useEffect, useState } from 'react'
import { Music, Play, Loader2 } from 'lucide-react'
import type { AudioPin as AudioPinT } from '../../../api/board'
import { acquireBlobUrl, releaseBlobUrl } from '../../../utils/blobCache'
import { useUiStore } from '../../../store/useUiStore'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

export function AudioPin({ pin }: { pin: AudioPinT }) {
  const { activated } = usePinActivation()
  const [cover, setCover] = useState<string | null>(null)
  const [coverFailed, setCoverFailed] = useState(false)
  const pushToast = useUiStore((s) => s.pushToast)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    // Load the asset as a blob just to read ID3 tags out of it — the
    // audio itself plays through the (not-yet-written) global player, but
    // the cover art has to come from somewhere and the ID3 APIC frame is
    // the most reliable. Until ID3 parsing lands, this just resolves the
    // asset's own URL and does nothing with it beyond confirming it
    // exists; the "no cover" fallback icon shows either way.
    void (async () => {
      try {
        const url = await acquireBlobUrl(pin.assetPath)
        if (!cancelled) setCover(url)
      } catch {
        if (!cancelled) setCoverFailed(true)
      }
    })()
    return () => {
      cancelled = true
      releaseBlobUrl(pin.assetPath)
    }
  }, [pin.assetPath])

  const onPlayClick = () => {
    setLoading(true)
    // The global audio player lands in a follow-up delivery. Until then,
    // this button tells the user what would happen rather than pretending
    // to do something — a silent no-op is worse than an honest "скоро".
    setTimeout(() => {
      setLoading(false)
      pushToast('Глобальный плеер появится в следующей версии', 'info')
    }, 120)
  }

  void activated
  void coverFailed

  return (
    <div className={styles.audioWrap}>
      {cover ? (
        <img className={styles.audioCover} src={cover} alt={pin.fileName} />
      ) : (
        <div className={styles.audioCoverFallback}>
          <Music size={28} />
        </div>
      )}
      <div className={styles.audioTitle}>{pin.title || pin.fileName}</div>
      {pin.artist && <div className={styles.audioArtist}>{pin.artist}</div>}
      <button className={styles.audioPlay} onClick={onPlayClick} title="Воспроизвести">
        {loading ? <Loader2 size={16} className="spin" /> : <Play size={16} />}
      </button>
    </div>
  )
}