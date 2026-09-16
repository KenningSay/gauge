import { useEffect, useRef } from 'react'
import type { VideoPin as VideoPinT } from '../../../api/board'
import { davUrl } from '../../../api/webdav'
import { usePinActivation } from '../PinShell'
import styles from './Pins.module.css'

export function VideoPin({ pin }: { pin: VideoPinT }) {
  const { activated } = usePinActivation()
  const ref = useRef<HTMLVideoElement | null>(null)
  const src = davUrl(pin.assetPath)

  // Pause when the pin deactivates — otherwise a "closed" pin keeps
  // playing audio from off-screen, which is jarring once the user has
  // panned away.
  useEffect(() => {
    if (!activated) ref.current?.pause()
  }, [activated])

  return (
    <video
      ref={ref}
      className={`${styles.media} ${activated ? styles.mediaActive : ''}`}
      src={src}
      controls={activated}
      preload="metadata"
      playsInline
    />
  )
}