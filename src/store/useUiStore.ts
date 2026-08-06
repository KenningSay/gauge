import { create } from 'zustand'

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

interface DialogState {
  kind: 'confirm' | 'prompt'
  message: string
  defaultValue?: string
  resolve: (value: string | boolean | null) => void
}

interface UiStore {
  toasts: Toast[]
  pushToast: (message: string, type?: Toast['type']) => void
  dismissToast: (id: number) => void

  dialog: DialogState | null
  confirmDialog: (message: string) => Promise<boolean>
  promptDialog: (message: string, defaultValue?: string) => Promise<string | null>
  resolveDialog: (value: string | boolean | null) => void

  propertiesOpen: boolean
  toggleProperties: () => void

  sidebarOpen: boolean
  toggleSidebar: () => void
  closeSidebar: () => void
}

let toastId = 0

export const useUiStore = create<UiStore>((set, get) => ({
  toasts: [],
  pushToast: (message, type = 'success') => {
    const id = ++toastId
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(() => get().dismissToast(id), 3200)
  },
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  dialog: null,
  confirmDialog: (message) =>
    new Promise<boolean>((resolve) => {
      set({
        dialog: {
          kind: 'confirm',
          message,
          resolve: (v) => resolve(Boolean(v)),
        },
      })
    }),
  promptDialog: (message, defaultValue = '') =>
    new Promise<string | null>((resolve) => {
      set({
        dialog: {
          kind: 'prompt',
          message,
          defaultValue,
          resolve: (v) => resolve(typeof v === 'string' ? v : null),
        },
      })
    }),
  resolveDialog: (value) => {
    get().dialog?.resolve(value)
    set({ dialog: null })
  },

  propertiesOpen: false,
  toggleProperties: () => set((s) => ({ propertiesOpen: !s.propertiesOpen })),

  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  closeSidebar: () => set({ sidebarOpen: false }),
}))
