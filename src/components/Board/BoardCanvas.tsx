import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pin } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useUiStore } from '../../store/useUiStore'
import { useFileStore } from '../../store/useFileStore'
import { useBoardPanZoom, type ViewportState } from '../../hooks/useBoardPanZoom'
import { useBoardVirtual } from '../../hooks/useBoardVirtual'
import { boundsOf, rectsIntersect, resolvePush, resolvePushForMoved, type Rect } from '../../utils/boardGeo'
import {
  looksLikeUrl,
  makeNotePin,
  makeShapePin,
  normalizeUrl,
  pinFromDroppedFile,
  pinFromVaultEntry,
} from '../../utils/boardPinFactories'
import { collectDroppedEntries } from '../../utils/dropFolder'
import { EdgeLayer } from './EdgeLayer'
import { DECOR_MIME, TEMPLATE_MIME, decorById, templateById } from './TemplatePanel'
import { MAX_DECOR_PER_NOTE, clampPos } from '../../utils/decorGeo'
import { EdgeContextMenu } from './EdgeContextMenu'
import { BoardToolbar } from './BoardToolbar'
import { NoteFormatBar } from './NoteFormatBar'
import { BoardSearch } from './BoardSearch'
import { FONT_BY_ID } from './pins/noteStyles'
import {
  downloadBlob,
  downloadDataUrl,
  elementToPng,
  exportFileName,
  exportTooSmall,
  pngToPdf,
  usedFontEmbedCss,
  withTimeout,
} from '../../utils/boardExport'
import { bestSides, edgePath, portPoint } from '../../utils/edgeGeo'
import type { Edge, PortSide, ShapeKind } from '../../api/board'
import { getTextContent } from '../../api/webdav'
import type { FileEntry } from '../../api/types'
import { VaultNotePicker } from './VaultNotePicker'
import { runPool } from '../../utils/pool'
import { PinRenderer } from './pins/PinRenderer'
import { PinContextMenu, type PinMenuTarget } from './PinContextMenu'
import styles from './BoardCanvas.module.css'
import { isKey } from '../../utils/keys'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

// setPointerCapture throws if the pointer is already gone — a fast flick,
// a pointer the browser has released, or a synthetic event. It's an
// optimisation (it keeps events coming when the cursor leaves the window),
// never a requirement, so a failure must not abort the gesture that was
// just starting.
function capturePointer(el: HTMLElement | null, pointerId: number): void {
  try {
    el?.setPointerCapture(pointerId)
  } catch {
    // Ignored on purpose: window-level move/up listeners still fire.
  }
}

type Interaction =
  | null
  | {
      kind: 'drag'
      pointerId: number
      ids: string[]
      startScreen: { x: number; y: number }
      startPositions: Map<string, { x: number; y: number }>
      delta: { dx: number; y: number }
    }
  | {
      kind: 'resize'
      pointerId: number
      id: string
      handle: Handle
      startScreen: { x: number; y: number }
      startRect: Rect
      current: Rect
    }
  | {
      kind: 'marquee'
      pointerId: number
      startWorld: { x: number; y: number }
      currentWorld: { x: number; y: number }
    }
  | {
      kind: 'wire'
      pointerId: number
      fromPinId: string
      fromSide: PortSide
      currentWorld: { x: number; y: number }
      // The pin the cursor is over, if any — highlighted as a drop target.
      overPinId: string | null
    }

const NO_EDGES: Edge[] = []

const MIN_W = 80
const MIN_H = 80

const GRID_PATTERN: Record<string, { image: (c: string) => string; size: number }> = {
  plain: { image: () => 'none', size: 20 },
  dots: {
    image: (c) =>
      `radial-gradient(circle at 1px 1px, ${c} 1px, transparent 1.2px)`,
    size: 24,
  },
  grid: {
    image: (c) =>
      `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,
    size: 24,
  },
  ruled: {
    image: (c) => `linear-gradient(${c} 1px, transparent 1px)`,
    size: 32,
  },
  graph: {
    image: (c) =>
      `linear-gradient(${c} 1px, transparent 1px), linear-gradient(90deg, ${c} 1px, transparent 1px)`,
    size: 12,
  },
}

// A stable identity: a fresh Set every render would make the search's
// publish-matches effect fire for ever.
const EMPTY_MATCHES: Set<string> = new Set()

export function BoardCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // The zoomed layer that holds the pins — what an export snapshots.
  const worldRef = useRef<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 })
  const [interaction, setInteraction] = useState<Interaction>(null)
  const [menu, setMenu] = useState<PinMenuTarget | null>(null)

  const board = useBoardStore((s) => s.board)
  const viewport = board?.viewport ?? { x: 0, y: 0, zoom: 1 }
  const pins = board?.pins ?? []
  const settings = board?.settings
  const selected = useBoardStore((s) => s.selected)
  const setViewport = useBoardStore((s) => s.setViewport)
  const addPin = useBoardStore((s) => s.addPin)
  const addEdge = useBoardStore((s) => s.addEdge)
  const activePinId = useBoardStore((s) => s.activePinId)
  const removeEdges = useBoardStore((s) => s.removeEdges)
  const edges = useBoardStore((s) => s.board?.edges) ?? NO_EDGES
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const movePins = useBoardStore((s) => s.movePins)
  const resizePin = useBoardStore((s) => s.resizePin)
  const reorderPin = useBoardStore((s) => s.reorderPin)
  const undo = useBoardStore((s) => s.undo)
  const redo = useBoardStore((s) => s.redo)
  const selectOnly = useBoardStore((s) => s.selectOnly)
  const selectMany = useBoardStore((s) => s.selectMany)
  const clearSelection = useBoardStore((s) => s.clearSelection)

  const pushToast = useUiStore((s) => s.pushToast)
  const promptDialog = useUiStore((s) => s.promptDialog)

  const { screenToWorld } = useBoardPanZoom({
    viewport,
    onChange: setViewport,
    containerRef,
  })

  // --- container sizing (for virtualization) ---
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect
      setContainerSize({ w: r.width, h: r.height })
    })
    ro.observe(el)
    setContainerSize({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // --- virtualized list of pins to actually render ---
  // While exporting, every pin must be in the DOM: html-to-image
  // serialises what is mounted, and the board only mounts what is on
  // screen. Without this the picture is whatever happened to be in view.
  const [exporting, setExporting] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchMatches, setSearchMatches] = useState<Set<string>>(EMPTY_MATCHES)
  const windowed = useBoardVirtual({
    pins,
    viewport,
    containerWidth: containerSize.w,
    containerHeight: containerSize.h,
  })
  const visiblePins = exporting ? pins : windowed

  // --- per-pin drag/resize overrides applied on top of stored positions ---
  const overrides = useMemo(() => {
    if (!interaction) return null
    if (interaction.kind === 'drag') {
      const m = new Map<string, Partial<Rect>>()
      for (const id of interaction.ids) {
        const start = interaction.startPositions.get(id)
        if (!start) continue
        m.set(id, { x: start.x + interaction.delta.dx, y: start.y + interaction.delta.y })
      }
      return m
    }
    if (interaction.kind === 'resize') {
      const m = new Map<string, Partial<Rect>>()
      m.set(interaction.id, interaction.current)
      return m
    }
    return null
  }, [interaction])

  // --- pointer handlers on the container (pan is handled by the hook) ---

  const onContainerPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Alt is the marquee-selection modifier; a bare click on empty space
      // clears selection and starts nothing else.
      if (e.altKey && e.button === 0) {
        e.preventDefault()
        const rect = containerRef.current!.getBoundingClientRect()
        const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
        capturePointer(containerRef.current, e.pointerId)
        setInteraction({
          kind: 'marquee',
          pointerId: e.pointerId,
          startWorld: world,
          currentWorld: world,
        })
        return
      }
      // Plain click on the container background: clear selection.
      if (e.target === containerRef.current && e.button === 0) {
        clearSelection()
      }
    },
    [clearSelection, screenToWorld],
  )

  const beginPinDrag = useCallback(
    (e: React.PointerEvent, pin: Pin) => {
      if (e.button !== 0) return
      e.stopPropagation()

      // Bring to front — matches the "last touched floats up" behaviour
      // from the spec. Pushed as a real op so undo restores the previous
      // stacking, not silently ignored.
      const maxZ = pins.reduce((m, p) => Math.max(m, p.z), 0)
      if (pin.z < maxZ) reorderPin(pin.id, maxZ + 1)

      const store = useBoardStore.getState()
      const currentSelection = store.selected
      let activeIds: string[]
      if (currentSelection.has(pin.id)) {
        activeIds = Array.from(currentSelection)
      } else if (e.shiftKey) {
        selectMany([...currentSelection, pin.id])
        activeIds = [...currentSelection, pin.id]
      } else {
        selectOnly(pin.id)
        activeIds = [pin.id]
      }

      const startPositions = new Map<string, { x: number; y: number }>()
      for (const id of activeIds) {
        const p = pins.find((x) => x.id === id)
        if (p) startPositions.set(id, { x: p.x, y: p.y })
      }
      capturePointer(containerRef.current, e.pointerId)
      setInteraction({
        kind: 'drag',
        pointerId: e.pointerId,
        ids: activeIds,
        startScreen: { x: e.clientX, y: e.clientY },
        startPositions,
        delta: { dx: 0, y: 0 },
      })
    },
    [pins, reorderPin, selectMany, selectOnly],
  )

  const beginWire = useCallback(
    (e: React.PointerEvent, pin: Pin, side: PortSide) => {
      if (e.button !== 0) return
      e.stopPropagation()
      capturePointer(containerRef.current, e.pointerId)
      const rect = containerRef.current!.getBoundingClientRect()
      setInteraction({
        kind: 'wire',
        pointerId: e.pointerId,
        fromPinId: pin.id,
        fromSide: side,
        currentWorld: screenToWorld(e.clientX - rect.left, e.clientY - rect.top),
        overPinId: null,
      })
    },
    [containerRef, screenToWorld],
  )

  const beginPinResize = useCallback(
    (e: React.PointerEvent, pin: Pin, handle: Handle) => {
      if (e.button !== 0) return
      e.stopPropagation()
      capturePointer(containerRef.current, e.pointerId)
      const rect: Rect = { x: pin.x, y: pin.y, w: pin.w, h: pin.h }
      setInteraction({
        kind: 'resize',
        pointerId: e.pointerId,
        id: pin.id,
        handle,
        startScreen: { x: e.clientX, y: e.clientY },
        startRect: rect,
        current: rect,
      })
    },
    [],
  )

  // Pushes whatever the just-moved pins now overlap, as one undoable batch.
  // The rule the board was specified with ("капля в воду") applied only to
  // dropped files and AI-created notes; dragging a pin onto another simply
  // buried it.
  const pushNeighbours = useCallback((movedIds: string[]) => {
    const state = useBoardStore.getState()
    const current = state.board
    // Absent on boards made before the setting existed, and those were
    // pushing — so only an explicit false turns it off.
    if (!current || current.settings.pushEnabled === false) return
    const moves = resolvePushForMoved(
      current.pins.map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h })),
      movedIds,
    )
    if (moves.length) state.movePins(moves)
  }, [])

  // Move/up listeners — attached to window so we keep getting events even
  // if the pointer leaves the container (user drags off-screen).
  useEffect(() => {
    if (!interaction) return
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== interaction.pointerId) return
      if (interaction.kind === 'drag') {
        setInteraction((cur) =>
          cur && cur.kind === 'drag'
            ? {
                ...cur,
                delta: {
                  dx: (e.clientX - cur.startScreen.x) / viewport.zoom,
                  y: (e.clientY - cur.startScreen.y) / viewport.zoom,
                },
              }
            : cur,
        )
      } else if (interaction.kind === 'resize') {
        setInteraction((cur) =>
          cur && cur.kind === 'resize'
            ? { ...cur, current: computeResize(cur, e, viewport.zoom) }
            : cur,
        )
      } else if (interaction.kind === 'marquee') {
        const rect = containerRef.current!.getBoundingClientRect()
        const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
        setInteraction((cur) =>
          cur && cur.kind === 'marquee' ? { ...cur, currentWorld: world } : cur,
        )
      } else if (interaction.kind === 'wire') {
        const rect = containerRef.current!.getBoundingClientRect()
        const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
        // Topmost pin under the cursor wins, matching what the user sees.
        const over = [...pins]
          .sort((a, b) => b.z - a.z)
          .find(
            (p) =>
              p.id !== interaction.fromPinId &&
              world.x >= p.x &&
              world.x <= p.x + p.w &&
              world.y >= p.y &&
              world.y <= p.y + p.h,
          )
        setInteraction((cur) =>
          cur && cur.kind === 'wire'
            ? { ...cur, currentWorld: world, overPinId: over?.id ?? null }
            : cur,
        )
      }
    }
    // Snapping is applied on commit, not during the drag: the pin follows
    // the cursor exactly while you hold it and settles onto the grid when
    // you let go. Snapping live makes a slow drag feel like it's fighting
    // you. Off by default, so this is the identity function unless the
    // board asked for it.
    const snap = (v: number) => {
      const step = settings?.snapEnabled ? settings.snapStep : 0
      return step > 0 ? Math.round(v / step) * step : v
    }

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== interaction.pointerId) return
      if (interaction.kind === 'drag') {
        const { delta, ids, startPositions } = interaction
        if (delta.dx !== 0 || delta.y !== 0) {
          const moves: Array<{ id: string; x: number; y: number }> = []
          for (const id of ids) {
            const s = startPositions.get(id)
            if (!s) continue
            moves.push({ id, x: snap(s.x + delta.dx), y: snap(s.y + delta.y) })
          }
          movePins(moves)
          pushNeighbours(ids)
        }
      } else if (interaction.kind === 'resize') {
        const { id, current, startRect } = interaction
        if (current.w !== startRect.w || current.h !== startRect.h) {
          // Resize commits only the size; position changes (from dragging
          // a corner handle that moves x/y) are a separate movePins batch.
          const moves: Array<{ id: string; x: number; y: number }> = []
          if (current.x !== startRect.x || current.y !== startRect.y) {
            moves.push({ id, x: current.x, y: current.y })
          }
          if (moves.length) movePins(moves)
          resizePin(id, { w: snap(current.w), h: snap(current.h) })
          // A pin grown over its neighbours pushes them like a moved one.
          pushNeighbours([id])
        }
      } else if (interaction.kind === 'marquee') {
        const { startWorld, currentWorld } = interaction
        const box: Rect = {
          x: Math.min(startWorld.x, currentWorld.x),
          y: Math.min(startWorld.y, currentWorld.y),
          w: Math.abs(currentWorld.x - startWorld.x),
          h: Math.abs(currentWorld.y - startWorld.y),
        }
        const hits = pins.filter((p) => rectsIntersect(box, p)).map((p) => p.id)
        if (hits.length) selectMany(hits)
        else clearSelection()
      } else if (interaction.kind === 'wire') {
        // Dropped on a pin: connect. Dropped anywhere else: nothing — the
        // alternative (spawning a note there) is too easy to trigger by
        // accident when you let go in the wrong place.
        const { fromPinId, fromSide, overPinId } = interaction
        if (overPinId) {
          const target = pins.find((p) => p.id === overPinId)
          const source = pins.find((p) => p.id === fromPinId)
          if (target && source) {
            addEdge({
              id: crypto.randomUUID(),
              from: { pinId: fromPinId, side: fromSide },
              to: { pinId: overPinId, side: bestSides(source, target).to },
            })
          }
        }
      }
      setInteraction(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [
    interaction,
    viewport.zoom,
    movePins,
    resizePin,
    selectMany,
    clearSelection,
    pins,
    screenToWorld,
    // These were missing and the handlers close over them: a snap setting
    // changed mid-session, or the push helper, would have been read from a
    // stale closure until the next interaction rebuilt the effect.
    pushNeighbours,
    addEdge,
    settings?.snapEnabled,
    settings?.snapStep,
  ])

  // --- keyboard shortcuts (scoped to when the board canvas is mounted) ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const mod = e.ctrlKey || e.metaKey
      if (mod && isKey(e, 'f')) {
        // The browser's own find is no use here: most of the board is not
        // in the DOM at any moment, and what is, is transformed off screen.
        e.preventDefault()
        setSearchOpen(true)
        return
      }
      if (mod && isKey(e, 'z') && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((mod && isKey(e, 'y')) || (mod && e.shiftKey && isKey(e, 'z'))) {
        e.preventDefault()
        redo()
        return
      }
      // A selected connection takes priority over selected pins: you click
      // a wire, press Delete, and the wire goes — deleting the cards it
      // joins instead would be a nasty surprise.
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedEdgeId) {
        e.preventDefault()
        removeEdges([selectedEdgeId])
        setSelectedEdgeId(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
        e.preventDefault()
        useBoardStore.getState().removePins(Array.from(selected))
        return
      }
      if (e.key === 'Escape') {
        // Step out of editing first; a second Escape clears the selection.
        if (useBoardStore.getState().activePinId) {
          useBoardStore.getState().setActivePin(null)
          return
        }
        setSelectedEdgeId(null)
        clearSelection()
        return
      }
      if (mod && isKey(e, 'a')) {
        e.preventDefault()
        selectMany(pins.map((p) => p.id))
        return
      }

      // Ctrl+Enter strikes the selection through as done. A bare letter
      // would have been shorter, but plain printable keys are taken: they
      // open the editor and land in the text (see "start typing" below).
      if (mod && e.key === 'Enter' && selected.size > 0) {
        e.preventDefault()
        const ids = Array.from(selected)
        const st = useBoardStore.getState()
        // One card decides for the batch: if anything in the selection is
        // still open, the whole selection gets struck; if they are all
        // struck already, the shortcut un-strikes them. Toggling each card
        // on its own would just shuffle a mixed selection around.
        const anyOpen = ids.some((id) => !pins.find((p) => p.id === id)?.done)
        for (const id of ids) st.updatePin(id, 'done', anyOpen)
        return
      }

      // Enter edits the selected pin, Escape leaves — the convention every
      // board tool shares. Only with exactly one pin selected, since there
      // is no sensible "edit five pins".
      if (e.key === 'Enter' && selected.size === 1) {
        const id = Array.from(selected)[0]
        const pin = pins.find((p) => p.id === id)
        if (pin && (pin.type === 'note' || pin.type === 'shape')) {
          e.preventDefault()
          useBoardStore.getState().setActivePin(id)
        }
        return
      }

      // Just start typing, like Miro: the first character opens the editor
      // and lands in the text rather than being swallowed. Printable keys
      // only, and never with a modifier held (that's a shortcut).
      if (
        selected.size === 1 &&
        e.key.length === 1 &&
        !mod &&
        !e.altKey &&
        !useBoardStore.getState().activePinId
      ) {
        const id = Array.from(selected)[0]
        const pin = pins.find((p) => p.id === id)
        if (pin && (pin.type === 'note' || pin.type === 'shape')) {
          e.preventDefault()
          const store = useBoardStore.getState()
          store.updatePin(id, 'text', (pin.text ?? '') + e.key)
          store.setActivePin(id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, selected, clearSelection, selectMany, pins])

  // --- paste (internal clipboard from useFileStore, or URL from text) ---
  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      const text = e.clipboardData?.getData('text/plain') ?? ''
      const clip = useFileStore.getState().clipboard
      if (clip && clip.entries.length > 0) {
        e.preventDefault()
        const center = viewportCenterWorld(viewport, containerSize)
        let z = pins.reduce((m, p) => Math.max(m, p.z), 0)
        let i = 0
        for (const entry of clip.entries) {
          const args = { x: center.x + i * 24, y: center.y + i * 24, z: ++z }
          try {
            addPin(pinFromVaultEntry(entry, args))
            i++
          } catch (err) {
            pushToast(`Не удалось вставить: ${err instanceof Error ? err.message : String(err)}`, 'error')
          }
        }
        return
      }
      if (text && looksLikeUrl(text)) {
        e.preventDefault()
        const center = viewportCenterWorld(viewport, containerSize)
        const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
        const url = normalizeUrl(text)
        addPin({
          id: crypto.randomUUID(),
          type: 'link',
          x: center.x - 200,
          y: center.y - 160,
          w: 400,
          h: 320,
          z,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          url,
        })
      }
    }
    window.addEventListener('paste', handler)
    return () => window.removeEventListener('paste', handler)
  }, [addPin, containerSize, pins, pushToast, viewport])

  // --- drop from OS ---
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      if (!board) return
      const rect0 = containerRef.current!.getBoundingClientRect()
      const dropAt = screenToWorld(e.clientX - rect0.left, e.clientY - rect0.top)

      // A decoration dropped onto a note: pin it to whichever corner of
      // that note the pointer was nearest, so it lands where you aimed.
      const decorId = e.dataTransfer.getData(DECOR_MIME)
      if (decorId) {
        const def = decorById(decorId)
        const target = [...pins]
          .sort((a, b) => b.z - a.z)
          .find(
            (p) =>
              p.type === 'note' &&
              dropAt.x >= p.x &&
              dropAt.x <= p.x + p.w &&
              dropAt.y >= p.y &&
              dropAt.y <= p.y + p.h,
          )
        if (!def) return
        if (!target || target.type !== 'note') {
          pushToast('Брось на заметку — штучки цепляются к ним', 'info')
          return
        }
        const existing = target.decor ?? []
        if (existing.length >= MAX_DECOR_PER_NOTE) {
          pushToast(`Больше ${MAX_DECOR_PER_NOTE} штучек на одну заметку — хватит`, 'info')
          return
        }
        const corner =
          `${dropAt.y < target.y + target.h / 2 ? 't' : 'b'}${dropAt.x < target.x + target.w / 2 ? 'l' : 'r'}` as
            | 'tl'
            | 'tr'
            | 'bl'
            | 'br'
        // It lands exactly where it was dropped rather than snapping to the
        // nearest corner; the corner is kept only as the fallback for
        // decorations saved before they could be positioned freely.
        useBoardStore
          .getState()
          .updatePin(target.id, 'decor', [
            ...existing,
            {
              id: crypto.randomUUID(),
              kind: def.kind,
              corner,
              color: def.color,
              x: clampPos((dropAt.x - target.x) / target.w),
              y: clampPos((dropAt.y - target.y) / target.h),
            },
          ])
        return
      }

      // A template dragged out of the side panel: build that note here
      // rather than in the middle of the screen, since the drop point is
      // the whole reason to drag instead of click.
      const styleId = e.dataTransfer.getData(TEMPLATE_MIME)
      if (styleId) {
        const def = templateById(styleId)
        if (def) {
          const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
          const note = makeNotePin(
            { x: Math.round(dropAt.x - 110), y: Math.round(dropAt.y - 100), z },
            '',
            def.color,
          )
          const styled = {
            ...note,
            style: def.style,
            ...(def.texture ? { texture: def.texture } : {}),
          }
          addPin(styled)
          const store = useBoardStore.getState()
          store.selectOnly(styled.id)
          store.setActivePin(styled.id)
          pushNeighbours([styled.id])
        }
        return
      }

      // collectDroppedEntries returns null when the Entries API isn't
      // available (it's what makes dropping a *folder* work). Falling back
      // to the plain file list matters: without it the drop silently did
      // nothing at all, which is exactly how a "drag and drop doesn't work"
      // bug report looks.
      const dropped =
        (await collectDroppedEntries(e.dataTransfer)) ??
        Array.from(e.dataTransfer.files).map((file) => ({ relPath: [file.name], file }))
      if (dropped.length === 0) return
      const rect = containerRef.current!.getBoundingClientRect()
      const dropWorld = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      let z = pins.reduce((m, p) => Math.max(m, p.z), 0)

      // Uploads run through the shared pool (limit 3) like every other bulk
      // operation — dropping a folder of images used to upload them strictly
      // one after another. Layout offsets are assigned up front, from the
      // index, so a pin's position doesn't depend on which upload finishes
      // first.
      const boardId = board.id
      const jobs = dropped.map((entry, i) => ({ ...entry, index: i, z: ++z }))
      const result = await runPool(jobs, 3, async (job) => {
        const offset = job.index * 24
        const args = { x: dropWorld.x + offset, y: dropWorld.y + offset, z: job.z }
        const pin = await pinFromDroppedFile(boardId, job.file, args)
        addPin(pin)
        // "Капля в воду": push overlapping pins out of the way. Runs
        // against the current board state (which now includes the pin
        // we just added — filtered out below), and any actual movement
        // is committed as a normal batch of move ops.
        const state = useBoardStore.getState()
        const others = (state.board?.pins ?? [])
          .filter((p) => p.id !== pin.id)
          .map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }))
        const pushed = resolvePush(others, pin, 16)
        if (pushed.length) movePins(pushed)
      })

      for (const { item, error } of result.failed) {
        pushToast(
          `Не удалось загрузить «${item.relPath.join('/')}»: ${error instanceof Error ? error.message : String(error)}`,
          'error',
        )
      }
    },
    [addPin, board, movePins, pins, pushToast, screenToWorld],
  )

  // --- context menu on empty space ---
  const onContextMenuEmpty = useCallback(
    (e: React.MouseEvent) => {
      if (e.target !== containerRef.current) return
      e.preventDefault()
      const rect = containerRef.current!.getBoundingClientRect()
      const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top)
      setMenu({
        kind: 'empty',
        screen: { x: e.clientX, y: e.clientY },
        world,
      })
    },
    [screenToWorld],
  )

  // --- long-press = right-click, for touch --------------------------------
  // Touch has no context menu gesture of its own, so on a phone every menu
  // on this board was unreachable: no colours, no shapes, no delete, no AI
  // actions. A press held still for half a second opens the same menu the
  // right button does. Cancelled by any real movement, so it never fires
  // during a pan or a drag.
  const longPress = useRef<{ timer: number; x: number; y: number } | null>(null)

  const cancelLongPress = useCallback(() => {
    if (longPress.current) {
      window.clearTimeout(longPress.current.timer)
      longPress.current = null
    }
  }, [])

  const armLongPress = useCallback(
    (e: React.PointerEvent, open: (screen: { x: number; y: number }) => void) => {
      if (e.pointerType !== 'touch') return
      cancelLongPress()
      const { clientX: x, clientY: y } = e
      const timer = window.setTimeout(() => {
        longPress.current = null
        open({ x, y })
      }, 500)
      longPress.current = { timer, x, y }
    },
    [cancelLongPress],
  )

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const lp = longPress.current
      if (!lp) return
      if (Math.abs(e.clientX - lp.x) > 10 || Math.abs(e.clientY - lp.y) > 10) cancelLongPress()
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cancelLongPress)
    window.addEventListener('pointercancel', cancelLongPress)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', cancelLongPress)
      window.removeEventListener('pointercancel', cancelLongPress)
    }
  }, [cancelLongPress])

  // --- "Create note here" from the context menu ---
  const createNoteAt = useCallback(
    (world: { x: number; y: number }) => {
      const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
      const pin = makeNotePin({ x: world.x - 110, y: world.y - 100, z })
      addPin(pin)
      // Straight into editing, the way FigJam drops you into a new sticky:
      // creating a note is only ever a prelude to writing in it.
      const store = useBoardStore.getState()
      store.selectOnly(pin.id)
      store.setActivePin(pin.id)
      const state = useBoardStore.getState()
      const others = (state.board?.pins ?? [])
        .filter((p) => p.id !== pin.id)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }))
      const pushed = resolvePush(others, pin, 16)
      if (pushed.length) movePins(pushed)
    },
    [addPin, movePins, pins],
  )

  const [edgeMenu, setEdgeMenu] = useState<{ id: string; screen: { x: number; y: number } } | null>(null)

  const labelEdge = useCallback(
    async (id: string) => {
      const edge = (useBoardStore.getState().board?.edges ?? []).find((e) => e.id === id)
      if (!edge) return
      const value = await promptDialog('Подпись связи', edge.label ?? '')
      if (value === null) return
      // An empty string clears the label rather than drawing an empty one.
      useBoardStore.getState().updateEdge(id, 'label', value.trim() || undefined)
    },
    [promptDialog],
  )

  // --- fit the board into view ---------------------------------------
  // A board's viewport is saved with it, so opening one on a narrower
  // screen than it was last used on can land entirely off-camera — from a
  // phone that looks like an empty board with your work gone. Fit runs
  // automatically in that case (once per board) and is on the toolbar for
  // every other time.
  const fitToPins = useCallback(() => {
    const current = useBoardStore.getState().board
    if (!current || current.pins.length === 0 || containerSize.w === 0) return
    const bounds = boundsOf(current.pins.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })))
    if (!bounds) return
    const pad = 48
    const zoom = Math.min(
      3,
      Math.max(0.15, Math.min(containerSize.w / (bounds.w + pad * 2), containerSize.h / (bounds.h + pad * 2))),
    )
    setViewport({
      zoom,
      x: bounds.x + bounds.w / 2 - containerSize.w / 2 / zoom,
      y: bounds.y + bounds.h / 2 - containerSize.h / 2 / zoom,
    })
  }, [containerSize.w, containerSize.h, setViewport])

  // When a pin stops being edited, put focus back on the board. Otherwise
  // it stays on the unmounted textarea's old position — i.e. nowhere — and
  // the first Ctrl+Z or Delete after editing goes to no one.
  const wasEditing = useRef(false)
  useEffect(() => {
    const editing = activePinId !== null
    if (wasEditing.current && !editing) containerRef.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [activePinId, containerRef])

  const autoFitted = useRef<string | null>(null)
  useEffect(() => {
    const id = board?.id
    if (!id || containerSize.w === 0 || pins.length === 0) return
    if (autoFitted.current === id) return
    autoFitted.current = id
    // Only when nothing is currently visible — a deliberate viewport the
    // user left behind must be respected.
    const anyVisible = pins.some(
      (p) =>
        p.x + p.w > viewport.x &&
        p.x < viewport.x + containerSize.w / viewport.zoom &&
        p.y + p.h > viewport.y &&
        p.y < viewport.y + containerSize.h / viewport.zoom,
    )
    if (!anyVisible) fitToPins()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.id, containerSize.w, containerSize.h, pins.length])

  const createShapeAt = useCallback(
    (world: { x: number; y: number }, kind: ShapeKind) => {
      const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
      const pin = makeShapePin({ x: world.x - 130, y: world.y - 90, z }, kind)
      addPin(pin)
      useBoardStore.getState().selectOnly(pin.id)
      pushNeighbours([pin.id])
      // No push here: a shape is usually drawn *around* existing pins, so
      // shoving them out of the way would defeat the point.
    },
    [addPin, pins],
  )

  // --- "Note from the vault" (a linked .md file) ---
  // The picker is opened from here and resolves in the handler below; the
  // world position is remembered so the pin lands where the menu was.
  const [vaultPickerAt, setVaultPickerAt] = useState<{ x: number; y: number } | null>(null)

  const createVaultNoteAt = useCallback((world: { x: number; y: number }) => {
    setVaultPickerAt(world)
  }, [])

  // "Put an existing vault file on the board". Files dropped from the OS
  // are copied into the board's assets; this instead *references* a file
  // already in the vault, which is the only way to pin audio, video or a
  // PDF that's already there — previously unreachable from the board at
  // all, since the file manager is a different tab you can't drag out of.
  const [filePickerAt, setFilePickerAt] = useState<{ x: number; y: number } | null>(null)

  const handleVaultFilePick = useCallback(
    (entry: FileEntry) => {
      const world = filePickerAt
      setFilePickerAt(null)
      if (!world) return
      const current = useBoardStore.getState()
      const z = (current.board?.pins ?? []).reduce((m, p) => Math.max(m, p.z), 0) + 1
      current.addPin(pinFromVaultEntry(entry, { x: world.x - 140, y: world.y - 110, z }))
    },
    [filePickerAt],
  )

  // Which shape is waiting for a picture, if any.
  const [imagePickerFor, setImagePickerFor] = useState<string | null>(null)

  const handleShapeImagePick = useCallback(
    (entry: FileEntry) => {
      const id = imagePickerFor
      setImagePickerFor(null)
      if (!id) return
      const store = useBoardStore.getState()
      store.updatePin(id, 'assetPath', entry.path)
      store.updatePin(id, 'fileName', entry.name)
    },
    [imagePickerFor],
  )

  const handleVaultNotePick = useCallback(
    async (entry: FileEntry) => {
      const world = vaultPickerAt
      setVaultPickerAt(null)
      if (!world) return
      let text = ''
      try {
        text = await getTextContent(entry.path)
      } catch (err) {
        pushToast(
          `Не удалось прочитать «${entry.name}»: ${err instanceof Error ? err.message : String(err)}`,
          'error',
        )
        return
      }
      const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
      const pin = makeNotePin({ x: world.x - 160, y: world.y - 130, z }, text, '#e8eae6')
      // Wider than a sticky note by default — a real document needs room.
      const linked = { ...pin, w: 320, h: 260, sourcePath: entry.path, textColor: '#16150f' }
      addPin(linked)
      const state = useBoardStore.getState()
      const others = (state.board?.pins ?? [])
        .filter((p) => p.id !== linked.id)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }))
      const pushed = resolvePush(others, linked, 16)
      if (pushed.length) movePins(pushed)
    },
    [vaultPickerAt, pins, addPin, movePins, pushToast],
  )

  // --- "Create link here" from the context menu ---
  const createLinkAt = useCallback(
    async (world: { x: number; y: number }) => {
      const url = await promptDialog('Адрес ссылки', 'https://')
      if (!url) return
      const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
      addPin({
        id: crypto.randomUUID(),
        type: 'link',
        x: world.x - 200,
        y: world.y - 160,
        w: 400,
        h: 320,
        z,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: normalizeUrl(url),
      })
    },
    [addPin, pins],
  )

  const exportBoard = useCallback(
    async (format: 'png' | 'pdf') => {
      const world = worldRef.current
      const bounds = boundsOf(pins.map((p) => ({ x: p.x, y: p.y, w: p.w, h: p.h })))
      if (!world || !bounds) {
        pushToast('Пустая доска — нечего выгружать', 'info')
        return
      }
      // Enough to clear what hangs outside a pin's own box: a decoration
      // sits astride a corner and can be 160 units across, and reactions
      // hang below the bottom edge. Cropping those is the kind of thing
      // nobody notices until the picture is already sent.
      const pad = 120
      const size = { width: Math.ceil(bounds.w + pad * 2), height: Math.ceil(bounds.h + pad * 2) }
      if (exportTooSmall(size)) {
        pushToast('Доска очень большая — картинка выйдет грубой', 'info')
      }
      setExporting(true)
      try {
        // Give the pins that virtualization was hiding a moment to mount,
        // and wait on the font promise, because a webfont that arrives
        // after the snapshot simply is not in it.
        //
        // Deliberately timers and not requestAnimationFrame: rAF does not
        // fire in a tab that isn't being painted. Start an export and
        // switch tabs and the rAF version waits for ever, with the button
        // stuck disabled and nothing to say why.
        await new Promise((r) => setTimeout(r, 60))
        await document.fonts.ready
        // Only the families the board is actually set in: see
        // usedFontEmbedCss — embedding all of them takes minutes.
        const used = new Set<string>([
          'IBM Plex Sans',
          'IBM Plex Mono',
          ...pins.flatMap((p) =>
            p.type === 'note'
              ? [FONT_BY_ID.get(p.font ?? 'default')?.css.split(',')[0] ?? '']
              : [],
          ),
        ])
        const fontCss = await usedFontEmbedCss(used)
        const origin = world.style.transform
        // The world is parked wherever the user was looking; the export
        // wants the board's own top-left at the origin.
        world.style.transform = `translate(${pad - bounds.x}px, ${pad - bounds.y}px)`
        let png: string
        try {
          // A hard stop: html-to-image waits on image loads that can
          // simply never resolve — a decode that fails, a tab that stops
          // painting — and a button disabled for ever is the worst way to
          // fail.
          png = await withTimeout(
            elementToPng(world, size, settings?.backgroundColor ?? '#1b1a18', fontCss),
            90_000,
            'снимок доски не уложился в полторы минуты',
          )
        } finally {
          world.style.transform = origin
        }
        const name = exportFileName(board?.name ?? 'board', format)
        if (format === 'png') downloadDataUrl(png, name)
        else downloadBlob(await pngToPdf(png, size), name)
        pushToast(`Сохранено: ${name}`, 'success')
      } catch (e) {
        pushToast(`Не удалось выгрузить: ${e instanceof Error ? e.message : String(e)}`, 'error')
      } finally {
        setExporting(false)
      }
    },
    [board?.name, pins, pushToast, settings?.backgroundColor],
  )

  if (!board) return null

  const gridCfg = GRID_PATTERN[settings?.backgroundTexture ?? 'dots']
  const gridColor = 'rgba(255,255,255,0.06)'
  const gridStyle: React.CSSProperties = {
    backgroundColor: settings?.backgroundColor ?? '#1b1a18',
    backgroundImage: settings?.gridVisible ? gridCfg.image(gridColor) : 'none',
    backgroundSize: `${gridCfg.size * viewport.zoom}px ${gridCfg.size * viewport.zoom}px`,
    backgroundPosition: `${-viewport.x * viewport.zoom}px ${-viewport.y * viewport.zoom}px`,
  }

  // The single selected note, with its box already through the viewport
  // transform — the bar is chrome and lives in screen coordinates.
  // Hidden while a drag or resize is in progress, because a toolbar that
  // chases the note around is noise.
  const formatTarget = (() => {
    if (selected.size !== 1 || interaction) return null
    const pin = pins.find((p) => p.id === Array.from(selected)[0])
    if (!pin || pin.type !== 'note') return null
    return {
      pin,
      rect: {
        x: (pin.x - viewport.x) * viewport.zoom,
        y: (pin.y - viewport.y) * viewport.zoom,
        w: pin.w * viewport.zoom,
        h: pin.h * viewport.zoom,
      },
    }
  })()

  // Marquee box in screen coords for rendering.
  let marqueeRect: Rect | null = null
  if (interaction && interaction.kind === 'marquee') {
    const { startWorld, currentWorld } = interaction
    marqueeRect = {
      x: (Math.min(startWorld.x, currentWorld.x) - viewport.x) * viewport.zoom,
      y: (Math.min(startWorld.y, currentWorld.y) - viewport.y) * viewport.zoom,
      w: Math.abs(currentWorld.x - startWorld.x) * viewport.zoom,
      h: Math.abs(currentWorld.y - startWorld.y) * viewport.zoom,
    }
  }

  // Render pins in z order so the DOM reflects stacking.
  const sorted = [...visiblePins].sort((a, b) => a.z - b.z)

  return (
    <div
      ref={containerRef}
      className={styles.canvas}
      style={gridStyle}
      onPointerDown={onContainerPointerDown}
      // Focusable so the board can take focus back when a pin's editor
      // closes. Without it focus lands on <body>, which works by accident
      // today and would break the moment anything else claims it.
      tabIndex={-1}
      onContextMenu={onContextMenuEmpty}
      onPointerDownCapture={(e) => {
        if (e.target !== containerRef.current) return
        armLongPress(e, (screen) => {
          const rect = containerRef.current!.getBoundingClientRect()
          setMenu({
            kind: 'empty',
            screen,
            world: screenToWorld(screen.x - rect.left, screen.y - rect.top),
          })
        })
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
        ref={worldRef}
        className={styles.world}
        style={{
          transform: `translate(${-viewport.x * viewport.zoom}px, ${-viewport.y * viewport.zoom}px) scale(${viewport.zoom})`,
          transformOrigin: '0 0',
          // Everything inside this layer is scaled by the transform above,
          // which would also scale hairlines and handles. Pins divide by
          // this to stay visually constant at any zoom.
          ['--zoom' as string]: viewport.zoom,
        }}
      >
        <EdgeLayer
          edges={edges}
          pins={pins}
          overrides={overrides ?? undefined}
          selectedEdgeId={selectedEdgeId}
          onSelectEdge={setSelectedEdgeId}
          onLabelEdge={(id) => void labelEdge(id)}
          onContextMenuEdge={(id, e) =>
            setEdgeMenu({ id, screen: { x: e.clientX, y: e.clientY } })
          }
          pending={
            interaction?.kind === 'wire'
              ? {
                  path: (() => {
                    const source = pins.find((p) => p.id === interaction.fromPinId)
                    if (!source) return ''
                    const start = portPoint(source, interaction.fromSide)
                    const end = interaction.currentWorld
                    return edgePath(start, interaction.fromSide, end, oppositeOf(interaction.fromSide))
                  })(),
                }
              : null
          }
        />

        {sorted.map((pin) => (
          <PinRenderer
            key={pin.id}
            pin={pin}
            override={overrides?.get(pin.id)}
            selected={selected.has(pin.id)}
            matched={searchMatches.has(pin.id)}
            onPointerDownBody={(e) => {
              armLongPress(e, (screen) => setMenu({ kind: 'pin', screen, pin }))
              beginPinDrag(e, pin)
            }}
            onPortPointerDown={(e, side) => beginWire(e, pin, side)}
            onPointerDownHandle={(e, handle) => beginPinResize(e, pin, handle)}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setMenu({ kind: 'pin', screen: { x: e.clientX, y: e.clientY }, pin })
            }}
          />
        ))}
      </div>

      {marqueeRect && (
        <div
          className={styles.marquee}
          style={{
            left: marqueeRect.x,
            top: marqueeRect.y,
            width: marqueeRect.w,
            height: marqueeRect.h,
          }}
        />
      )}

      {searchOpen && (
        <BoardSearch
          pins={pins}
          zoom={viewport.zoom}
          container={containerSize}
          onMatchesChange={setSearchMatches}
          onJump={(v, id) => {
            setViewport({ ...viewport, ...v })
            selectOnly(id)
          }}
          onClose={() => {
            setSearchOpen(false)
            containerRef.current?.focus({ preventScroll: true })
          }}
        />
      )}

      {/* The formatting bar, for exactly one selected note. Not shown for a
          multi-selection: the controls are toggles reading one note's
          state, and showing one note's settings over five would lie. */}
      {formatTarget && (
        <NoteFormatBar
          pin={formatTarget.pin}
          rect={formatTarget.rect}
          container={containerSize}
        />
      )}

      {menu && (
        <PinContextMenu
          target={menu}
          onClose={() => setMenu(null)}
          onCreateNote={createNoteAt}
          onCreateLink={createLinkAt}
          onCreateVaultNote={createVaultNoteAt}
          onCreateShape={createShapeAt}
          onPickShapeImage={setImagePickerFor}
        />
      )}

      {/* Creating from the toolbar drops things into the middle of what the
          user is looking at, since there's no click position to use. */}
      <BoardToolbar
        hasEdges={edges.length > 0}
        onCreateNote={() => createNoteAt(viewportCenterWorld(viewport, containerSize))}
        onCreateVaultNote={() => createVaultNoteAt(viewportCenterWorld(viewport, containerSize))}
        onCreateLink={() => void createLinkAt(viewportCenterWorld(viewport, containerSize))}
        onCreateShape={(kind) => createShapeAt(viewportCenterWorld(viewport, containerSize), kind)}
        onFit={fitToPins}
        onExport={(f) => void exportBoard(f)}
        exporting={exporting}
        onCreateVaultFile={() => setFilePickerAt(viewportCenterWorld(viewport, containerSize))}
      />

      {edgeMenu && (
        <EdgeContextMenu
          edgeId={edgeMenu.id}
          screen={edgeMenu.screen}
          onClose={() => setEdgeMenu(null)}
          onLabel={() => void labelEdge(edgeMenu.id)}
          onDelete={() => {
            removeEdges([edgeMenu.id])
            setSelectedEdgeId(null)
          }}
        />
      )}

      {filePickerAt && (
        <VaultNotePicker
          kind="any"
          onPick={handleVaultFilePick}
          onCancel={() => setFilePickerAt(null)}
        />
      )}

      {imagePickerFor && (
        <VaultNotePicker
          kind="image"
          onPick={handleShapeImagePick}
          onCancel={() => setImagePickerFor(null)}
        />
      )}

      {vaultPickerAt && (
        <VaultNotePicker
          onPick={(entry) => void handleVaultNotePick(entry)}
          onCancel={() => setVaultPickerAt(null)}
        />
      )}
    </div>
  )
}

// ---------- helpers ----------

// While a wire is being pulled it has no target side yet; aiming the free
// end at the opposite side of the source keeps the curve's shape stable
// instead of flipping as the cursor crosses the card.
function oppositeOf(side: PortSide): PortSide {
  return side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left'
}

function viewportCenterWorld(
  viewport: ViewportState,
  size: { w: number; h: number },
): { x: number; y: number } {
  return {
    x: viewport.x + size.w / 2 / viewport.zoom,
    y: viewport.y + size.h / 2 / viewport.zoom,
  }
}

function computeResize(
  state: Extract<Interaction, { kind: 'resize' }>,
  e: PointerEvent,
  zoom: number,
): Rect {
  const { handle, startScreen, startRect } = state
  const dx = (e.clientX - startScreen.x) / zoom
  const dy = (e.clientY - startScreen.y) / zoom
  let { x, y, w, h } = startRect
  if (handle.includes('e')) w = startRect.w + dx
  if (handle.includes('s')) h = startRect.h + dy
  if (handle.includes('w')) {
    w = startRect.w - dx
    x = startRect.x + dx
  }
  if (handle.includes('n')) {
    h = startRect.h - dy
    y = startRect.y + dy
  }
  if (w < MIN_W) {
    if (handle.includes('w')) x = startRect.x + startRect.w - MIN_W
    w = MIN_W
  }
  if (h < MIN_H) {
    if (handle.includes('n')) y = startRect.y + startRect.h - MIN_H
    h = MIN_H
  }
  return { x, y, w, h }
}
