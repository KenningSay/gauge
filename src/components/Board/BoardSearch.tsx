// Find on board. Ctrl+F, because that is the shortcut every person alive
// already knows, and the browser's own find is useless here — most of the
// board is not in the DOM at any given moment, and what is, is transformed
// somewhere off screen.

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react'
import type { Pin } from '../../api/board'
import { centreOn, findMatches, stepMatch } from '../../utils/boardSearch'
import styles from './BoardSearch.module.css'

interface Props {
  pins: Pin[]
  zoom: number
  container: { w: number; h: number }
  onJump: (viewport: { x: number; y: number }, pinId: string) => void
  onMatchesChange: (ids: Set<string>) => void
  onClose: () => void
}

export function BoardSearch({ pins, zoom, container, onJump, onMatchesChange, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const matches = useMemo(() => findMatches(pins, query), [pins, query])

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // The board highlights every match while the field is open, and stops
  // when it closes.
  useEffect(() => {
    onMatchesChange(new Set(matches.map((m) => m.id)))
    return () => onMatchesChange(new Set())
  }, [matches, onMatchesChange])

  // A new query starts from the first match rather than from wherever the
  // last one left the counter.
  useEffect(() => {
    setIndex(0)
  }, [query])

  const go = (dir: 1 | -1) => {
    if (matches.length === 0) return
    const next = stepMatch(index, matches.length, dir)
    setIndex(next)
    const m = matches[next]
    onJump(centreOn(m.cx, m.cy, zoom, container), m.id)
  }

  return (
    <div className={styles.wrap} onPointerDown={(e) => e.stopPropagation()}>
      <span className={styles.icon}><Search size={15} /></span>
      <input
        ref={inputRef}
        className={styles.input}
        value={query}
        placeholder="Найти на доске"
        aria-label="Найти на доске"
        spellCheck={false}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            go(e.shiftKey ? -1 : 1)
          } else if (e.key === 'Escape') {
            e.preventDefault()
            onClose()
          }
        }}
      />
      <span className={styles.count}>
        {query.trim() === '' ? '' : matches.length === 0 ? 'нет' : `${index + 1} / ${matches.length}`}
      </span>
      <button
        type="button"
        className={styles.btn}
        title="Предыдущее (Shift+Enter)"
        aria-label="Предыдущее совпадение"
        disabled={matches.length === 0}
        onClick={() => go(-1)}
      >
        <ChevronUp size={15} />
      </button>
      <button
        type="button"
        className={styles.btn}
        title="Следующее (Enter)"
        aria-label="Следующее совпадение"
        disabled={matches.length === 0}
        onClick={() => go(1)}
      >
        <ChevronDown size={15} />
      </button>
      <button type="button" className={styles.btn} title="Закрыть (Escape)" aria-label="Закрыть поиск" onClick={onClose}>
        <X size={15} />
      </button>
    </div>
  )
}
