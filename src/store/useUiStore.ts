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

export type ActiveTab = 'files' | 'boards'

const TAB_STORAGE = 'gauge-active-tab'

function loadTab(): ActiveTab {
  try {
    const v = localStorage.getItem(TAB_STORAGE)
    return v === 'boards' ? 'boards' : 'files'
  } catch {
    return 'files'
  }
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

  // Top-level "which half of the app am I in" switch. Chosen over a router
  // for the same reason the file manager never had one: the two tabs don't
  // need URLs, deep links, or back/forward — they need a fast in-place
  // swap. Persisted so a reload after a session spent on boards returns
  // to boards, not to the file list.
  activeTab: ActiveTab
  setActiveTab: (tab: ActiveTab) => void
  // Whether the board's side panel is showing. It lives here because two
  // components in different trees need it: the panel owns it, and the
  // board's floating toolbar has to stand down while the panel is a
  // full-screen surface on a phone.
  boardPanelOpen: boolean
  setBoardPanelOpen: (open: boolean) => void
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

  activeTab: loadTab(),
  boardPanelOpen: false,
  setBoardPanelOpen: (open) => set({ boardPanelOpen: open }),
  setActiveTab: (tab) => {
    try {
      localStorage.setItem(TAB_STORAGE, tab)
    } catch {
      // Private-mode localStorage — tab choice just doesn't persist across
      // reloads. Not worth surfacing.
    }
    set({ activeTab: tab })
  },
}))
