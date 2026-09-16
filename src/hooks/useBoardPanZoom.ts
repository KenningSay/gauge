// Pan/zoom interaction for the board canvas. Handles three input paths:
//   - Mouse drag on empty canvas → pan (left button)
//   - Wheel without modifier → pan vertically (and horizontally with shift)
//   - Ctrl/Cmd + wheel → zoom to cursor
//   - Two-finger trackpad pinch → browser synthesizes ctrl+wheel, same code
//   - Touch: one-finger drag → pan; two-finger pinch → zoom
//
// Alt+left-drag is intentionally NOT handled here — that's the marquee
// selection rectangle (per §4.2), and consuming it here would break it.
//
// The hook is state-agnostic: it accepts a viewport {x, y, zoom} and an
// onChange callback, so the parent decides whether that state lives in
// Zustand, useState, or a ref. In practice BoardCanvas wires it to
// useBoardStore.setViewport.

import { useCallback, useEffect, useRef } from 'react'

export interface ViewportState {
  x: number
  y: number
  zoom: number
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

interface Options {
  viewport: ViewportState
  onChange: (v: ViewportState) => void
  // Ref to the container element the gestures should attach to. Using a
  // ref (not a query selector) so multiple boards mounted in different
  // DOM positions don't collide.
  containerRef: React.RefObject<HTMLElement | null>
}

// Zoom is anchored on the cursor, not the origin — otherwise zooming into
// a pin the user is looking at scrolls the pin out of frame, which is
// disorienting. The math: keep the world point under the cursor fixed
// while zoom changes; the viewport translation absorbs the difference.
function zoomAt(v: ViewportState, worldX: number, worldY: number, factor: number): ViewportState {
  const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.zoom * factor))
  if (newZoom === v.zoom) return v
  // World → screen is: screen = (world - viewport.xy) * zoom.
  // We want screen to stay the same for a fixed world point, so:
  //   (worldX - x) * zoom = (worldX - newX) * newZoom
  // → newX = worldX - (worldX - x) * (zoom / newZoom)
  const scale = v.zoom / newZoom
  return {
    x: worldX - (worldX - v.x) * scale,
    y: worldY - (worldY - v.y) * scale,
    zoom: newZoom,
  }
}

export function useBoardPanZoom({ viewport, onChange, containerRef }: Options) {
  // Latest viewport kept in a ref so event handlers don't need to be
  // re-attached on every viewport change (a pan would otherwise rebuild
  // listeners 60×/sec).
  const viewportRef = useRef(viewport)
  useEffect(() => {
    viewportRef.current = viewport
  }, [viewport])

  // Single-finger pan state for touch. Mouse drag reuses the same ref.
  const dragRef = useRef<{
    pointerId: number
    startX: number
    startY: number
    startViewportX: number
    startViewportY: number
  } | null>(null)

  // Two-finger pinch state. Both pointers tracked; the midpoint is the
  // zoom anchor and the finger distance ratio drives the zoom factor.
  const pinchRef = useRef<{
    p1: { id: number; x: number; y: number }
    p2: { id: number; x: number; y: number }
  } | null>(null)

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      // Alt is the marquee-selection modifier — a pointerdown with alt held
      // is the parent's problem, not ours.
      if (e.altKey) return
      // Only empty canvas (target === container) starts a pan. A pointerdown
      // on a pin is the pin's drag, and the pin's handler will stopPropagation
      // before it reaches us — this guard is for future-proofing when a pin
      // forgets to.
      if (e.target !== containerRef.current) return
      // Right-button drag is reserved for the context menu / future use.
      if (e.button !== 0) return

      if (pinchRef.current) return // already pinching, ignore third finger

      // If a second pointer arrives, upgrade to pinch.
      if (e.pointerType === 'touch') {
        const first = dragRef.current
        if (first && first.pointerId !== e.pointerId) {
          // Cancel the pan and start a pinch. The pan's startViewport values
          // are discarded — the pinch re-anchors on its own midpoint.
          dragRef.current = null
          pinchRef.current = {
            p1: { id: first.pointerId, x: first.startX, y: first.startY },
            p2: { id: e.pointerId, x: e.clientX, y: e.clientY },
          }
          containerRef.current?.setPointerCapture(e.pointerId)
          containerRef.current?.setPointerCapture(first.pointerId)
          return
        }
      }

      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        startViewportX: viewportRef.current.x,
        startViewportY: viewportRef.current.y,
      }
      containerRef.current?.setPointerCapture(e.pointerId)
    },
    [containerRef],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const pinch = pinchRef.current
      if (pinch) {
        if (e.pointerId === pinch.p1.id) pinch.p1 = { id: e.pointerId, x: e.clientX, y: e.clientY }
        else if (e.pointerId === pinch.p2.id) pinch.p2 = { id: e.pointerId, x: e.clientX, y: e.clientY }
        else return

        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        // Midpoint of the two fingers, in screen coords relative to the
        // canvas. That's the world point that should stay put while the
        // zoom factor changes.
        const midScreenX = (pinch.p1.x + pinch.p2.x) / 2 - rect.left
        const midScreenY = (pinch.p1.y + pinch.p2.y) / 2 - rect.top
        const v = viewportRef.current
        const worldX = midScreenX / v.zoom + v.x
        const worldY = midScreenY / v.zoom + v.y

        const dx = pinch.p2.x - pinch.p1.x
        const dy = pinch.p2.y - pinch.p1.y
        const dist = Math.hypot(dx, dy)
        const prevDist = (window as unknown as { __gaugePinchDist?: number }).__gaugePinchDist
        if (prevDist) {
          const factor = dist / prevDist
          onChange(zoomAt(v, worldX, worldY, factor))
        }
        ;(window as unknown as { __gaugePinchDist?: number }).__gaugePinchDist = dist
        return
      }

      const drag = dragRef.current
      if (!drag || drag.pointerId !== e.pointerId) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      onChange({
        ...viewportRef.current,
        x: drag.startViewportX - dx / viewportRef.current.zoom,
        y: drag.startViewportY - dy / viewportRef.current.zoom,
      })
    },
    [containerRef, onChange],
  )

  const endPointer = useCallback((e: PointerEvent) => {
    const pinch = pinchRef.current
    if (pinch && (e.pointerId === pinch.p1.id || e.pointerId === pinch.p2.id)) {
      pinchRef.current = null
      ;(window as unknown as { __gaugePinchDist?: number }).__gaugePinchDist = undefined
      return
    }
    const drag = dragRef.current
    if (drag && drag.pointerId === e.pointerId) {
      dragRef.current = null
    }
  }, [])

  const onWheel = useCallback(
    (e: WheelEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return
      const screenX = e.clientX - rect.left
      const screenY = e.clientY - rect.top

      // Ctrl (or Cmd) forces zoom. Trackpad pinch gestures arrive as
      // wheel events with ctrlKey=true, so this single branch covers both
      // physical wheel+ctrl and pinch. deltaY < 0 means "spread fingers
      // apart" = zoom in, matching native feel.
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const v = viewportRef.current
        const worldX = screenX / v.zoom + v.x
        const worldY = screenY / v.zoom + v.y
        // Exponential so each wheel tick is a fixed ratio, not fixed
        // delta — otherwise zoom crawls when zoomed out and jumps when
        // zoomed in.
        const factor = Math.exp(-e.deltaY * 0.002)
        onChange(zoomAt(v, worldX, worldY, factor))
        return
      }

      // Plain wheel: pan. preventDefault because the board owns the scroll
      // axis — without this the whole page scrolls, which is never what a
      // user wants on a mood board.
      e.preventDefault()
      const v = viewportRef.current
      // Shift swaps axes, matching the OS convention (shift+wheel is
      // horizontal scroll everywhere).
      const dx = e.shiftKey ? e.deltaY : e.deltaX
      const dy = e.shiftKey ? 0 : e.deltaY
      onChange({
        ...v,
        x: v.x + dx / v.zoom,
        y: v.y + dy / v.zoom,
      })
    },
    [containerRef, onChange],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    // Wheel must be non-passive to call preventDefault — a passive
    // listener is the default for wheel on some browsers, so explicit.
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('pointermove', onPointerMove)
    el.addEventListener('pointerup', endPointer)
    el.addEventListener('pointercancel', endPointer)
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', onPointerDown)
      el.removeEventListener('pointermove', onPointerMove)
      el.removeEventListener('pointerup', endPointer)
      el.removeEventListener('pointercancel', endPointer)
      el.removeEventListener('wheel', onWheel)
    }
  }, [containerRef, onPointerDown, onPointerMove, endPointer, onWheel])

  // Converts a screen point (relative to the container) to world coords.
  // Exposed so pin-drop and marquee-selection can call it without
  // duplicating the viewport math.
  const screenToWorld = useCallback(
    (screenX: number, screenY: number): { x: number; y: number } => {
      const v = viewportRef.current
      return { x: screenX / v.zoom + v.x, y: screenY / v.zoom + v.y }
    },
    [],
  )

  return { screenToWorld }
}