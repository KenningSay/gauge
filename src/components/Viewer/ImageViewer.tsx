import { useRef, useState } from 'react'
import styles from './ImageViewer.module.css'

export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragging = useRef(false)
  const last = useRef({ x: 0, y: 0 })

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY * 0.0015
    setScale((s) => Math.min(6, Math.max(1, s + delta * s)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return
    dragging.current = true
    last.current = { x: e.clientX, y: e.clientY }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - last.current.x
    const dy = e.clientY - last.current.y
    last.current = { x: e.clientX, y: e.clientY }
    setPos((p) => ({ x: p.x + dx, y: p.y + dy }))
  }
  const stopDrag = () => { dragging.current = false }

  const handleDoubleClick = () => {
    if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }) }
    else setScale(2.2)
  }

  return (
    <div
      className={`${styles.wrap} ${dragging.current ? styles.dragging : ''}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onDoubleClick={handleDoubleClick}
    >
      <img
        className={styles.img}
        src={src}
        alt={alt}
        draggable={false}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
      />
      {scale !== 1 && <div className={styles.zoomHud}>{Math.round(scale * 100)}%</div>}
    </div>
  )
}
