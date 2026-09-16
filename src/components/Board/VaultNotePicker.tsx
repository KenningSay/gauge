// Picks a markdown file from the vault to put on a board as a linked note.
//
// Modelled on Obsidian Canvas's distinction between a *text card* (the text
// lives in the board file) and a *note card* (the card is a view onto a real
// note in the vault, and editing it edits that file). Gauge's boards only
// had the first kind, which meant anything written on a board was invisible
// to Obsidian — the whole point of the vault.
//
// Reuses the file manager's own recursive index rather than crawling again.

import { useEffect, useMemo, useRef, useState } from 'react'
import { FileText, Loader2, Search } from 'lucide-react'
import type { FileEntry } from '../../api/types'
import { useFileStore } from '../../store/useFileStore'
import styles from './VaultNotePicker.module.css'

interface Props {
  onPick: (entry: FileEntry) => void
  onCancel: () => void
}

export function VaultNotePicker({ onPick, onCancel }: Props) {
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const index = useFileStore((s) => s.searchIndex)
  const building = useFileStore((s) => s.indexBuilding)
  const buildSearchIndex = useFileStore((s) => s.buildSearchIndex)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!index && !building) void buildSearchIndex()
  }, [index, building, buildSearchIndex])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    const md = (index ?? []).filter((e) => !e.isDir && /\.(md|markdown|txt)$/i.test(e.name))
    const hits = q ? md.filter((e) => e.path.toLowerCase().includes(q)) : md
    // Newest first with no query: the file you want is usually one you
    // touched recently. Alphabetical would bury it under a decade of notes.
    return hits
      .sort((a, b) => (q ? a.path.length - b.path.length : (b.modified ?? '').localeCompare(a.modified ?? '')))
      .slice(0, 80)
  }, [index, query])

  useEffect(() => {
    setCursor(0)
  }, [query])

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor((c) => Math.min(c + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor((c) => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const pick = matches[cursor]
      if (pick) onPick(pick)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  return (
    <div className={styles.backdrop} onPointerDown={onCancel}>
      <div className={styles.dialog} onPointerDown={(e) => e.stopPropagation()}>
        <div className={styles.searchRow}>
          <Search size={15} className={styles.searchIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            value={query}
            placeholder="Найти заметку в хранилище…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
          />
          {building && <Loader2 size={15} className={styles.spinner} />}
        </div>

        <div className={styles.list}>
          {matches.length === 0 && (
            <div className={styles.empty}>
              {building ? 'Читаю хранилище…' : 'Ничего не найдено'}
            </div>
          )}
          {matches.map((e, i) => (
            <button
              key={e.path}
              className={`${styles.item} ${i === cursor ? styles.itemActive : ''}`}
              onPointerEnter={() => setCursor(i)}
              onClick={() => onPick(e)}
            >
              <FileText size={14} className={styles.itemIcon} />
              <span className={styles.itemName}>{e.name}</span>
              <span className={styles.itemPath}>{e.path.replace(/\/[^/]*$/, '') || '/'}</span>
            </button>
          ))}
        </div>

        <div className={styles.foot}>
          ↑↓ — выбор · Enter — добавить · Esc — отмена
        </div>
      </div>
    </div>
  )
}
