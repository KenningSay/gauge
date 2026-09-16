// Draws the connections between pins.
//
// One SVG spanning the world layer, under the pins: the cards stay
// clickable, and a single <svg> beats one element per edge for a board with
// a hundred of them. Hit targets are a second, invisible, much thicker
// stroke over each curve — a 2px line is impossible to click otherwise.

import type { Edge, Pin } from '../../api/board'
import { resolveEdges, type Rect } from '../../utils/edgeGeo'
import styles from './EdgeLayer.module.css'

interface Props {
  edges: Edge[]
  pins: Pin[]
  // Live geometry during a drag or resize, so a connection follows the pin
  // being moved instead of snapping into place when the drag ends.
  overrides?: Map<string, Partial<Rect>>
  selectedEdgeId: string | null
  onSelectEdge: (id: string | null) => void
  onContextMenuEdge?: (id: string, e: React.MouseEvent) => void
  // Double-clicking a wire labels it — the same "double-click to edit"
  // gesture pins use.
  onLabelEdge?: (id: string) => void
  // Drawn while the user is pulling a new connection out of a port.
  pending?: { path: string } | null
}

export function EdgeLayer({
  edges,
  pins,
  overrides,
  selectedEdgeId,
  onSelectEdge,
  onContextMenuEdge,
  onLabelEdge,
  pending,
}: Props) {
  const rects = new Map<string, Rect>()
  for (const pin of pins) {
    const o = overrides?.get(pin.id)
    rects.set(pin.id, {
      x: o?.x ?? pin.x,
      y: o?.y ?? pin.y,
      w: o?.w ?? pin.w,
      h: o?.h ?? pin.h,
    })
  }

  const resolved = resolveEdges(edges, rects)
  if (resolved.length === 0 && !pending) return null

  // Keep in sync with --edge-span in the stylesheet: the box is offset by
  // this much, so the content translates back by the same amount to land on
  // world coordinates.
  const SPAN = 100000

  return (
    <svg className={styles.layer} aria-hidden={false}>
      <g transform={`translate(${SPAN} ${SPAN})`}>
      {resolved.map(({ edge, path, mid, to }) => {
        const selected = edge.id === selectedEdgeId
        return (
          <g key={edge.id}>
            <path
              className={styles.hit}
              d={path}
              onPointerDown={(e) => {
                e.stopPropagation()
                onSelectEdge(edge.id)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                e.stopPropagation()
                onSelectEdge(edge.id)
                onContextMenuEdge?.(edge.id, e)
              }}
              onDoubleClick={(e) => {
                e.stopPropagation()
                onLabelEdge?.(edge.id)
              }}
            />
            <path
              className={`${styles.wire} ${selected ? styles.wireSelected : ''}`}
              style={edge.color ? { stroke: edge.color } : undefined}
              d={path}
            />
            {/* A dot at the receiving end reads as direction without the
                visual weight of an arrowhead on every wire. */}
            <circle className={styles.endpoint} cx={to.x} cy={to.y} r={4} />
            {edge.label && (
              <text className={styles.label} x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="middle">
                {edge.label}
              </text>
            )}
          </g>
        )
      })}

        {pending && <path className={styles.pending} d={pending.path} />}
      </g>
    </svg>
  )
}
