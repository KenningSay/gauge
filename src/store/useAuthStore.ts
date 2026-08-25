import { create } from 'zustand'
import { setCredentials, clearCredentials, list, onUnauthorized } from '../api/webdav'

const STORAGE_KEY = 'gauge-auth'

interface StoredAuth {
  username: string
  password: string
}

function loadStored(): StoredAuth | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

interface AuthStore {
  authenticated: boolean
  username: string | null
  loading: boolean
  error: string | null
  login: (username: string, password: string) => Promise<boolean>
  logout: () => void
  restoreSession: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  authenticated: false,
  username: null,
  loading: false,
  error: null,

  login: async (username, password) => {
    set({ loading: true, error: null })
    try {
      setCredentials(username, password)
      await list('/')
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ username, password }))
      set({ authenticated: true, username, loading: false })
      return true
    } catch {
      clearCredentials()
      set({ loading: false, error: 'Неверный логин или пароль' })
      return false
    }
  },

  logout: () => {
    clearCredentials()
    sessionStorage.removeItem(STORAGE_KEY)
    set({ authenticated: false, username: null })
  },

  restoreSession: async () => {
    const stored = loadStored()
    if (!stored) return
    set({ loading: true })
    try {
      setCredentials(stored.username, stored.password)
      await list('/')
      set({ authenticated: true, username: stored.username, loading: false })
    } catch {
      clearCredentials()
      sessionStorage.removeItem(STORAGE_KEY)
      set({ loading: false })
    }
  },
}))

// A 401 arriving mid-session (credentials revoked/changed server-side, a
// stale session) previously cleared webdav.ts's own internal state but left
// this store's `authenticated` flag — and the session sitting in
// sessionStorage — untouched, so the UI stayed on the file manager with
// every request now silently failing instead of returning to the login
// screen. Registered here rather than inside webdav.ts to avoid a circular
// import (this file already imports from webdav.ts).
onUnauthorized(() => {
  sessionStorage.removeItem(STORAGE_KEY)
  useAuthStore.setState({ authenticated: false, username: null, error: 'Сессия истекла — войдите заново' })
})
