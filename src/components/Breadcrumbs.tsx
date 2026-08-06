import { useFileStore } from '../store/useFileStore'
import styles from './Breadcrumbs.module.css'

export function Breadcrumbs() {
  const currentPath = useFileStore((s) => s.currentPath)
  const navigate = useFileStore((s) => s.navigate)

  const parts = currentPath.split('/').filter(Boolean)
  const crumbs = [{ name: 'Gauge', path: '/' }, ...parts.map((name, i) => ({
    name,
    path: '/' + parts.slice(0, i + 1).join('/'),
  }))]

  return (
    <div className={styles.wrap}>
      <div className={styles.ruler} />
      {crumbs.map((crumb, i) => (
        <span key={crumb.path} style={{ display: 'flex', alignItems: 'flex-end' }}>
          {i > 0 && <span className={styles.sep}>/</span>}
          <button
            className={`${styles.segment} ${i === crumbs.length - 1 ? styles.current : ''}`}
            onClick={() => navigate(crumb.path)}
          >
            {crumb.name}
          </button>
        </span>
      ))}
    </div>
  )
}
