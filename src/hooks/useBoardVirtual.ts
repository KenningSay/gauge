// 2D viewport culling for boards with more than ~100 pins. Deliberately
// simpler than a general-purpose spatial index — a mood board's pins are
// few enough (even a busy one) that a linear scan per frame is fine; the
// only reason this exists is to keep the DOM small so 500 pins don't
// produce 500 live <img>/<video> elements.
//
// What it does NOT do: measure pin sizes, handle overlaps, or reorder.
// It just answers "which pins fall inside [viewBox ∪ margin]?" and the
// caller renders only those.
//
// Why not reuse useVirtualRows (the file manager's hook): that one assumes
// a single scroll axis, uniform row height, and a scroll container whose
// scrollTop/scrollHeight it can read. Board pins are freely positioned in
// 2D, have arbitrary sizes, and the "scroll" is a CSS transform — none of
// those assumptions hold.

import { useMemo } from 'react'
import type { Pin } from '../api/board'
import type { ViewportState } from './useBoardPanZoom'

interface Options {
  pins: Pin[]
  viewport: ViewportState
  containerWidth: number
  containerHeight: number
  // Extra margin around the visible area, in world units. Preloads pins
  // that are just off-screen so a small pan doesn't flash empty cells
  // before their content arrives. Roughly one pin-width is a good default.
  overscan?: number
}

// Visible world rectangle: the container's screen rect, mapped through the
// inverse of the viewport transform. viewport.x/y are the world coords of
// the container's top-left corner; the visible world box runs from (x,y)
// to (x + width/zoom, y + height/zoom).
function visibleWorldBox(
  viewport: ViewportState,
  containerWidth: number,
  containerHeight: number,
  overscan: number,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const w = containerWidth / viewport.zoom
  const h = containerHeight / viewport.zoom
  return {
    minX: viewport.x - overscan,
    minY: viewport.y - overscan,
    maxX: viewport.x + w + overscan,
    maxY: viewport.y + h + overscan,
  }
}

export function useBoardVirtual({
  pins,
  viewport,
  containerWidth,
  containerHeight,
  overscan = 200,
}: Options): Pin[] {
  // Below the threshold, skip the math entirely — for 30 pins the filter
  // costs more than just rendering them, and every extra check happens
  // on every pan frame.
  const shouldCull = pins.length > 100

  return useMemo(() => {
    if (!shouldCull) return pins
    if (containerWidth === 0 || containerHeight === 0) return pins
    const box = visibleWorldBox(viewport, containerWidth, containerHeight, overscan)
    return pins.filter(
      (p) =>
        p.x < box.maxX &&
        p.x + p.w > box.minX &&
        p.y < box.maxY &&
        p.y + p.h > box.minY,
    )
  }, [pins, viewport, containerWidth, containerHeight, overscan, shouldCull])
}