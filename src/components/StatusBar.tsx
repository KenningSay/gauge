import { useCallback, useEffect, useRef, useState } from 'react'
import { HardDrive } from 'lucide-react'
import { getStorageInfo, type StorageInfo } from '../api/webdav'
import { useFileStore } from '../store/useFileStore'
import { formatSize } from '../utils/format'
import styles from './StatusBar.module.css'

// The server-side numbers (a df snapshot, or the WebDAV quota props) move
// slowly — a minute between polls is plenty, with an extra fetch whenever
// the listing changes (upload, delete, paste) and when the tab regains focus.
const POLL_MS = 60_000

function levelOf(ratio: number): 'ok' | 'warn' | 'critical' {
  if (ratio >= 0.95) return 'critical'
  if (ratio >= 0.85) return 'warn'
  return 'ok'
}

export function StatusBar() {
  const entries = useFileStore((s) => s.entries)
  const [info, setInfo] = useState<StorageInfo | null>(null)
  const barRef = useRef<HTMLElement | null>(null)

  // Whatever is pinned to the bottom of the window has to clear this bar,
  // and it cannot know how tall the bar is — the height depends on the
  // font and on whether the label wraps on a phone. So the bar publishes it.
  // Without this the floating formatting bar on a phone sat under the board
  // toolbar: the toolbar moved up with the board's container, the bar,
  // fixed to the window, did not.
  useEffect(() => {
    const el = barRef.current
    const root = document.documentElement
    if (!el) {
      root.style.removeProperty('--status-bar-h')
      return
    }
    const publish = () => root.style.setProperty('--status-bar-h', `${el.offsetHeight}px`)
    publish()
    const ro = new ResizeObserver(publish)
    ro.observe(el)
    return () => {
      ro.disconnect()
      root.style.removeProperty('--status-bar-h')
    }
  }, [info])

  const refresh = useCallback(() => {
    // A failed or empty answer keeps what is already shown: dropping the bar
    // on one bad poll makes the layout jump and the numbers flicker.
    getStorageInfo()
      .then((next) => {
        if (next && next.total > 0) setInfo(next)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    refresh()
  }, [entries, refresh])

  useEffect(() => {
    const id = window.setInterval(refresh, POLL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh])

  if (!info) return null

  // used + available is less than total on ext4 (root-reserved blocks), so
  // the bar fills by what is actually no longer available to Gauge.
  const ratio = Math.min(1, Math.max(0, 1 - info.available / info.total))
  const percent = Math.round(ratio * 100)
  const level = levelOf(ratio)

  return (
    <footer
      ref={barRef}
      className={styles.bar}
      title={`Занято ${formatSize(info.used, false)} · свободно ${formatSize(info.available, false)} · всего ${formatSize(info.total, false)}`}
    >
      <HardDrive size={16} className={styles.icon} />
      <span className={styles.label}>Хранилище</span>
      <div
        className={styles.meter}
        role="meter"
        aria-label="Заполненность хранилища"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className={`${styles.fill} ${styles[level]}`} style={{ width: `${percent}%` }} />
      </div>
      <span className={`${styles.value} ${styles[level]}`}>
        свободно {formatSize(info.available, false)} из {formatSize(info.total, false)}
      </span>
      <span className={styles.percent}>{percent}%</span>
    </footer>
  )
}
