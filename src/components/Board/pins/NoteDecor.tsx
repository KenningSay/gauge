// The small things you pin onto a note: a paperclip over the corner, a
// pushpin, a warning triangle, a level meter, a circuit trace.
//
// Each is inline SVG rather than an icon font or an image: they have to
// take the note's accent colour, sit half outside the card, and stay sharp
// at any zoom.
//
// They are objects, not ornaments — each one can be dragged anywhere on
// its note, resized, and taken off on its own. Position is kept as a
// fraction of the note's box so it survives the note being resized, and
// the glyph turns to face inward from whichever side it ends up on.

import { useEffect, useId, useRef, useState } from 'react'
import type { Decor, DecorKind } from '../../../api/board'
import { useBoardStore } from '../../../store/useBoardStore'
import { clampPos, clampSize, decorFlip, decorPos, decorSize } from '../../../utils/decorGeo'
import styles from './Pins.module.css'

// Drawn in a 32×32 box.
export function DecorGlyph({ kind }: { kind: DecorKind }) {
  // SVG ids are document-global. A hardcoded one would repeat for every
  // copy of the glyph on the board, and a mask referenced by a duplicated
  // id resolves to whichever element the document happens to see first.
  const uid = useId().replace(/:/g, '')
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

    // --- second pass, from the decal and pixel-UI sheets ---------------

    case 'gear':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M16 3.5 18 7h4l1 4 3.4 2-1.4 3.8 1.4 3.8L23 22.6l-1 4h-4L16 30l-2-3.4h-4l-1-4-3.4-2L7 16.8 5.6 13 9 11l1-4h4L16 3.5Z"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <circle cx="16" cy="16.5" r="4.6" fill="#000" fillOpacity="0.85" />
        </svg>
      )
    case 'target':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="1.6" fill="currentColor" />
          <path d="M16 1v6M16 25v6M1 16h6M25 16h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      )
    case 'lightning':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M19 2 7 18h7l-2 12 13-17h-8l2-11Z" fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'dpad':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M16 2l4 5h-8l4-5ZM16 30l-4-5h8l-4 5ZM2 16l5-4v8l-5-4ZM30 16l-5 4v-8l5 4Z"
            fill="currentColor"
          />
          <rect x="12.5" y="12.5" width="7" height="7" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'recycle':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <g stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 5.5 21 14h-5" />
            <path d="M21 14h-5l2.6-4.4" />
            <path d="M26 21.5 21 13l-2.5 4.3" />
            <path d="M6 21.5h10l-2.6 4.4" />
            <path d="M6 21.5 11 13l2.5 4.3" />
            <path d="M26 21.5H16" />
          </g>
        </svg>
      )
    case 'warnTriangle':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M16 3.5 30 28H2L16 3.5Z" fill="currentColor" />
          <path d="M16 12v8" stroke="#000" strokeOpacity="0.85" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="16" cy="24" r="1.6" fill="#000" fillOpacity="0.85" />
        </svg>
      )
    case 'hazardStrip':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <mask id={`hz-${uid}`} maskUnits="userSpaceOnUse" x="1" y="10" width="30" height="12">
            <rect x="1" y="10" width="30" height="12" fill="#fff" />
          </mask>
          <g mask={`url(#hz-${uid})`} stroke="currentColor" strokeWidth="4">
            <path d="M-2 24 8 8M6 24 16 8M14 24 24 8M22 24 32 8M30 24 40 8" />
          </g>
          <rect x="1" y="10" width="30" height="12" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      )
    case 'waveLine':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M1 16h3l2-7 3 14 3-10 3 7 3-11 3 9 3-5h5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    case 'segBar':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="1.5" y="11.5" width="29" height="9" stroke="currentColor" strokeWidth="1.6" />
          <path d="M4 13.5h3.5v5H4zM9 13.5h3.5v5H9zM14 13.5h3.5v5H14zM19 13.5h3.5v5H19z" fill="currentColor" />
        </svg>
      )
    case 'screw':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="9" fill="currentColor" />
          <path d="M10.5 19.5 21.5 12.5" stroke="#000" strokeOpacity="0.8" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      )
    case 'circuit':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 24h8l6-6h6" />
            <path d="M2 14h5l4-4h6" />
            <path d="M22 18h8" />
          </g>
          <circle cx="23" cy="10" r="2.6" fill="currentColor" />
          <circle cx="29" cy="24" r="2.6" fill="currentColor" />
          <rect x="20" y="16" width="4" height="4" fill="currentColor" />
        </svg>
      )
    case 'crosshair':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="M16 2v9M16 21v9M2 16h9M21 16h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M5 5h5M5 5v5M27 5h-5M27 5v5M5 27h5M5 27v-5M27 27h-5M27 27v-5" stroke="currentColor" strokeWidth="2" />
        </svg>
      )
    case 'diamondStack':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path d="m16 2 6 6-6 6-6-6 6-6Z" fill="currentColor" />
          <path d="m16 13 6 6-6 6-6-6 6-6Z" stroke="currentColor" strokeWidth="2" />
          <path d="m16 24 4 4-4 4-4-4 4-4Z" fill="currentColor" opacity="0.6" />
        </svg>
      )
    case 'wifi':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <g stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" fill="none">
            <path d="M4 13a17 17 0 0 1 24 0" />
            <path d="M9 18.5a10 10 0 0 1 14 0" />
          </g>
          <circle cx="16" cy="25" r="2.6" fill="currentColor" />
        </svg>
      )

    // --- the animated ones ---------------------------------------------

    case 'pulseRing':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle
            cx="16" cy="16" r="11"
            stroke="currentColor" strokeWidth="2"
            className={`${styles.animPart} ${styles.animPulse}`}
          />
          <circle
            cx="16" cy="16" r="11"
            stroke="currentColor" strokeWidth="2"
            className={`${styles.animPart} ${styles.animPulseLate}`}
          />
          <circle cx="16" cy="16" r="4" fill="currentColor" />
        </svg>
      )
    case 'soundWave':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          {[4, 9, 14, 19, 24].map((x, i) => (
            <rect
              key={x}
              x={x} y="6" width="4" height="20" rx="1.5"
              fill="currentColor"
              className={`${styles.animPart} ${styles.animBar} ${
                [styles.animBar, styles.animBar2, styles.animBar3, styles.animBar4, styles.animBar5][i]
              }`}
            />
          ))}
        </svg>
      )
    case 'orbit':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.6" opacity="0.45" />
          <circle cx="16" cy="16" r="3" fill="currentColor" />
          <g className={`${styles.animPart} ${styles.animSpin}`}>
            <circle cx="27" cy="16" r="3.2" fill="currentColor" />
          </g>
        </svg>
      )
    case 'radar':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
          <circle cx="16" cy="16" r="7" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
          <g className={`${styles.animPart} ${styles.animSpin}`}>
            <path d="M16 16 L29 16 A13 13 0 0 0 24.8 6.6 Z" fill="currentColor" opacity="0.55" />
            <path d="M16 16 L29 16" stroke="currentColor" strokeWidth="2" />
          </g>
        </svg>
      )
    case 'spinnerArc':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2.4" opacity="0.2" />
          <g className={`${styles.animPart} ${styles.animSpinFast}`}>
            <path
              d="M16 4a12 12 0 0 1 12 12"
              stroke="currentColor" strokeWidth="2.8" strokeLinecap="round"
            />
          </g>
        </svg>
      )
    case 'blinkDot':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="1.6" opacity="0.4" />
          <circle cx="16" cy="16" r="6" fill="currentColor" className={styles.animBlink} />
        </svg>
      )
    case 'scanBox':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="3" y="3" width="26" height="26" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 3h6M23 3h6M3 29h6M23 29h6" stroke="currentColor" strokeWidth="3" />
          <rect
            x="5" y="15" width="22" height="2"
            fill="currentColor"
            className={`${styles.animPart} ${styles.animScan}`}
          />
        </svg>
      )
    case 'loadDots':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="6" cy="16" r="4" fill="currentColor" className={`${styles.animPart} ${styles.animDot}`} />
          <circle cx="16" cy="16" r="4" fill="currentColor" className={`${styles.animPart} ${styles.animDot} ${styles.animDot2}`} />
          <circle cx="26" cy="16" r="4" fill="currentColor" className={`${styles.animPart} ${styles.animDot} ${styles.animDot3}`} />
        </svg>
      )
    case 'heartbeat':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <path
            d="M1 16h6l3-8 4 16 3-10 3 5 3-3h8"
            stroke="currentColor" strokeWidth="1.4" opacity="0.28"
            strokeLinecap="round" strokeLinejoin="round"
          />
          <path
            d="M1 16h6l3-8 4 16 3-10 3 5 3-3h8"
            stroke="currentColor" strokeWidth="2.4"
            strokeLinecap="round" strokeLinejoin="round"
            className={styles.animTrace}
          />
        </svg>
      )
    case 'gearSpin':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <g className={`${styles.animPart} ${styles.animSpinSlow}`}>
            <path
              d="M16 3.5 18 7h4l1 4 3.4 2-1.4 3.8 1.4 3.8L23 22.6l-1 4h-4L16 30l-2-3.4h-4l-1-4-3.4-2L7 16.8 5.6 13 9 11l1-4h4L16 3.5Z"
              fill="currentColor" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"
            />
            <circle cx="16" cy="16.5" r="4.6" fill="#000" fillOpacity="0.85" />
          </g>
        </svg>
      )
    case 'progressRing':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="10" stroke="currentColor" strokeWidth="3" opacity="0.2" />
          <circle
            cx="16" cy="16" r="10"
            stroke="currentColor" strokeWidth="3" strokeLinecap="round"
            transform="rotate(-90 16 16)"
            className={styles.animSweep}
          />
        </svg>
      )
    case 'dataFall':
      return (
        <svg viewBox="0 0 32 32" fill="none">
          <rect x="2" y="2" width="28" height="28" stroke="currentColor" strokeWidth="1.2" opacity="0.3" />
          <g className={styles.animFall}>
            <path d="M8 2v6M8 11v4M8 18v7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <g className={`${styles.animFall} ${styles.animFall2}`}>
            <path d="M16 2v4M16 9v8M16 20v5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </g>
          <g className={`${styles.animFall} ${styles.animFall3}`}>
            <path d="M24 2v9M24 14v3M24 20v6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          </g>
        </svg>
      )
  }
}

interface Props {
  pinId: string
  items: Decor[]
  accent: string
}

export function NoteDecor({ pinId, items, accent }: Props) {
  const updatePin = useBoardStore((s) => s.updatePin)
  const [active, setActive] = useState<string | null>(null)
  // The position being dragged right now. Kept out of the store on
  // purpose: writing every pointermove would fill the undo history with
  // hundreds of steps and wake the autosave on each one.
  const [live, setLive] = useState<{ id: string; x: number; y: number; size: number } | null>(null)
  const itemsRef = useRef(items)
  itemsRef.current = items

  // Clicking anywhere else puts the handles away.
  useEffect(() => {
    if (!active) return
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null
      if (el?.closest(`[data-decor="${active}"]`)) return
      setActive(null)
    }
    window.addEventListener('pointerdown', onDown, true)
    return () => window.removeEventListener('pointerdown', onDown, true)
  }, [active])

  // A decoration that gets removed while it is selected must not leave its
  // handles behind, and must not keep a stale drag alive.
  useEffect(() => {
    if (active && !items.some((i) => i.id === active)) setActive(null)
    if (live && !items.some((i) => i.id === live.id)) setLive(null)
  }, [items, active, live])

  if (items.length === 0) return null

  const commit = (id: string, patch: Partial<Decor>) => {
    const next = itemsRef.current.map((i) => (i.id === id ? { ...i, ...patch } : i))
    updatePin(pinId, 'decor', next)
  }

  const remove = (id: string) => {
    updatePin(
      pinId,
      'decor',
      itemsRef.current.filter((i) => i.id !== id),
    )
  }

  // The note element is this fragment's parent, and its client rect already
  // has the board's zoom baked into it — which is why nothing here needs to
  // know what the zoom is.
  const hostRect = (el: HTMLElement): DOMRect | null => {
    const host = el.closest('[data-decor-host]') as HTMLElement | null
    return host ? host.getBoundingClientRect() : null
  }

  const startDrag = (e: React.PointerEvent, d: Decor) => {
    if (e.button !== 0) return
    // Without both of these the note underneath starts its own drag and the
    // decoration is left behind.
    e.stopPropagation()
    e.preventDefault()
    setActive(d.id)

    const el = e.currentTarget as HTMLElement
    const rect = hostRect(el)
    if (!rect || rect.width === 0 || rect.height === 0) return
    const size = decorSize(d)
    let last = decorPos(d)

    const move = (ev: PointerEvent) => {
      last = {
        x: clampPos((ev.clientX - rect.left) / rect.width),
        y: clampPos((ev.clientY - rect.top) / rect.height),
      }
      setLive({ id: d.id, ...last, size })
    }
    const end = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      setLive(null)
      const from = decorPos(d)
      if (last.x !== from.x || last.y !== from.y) commit(d.id, last)
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // Capture is best-effort: a pointer can be gone by the time we ask.
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }

  const startResize = (e: React.PointerEvent, d: Decor) => {
    if (e.button !== 0) return
    e.stopPropagation()
    e.preventDefault()

    const el = e.currentTarget as HTMLElement
    const rect = hostRect(el)
    if (!rect || rect.width === 0) return
    // Screen pixels per board unit — the note's drawn width against the
    // width it thinks it has.
    const host = el.closest('[data-decor-host]') as HTMLElement
    const zoom = rect.width / (host.offsetWidth || rect.width)
    const pos = decorPos(d)
    const cx = rect.left + pos.x * rect.width
    const cy = rect.top + pos.y * rect.height
    let size = decorSize(d)

    const move = (ev: PointerEvent) => {
      // The grip sits on the corner of the box, so the distance from the
      // centre to the pointer is half the diagonal.
      const dist = Math.hypot(ev.clientX - cx, ev.clientY - cy) / (zoom || 1)
      size = clampSize((dist * 2) / Math.SQRT2)
      setLive({ id: d.id, ...pos, size })
    }
    const end = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', end)
      el.removeEventListener('pointercancel', end)
      setLive(null)
      if (size !== decorSize(d)) commit(d.id, { size })
    }
    try {
      el.setPointerCapture(e.pointerId)
    } catch {
      // See above.
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', end)
    el.addEventListener('pointercancel', end)
  }

  return (
    <>
      {items.map((d) => {
        const drag = live?.id === d.id ? live : null
        const pos = drag ?? decorPos(d)
        const size = drag ? drag.size : decorSize(d)
        const flip = decorFlip(drag ? { ...d, x: drag.x, y: drag.y } : d)
        const isActive = active === d.id
        return (
          <span
            key={d.id}
            data-decor={d.id}
            className={`${styles.decor} ${isActive ? styles.decorActive : ''}`}
            style={{
              left: `${pos.x * 100}%`,
              top: `${pos.y * 100}%`,
              width: size,
              height: size,
              color: d.color ?? accent,
            }}
            onPointerDown={(e) => startDrag(e, d)}
            // The note's own double-click opens the editor; a double-click
            // on a decoration must not also do that.
            onDoubleClick={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.stopPropagation()}
          >
            <span
              className={styles.decorGlyphBox}
              style={{ transform: `scale(${flip.x ? -1 : 1}, ${flip.y ? -1 : 1})` }}
              aria-hidden
            >
              <DecorGlyph kind={d.kind} />
            </span>
            {isActive && (
              <>
                <span
                  className={styles.decorGrip}
                  title="Потяни, чтобы изменить размер"
                  onPointerDown={(e) => startResize(e, d)}
                />
                <button
                  type="button"
                  className={styles.decorRemove}
                  title="Убрать"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(d.id)
                  }}
                >
                  ×
                </button>
              </>
            )}
          </span>
        )
      })}
    </>
  )
}
