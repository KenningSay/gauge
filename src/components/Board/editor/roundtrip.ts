// The editor's safety valve: may this note be opened in the visual editor?
//
// Opening a note parses its markdown into the editor's document, and
// closing it writes the document back out. For the constructs the editor
// understands that comes back as the same note; for anything it does not
// (a formula, a table, a block of raw HTML) it can come back different, and
// a note must never be rewritten behind the person's back. So before the
// visual editor is used, the note is taken through the trip once and the two
// strings are compared — not as text, which would flag `_x_` against `*x*`,
// but as what the reader would draw: the same parser the note renderer uses,
// positions stripped.

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkBreaks from 'remark-breaks'
import { remarkInlineSpans } from '../../../utils/inlineSpans'

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkMath)
  .use(remarkBreaks)
  .use(remarkInlineSpans)

interface MdNode {
  type: string
  value?: string
  url?: string
  depth?: number
  ordered?: boolean
  checked?: boolean | null
  lang?: string | null
  children?: MdNode[]
  data?: { hName?: string; hProperties?: { style?: string } }
}

interface Ctx {
  style: Record<string, string>
  marks: string[]
}

type Item = string | { t: string; k: string }

function cssMap(css: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (css ?? '').split(';')) {
    const i = part.indexOf(':')
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim()
  }
  return out
}

const key = (c: Ctx) =>
  JSON.stringify([Object.entries(c.style).sort(), [...c.marks].sort()])

// What the reader would draw, flattened to a sequence: block boundaries,
// and runs of text each with the formatting in force on it. Formatting is
// recorded per run of text, not per tag — one span carrying a colour and an
// alignment and two spans nested to carry them draw the same thing, and
// whether a list had blank lines between its items is a margin, not content.
function flatten(node: MdNode, ctx: Ctx, out: Item[]) {
  const hName = node.data?.hName
  if (hName === 'span' || hName === 'u') {
    const next: Ctx = {
      style: hName === 'span' ? { ...ctx.style, ...cssMap(node.data?.hProperties?.style) } : ctx.style,
      marks: hName === 'u' ? [...ctx.marks, 'u'] : ctx.marks,
    }
    for (const c of node.children ?? []) flatten(c, next, out)
    return
  }
  switch (node.type) {
    case 'text':
      out.push({ t: node.value ?? '', k: key(ctx) })
      return
    case 'break':
      out.push({ t: '\n', k: key(ctx) })
      return
    case 'inlineCode':
      out.push({ t: node.value ?? '', k: key({ ...ctx, marks: [...ctx.marks, 'code'] }) })
      return
    case 'emphasis':
    case 'strong':
    case 'delete': {
      const next = { ...ctx, marks: [...ctx.marks, node.type] }
      for (const c of node.children ?? []) flatten(c, next, out)
      return
    }
    case 'link': {
      const next = { ...ctx, marks: [...ctx.marks, `link:${node.url ?? ''}`] }
      for (const c of node.children ?? []) flatten(c, next, out)
      return
    }
    case 'paragraph':
    case 'heading':
    case 'listItem': {
      // A block with nothing in it is not content: an empty last bullet
      // left by pressing Enter at the end of a list, a blank paragraph, a
      // bare "# ". The editor does not write these back, and a note must not
      // be taken out of the visual editor over something nobody can read.
      const inner: Item[] = []
      for (const c of node.children ?? []) flatten(c, ctx, inner)
      if (!inner.some((i) => typeof i !== 'string' && i.t.trim() !== '') && !inner.some((i) => typeof i === 'string' && i.startsWith('<image'))) return
      const attrs = [node.depth, node.ordered, node.checked].map((v) => (v === undefined ? '' : String(v))).join('|')
      out.push(`<${node.type} ${attrs}>`, ...inner, `</${node.type}>`)
      return
    }
    default: {
      const attrs = [node.depth, node.ordered, node.checked, node.lang, node.type === 'image' ? node.url : undefined]
        .map((v) => (v === undefined ? '' : String(v)))
        .join('|')
      out.push(`<${node.type} ${attrs}>`)
      if (node.value !== undefined && node.type !== 'html') out.push({ t: node.value, k: key(ctx) })
      for (const c of node.children ?? []) flatten(c, ctx, out)
      out.push(`</${node.type}>`)
    }
  }
}

// Consecutive runs with the same formatting are one run: where the parser
// happened to split the text is not something a reader can see.
function merged(items: Item[]): Item[] {
  const out: Item[] = []
  for (const it of items) {
    const last = out[out.length - 1]
    if (typeof it !== 'string' && last && typeof last !== 'string' && last.k === it.k) last.t += it.t
    else out.push(typeof it === 'string' ? it : { ...it })
  }
  return out
}

export function semanticForm(markdown: string): string {
  const tree = processor.runSync(processor.parse(markdown)) as unknown as MdNode
  const items: Item[] = []
  flatten(tree, { style: {}, marks: [] }, items)
  return JSON.stringify(merged(items))
}

// True when writing `serialized` back in place of `original` changes nothing
// the reader would show.
export function survivesTrip(original: string, serialized: string): boolean {
  if (original === serialized) return true
  try {
    return semanticForm(original) === semanticForm(serialized)
  } catch {
    return false
  }
}
