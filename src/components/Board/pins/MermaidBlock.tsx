// A ```mermaid fence inside a note, rendered as a diagram.
//
// Mermaid is by far the heaviest thing in the app — several hundred
// kilobytes — so it is never in the main bundle. It is imported the first
// time a board actually contains a diagram, and the module promise is
// shared, so ten diagrams on one board still load it once.

import { useEffect, useRef, useState } from 'react'
import styles from './Pins.module.css'

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, text: string) => Promise<{ svg: string }>
}

let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= import('mermaid').then((m) => {
    const api = m.default as unknown as MermaidApi
    api.initialize({
      startOnLoad: false,
      // The board is dark and amber; mermaid's default is a light blue
      // that looks like it wandered in from another application.
      theme: 'base',
      themeVariables: {
        background: 'transparent',
        primaryColor: '#2b2926',
        primaryTextColor: '#e8eae6',
        primaryBorderColor: '#fbbf24',
        lineColor: '#a8a6a0',
        secondaryColor: '#1b1a18',
        tertiaryColor: '#232120',
        fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
      },
      // A diagram comes from the note's own text, which is the user's, but
      // it is still text being turned into markup — strict keeps mermaid
      // from honouring raw HTML inside it.
      securityLevel: 'strict',
    })
    return api
  })
  return mermaidPromise
}

let seq = 0

export function MermaidBlock({ chart }: { chart: string }) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const idRef = useRef(`gauge-mermaid-${++seq}`)

  useEffect(() => {
    let cancelled = false
    setError(null)
    void (async () => {
      try {
        const mermaid = await loadMermaid()
        const out = await mermaid.render(idRef.current, chart)
        if (!cancelled) setSvg(out.svg)
      } catch (e) {
        // A half-typed diagram is the normal state while you are writing
        // one; it must show what's wrong, not blank the note.
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
      // Mermaid leaves its measuring element behind when a render is
      // abandoned mid-flight, and they accumulate on every keystroke.
      document.getElementById(`d${idRef.current}`)?.remove()
    }
  }, [chart])

  if (error) return <pre className={styles.mermaidError}>{error}</pre>
  if (!svg) return <div className={styles.mermaidPending}>диаграмма…</div>
  // The svg is mermaid's own output from text we handed it under
  // securityLevel: strict.
  return <div className={styles.mermaid} dangerouslySetInnerHTML={{ __html: svg }} />
}
