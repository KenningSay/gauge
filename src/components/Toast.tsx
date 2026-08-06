import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { useUiStore } from '../store/useUiStore'
import styles from './Toast.module.css'

const ICONS = {
  success: <CheckCircle2 size={18} color="var(--signal)" />,
  error: <XCircle size={18} color="var(--danger)" />,
  info: <Info size={18} color="var(--tick)" />,
}

export function ToastContainer() {
  const toasts = useUiStore((s) => s.toasts)
  const dismissToast = useUiStore((s) => s.dismissToast)

  return (
    <div className={styles.wrap}>
      {toasts.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[t.type]}`} onClick={() => dismissToast(t.id)}>
          {ICONS[t.type]}
          {t.message}
        </div>
      ))}
    </div>
  )
}
