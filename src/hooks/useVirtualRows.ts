import { useEffect, useRef, useState } from 'react'

interface VirtualRange {
  start: number
  end: number // exclusive
  topSpacer: number
  bottomSpacer: number
  rowHeight: number
}

// Windows a long, uniform-height list inside a scrollable container: only
// the rows actually in (or near) the viewport get rendered, with a spacer
// above and below standing in for the rest so the scrollbar's size/position
// stays correct. A folder with a few thousand files was rendering every
// <tr> at once — fine for a small vault, real jank for a big one.
//
// rowHeight is measured off contentRef's actual rendered height rather than
// hardcoded, since it starts out rendering every row un-windowed (rowHeight
// is 0 until measured) — that first full render is also what makes the
// measurement itself correct: contentRef.scrollHeight / count. Once
// windowing kicks in, the spacers are sized to keep that total constant, so
// the measurement stays self-consistent across re-renders.
export function useVirtualRows(
  scrollerRef: React.RefObject<HTMLElement | null>,
  contentRef: React.RefObject<HTMLElement | null>,
  count: number,
  overscan = 8,
): VirtualRange {
  const [rowHeight, setRowHeight] = useState(0)
  const [range, setRange] = useState({ start: 0, end: count })
  const countRef = useRef(count)
  countRef.current = count

  useEffect(() => {
    // A new folder (different count) starts back at "render everything"
    // until the height is re-measured for it — row height can differ
    // between folders in theory (e.g. a future denser layout), and it's a
    // trivially cheap re-measure either way.
    setRowHeight(0)
    setRange({ start: 0, end: count })
  }, [count])

  useEffect(() => {
    const scroller = scrollerRef.current
    const content = contentRef.current
    if (!scroller || !content || count === 0) return

    const update = () => {
      const n = countRef.current
      let h = rowHeight
      if (!h) {
        const measured = content.scrollHeight / n
        if (!measured) return
        h = measured
        setRowHeight(h)
      }
      const viewport = scroller.clientHeight
      const scrollTop = scroller.scrollTop
      const start = Math.max(0, Math.floor(scrollTop / h) - overscan)
      const visibleCount = Math.ceil(viewport / h) + overscan * 2
      const end = Math.min(n, start + visibleCount)
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }

    update()
    scroller.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(scroller)
    return () => {
      scroller.removeEventListener('scroll', update)
      ro.disconnect()
    }
  }, [scrollerRef, contentRef, count, overscan, rowHeight])

  return {
    start: range.start,
    end: range.end,
    topSpacer: range.start * rowHeight,
    bottomSpacer: Math.max(0, count - range.end) * rowHeight,
    rowHeight,
  }
}
