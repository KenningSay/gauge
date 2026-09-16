import { FolderOpen, LayoutDashboard } from 'lucide-react'
import { useUiStore, type ActiveTab } from '../store/useUiStore'
import styles from './ToolbarTabs.module.css'

const TABS: Array<{ id: ActiveTab; label: string; Icon: typeof FolderOpen }> = [
  { id: 'files', label: 'Файлы', Icon: FolderOpen },
  { id: 'boards', label: 'Доски', Icon: LayoutDashboard },
]

export function ToolbarTabs() {
  const activeTab = useUiStore((s) => s.activeTab)
  const setActiveTab = useUiStore((s) => s.setActiveTab)

  return (
    <div className={styles.wrap} role="tablist" aria-label="Разделы">
      {TABS.map(({ id, label, Icon }) => {
        const active = id === activeTab
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={14} />
            <span className={styles.tabLabel}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}