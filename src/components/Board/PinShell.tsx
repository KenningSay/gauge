// Universal wrapper every pin is rendered inside. Responsibilities:
//   - positions the pin in world coords
//   - the "tongue" on top for dragging pins with interactive bodies
//   - 8 resize handles (visible only on hover/selection, per spec)
//   - the selection glow layer (a separate absolutely-positioned div so
//     the animation stays on opacity/transform only — the "не прожорливо"
//     requirement from the spec)
//   - the "activated" state (double-click) that lets interactive bodies
//     (video, iframe, note textarea) receive pointer events
//
// The glow is a sibling element, not a box-shadow on the pin itself.
// Animating box-shadow repaints the pin every frame; animating opacity
// on a pre-composited layer is free.

import { createContext, useContext, useEffect, useRef, useState } from 'react'
import type { Pin } from '../../api/board'
import styles from './PinShell.module.css'

export interface PinActivation {
  activated: boolean
  setActivated: (v: boolean) => void
}

const ActivationContext = createContext<PinActivation>({
  activated: false,
  setActivated: () => {},
})

export function usePinActivation(): PinActivation {
  return useContext(ActivationContext)
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

interface Props {
  pin: Pin
  override?: Partial<{ x: number; y: number; w: number; h: number }>
  selected: boolean
  // Called when the user presses down on the pin body or tongue. The
  // parent decides whether that starts a drag, a marquee, or nothing.
  onPointerDownBody: (e: React.PointerEvent) => void
  // Called when the user presses down on a resize handle.
  onPointerDownHandle: (e: React.PointerEvent, handle: ResizeHandle) => void
  onContextMenu: (e: React.MouseEvent) => void
  children: React.ReactNode
}

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function PinShell({
  pin,
  override,
  selected,
  onPointerDownBody,
  onPointerDownHandle,
  onContextMenu,
  children,
}: Props) {
  const [activated, setActivatedState] = useState(false)
  const shellRef = useRef<HTMLDivElement | null>(null)

  // Deactivate on any pointerdown outside the pin. Listens at document
  // level so a click on any other pin, the canvas, or an unrelated UI
  // surface all dismiss the activation — matching "click elsewhere =
  // leave edit mode" from the spec.
  useEffect(() => {
    if (!activated) return
    let alive = true
    const handler = (e: PointerEvent) => {
      if (!alive) return
      const target = e.target as Node | null
      if (target && shellRef.current?.contains(target)) return
      setActivatedState(false)
    }
    document.addEventListener('pointerdown', handler, true)
    return () => {
      alive = false
      document.removeEventListener('pointerdown', handler, true)
    }
  }, [activated])

  const x = override?.x ?? pin.x
  const y = override?.y ?? pin.y
  const w = override?.w ?? pin.w
  const h = override?.h ?? pin.h

  return (
    <ActivationContext.Provider
      value={{ activated, setActivated: setActivatedState }}
    >
      <div
        ref={shellRef}
        className={`${styles.shell} ${selected ? styles.selected : ''}`}
        style={{
          transform: `translate(${x}px, ${y}px)${selected ? ' scale(1.02)' : ''}`,
          // `override` is only set while a drag or resize is live. The
          // 120ms transform transition that makes selection feel soft would
          // otherwise make the pin lag behind the cursor for the whole drag.
          transition: override ? 'none' : undefined,
          width: `${w}px`,
          height: `${h}px`,
          zIndex: pin.z,
        }}
        onContextMenu={onContextMenu}
        onDoubleClick={(e) => {
          e.stopPropagation()
          setActivatedState(true)
        }}
      >
        {/* Glow layer — animated only via opacity, never re-laid-out. */}
        <div className={styles.glow} aria-hidden />

        {/* Tongue: always visible in mini form, expands on selection. */}
        <div
          className={`${styles.tongue} ${selected ? styles.tongueSelected : ''}`}
          onPointerDown={(e) => onPointerDownBody(e)}
          title="Перетащить"
        >
          <span className={styles.tongueDots} />
        </div>

        {/* Body: the actual content. When not activated, a transparent
            overlay intercepts pointer events so dragging works on top of
            otherwise-interactive elements (iframe/video/textarea). */}
        <div className={styles.body}>
          {children}
          {!activated && (
            <div
              className={styles.overlay}
              onPointerDown={onPointerDownBody}
              onContextMenu={onContextMenu}
            />
          )}
        </div>

        {/* Resize handles: shown only when selected (hover already
            implies selection in the intended flow). */}
        {selected &&
          HANDLES.map((handle) => (
            <div
              key={handle}
              className={`${styles.handle} ${styles[`handle_${handle}`]}`}
              onPointerDown={(e) => onPointerDownHandle(e, handle)}
            />
          ))}
      </div>
    </ActivationContext.Provider>
  )
}