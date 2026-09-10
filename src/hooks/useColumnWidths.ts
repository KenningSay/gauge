import { useEffect, useState } from 'react'

// The name column is deliberately left out: with table-layout:fixed, a
// column with no explicit width absorbs whatever space the others don't
// use, which is exactly the "name takes the rest of the row" behavior a
// file list wants. Excel-style manual widths make sense for the columns
// that actually collide (a number column too narrow for its digits).
export type ColumnKey = 'modified' | 'size' | 'type'

export const COLUMN_MIN: Record<ColumnKey, number> = { modified: 90, size: 70, type: 60 }
const DEFAULTS: Record<ColumnKey, number> = { modified: 130, size: 90, type: 80 }
const STORAGE_KEY = 'gauge-column-widths'

function load(): Record<ColumnKey, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    return { ...DEFAULTS, ...parsed }
  } catch {
    return { ...DEFAULTS }
  }
}

export function useColumnWidths() {
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(load)

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(widths)) } catch { /* private mode etc — width just won't persist */ }
  }, [widths])

  const resize = (col: ColumnKey, deltaPx: number) => {
    setWidths((prev) => ({ ...prev, [col]: Math.max(COLUMN_MIN[col], prev[col] + deltaPx) }))
  }

  return { widths, resize }
}
