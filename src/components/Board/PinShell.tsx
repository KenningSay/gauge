// Universal wrapper every pin is rendered inside. Responsibilities:
//   - positions the pin in world coords
//   - the "tongue" on top for dragging pins with interactive bodies
//   - 8 resize handles (visible only on hover/selection, per spec)
//   - the selection outline, which follows the pin's own rounded shape
//   - the "activated" state (double-click) that lets interactive bodies
//     (video, iframe, note textarea) receive pointer events
//
// Selection is an outline on the shell whose width is divided by the canvas
// zoom (--zoom, set on the world layer), so it stays hairline-thin at any
// scale instead of growing with the pin.

import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import type { Pin, PortSide } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import styles from './PinShell.module.css'

export interface PinActivation {
  activated: boolean
  setActivated: (v: boolean) => void
  // A pin whose double-click means something other than "start editing"
  // (an image opens the viewer, a file downloads) registers a handler here.
  // Returning true means it handled the gesture and the pin should NOT
  // enter edit mode. See the note on double-click detection below.
  registerDoubleClick: (handler: (() => boolean) | null) => void
}

const ActivationContext = createContext<PinActivation>({
  activated: false,
  setActivated: () => {},
  registerDoubleClick: () => {},
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
  // Starts pulling a connection out of one of the four ports.
  onPortPointerDown?: (e: React.PointerEvent, side: PortSide) => void
  children: React.ReactNode
  // Lit while board search is open and this pin is one of the hits.
  matched?: boolean
}

const PORTS: PortSide[] = ['top', 'right', 'bottom', 'left']

const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

export function PinShell({
  pin,
  override,
  selected,
  matched,
  onPointerDownBody,
  onPointerDownHandle,
  onContextMenu,
  onPortPointerDown,
  children,
}: Props) {
  // Edit mode lives in the store, so the keyboard (Enter, or simply typing
  // with a pin selected) and pin creation can open a pin for editing — the
  // pattern Miro and FigJam use. Double-click still works; it's just no
  // longer the only way in.
  const activated = useBoardStore((s) => s.activePinId === pin.id)
  const setActivePin = useBoardStore((s) => s.setActivePin)
  const setActivatedState = useCallback(
    (v: boolean) => setActivePin(v ? pin.id : null),
    [setActivePin, pin.id],
  )
  const shellRef = useRef<HTMLDivElement | null>(null)

  // Double-click is detected by hand, from pointerdown, instead of relying
  // on the browser's own dblclick event: the drag handler calls
  // setPointerCapture on the CANVAS, and while a capture is active the
  // browser retargets the resulting click/dblclick to the capturing
  // element. So dblclick fired on the canvas, never on the pin, and
  // nothing that depended on it worked — you couldn't type in a note, an
  // image wouldn't open the viewer, a file wouldn't download.
  const lastDownRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const dblHandlerRef = useRef<(() => boolean) | null>(null)
  const registerDoubleClick = useCallback((handler: (() => boolean) | null) => {
    dblHandlerRef.current = handler
  }, [])

  const handleBodyPointerDown = (e: React.PointerEvent) => {
    const last = lastDownRef.current
    const now = e.timeStamp
    // 400ms and 6px: the same tolerances a browser uses for its own
    // dblclick, loose enough for a touchpad, tight enough that two
    // deliberate clicks in a row don't trip it.
    if (last && now - last.t < 400 && Math.abs(e.clientX - last.x) < 6 && Math.abs(e.clientY - last.y) < 6) {
      lastDownRef.current = null
      e.stopPropagation()
      // Without this the browser's own pointerdown default action moves
      // focus off the editor the moment it mounts, which fires the
      // textarea's onBlur → commit → back to read mode. The pin appeared
      // to ignore the double-click entirely.
      e.preventDefault()
      if (dblHandlerRef.current?.()) return
      setActivatedState(true)
      return
    }
    lastDownRef.current = { t: now, x: e.clientX, y: e.clientY }
    onPointerDownBody(e)
  }

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
      value={{ activated, setActivated: setActivatedState, registerDoubleClick }}
    >
      <div
        ref={shellRef}
        // Lets anything outside the pin find it — the formatting bar
        // measures the note's body to fit text to the box.
        data-pin-id={pin.id}
        // A shape is its own outline, so it opts out of the card chrome:
        // a rectangular drop shadow and a rectangular selection ring around
        // an ellipse look like a bug. Its shadow comes from the SVG path.
        className={`${styles.shell} ${pin.type === 'shape' ? styles.shellShape : ''} ${selected ? styles.selected : ''} ${matched ? styles.matched : ''} ${override ? styles.dragging : ''}`}
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
        {/* Tongue: always visible in mini form, expands on selection. */}
        <div
          className={`${styles.tongue} ${selected ? styles.tongueSelected : ''}`}
          onPointerDown={handleBodyPointerDown}
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
              onPointerDown={handleBodyPointerDown}
              onContextMenu={onContextMenu}
            />
          )}
        </div>

        {/* Connection ports. Hidden until the pin is hovered or selected —
            four dots on every card at all times would bury the board in
            chrome. Dragging one pulls a wire; the canvas decides where it
            lands. */}
        {onPortPointerDown &&
          PORTS.map((side) => (
            <div
              key={side}
              className={`${styles.port} ${styles[`port_${side}`]}`}
              data-export-ignore=""
              title="Потянуть связь"
              onPointerDown={(e) => {
                e.stopPropagation()
                onPortPointerDown(e, side)
              }}
            >
              <span className={styles.portDot} />
            </div>
          ))}

        {/* Resize handles: shown only when selected (hover already
            implies selection in the intended flow). */}
        {selected &&
          HANDLES.map((handle) => (
            <div
              key={handle}
              className={`${styles.handle} ${styles[`handle_${handle}`]}`}
              data-export-ignore=""
              onPointerDown={(e) => onPointerDownHandle(e, handle)}
            />
          ))}
      </div>
    </ActivationContext.Provider>
  )
}