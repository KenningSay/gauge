import { Music } from 'lucide-react'
import styles from './MediaViewer.module.css'

export function AudioViewer({ src, name }: { src: string; name: string }) {
  return (
    <div className={styles.audioWrap}>
      <div className={styles.audioIcon}>
        <Music size={44} color="var(--signal)" />
      </div>
      <div className="mono" style={{ fontSize: 15, color: 'var(--text-dim)' }}>{name}</div>
      <audio className={styles.audio} src={src} controls autoPlay />
    </div>
  )
}
