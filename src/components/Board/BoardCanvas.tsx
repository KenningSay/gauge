import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Pin } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useUiStore } from '../../store/useUiStore'
import { useFileStore } from '../../store/useFileStore'
import { useBoardPanZoom, type ViewportState } from '../../hooks/useBoardPanZoom'
import { useBoardVirtual } from '../../hooks/useBoardVirtual'
import { rectsIntersect, resolvePush, type Rect } from '../../utils/boardGeo'
import {
  looksLikeUrl,
  makeNotePin,
  normalizeUrl,
  pinFromDroppedFile,
  pinFromVaultEntry,
} from '../../utils/boardPinFactories'
import { collectDroppedEntries } from '../../utils/dropFolder'
import { getTextContent } from '../../api/webdav'
import type { FileEntry } from '../../api/types'
import { VaultNotePicker } from './VaultNotePicker'
import { runPool } from '../../utils/pool'
import { PinRenderer } from './pins/PinRenderer'
import { PinContextMenu, type PinMenuTarget } from './PinContextMenu'
import styles from './BoardCanvas.module.css'

type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

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

export function BoardCanvas() {
  const containerRef = useRef<HTMLDivElement | null>(null)
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
  const visiblePins = useBoardVirtual({
    pins,
    viewport,
    containerWidth: containerSize.w,
    containerHeight: containerSize.h,
  })

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
        containerRef.current!.setPointerCapture(e.pointerId)
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
      containerRef.current!.setPointerCapture(e.pointerId)
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

  const beginPinResize = useCallback(
    (e: React.PointerEvent, pin: Pin, handle: Handle) => {
      if (e.button !== 0) return
      e.stopPropagation()
      containerRef.current!.setPointerCapture(e.pointerId)
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
  }, [interaction, viewport.zoom, movePins, resizePin, selectMany, clearSelection, pins, screenToWorld])

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
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }
      if ((mod && e.key.toLowerCase() === 'y') || (mod && e.shiftKey && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        redo()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
        e.preventDefault()
        useBoardStore.getState().removePins(Array.from(selected))
        return
      }
      if (e.key === 'Escape') {
        clearSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        selectMany(pins.map((p) => p.id))
        return
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

  // --- "Create note here" from the context menu ---
  const createNoteAt = useCallback(
    (world: { x: number; y: number }) => {
      const z = pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
      const pin = makeNotePin({ x: world.x - 110, y: world.y - 100, z })
      addPin(pin)
      const state = useBoardStore.getState()
      const others = (state.board?.pins ?? [])
        .filter((p) => p.id !== pin.id)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }))
      const pushed = resolvePush(others, pin, 16)
      if (pushed.length) movePins(pushed)
    },
    [addPin, movePins, pins],
  )

  // --- "Note from the vault" (a linked .md file) ---
  // The picker is opened from here and resolves in the handler below; the
  // world position is remembered so the pin lands where the menu was.
  const [vaultPickerAt, setVaultPickerAt] = useState<{ x: number; y: number } | null>(null)

  const createVaultNoteAt = useCallback((world: { x: number; y: number }) => {
    setVaultPickerAt(world)
  }, [])

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

  if (!board) return null

  const gridCfg = GRID_PATTERN[settings?.backgroundTexture ?? 'dots']
  const gridColor = 'rgba(255,255,255,0.06)'
  const gridStyle: React.CSSProperties = {
    backgroundColor: settings?.backgroundColor ?? '#1b1a18',
    backgroundImage: settings?.gridVisible ? gridCfg.image(gridColor) : 'none',
    backgroundSize: `${gridCfg.size * viewport.zoom}px ${gridCfg.size * viewport.zoom}px`,
    backgroundPosition: `${-viewport.x * viewport.zoom}px ${-viewport.y * viewport.zoom}px`,
  }

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
      onContextMenu={onContextMenuEmpty}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
    >
      <div
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
        {sorted.map((pin) => (
          <PinRenderer
            key={pin.id}
            pin={pin}
            override={overrides?.get(pin.id)}
            selected={selected.has(pin.id)}
            onPointerDownBody={(e) => beginPinDrag(e, pin)}
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

      {menu && (
        <PinContextMenu
          target={menu}
          onClose={() => setMenu(null)}
          onCreateNote={createNoteAt}
          onCreateLink={createLinkAt}
          onCreateVaultNote={createVaultNoteAt}
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
