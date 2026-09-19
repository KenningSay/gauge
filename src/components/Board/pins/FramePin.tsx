// A frame: a titled area that owns whatever sits inside it.
//
// Deliberately the quietest thing on the board — an outline, a tinted
// wash and a label. It exists to say "these belong together", and a frame
// that competes with its contents for attention has failed at that. The
// fill is barely there so the cards inside read normally on top of it.
//
// Membership is geometric (see utils/frameGeo), so this component holds
// no list of children and never needs to be told when one moves.

import { useEffect, useRef, useState } from 'react'
import { useBoardStore } from '../../../store/useBoardStore'
import type { FramePin as FramePinT } from '../../../api/board'
import { usePinActivation } from '../PinShell'
import { hexWithOpacity } from '../../../utils/color'
import { FRAME_HEADER } from '../../../utils/frameGeo'
import styles from './Pins.module.css'

export function FramePin({ pin }: { pin: FramePinT }) {
  const { activated, setActivated } = usePinActivation()
  const updatePin = useBoardStore((s) => s.updatePin)
  const [draft, setDraft] = useState(pin.title)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!activated) setDraft(pin.title)
  }, [pin.title, activated])

  useEffect(() => {
    if (!activated) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    el.select()
  }, [activated])

  const commit = () => {
    setActivated(false)
    const next = draft.trim()
    if (next !== pin.title) updatePin(pin.id, 'title', next)
  }

  return (
    <div
      className={styles.frameRoot}
      style={{
        // The outline carries the frame's colour at full strength; the
        // wash is the same colour at the chosen opacity, which is low by
        // default.
        borderColor: pin.color,
        background: hexWithOpacity(pin.color, pin.fillOpacity),
        ['--frame-header' as string]: `${FRAME_HEADER}px`,
      }}
    >
      <div className={styles.frameHeader} style={{ color: pin.color }}>
        {activated ? (
          <input
            ref={inputRef}
            className={styles.frameTitleInput}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                commit()
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setDraft(pin.title)
                setActivated(false)
              }
            }}
            // The canvas listens for plain keys to start editing a pin;
            // inside a text field they are just typing.
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <span className={styles.frameTitle}>{pin.title || 'Контейнер'}</span>
        )}
      </div>
    </div>
  )
}
