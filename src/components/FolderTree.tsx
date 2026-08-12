import { useEffect, useState, useCallback, useRef } from 'react'
import { ChevronRight, Folder, FolderOpen, HardDrive } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { useUiStore } from '../store/useUiStore'
import * as webdav from '../api/webdav'
import type { FileEntry } from '../api/types'
import styles from './FolderTree.module.css'

interface NodeProps {
  path: string
  name: string
  depth: number
}

function TreeNode({ path, name, depth }: NodeProps) {
  const [open, setOpen] = useState(depth === 0)
  const [children, setChildren] = useState<FileEntry[] | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const currentPath = useFileStore((s) => s.currentPath)
  const navigate = useFileStore((s) => s.navigate)
  const moveEntries = useFileStore((s) => s.moveEntries)
  const entries = useFileStore((s) => s.entries)

  const active = currentPath === path

  // Guards against load() being called again (open/close toggle, an entries
  // change elsewhere) before a prior call has resolved — a slow, superseded
  // response would otherwise land after the fresh one and show stale children.
  const loadGen = useRef(0)
  const load = useCallback(async () => {
    const gen = ++loadGen.current
    const list = await webdav.list(path)
    if (gen !== loadGen.current) return
    setChildren(list.filter((e) => e.isDir))
  }, [path])

  useEffect(() => {
    if (open && children === null) load()
  }, [open, children, load])

  // keep tree in sync when files change elsewhere (e.g. after a move) while expanded
  useEffect(() => {
    if (open && currentPath === path) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries])

  const handleClick = () => {
    navigate(path)
    if (!open) setOpen(true)
    useUiStore.getState().closeSidebar()
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const internal = e.dataTransfer.getData('application/x-gauge-paths')
    if (!internal) return
    const paths: string[] = JSON.parse(internal)
    const moving = entries.filter((en) => paths.includes(en.path) && en.path !== path)
    if (moving.length) {
      await moveEntries(moving, path)
      setChildren(null)
      if (open) load()
    }
  }

  return (
    <div>
      <div
        className={`${styles.node} ${active ? styles.active : ''} ${dragOver ? styles.dragOver : ''}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={handleClick}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <span
          className={`${styles.chevron} ${open ? styles.open : ''}`}
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        >
          <ChevronRight size={14} />
        </span>
        {depth === 0 ? <HardDrive size={16} color="var(--signal)" /> : active || open ? (
          <FolderOpen size={16} color="var(--signal)" />
        ) : (
          <Folder size={16} color="var(--signal)" />
        )}
        <span className={styles.label}>{name}</span>
      </div>
      {open && children && children.map((child) => (
        <TreeNode key={child.path} path={child.path} name={child.name} depth={depth + 1} />
      ))}
    </div>
  )
}

export function FolderTree() {
  const sidebarOpen = useUiStore((s) => s.sidebarOpen)
  const closeSidebar = useUiStore((s) => s.closeSidebar)
  return (
    <>
      <div className={`${styles.backdrop} ${sidebarOpen ? styles.open : ''}`} onClick={closeSidebar} />
      <div className={`${styles.sidebar} ${sidebarOpen ? styles.open : ''}`}>
        <TreeNode path="/" name="Gauge" depth={0} />
      </div>
    </>
  )
}
