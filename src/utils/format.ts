export function formatSize(bytes: number, isDir: boolean): string {
  if (isDir) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const value = bytes / Math.pow(1024, i)
  return `${i === 0 ? value : value.toFixed(1)} ${units[i]}`
}

export function formatDate(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  const sameYear = d.getFullYear() === now.getFullYear()
  // Another year switches to an all-numeric date rather than adding a year
  // to the spelled-out month: ru-RU renders that as "01 сент. 2025 г.,
  // 13:40", half again as wide as the same-year form and wider than the
  // column it lives in — the short numeric form is the same width as the
  // in-year one, so the column never has to be sized for a rare case.
  return sameYear
    ? d.toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function extensionOf(name: string): string {
  const parts = name.split('.')
  return parts.length > 1 ? parts.pop()!.toUpperCase() : ''
}
