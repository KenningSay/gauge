import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

// IntersectionObserver-backed "has this element ever scrolled near the
// viewport" flag. Once true it stays true — the point is to defer expensive
// per-item work (e.g. fetching an entire image just to show a thumbnail)
// until it's actually about to be seen, not to unload it again once it has.
export function useInView<T extends Element>(rootMargin = '200px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    if (inView) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0]?.isIntersecting) setInView(true) },
      { rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [inView, rootMargin])

  return [ref, inView]
}
