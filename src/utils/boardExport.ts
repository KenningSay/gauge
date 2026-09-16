// Exporting a board as a picture.
//
// The board is DOM, not a canvas, so the export goes through
// html-to-image: it inlines the stylesheets and the webfonts, serialises
// the subtree into an SVG <foreignObject>, and paints that into a canvas.
// Both libraries are loaded on demand — jsPDF alone is bigger than the
// rest of the app, and most sessions never export anything.
//
// The two things that make this work rather than produce a blank or
// half-empty picture are handled by the caller, and both are easy to get
// wrong: every pin has to be mounted (the board virtualises, so whatever
// is off-screen is not in the DOM at all), and the fonts have to have
// finished loading (a webfont that arrives after the snapshot is taken is
// simply not in it).

export interface ExportSize {
  width: number
  height: number
}

// A cap on the exported bitmap. A large board at 2× can otherwise ask for
// a canvas bigger than the browser will allocate, and the failure mode is
// a silently blank image rather than an error.
const MAX_PIXELS = 24_000_000

// The scale to render at: twice the CSS size for a crisp picture, backed
// off when that would exceed what a canvas can hold.
//
// The cap is absolute and there is deliberately no floor under it. A floor
// reads as "never make it uselessly small", but a board big enough to hit
// one is a board where the floor puts the canvas back over the limit --
// and over the limit is not a small picture, it is a blank one. A tiny
// picture of the whole board beats a blank picture of it; `exportTooSmall`
// exists so the caller can warn instead.
export function exportScale(size: ExportSize, preferred = 2): number {
  const area = Math.max(1, size.width * size.height)
  const max = Math.sqrt(MAX_PIXELS / area)
  return Math.max(0.05, Math.min(preferred, max))
}

// True when the board is so large that the export will be visibly coarse.
export function exportTooSmall(size: ExportSize): boolean {
  return exportScale(size) < 0.5
}

// A filename that sorts by date and survives a filesystem: no colons from
// the time, no slashes from the board name.
export function exportFileName(boardName: string, ext: 'png' | 'pdf', now = new Date()): string {
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('')
  // Strip what a filesystem refuses, then the separators that cleaning
  // leaves behind -- a board called "///" came out as "-" rather than
  // falling back to a real name.
  const safe =
    boardName
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .replace(/^[-\s.]+|[-\s.]+$/g, '')
      .trim() || 'board'
  return `${safe} ${stamp}.${ext}`
}

// The webfonts the picture actually needs, inlined as data URLs.
//
// html-to-image embeds fonts by walking every stylesheet on the page and
// inlining every @font-face it finds. That was fine when the app declared
// two families. It now declares fifty-nine, in two subsets and up to three
// weights each — around two hundred and fifty files — and the export hung
// for minutes fetching and base64-ing fonts that nothing on the board is
// set in.
//
// So the embedding is done here instead, for the families in use and
// nothing else, and html-to-image is told to skip its own.
export async function usedFontEmbedCss(families: Set<string>): Promise<string> {
  const wanted = new Set([...families].map((f) => f.replace(/['"]/g, '').trim().toLowerCase()))
  const out: string[] = []

  for (const sheet of Array.from(document.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      // A cross-origin stylesheet refuses to be read. Ours are not, but a
      // browser extension's might be on the page.
      continue
    }
    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSFontFaceRule)) continue
      const family = rule.style.getPropertyValue('font-family').replace(/['"]/g, '').trim()
      if (!wanted.has(family.toLowerCase())) continue
      const src = rule.style.getPropertyValue('src')
      const url = /url\(["']?([^"')]+)["']?\)/.exec(src)?.[1]
      if (!url) continue
      try {
        const absolute = new URL(url, sheet.href ?? document.baseURI).href
        const data = await fetch(absolute).then((r) => r.blob()).then(blobToDataUrl)
        out.push(
          `@font-face{font-family:'${family}';` +
            `font-style:${rule.style.getPropertyValue('font-style') || 'normal'};` +
            `font-weight:${rule.style.getPropertyValue('font-weight') || '400'};` +
            `src:url(${data}) format('woff2');` +
            (rule.style.getPropertyValue('unicode-range')
              ? `unicode-range:${rule.style.getPropertyValue('unicode-range')};`
              : '') +
            '}',
        )
      } catch {
        // One font that will not load is a fallback in the picture, not a
        // failed export.
      }
    }
  }
  return out.join('\n')
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Rejects if the promise has not settled in time. html-to-image resolves
// its own work on image `load` and `decode` events, either of which can
// simply never arrive — a decode that fails silently, a tab that stops
// being painted — and there is no way to cancel it from outside.
export function withTimeout<T>(p: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(what)), ms)),
  ])
}

export async function elementToPng(
  el: HTMLElement,
  size: ExportSize,
  background: string,
  fontEmbedCSS: string,
): Promise<string> {
  const { toPng } = await import('html-to-image')
  return toPng(el, {
    width: size.width,
    height: size.height,
    pixelRatio: exportScale(size),
    backgroundColor: background,
    // Ours, built from the families actually in use — see above.
    skipFonts: true,
    fontEmbedCSS,
    // The world layer is translated and scaled to wherever the user was
    // looking; the export wants it at the origin, unscaled.
    style: { transform: 'none', transformOrigin: '0 0' },
    // Anything the board doesn't paint itself — selection outlines,
    // resize handles, the connection ports — is chrome, not content.
    filter: (node) =>
      !(node instanceof HTMLElement) || node.dataset.exportIgnore === undefined,
  })
}

// The page is sized to the picture rather than the picture to a page:
// a board is not A4, and fitting one to the other either crops it or
// leaves it swimming in margin.
export async function pngToPdf(dataUrl: string, size: ExportSize): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({
    orientation: size.width >= size.height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [size.width, size.height],
    compress: true,
  })
  doc.addImage(dataUrl, 'PNG', 0, 0, size.width, size.height)
  return doc.output('blob')
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  // Revoking immediately races the download in some browsers; a tick is
  // enough and the object is small.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

export function downloadDataUrl(dataUrl: string, name: string): void {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = name
  a.click()
}
