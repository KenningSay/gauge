// The small things you pin onto a note: a paperclip over the corner, a
// pushpin, a star, a folded ribbon, a bracket.
//
// Each is inline SVG rather than an icon font or an image: they have to
// take the note's accent colour, sit half outside the card, and stay sharp
// at any zoom. Each one remembers the corner it was dropped on, and the
// corner decides both where it sits and which way it faces.

import type { Decor, DecorCorner, DecorKind } from '../../../api/board'
import styles from './Pins.module.css'

const CORNER_CLASS: Record<DecorCorner, string> = {
  tl: styles.decorTl,
  tr: styles.decorTr,
  bl: styles.decorBl,
  br: styles.decorBr,
}

// Drawn in a 32×32 box, centred on the corner it belongs to.
export function DecorGlyph({ kind }: { kind: DecorKind }) {
  switch (kind) {
    case 'clip':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M21 6v16a5 5 0 0 1-10 0V8a3 3 0 0 1 6 0v13a1.5 1.5 0 0 1-3 0V9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'pushpin':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M16 20v8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          <path
            d="M9 8h14l-2.5 4.5 3.5 5.5H8l3.5-5.5L9 8Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'star':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="m16 5 3.3 6.9 7.7 1-5.6 5.3 1.4 7.5L16 22.2 9.2 25.7l1.4-7.5L5 12.9l7.7-1L16 5Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'heart':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M16 26S5 19.3 5 12.9A5.9 5.9 0 0 1 16 9.8 5.9 5.9 0 0 1 27 12.9C27 19.3 16 26 16 26Z"
            fill="currentColor"
          />
        </svg>
      )
    case 'arrow':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M5 16h20M18 9l7 7-7 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'chevron':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M8 6l8 10-8 10M18 6l8 10-8 10" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'bracketCorner':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M28 4H4v24" stroke="currentColor" strokeWidth="3" strokeLinecap="square" />
        </svg>
      )
    case 'ribbonCorner':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M0 0h32L18 14 0 32V0Z" fill="currentColor" />
          <path d="M0 0h32L18 14" stroke="currentColor" strokeWidth="1" />
        </svg>
      )
    case 'barcodeTag':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="4" y="8" width="24" height="16" rx="2" stroke="currentColor" strokeWidth="2" />
          <path
            d="M8 12v8M11 12v8M14 12v8M18 12v8M21 12v8M24 12v8"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'dot':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="7" fill="currentColor" />
          <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
        </svg>
      )
  }
}

export function NoteDecor({ items, accent }: { items: Decor[]; accent: string }) {
  if (items.length === 0) return null
  return (
    <>
      {items.map((d) => (
        <span
          key={d.id}
          className={`${styles.decor} ${CORNER_CLASS[d.corner]}`}
          style={{ color: d.color ?? accent }}
          aria-hidden
        >
          <DecorGlyph kind={d.kind} />
        </span>
      ))}
    </>
  )
}
