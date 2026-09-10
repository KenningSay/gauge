import { useEffect, useState } from 'react'

// The name column is deliberately left out: with table-layout:fixed, a
// column with no explicit width absorbs whatever space the others don't
// use, which is exactly the "name takes the rest of the row" behavior a
// file list wants (and what keeps it filling the row on mobile once
// modified/type get hidden). Excel-style manual widths make sense for the
// columns that actually collide (a number column too narrow for its digits).
export type ColumnKey = 'modified' | 'size' | 'type'

export const COLUMN_MIN: Record<ColumnKey, number> = { modified: 90, size: 70, type: 60 }
// An upper bound matters here specifically because the name column has no
// bound of its own — it just takes whatever's left. Without a cap, one fast
// drag could balloon a column and squeeze name toward zero, taking its own
// filenames (and the handle needed to undo the drag) off past the visible
// edge with no way to grab it back.
export const COLUMN_MAX: Record<ColumnKey, number> = { modified: 260, size: 160, type: 160 }
const DEFAULTS: Record<ColumnKey, number> = { modified: 130, size: 90, type: 80 }
const STORAGE_KEY = 'gauge-column-widths'

function clamp(col: ColumnKey, px: number): number {
  return Math.min(COLUMN_MAX[col], Math.max(COLUMN_MIN[col], px))
}

function load(): Record<ColumnKey, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULTS }
    const parsed = JSON.parse(raw)
    const merged = { ...DEFAULTS, ...parsed }
    // Re-clamp on load too — a width saved before COLUMN_MAX existed (or
    // edited by hand in devtools/localStorage) shouldn't be able to wedge
    // the layout permanently; every load lands back inside today's bounds.
    return { modified: clamp('modified', merged.modified), size: clamp('size', merged.size), type: clamp('type', merged.type) }
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
    setWidths((prev) => ({ ...prev, [col]: clamp(col, prev[col] + deltaPx) }))
  }

  // Double-click a resize handle to snap that one column back to its
  // default — a deliberate escape hatch so a bad drag is never a dead end.
  const reset = (col: ColumnKey) => {
    setWidths((prev) => ({ ...prev, [col]: DEFAULTS[col] }))
  }

  return { widths, resize, reset }
}
