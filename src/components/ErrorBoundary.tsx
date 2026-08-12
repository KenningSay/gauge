import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import styles from './ErrorBoundary.module.css'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// Last-resort fallback for an uncaught render exception (e.g. a viewer
// choking on pathological content) — without this the whole app white-screens
// with no way back short of the user knowing to hit refresh themselves.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: unknown) {
    console.error('Gauge crashed:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className={styles.crash}>
          <AlertTriangle size={40} color="var(--danger)" />
          <div className={styles.message}>Что-то пошло не так</div>
          <button className={styles.reload} onClick={() => location.reload()}>
            Обновить страницу
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
