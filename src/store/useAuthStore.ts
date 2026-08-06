import { create } from 'zustand'
import { setCredentials, clearCredentials, list } from '../api/webdav'

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
    setCredentials(username, password)
    try {
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
    setCredentials(stored.username, stored.password)
    try {
      await list('/')
      set({ authenticated: true, username: stored.username, loading: false })
    } catch {
      clearCredentials()
      sessionStorage.removeItem(STORAGE_KEY)
      set({ loading: false })
    }
  },
}))
