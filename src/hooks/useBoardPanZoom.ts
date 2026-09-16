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

// True when something under the cursor can absorb this scroll itself — a
// long note, a scrollable card. Uses elementsFromPoint rather than the
// event target because every unactivated pin has a transparent overlay on
// top of it (it's what makes dragging work over a textarea or an iframe),
// and that overlay would otherwise hide the scrollable content beneath it
// from this check.
//
// Only yields while the element can still move in the requested direction,
// so hitting the end of a note hands the gesture back to the board rather
// than dead-ending the scroll.
function scrollableUnder(
  x: number,
  y: number,
  container: HTMLElement | null,
  deltaY: number,
): boolean {
  if (deltaY === 0) return false
  for (const el of document.elementsFromPoint(x, y)) {
    if (el === container) break
    if (!(el instanceof HTMLElement)) continue
    const style = getComputedStyle(el)
    if (!/(auto|scroll|overlay)/.test(style.overflowY)) continue
    if (el.scrollHeight <= el.clientHeight + 1) continue
    const atTop = el.scrollTop <= 0
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
    if ((deltaY < 0 && atTop) || (deltaY > 0 && atBottom)) continue
    // The overlay swallows wheel events aimed at the content below it, so
    // the scroll is applied here by hand.
    el.scrollTop += deltaY
    return true
  }
  return false
}

// setPointerCapture throws NotFoundError when the pointer it names is
// already gone — a click fast enough that the pointer is released between
// the event being queued and the handler running, a pointer the browser
// cancelled, a synthetic event. It is best-effort by nature: failing to
// capture means the gesture ends when the pointer leaves the element,
// which is a worse gesture, not a broken app. It must never throw out of
// a pointerdown handler and abort the rest of it.
function capture(el: HTMLElement | null, pointerId: number): void {
  try {
    el?.setPointerCapture(pointerId)
  } catch {
    // See above.
  }
}

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4

// A wheel event does not have to report pixels. Firefox reports lines
// (deltaMode 1) for most physical mice, and a page (deltaMode 2) for
// page-up/down style devices — so `deltaY` comes through as 3 rather than
// ~100, and everything downstream that treats it as pixels moves about a
// thirtieth as far. That is the difference between a wheel notch panning
// the board and a wheel notch doing visibly nothing.
const LINE_HEIGHT_PX = 16

export function normalizeWheel(e: WheelEvent, pageHeight: number): { dx: number; dy: number } {
  const scale =
    e.deltaMode === 1 ? LINE_HEIGHT_PX : e.deltaMode === 2 ? Math.max(1, pageHeight) : 1
  return { dx: e.deltaX * scale, dy: e.deltaY * scale }
}

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
    // Distance at the previous move. This used to live on `window`, which
    // meant two boards shared one pinch, and a gesture interrupted by
    // unmounting left a stale distance behind that made the next pinch
    // jump.
    dist: number | null
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
            dist: null,
          }
          capture(containerRef.current, e.pointerId)
          capture(containerRef.current, first.pointerId)
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
      capture(containerRef.current, e.pointerId)
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
        if (pinch.dist) onChange(zoomAt(v, worldX, worldY, dist / pinch.dist))
        pinch.dist = dist
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

  const endPointer = useCallback(
    (e: PointerEvent) => {
      const pinch = pinchRef.current
      if (pinch && (e.pointerId === pinch.p1.id || e.pointerId === pinch.p2.id)) {
        pinchRef.current = null
        // Lifting one finger of a pinch used to leave the board inert until
        // the other was lifted too. The finger still down becomes a pan,
        // anchored where it is now rather than where the pinch began.
        const remaining = e.pointerId === pinch.p1.id ? pinch.p2 : pinch.p1
        dragRef.current = {
          pointerId: remaining.id,
          startX: remaining.x,
          startY: remaining.y,
          startViewportX: viewportRef.current.x,
          startViewportY: viewportRef.current.y,
        }
        return
      }
      const drag = dragRef.current
      if (drag && drag.pointerId === e.pointerId) {
        dragRef.current = null
      }
    },
    [],
  )

  const onWheel = useCallback(
    (e: WheelEvent) => {
      const rect = containerRef.current?.getBoundingClientRect()
      if (!rect) return

      // A pin's own scrollable content wins over panning the board: with a
      // long note open, the wheel has to move the text, not the canvas
      // underneath it. Only yields when that element can actually scroll
      // further in the direction asked for, so reaching the end of a note
      // hands the gesture back to the board instead of dead-ending.
      const { dx: rawDx, dy: rawDy } = normalizeWheel(e, rect.height)
      if (!e.ctrlKey && !e.metaKey && scrollableUnder(e.clientX, e.clientY, containerRef.current, rawDy)) {
        e.preventDefault()
        return
      }
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
        const factor = Math.exp(-rawDy * 0.002)
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
      const dx = e.shiftKey ? rawDy : rawDx
      const dy = e.shiftKey ? 0 : rawDy
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