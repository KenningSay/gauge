// An audio pin that actually plays.
//
// It used to download the whole file into a blob "to read ID3 tags",
// never read them, and hand the mp3 to an <img> as cover art — so every
// audio pin on a board pulled megabytes over the network to display a
// fallback icon, and the play button raised a toast saying a player would
// arrive some day.
//
// This plays through a plain <audio> pointed at the WebDAV URL, the same
// way video pins do: the service worker attaches the credential, so the
// browser streams it with Range requests instead of buffering the whole
// file first.

import { useEffect, useRef, useState } from 'react'
import { Music, Play, Pause } from 'lucide-react'
import type { AudioPin as AudioPinT } from '../../../api/board'
import { davUrl } from '../../../api/webdav'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '--:--'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function AudioPin({ pin }: { pin: AudioPinT }) {
  const { activated } = usePinActivation()
  const ref = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(pin.duration ?? NaN)

  // Same rule as video: a pin the user has panned away from shouldn't keep
  // playing. Deactivating pauses it.
  useEffect(() => {
    if (!activated) ref.current?.pause()
  }, [activated])

  const toggle = () => {
    const el = ref.current
    if (!el) return
    if (el.paused) void el.play()
    else el.pause()
  }

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el || !Number.isFinite(duration)) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    el.currentTime = ratio * duration
    setTime(el.currentTime)
  }

  const progress = Number.isFinite(duration) && duration > 0 ? (time / duration) * 100 : 0

  return (
    <div className={styles.audioWrap}>
      <div className={styles.audioCoverFallback}>
        <Music size={28} />
      </div>

      <div className={styles.audioTitle}>{pin.title || pin.fileName}</div>
      {pin.artist && <div className={styles.audioArtist}>{pin.artist}</div>}

      <div className={styles.audioControls}>
        <button
          className={styles.audioPlay}
          onClick={toggle}
          title={playing ? 'Пауза' : 'Воспроизвести'}
          aria-label={playing ? 'Пауза' : 'Воспроизвести'}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>

        <div className={styles.audioBar} onPointerDown={seek} title="Перемотать">
          {/* scaleX, not width: this moves on every timeupdate, and a width
              that changes four times a second relays out the pin each time. */}
          <div
            className={styles.audioBarFill}
            style={{ transform: `scaleX(${progress / 100})` }}
          />
        </div>

        <span className={styles.audioTime}>
          {formatTime(time)} / {formatTime(duration)}
        </span>
      </div>

      <audio
        ref={ref}
        src={davUrl(pin.assetPath)}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
      />
    </div>
  )
}
