import { useEffect, useState } from 'react'
import { Toolbar } from './components/Toolbar'
import { Breadcrumbs } from './components/Breadcrumbs'
import { FileList } from './components/FileList'
import { ContextMenu } from './components/ContextMenu'
import { CommandPalette } from './components/CommandPalette'
import { ViewerModal } from './components/Viewer/ViewerModal'
import { useFileStore } from './store/useFileStore'
import styles from './App.module.css'

type Theme = 'dark' | 'light'

function getInitialTheme(): Theme {
  const saved = localStorage.getItem('gauge-theme')
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export default function App() {
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
  const viewerEntry = useFileStore((s) => s.viewerEntry)

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
      if (viewerEntry || commandPaletteOpen) return
      if (e.key === 'Delete' && selected.size > 0) {
        const toDelete = entries.filter((en) => selected.has(en.path))
        if (window.confirm(`Удалить ${toDelete.length} объект(ов)?`)) await deleteEntries(toDelete)
      }
      if (e.key === 'F2' && selected.size === 1) {
        startRename(Array.from(selected)[0])
      }
      if (e.key === 'Escape') clearSelection()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [commandPaletteOpen, openCommandPalette, closeCommandPalette, viewerEntry, selected, entries, deleteEntries, startRename, clearSelection])

  return (
    <div className={styles.app}>
      <Toolbar theme={theme} onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      <Breadcrumbs />
      <div className={styles.main}>
        <FileList />
      </div>
      <ContextMenu />
      <CommandPalette />
      <ViewerModal />
    </div>
  )
}
