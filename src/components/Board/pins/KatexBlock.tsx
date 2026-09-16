// A `$formula$` inside a note, typeset by KaTeX.
//
// KaTeX and its stylesheet are about a third of a megabyte — more than the
// whole board was before this — and most notes have no maths in them at
// all. So it is not in the main bundle: remark-math marks the formulas,
// and this component loads the typesetter the first time a board actually
// shows one. The module promise is shared, so twenty formulas load it once.
//
// Until it arrives the raw TeX is shown, which is readable on its own and
// is also exactly what appears if the load fails.

import { useEffect, useState } from 'react'

type KatexApi = {
  renderToString: (tex: string, options: Record<string, unknown>) => string
}

let katexPromise: Promise<KatexApi> | null = null

function loadKatex(): Promise<KatexApi> {
  katexPromise ??= Promise.all([
    import('katex'),
    // The stylesheet is part of the cost and part of the payload: without
    // it the output is a pile of unpositioned spans.
    import('katex/dist/katex.min.css'),
  ]).then(([m]) => m.default as unknown as KatexApi)
  return katexPromise
}

export function KatexBlock({ tex, display }: { tex: string; display: boolean }) {
  const [html, setHtml] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const katex = await loadKatex()
        const out = katex.renderToString(tex, {
          displayMode: display,
          // A formula being typed is a broken formula most of the time;
          // throwing would blank the note on every keystroke.
          throwOnError: false,
          strict: false,
          output: 'html',
        })
        if (!cancelled) setHtml(out)
      } catch {
        // Leave the raw TeX showing.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [tex, display])

  if (html === null) {
    return display ? <pre>{tex}</pre> : <code>{tex}</code>
  }
  // KaTeX's own output, from text it was given with throwOnError off.
  const Tag = display ? 'div' : 'span'
  return <Tag className="katex-host" dangerouslySetInnerHTML={{ __html: html }} />
}
