import { useState } from 'react'
import { Gauge as GaugeIcon, Loader2, LogIn } from 'lucide-react'
import { useAuthStore } from '../store/useAuthStore'
import styles from './LoginScreen.module.css'

export function LoginScreen() {
  const login = useAuthStore((s) => s.login)
  const loading = useAuthStore((s) => s.loading)
  const error = useAuthStore((s) => s.error)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!username || !password) return
    await login(username, password)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <GaugeIcon size={26} color="var(--signal)" />
          Gauge
        </div>
        <div className={styles.subtitle}>Вход в файловый менеджер</div>
        <div className={styles.ratchet} />

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="gauge-login-username">Логин</label>
            <input
              id="gauge-login-username"
              autoFocus
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="gauge-login-password">Пароль</label>
            <input
              id="gauge-login-password"
              type="password"
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <button className={styles.submit} type="submit" disabled={loading || !username || !password}>
            {loading ? <Loader2 size={17} className="spin" /> : <LogIn size={17} />}
            Войти
          </button>

          {error && <div className={styles.error}>{error}</div>}
        </form>
      </div>
    </div>
  )
}
