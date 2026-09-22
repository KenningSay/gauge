// Ink on the board: what the pencil leaves behind.
//
// One <svg> with a viewBox of 0..1 in both axes and
// preserveAspectRatio="none", so the stored normalised points need no
// conversion and the drawing stretches with its pin. The stroke width is
// the one thing that must NOT stretch, or resizing a sketch would turn a
// pencil line into a marker — hence vectorEffect="non-scaling-stroke" and
// a width expressed in screen terms via the zoom variable.

import type { DrawingPin as DrawingPinT } from '../../../api/board'
import { strokePath } from '../../../utils/inkGeo'
import styles from './Pins.module.css'

export function DrawingPin({ pin }: { pin: DrawingPinT }) {
  return (
    <svg
      className={styles.inkRoot}
      viewBox="0 0 1 1"
      preserveAspectRatio="none"
      aria-hidden
    >
      {pin.strokes.map((s, i) => (
        <path
          key={i}
          d={strokePath(s.points)}
          fill="none"
          stroke={s.color}
          strokeWidth={s.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}
