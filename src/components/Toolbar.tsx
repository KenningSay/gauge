import { useRef } from 'react'
import { FolderPlus, Upload, LayoutGrid, List, Sun, Moon, Search, Trash2, Gauge as GaugeIcon } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import styles from './Toolbar.module.css'

interface Props {
  theme: 'dark' | 'light'
  onToggleTheme: () => void
}

export function Toolbar({ theme, onToggleTheme }: Props) {
  const viewMode = useFileStore((s) => s.viewMode)
  const setViewMode = useFileStore((s) => s.setViewMode)
  const createFolder = useFileStore((s) => s.createFolder)
  const uploadFiles = useFileStore((s) => s.uploadFiles)
  const openCommandPalette = useFileStore((s) => s.openCommandPalette)
  const selected = useFileStore((s) => s.selected)
  const entries = useFileStore((s) => s.entries)
  const deleteEntries = useFileStore((s) => s.deleteEntries)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleNewFolder = async () => {
    const name = window.prompt('Имя новой папки')
    if (name) await createFolder(name)
  }

  const handleUploadClick = () => fileInput.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(e.target.files)
    }
    e.target.value = ''
  }

  const handleDelete = async () => {
    if (selected.size === 0) return
    if (!window.confirm(`Удалить ${selected.size} объект(ов)?`)) return
    const toDelete = entries.filter((en) => selected.has(en.path))
    await deleteEntries(toDelete)
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.brand}>
        <GaugeIcon size={20} color="var(--signal)" />
        Gauge
      </div>

      <button className={styles.iconBtn} title="Новая папка" onClick={handleNewFolder}>
        <FolderPlus size={18} />
      </button>
      <button className={styles.iconBtn} title="Загрузить файлы" onClick={handleUploadClick}>
        <Upload size={18} />
      </button>
      <input ref={fileInput} type="file" multiple hidden onChange={handleFileChange} />

      {selected.size > 0 && (
        <button className={styles.iconBtn} title="Удалить выбранное" onClick={handleDelete}>
          <Trash2 size={18} color="var(--danger)" />
        </button>
      )}

      <div className={styles.spacer} />

      <button className={styles.paletteHint} onClick={openCommandPalette}>
        <Search size={15} />
        Команды
        <kbd>Ctrl K</kbd>
      </button>

      <button
        className={`${styles.iconBtn} ${viewMode === 'list' ? styles.active : ''}`}
        title="Список"
        onClick={() => setViewMode('list')}
      >
        <List size={18} />
      </button>
      <button
        className={`${styles.iconBtn} ${viewMode === 'grid' ? styles.active : ''}`}
        title="Сетка"
        onClick={() => setViewMode('grid')}
      >
        <LayoutGrid size={18} />
      </button>
      <button className={styles.iconBtn} title="Тема" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
    </div>
  )
}
