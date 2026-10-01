// Formatting for a selected piece of a note: colour, size, typeface,
// alignment, spacing and case on a few words or lines rather than on the
// whole card.
//
// The text stays the single source of truth, and the markup is plain inline
// HTML — `<span style="color:#e11d48;font-size:24px">word</span>` — because
// that is what Obsidian itself understands, so a note linked to a vault
// file looks the same there. The renderer never trusts the string, though:
// it reads a short whitelist of properties out of it and rebuilds the style
// from scratch, so nothing a note contains can inject CSS.
//
// Everything here is string-in, string-out, like toggleWrap, so it can be
// tested without mounting an editor.

import type { NoteFont } from '../api/board'
import { FONT_BY_ID } from '../components/Board/pins/noteStyles'
import type { WrapResult } from './textFormat'

export type SpanAlign = 'left' | 'center' | 'right' | 'justify'

export interface SpanStyle {
  color?: string
  size?: number
  font?: string
  // Block-level: alignment and leading only mean something for whole lines,
  // so these are always applied to every line the selection touches.
  align?: SpanAlign
  lineHeight?: number
  // Hundredths of an em, like the note-wide setting.
  tracking?: number
  upper?: boolean
}

export type SpanPatch = { [K in keyof SpanStyle]?: SpanStyle[K] | null }

const MIN_SIZE = 8
const MAX_SIZE = 200
const ALIGNS: readonly string[] = ['left', 'center', 'right', 'justify']

const OPEN_RE = /<span((?:\s+(?:style="[^"]*"|data-font="[A-Za-z0-9-]+"))*)\s*>/
const OPEN_AT_END = new RegExp(`${OPEN_RE.source}$`)
const WHOLE_SPAN = new RegExp(`^(${OPEN_RE.source})([^\\n]*)</span>$`)
const CLOSE = '</span>'

// Markdown that only works at the start of a line. A wrapper opened before
// it ("<span>- item</span>") turns the list item into a paragraph, so a
// line's wrapper starts after this.
const LINE_PREFIX = /^\s*(?:>\s*)*(?:#{1,6}\s+|(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?/

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

// Reads the supported properties out of an opening tag. Anything else in it
// — another property, a url(), an expression — is simply not read.
export function parseOpenTag(tag: string): SpanStyle | null {
  const m = OPEN_RE.exec(tag)
  if (!m || m.index !== 0 || m[0].length !== tag.length) return null
  const attrs = m[1]
  const out: SpanStyle = {}
  const color = /(?:^|[\s;"])color:\s*(#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?)\b/.exec(attrs)
  if (color) out.color = color[1].toLowerCase()
  const size = /font-size:\s*(\d{1,3})px/.exec(attrs)
  if (size) out.size = clamp(Number(size[1]), MIN_SIZE, MAX_SIZE)
  const align = /text-align:\s*([a-z]+)/.exec(attrs)
  if (align && ALIGNS.includes(align[1])) out.align = align[1] as SpanAlign
  const lh = /line-height:\s*(\d*\.?\d+)/.exec(attrs)
  if (lh) out.lineHeight = Math.round(clamp(Number(lh[1]), 0.8, 3) * 100) / 100
  const ls = /letter-spacing:\s*(-?\d*\.?\d+)em/.exec(attrs)
  if (ls) out.tracking = Math.round(clamp(Number(ls[1]) * 100, -10, 50))
  if (/text-transform:\s*uppercase/.test(attrs)) out.upper = true
  const font = /data-font="([A-Za-z0-9-]+)"/.exec(attrs)
  if (font && FONT_BY_ID.has(font[1] as NoteFont)) out.font = font[1]
  return out
}

function cssParts(s: SpanStyle): string[] {
  const css: string[] = []
  if (s.color) css.push(`color:${s.color}`)
  if (s.size) css.push(`font-size:${s.size}px`)
  if (s.lineHeight) css.push(`line-height:${s.lineHeight}`)
  if (s.tracking) css.push(`letter-spacing:${s.tracking / 100}em`)
  if (s.upper) css.push('text-transform:uppercase')
  if (s.align) css.push(`text-align:${s.align}`)
  return css
}

export function buildOpenTag(s: SpanStyle): string {
  const css = cssParts(s)
  const parts = ['<span']
  if (css.length > 0) parts.push(` style="${css.join(';')}"`)
  if (s.font) parts.push(` data-font="${s.font}"`)
  parts.push('>')
  return parts.join('')
}

export function isBlockStyle(s: SpanStyle): boolean {
  return s.align !== undefined || s.lineHeight !== undefined
}

// What the renderer and the editor put on the element: the same properties,
// as real CSS. Alignment and leading need a block box to mean anything.
export function spanCss(s: SpanStyle): string {
  const css = cssParts(s)
  const def = s.font ? FONT_BY_ID.get(s.font as NoteFont) : undefined
  if (def) css.push(`font-family:${def.css}`)
  if (isBlockStyle(s)) css.push('display:block')
  return css.join(';')
}

function merge(base: SpanStyle, patch: SpanPatch): SpanStyle {
  const next: SpanStyle = { ...base }
  for (const key of ['color', 'size', 'font', 'align', 'lineHeight', 'tracking', 'upper'] as const) {
    if (!(key in patch)) continue
    const v = patch[key]
    if (v === null || v === undefined || v === false) delete next[key]
    else (next as Record<string, unknown>)[key] = v
  }
  return next
}

function isEmpty(s: SpanStyle): boolean {
  return Object.keys(s).length === 0
}

// Apply a style change to the selected text.
//
// If the selection is exactly the inside of a span (or a whole span), that
// span is edited in place instead of being wrapped again — a colour picker
// fires on every drag step, and without this each step would nest another
// span inside the last. After the edit the selection covers the span's
// content, so the next step finds it the same way.
//
// Alignment and leading are block properties: they widen the selection to
// whole lines first, because "centre these three words" has no meaning.
export function applySpanStyle(
  text: string,
  startIn: number,
  endIn: number,
  patch: SpanPatch,
): WrapResult {
  if (startIn >= endIn) return { text, start: startIn, end: endIn }

  let start = startIn
  let end = endIn
  if ('align' in patch || 'lineHeight' in patch) {
    start = text.lastIndexOf('\n', start - 1) + 1
    const nl = text.indexOf('\n', end)
    end = nl === -1 ? text.length : nl
    if (start >= end) return { text, start: startIn, end: endIn }
  }

  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  // Selection sits inside an existing span: …<span …>[selected]</span>…
  const enclosing = OPEN_AT_END.exec(before)
  if (enclosing && after.startsWith(CLOSE) && !selected.includes('\n')) {
    const style = merge(parseOpenTag(enclosing[0]) ?? {}, patch)
    const head = before.slice(0, enclosing.index)
    if (isEmpty(style)) {
      return { text: head + selected + after.slice(CLOSE.length), start: head.length, end: head.length + selected.length }
    }
    const tag = buildOpenTag(style)
    return {
      text: head + tag + selected + after,
      start: head.length + tag.length,
      end: head.length + tag.length + selected.length,
    }
  }

  // One line at a time: a span opened on one line and closed on another
  // would be a block-level construct to the markdown parser, which breaks
  // the paragraph in two and loses the formatting.
  const lines = selected.split('\n')
  const out: string[] = []
  let innerStart = -1
  let innerEnd = -1
  let offset = start
  lines.forEach((line, idx) => {
    const atLineStart = idx > 0 || start === 0 || text[start - 1] === '\n'
    const lead = atLineStart ? LINE_PREFIX.exec(line)![0].length : 0
    const rest = line.slice(lead)
    const body = rest.trim()
    if (body === '') {
      out.push(line)
      offset += line.length + 1
      return
    }
    const gap = lead + (rest.length - rest.trimStart().length)
    const tail = line.slice(gap + body.length)
    const head = line.slice(0, gap)
    const whole = WHOLE_SPAN.exec(body)
    let piece: string
    let tag: string | null = null
    let content = body
    if (whole && !whole[whole.length - 1].includes('<span')) {
      // Two spans on one line also match the pattern; only a span that is
      // the whole line is edited.
      const style = merge(parseOpenTag(whole[1]) ?? {}, patch)
      content = whole[whole.length - 1]
      if (isEmpty(style)) piece = content
      else {
        tag = buildOpenTag(style)
        piece = tag + content + CLOSE
      }
    } else {
      const style = merge({}, patch)
      if (isEmpty(style)) piece = body
      else {
        tag = buildOpenTag(style)
        piece = tag + body + CLOSE
      }
    }
    if (lines.length === 1) {
      innerStart = offset + head.length + (tag ? tag.length : 0)
      innerEnd = innerStart + content.length
    }
    out.push(head + piece + tail)
    offset += line.length + 1
  })
  const joined = out.join('\n')

  // A single line ends up selecting its content, so the next change merges
  // into the span just made; several lines select everything that changed.
  if (lines.length === 1 && innerStart >= 0) {
    // innerStart was measured against the old text; the head of this line
    // is unchanged by the edit, so it is still right for the new one.
    return { text: before + joined + after, start: innerStart, end: innerEnd }
  }
  return { text: before + joined + after, start, end: start + joined.length }
}

// Remove every span and underline tag from the selection — the "clear
// formatting" for a fragment. Plain markdown markers (bold, italic) are
// left alone: they have their own toggles.
export function clearSpans(text: string, start: number, end: number): WrapResult {
  const before = text.slice(0, start)
  const after = text.slice(end)
  const stripped = text
    .slice(start, end)
    .replace(new RegExp(OPEN_RE.source, 'g'), '')
    .replace(/<\/span>|<\/?u>/g, '')
  return { text: before + stripped + after, start, end: start + stripped.length }
}

// Wrap in an opening/closing pair, or take it off again if it is already
// there — toggleWrap for markers that differ at the two ends (`<u>`).
export function toggleTag(
  text: string,
  start: number,
  end: number,
  open: string,
  close: string,
): WrapResult {
  const before = text.slice(0, start)
  const selected = text.slice(start, end)
  const after = text.slice(end)

  if (selected.startsWith(open) && selected.endsWith(close) && selected.length >= open.length + close.length) {
    const inner = selected.slice(open.length, selected.length - close.length)
    return { text: before + inner + after, start, end: start + inner.length }
  }
  if (before.endsWith(open) && after.startsWith(close)) {
    return {
      text: before.slice(0, before.length - open.length) + selected + after.slice(close.length),
      start: start - open.length,
      end: end - open.length,
    }
  }
  return {
    text: before + open + selected + close + after,
    start: start + open.length,
    end: end + open.length,
  }
}

// ---------- the renderer's half ----------------------------------------

interface MdNode {
  type: string
  value?: string
  children?: MdNode[]
  data?: { hName?: string; hProperties?: Record<string, string> }
}

interface Frame {
  kind: 'span' | 'u'
  style?: SpanStyle
  kids: MdNode[]
}

function makeNode(frame: Frame): MdNode {
  if (frame.kind === 'u') {
    return { type: 'emphasis', data: { hName: 'u' }, children: frame.kids }
  }
  return {
    type: 'emphasis',
    data: { hName: 'span', hProperties: { style: spanCss(frame.style ?? {}) } },
    children: frame.kids,
  }
}

// `++text++` is what the underline button used to write, and nothing ever
// rendered it — notes carry the raw pluses. Reading it here keeps those
// notes and any typed by hand working.
function splitLegacyUnderline(node: MdNode): MdNode[] {
  const value = node.value ?? ''
  if (!value.includes('++')) return [node]
  const out: MdNode[] = []
  const re = /\+\+([^+\n]+?)\+\+/g
  let last = 0
  for (let m = re.exec(value); m; m = re.exec(value)) {
    if (m.index > last) out.push({ type: 'text', value: value.slice(last, m.index) })
    out.push({
      type: 'emphasis',
      data: { hName: 'u' },
      children: [{ type: 'text', value: m[1] }],
    })
    last = m.index + m[0].length
  }
  if (out.length === 0) return [node]
  if (last < value.length) out.push({ type: 'text', value: value.slice(last) })
  return out
}

function pair(children: MdNode[]): MdNode[] {
  const out: MdNode[] = []
  const stack: Frame[] = []
  const put = (n: MdNode) => (stack.length > 0 ? stack[stack.length - 1].kids : out).push(n)

  for (const raw of children) {
    if (raw.children && raw.type !== 'html') raw.children = pair(raw.children)
    const nodes = raw.type === 'text' ? splitLegacyUnderline(raw) : [raw]
    for (const node of nodes) {
      if (node.type !== 'html') {
        put(node)
        continue
      }
      const tag = (node.value ?? '').trim()
      const style = tag.startsWith('<span') ? parseOpenTag(tag) : null
      if (style) {
        stack.push({ kind: 'span', style, kids: [] })
      } else if (tag === '<u>') {
        stack.push({ kind: 'u', kids: [] })
      } else if (tag === '</span>' || tag === '</u>') {
        const want = tag === '</u>' ? 'u' : 'span'
        if (stack.length > 0 && stack[stack.length - 1].kind === want) {
          put(makeNode(stack.pop()!))
        }
        // A stray closing tag is dropped rather than shown.
      }
      // Any other raw HTML is dropped too: notes render markdown, not HTML.
    }
  }
  // An opening tag that never closes: keep what was inside it.
  while (stack.length > 0) {
    const frame = stack.pop()!
    for (const k of frame.kids) put(k)
  }
  return out
}

// remark plugin: turns the span / underline markup into elements. Written
// against the mdast shape directly rather than pulling in rehype-raw and a
// sanitiser — that is a parser and a schema to maintain, for the sake of
// recognising three kinds of tag.
export function remarkInlineSpans() {
  return (tree: MdNode) => {
    tree.children = pair(tree.children ?? [])
  }
}
