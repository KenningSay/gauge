import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Toolbar } from './components/Toolbar'
import { Breadcrumbs } from './components/Breadcrumbs'
import { FileList } from './components/FileList'
import { FolderTree } from './components/FolderTree'
import { ContextMenu } from './components/ContextMenu'
import { CommandPalette } from './components/CommandPalette'
import { PropertiesPanel } from './components/PropertiesPanel'
import { ToastContainer } from './components/Toast'
import { Dialog } from './components/Dialog'
import { LoginScreen } from './components/LoginScreen'
import { ViewerModal } from './components/Viewer/ViewerModal'
import { useFileStore } from './store/useFileStore'
import { useUiStore } from './store/useUiStore'
import { useAuthStore } from './store/useAuthStore'
import styles from './App.module.css'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('gauge-theme')
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function MainApp() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const navigate = useFileStore((s) => s.navigate)
  const openCommandPalette = useFileStore((s) => s.openCommandPalette)
  const closeCommandPalette = useFileStore((s) => s.closeCommandPalette)
  const commandPaletteOpen = useFileStore((s) => s.commandPaletteOpen)
  const selected = useFileStore((s) => s.selected)
  const entries = useFileStore((s) => s.entries)
  const deleteEntries = useFileStore((s) => s.deleteEntries)
  const clearSelection = useFileStore((s) => s.clearSelection)
  const startRename = useFileStore((s) => s.startRename)
  const renamingPath = useFileStore((s) => s.renamingPath)
  const viewerEntry = useFileStore((s) => s.viewerEntry)
  const moveCursor = useFileStore((s) => s.moveCursor)
  const activateCursor = useFileStore((s) => s.activateCursor)
  const goUp = useFileStore((s) => s.goUp)
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const toggleProperties = useUiStore((s) => s.toggleProperties)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('gauge-theme', theme)
  }, [theme])

  useEffect(() => {
    navigate('/')
  }, [navigate])

  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        commandPaletteOpen ? closeCommandPalette() : openCommandPalette()
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        toggleProperties()
        return
      }
      if (viewerEntry || commandPaletteOpen || renamingPath) return

      if (e.key === 'Delete' && selected.size > 0) {
        const toDelete = entries.filter((en) => selected.has(en.path))
        const ok = await confirmDialog(`Удалить ${toDelete.length} объект(ов)? Это необратимо.`)
        if (ok) await deleteEntries(toDelete)
        return
      }
      if (e.key === 'F2' && selected.size === 1) {
        startRename(Array.from(selected)[0])
        return
      }

      const target = e.target as HTMLElement | null
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
      if (typing) return

      if (e.key === 'ArrowDown') { e.preventDefault(); moveCursor(1) }
      if (e.key === 'ArrowUp') { e.preventDefault(); moveCursor(-1) }
      if (e.key === 'Enter') { e.preventDefault(); activateCursor() }
      if (e.key === 'Backspace') { e.preventDefault(); goUp() }
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [
    commandPaletteOpen, openCommandPalette, closeCommandPalette, viewerEntry, renamingPath,
    selected, entries, deleteEntries, startRename, clearSelection,
    moveCursor, activateCursor, goUp, confirmDialog, toggleProperties,
  ])

  return (
    <div className={styles.app}>
      <Toolbar theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      <div className={styles.content}>
        <FolderTree />
        <div className={styles.main}>
          <Breadcrumbs />
          <FileList />
        </div>
        <PropertiesPanel />
      </div>
      <ContextMenu />
      <CommandPalette />
      <ViewerModal />
      <ToastContainer />
      <Dialog />
    </div>
  )
}

export default function App() {
  const authenticated = useAuthStore((s) => s.authenticated)
  const loading = useAuthStore((s) => s.loading)
  const restoreSession = useAuthStore((s) => s.restoreSession)
  const [restoring, setRestoring] = useState(true)

  useEffect(() => {
    document.documentElement.dataset.theme = getInitialTheme()
    restoreSession().finally(() => setRestoring(false))
  }, [restoreSession])

  if (restoring && loading) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} className="spin" color="var(--signal)" />
      </div>
    )
  }

  return authenticated ? <MainApp /> : <LoginScreen />
}
