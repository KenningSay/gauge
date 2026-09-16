// A drawn shape that can hold words, a picture, or nothing at all.
//
// The outline is an SVG path rather than CSS borders: an ellipse, a diamond
// and a triangle all need real geometry, and one <path> per shape keeps the
// stroke, the fill and the image clip in the same coordinate system — which
// is what lets a picture be cropped to the outline instead of sitting in a
// rectangle behind it.

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ShapeKind, ShapePin as ShapePinT } from '../../../api/board'
import { acquireBlobUrl, releaseBlobUrl } from '../../../utils/blobCache'
import { useBoardStore } from '../../../store/useBoardStore'
import { usePinActivation } from '../PinShell'
import { readableOn } from './NotePin'
import styles from './Pins.module.css'

// Geometry in a 0-100 box, stretched by preserveAspectRatio="none" — the
// shape follows whatever width and height the user resizes the pin to.
function shapePath(kind: ShapeKind): string {
  switch (kind) {
    case 'rect':
      return 'M 2 2 H 98 V 98 H 2 Z'
    case 'ellipse':
      return 'M 50 2 A 48 48 0 1 1 49.9 2 Z'
    case 'diamond':
      return 'M 50 2 L 98 50 L 50 98 L 2 50 Z'
    case 'triangle':
      return 'M 50 3 L 97 97 L 3 97 Z'
  }
}

function hexWithOpacity(hex: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity / 100))
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export function ShapePin({ pin }: { pin: ShapePinT }) {
  const { activated, setActivated } = usePinActivation()
  const updatePin = useBoardStore((s) => s.updatePin)
  const [draft, setDraft] = useState(pin.text)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const areaRef = useRef<HTMLTextAreaElement | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!activated) setDraft(pin.text)
  }, [pin.text, activated])

  useEffect(() => {
    if (!activated) return
    const el = areaRef.current
    if (!el) return
    el.focus()
    // Caret at the end, not the start: the editor is often opened by
    // typing a first character, and the rest of the word has to follow it.
    el.setSelectionRange(el.value.length, el.value.length)
  }, [activated])

  // Same commit-from-cleanup rule as NotePin: editing can end by the pin
  // being deactivated, which unmounts the textarea before blur fires.
  const commitRef = useRef(() => {})
  commitRef.current = () => {
    if (draftRef.current !== pin.text) updatePin(pin.id, 'text', draftRef.current)
  }
  useEffect(() => {
    if (!activated) return
    return () => commitRef.current()
  }, [activated])

  useEffect(() => {
    if (!pin.assetPath) {
      setImageUrl(null)
      return
    }
    let cancelled = false
    const path = pin.assetPath
    acquireBlobUrl(path)
      .then((u) => {
        // No release on the cancelled path — the cleanup below owns it.
        if (!cancelled) setImageUrl(u)
      })
      .catch(() => !cancelled && setImageUrl(null))
    return () => {
      cancelled = true
      releaseBlobUrl(path)
    }
  }, [pin.assetPath])

  const clipId = `shape-clip-${pin.id}`
  const path = shapePath(pin.shape)
  const textColor = pin.textColor ?? (pin.fillOpacity > 55 ? readableOn(pin.fill) : undefined)

  const commit = () => {
    if (draftRef.current !== pin.text) updatePin(pin.id, 'text', draftRef.current)
    setActivated(false)
  }

  return (
    <div className={styles.root} style={{ color: textColor }}>
      <svg className={styles.shapeSvg} viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          {/* userSpaceOnUse with the path exactly as drawn. Converting it to
              objectBoundingBox units by scaling every number also scales an
              arc's flag parameters — "A 48 48 0 1 1" became "A 0.48 0.48 0
              0.01 0.01" and the ellipse clipped to nothing. */}
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={path} />
          </clipPath>
        </defs>

        {/* The picture lives inside the SVG so it shares the coordinate
            system with its own clip. "slice" crops to fill, like
            object-fit: cover. */}
        {imageUrl && (
          <image
            href={imageUrl}
            x={0}
            y={0}
            width={100}
            height={100}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        )}

        <path
          d={path}
          fill={hexWithOpacity(pin.fill, pin.fillOpacity)}
          stroke={pin.stroke}
          // vectorEffect keeps the outline one pixel wide no matter how far
          // the viewBox is stretched — without it a wide, short shape gets a
          // fat top edge and a thin side.
          vectorEffect="non-scaling-stroke"
          strokeWidth={2}
          strokeLinejoin="round"
        />
      </svg>

      <div className={styles.shapeContent}>
        {activated ? (
          <textarea
            ref={areaRef}
            className={styles.shapeEditor}
            value={draft}
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setDraft(pin.text)
                setActivated(false)
              }
            }}
          />
        ) : (
          pin.text && (
            <div className={styles.shapeText}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{pin.text}</ReactMarkdown>
            </div>
          )
        )}
      </div>
    </div>
  )
}
