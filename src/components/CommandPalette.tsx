import { useEffect, useMemo, useState } from 'react'
import { Search, Folder, File as FileIcon, FolderPlus, Home, LayoutGrid, List } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import styles from './CommandPalette.module.css'

interface Cmd {
  id: string
  label: string
  icon: React.ReactNode
  hint?: string
  run: () => void
}

export function CommandPalette() {
  const open = useFileStore((s) => s.commandPaletteOpen)
  const close = useFileStore((s) => s.closeCommandPalette)
  const navigate = useFileStore((s) => s.navigate)
  const openViewer = useFileStore((s) => s.openViewer)
  const createFolder = useFileStore((s) => s.createFolder)
  const setViewMode = useFileStore((s) => s.setViewMode)
  const entries = useFileStore((s) => s.entries)

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  useEffect(() => {
    if (open) { setQuery(''); setActiveIdx(0) }
  }, [open])

  const commands: Cmd[] = useMemo(() => {
    const staticCmds: Cmd[] = [
      { id: 'root', label: 'Перейти в корень', icon: <Home size={16} />, run: () => navigate('/') },
      { id: 'new-folder', label: 'Новая папка', icon: <FolderPlus size={16} />, run: () => { const n = window.prompt('Имя папки'); if (n) createFolder(n) } },
      { id: 'view-list', label: 'Вид: список', icon: <List size={16} />, run: () => setViewMode('list') },
      { id: 'view-grid', label: 'Вид: сетка', icon: <LayoutGrid size={16} />, run: () => setViewMode('grid') },
    ]
    const entryCmds: Cmd[] = entries.map((entry) => ({
      id: entry.path,
      label: entry.name,
      icon: entry.isDir ? <Folder size={16} color="var(--signal)" /> : <FileIcon size={16} />,
      hint: entry.isDir ? 'папка' : 'файл',
      run: () => (entry.isDir ? navigate(entry.path) : openViewer(entry)),
    }))
    const all = [...staticCmds, ...entryCmds]
    if (!query.trim()) return all
    const q = query.toLowerCase()
    return all.filter((c) => c.label.toLowerCase().includes(q))
  }, [entries, query, navigate, openViewer, createFolder, setViewMode])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, commands.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
      if (e.key === 'Enter') { commands[activeIdx]?.run(); close() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, commands, activeIdx, close])

  if (!open) return null

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        <div className={styles.inputRow}>
          <Search size={18} color="var(--text-faint)" />
          <input
            autoFocus
            placeholder="Команда или имя файла…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
          />
        </div>
        <div className={styles.list}>
          {commands.map((c, i) => (
            <button
              key={c.id}
              className={`${styles.item} ${i === activeIdx ? styles.active : ''}`}
              onMouseEnter={() => setActiveIdx(i)}
              onClick={() => { c.run(); close() }}
            >
              {c.icon}
              {c.label}
              {c.hint && <span className={styles.hint}>{c.hint}</span>}
            </button>
          ))}
          {commands.length === 0 && (
            <div style={{ padding: 16, color: 'var(--text-faint)' }}>Ничего не найдено</div>
          )}
        </div>
      </div>
    </div>
  )
}
