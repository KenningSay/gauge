import { CheckCircle2, XCircle, Info, UploadCloud } from 'lucide-react'
import { useUiStore } from '../store/useUiStore'
import { useFileStore } from '../store/useFileStore'
import { formatSize } from '../utils/format'
import styles from './Toast.module.css'

const ICONS = {
  success: <CheckCircle2 size={18} color="var(--signal)" />,
  error: <XCircle size={18} color="var(--danger)" />,
  info: <Info size={18} color="var(--tick)" />,
}

// Lives in the same notification stack as the toasts (not a separate
// component/position) because it's the same visual slot conceptually — one
// persistent card instead of an auto-dismissing one, shown while an upload
// is in flight. Before this there was no upload feedback at all beyond the
// eventual success/error toast — for anything bigger than a tiny file there
// was no way to tell it was actually doing something. Complaint 2026-08-25.
function UploadProgressCard() {
  const progress = useFileStore((s) => s.uploadProgress)
  if (!progress) return null
  const { filesTotal, filesDone, bytesTotal, bytesLoaded } = progress
  const pct = bytesTotal > 0
    ? Math.round((bytesLoaded / bytesTotal) * 100)
    : (filesTotal > 0 ? Math.round((filesDone / filesTotal) * 100) : 0)
  return (
    <div className={`${styles.toast} ${styles.progress}`}>
      <UploadCloud size={18} color="var(--signal)" />
      <div className={styles.progressBody}>
        <div className={styles.progressLabel}>
          <span>Загрузка {filesDone}/{filesTotal}</span>
          <span>{formatSize(bytesLoaded, false)} / {formatSize(bytesTotal, false)}</span>
        </div>
        <div className={styles.progressTrack}>
          <div className={styles.progressFill} style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts)
  const dismissToast = useUiStore((s) => s.dismissToast)

  return (
    <div className={styles.wrap}>
      <UploadProgressCard />
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} onClick={() => dismissToast(t.id)}>
          {ICONS[t.type]}
          {t.message}
        </div>
      ))}
    </div>
  )
}
