import { useRef } from 'react'
import { FolderPlus, Upload, LayoutGrid, List, Sun, Moon, Search, Trash2, Info, Menu, LogOut, X, CheckSquare, Copy, Scissors, Gauge as GaugeIcon } from 'lucide-react'
import { useFileStore } from '../store/useFileStore'
import { useUiStore } from '../store/useUiStore'
import { useAuthStore } from '../store/useAuthStore'
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
  const clearSelection = useFileStore((s) => s.clearSelection)
  const selectAll = useFileStore((s) => s.selectAll)
  const copyToClipboard = useFileStore((s) => s.copyToClipboard)
  const cutToClipboard = useFileStore((s) => s.cutToClipboard)
  const promptDialog = useUiStore((s) => s.promptDialog)
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const propertiesOpen = useUiStore((s) => s.propertiesOpen)
  const toggleProperties = useUiStore((s) => s.toggleProperties)
  const toggleSidebar = useUiStore((s) => s.toggleSidebar)
  const logout = useAuthStore((s) => s.logout)
  const fileInput = useRef<HTMLInputElement>(null)

  const handleNewFolder = async () => {
    const name = await promptDialog('Имя новой папки', 'Новая папка')
    if (name) await createFolder(name)
  }

  const handleUploadClick = () => fileInput.current?.click()

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await uploadFiles(e.target.files)
    }
    e.target.value = ''
  }

  const handleSelectAllToggle = () => {
    if (entries.length > 0 && selected.size === entries.length) clearSelection()
    else selectAll()
  }

  const selectedEntries = entries.filter((en) => selected.has(en.path))

  const handleDelete = async () => {
    if (selected.size === 0) return
    const ok = await confirmDialog(`Удалить ${selected.size} объект(ов)? Это необратимо.`)
    if (!ok) return
    await deleteEntries(selectedEntries)
  }

  return (
    <div className={styles.wrap}>
      <button className={`${styles.iconBtn} ${styles.hamburger}`} title="Папки" aria-label="Папки" onClick={toggleSidebar}>
        <Menu size={18} />
      </button>
      <div className={styles.brand}>
        <GaugeIcon size={20} color="var(--signal)" />
        Gauge
      </div>

      <button className={styles.iconBtn} title="Новая папка" aria-label="Новая папка" onClick={handleNewFolder}>
        <FolderPlus size={18} />
      </button>
      <button className={styles.iconBtn} title="Загрузить файлы" aria-label="Загрузить файлы" onClick={handleUploadClick}>
        <Upload size={18} />
      </button>
      <input ref={fileInput} type="file" multiple hidden onChange={handleFileChange} />

      <button
        className={`${styles.iconBtn} ${entries.length > 0 && selected.size === entries.length ? styles.active : ''}`}
        title="Выбрать всё (Ctrl A)"
        aria-label="Выбрать всё"
        aria-pressed={entries.length > 0 && selected.size === entries.length}
        onClick={handleSelectAllToggle}
        disabled={entries.length === 0}
      >
        <CheckSquare size={18} />
      </button>

      {selected.size > 0 && (
        <div className={styles.selectionPill}>
          <span>{selected.size} выбрано</span>
          <button className={styles.selectionClear} title="Отменить выбор" aria-label="Отменить выбор" onClick={clearSelection}>
            <X size={14} />
          </button>
        </div>
      )}

      {selected.size > 0 && (
        <>
          <button className={styles.iconBtn} title="Копировать выбранное" aria-label="Копировать выбранное" onClick={() => copyToClipboard(selectedEntries)}>
            <Copy size={18} />
          </button>
          <button className={styles.iconBtn} title="Вырезать выбранное" aria-label="Вырезать выбранное" onClick={() => cutToClipboard(selectedEntries)}>
            <Scissors size={18} />
          </button>
          <button className={styles.iconBtn} title="Удалить выбранное" aria-label="Удалить выбранное" onClick={handleDelete}>
            <Trash2 size={18} color="var(--danger)" />
          </button>
        </>
      )}

      <div className={styles.spacer} />

      <button className={styles.paletteHint} onClick={openCommandPalette} aria-label="Команды и поиск, Ctrl K">
        <Search size={15} />
        <span className={styles.hideOnMobile}>Команды и поиск</span>
        <kbd className={styles.hideOnMobile}>Ctrl K</kbd>
      </button>

      <button
        className={`${styles.iconBtn} ${viewMode === 'list' ? styles.active : ''}`}
        title="Список"
        aria-label="Список"
        aria-pressed={viewMode === 'list'}
        onClick={() => setViewMode('list')}
      >
        <List size={18} />
      </button>
      <button
        className={`${styles.iconBtn} ${viewMode === 'grid' ? styles.active : ''}`}
        title="Сетка"
        aria-label="Сетка"
        aria-pressed={viewMode === 'grid'}
        onClick={() => setViewMode('grid')}
      >
        <LayoutGrid size={18} />
      </button>
      <button
        className={`${styles.iconBtn} ${propertiesOpen ? styles.active : ''}`}
        title="Свойства (Ctrl I)"
        aria-label="Свойства"
        aria-pressed={propertiesOpen}
        onClick={toggleProperties}
      >
        <Info size={18} />
      </button>
      <button className={styles.iconBtn} title="Тема" aria-label="Переключить тему" onClick={onToggleTheme}>
        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      </button>
      <button className={styles.iconBtn} title="Выйти" aria-label="Выйти" onClick={logout}>
        <LogOut size={18} />
      </button>
    </div>
  )
}
