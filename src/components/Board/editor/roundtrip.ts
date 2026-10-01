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
// happened to split the text is not something a reader can see. Spaces are
// compared without their formatting — a colour on a space is invisible, and
// the editor moves spaces from inside a coloured span to outside it.
function merged(items: Item[]): Item[] {
  const out: Item[] = []
  const push = (t: string, k: string) => {
    const last = out[out.length - 1]
    if (last && typeof last !== 'string' && last.k === k) last.t += t
    else out.push({ t, k })
  }
  for (const it of items) {
    if (typeof it === 'string') {
      out.push(it)
      continue
    }
    for (const ch of it.t) push(ch, /\s/.test(ch) ? '' : it.k)
  }
  // Spaces at the very start or end of a block are not drawn: markdown trims
  // them, and the editor happily writes one just outside a span that used to
  // contain it.
  const isOpen = (i: Item | undefined) => typeof i === 'string' && !i.startsWith('</')
  const isClose = (i: Item | undefined) => typeof i === 'string' && i.startsWith('</')
  return out.filter((it, idx) => {
    if (typeof it === 'string' || it.t.trim() !== '') return true
    const before = out[idx - 1]
    const after = out[idx + 1]
    return !(before === undefined || isOpen(before) || after === undefined || isClose(after))
  })
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

// ---- what may be opened in the visual editor --------------------------------
//
// The trip test above asks "would the reader draw the same thing?". That is
// not the whole question. The note is also stored, searched, read by the AI
// and — for a note linked to a vault file — written back over a file that
// Obsidian owns. A wikilink the editor turns into `\[\[x\]\]` draws exactly
// the same and has still been broken. So there are two further rules.

// Syntax the editor has no way to hold. A note with any of it opens as text,
// where nothing is rewritten.
const UNSUPPORTED: RegExp[] = [
  /\[\[/, // wikilinks and embeds
  /^>\s*\[!/m, // callouts
  /^---[ \t]*\r?\n/, // front matter at the very start
  /<!--/, // comments
  /<(?!\/?(?:span|u)\b)[a-zA-Z][^>]*>/, // any tag but our own (<kbd>, <sup>, <br>…)
  /\[\^/, // footnotes
  /!\[/, // images
  /^\s*\|.*\|\s*$/m, // tables
  /\$\$|(?<![\\$])\$[^\s$][^$\n]*\$/, // formulas
]

export function hasUnsupportedSyntax(text: string): boolean {
  return UNSUPPORTED.some((re) => re.test(text))
}

const escapes = (s: string) => (s.match(/\\|&amp;|&lt;|&gt;/g) ?? []).length

// Characters that mean nothing to markdown but that the editor escapes to be
// safe (`file_name`, `[1]`, `C:\\path`, `AT&T`). The reader draws them the
// same, which is why the trip test lets them through; the stored text is
// still different, and plain-text search and the AI would see backslashes.
export function addsEscapes(original: string, serialized: string): boolean {
  return escapes(serialized) > escapes(original)
}

// May this note be opened in the visual editor, given what the editor would
// write back for it?
//
// Refusing sends the note to the plain-text editor, which shows the raw text
// and rewrites nothing. That is the safe outcome, but it is also the one that
// shows `<span style=…>` to a person whose note has formatting in it, so it
// is kept for what can really be damaged:
//   - syntax the editor cannot hold (above);
//   - anything the reader would draw differently;
//   - for a note linked to a vault file, which is written back as-is and
//     belongs to Obsidian, any change at all to the characters — even the
//     backslashes that are invisible in the reader.
// On a board note those backslashes cost nothing: the reader draws the same,
// and the board's search ignores them.
export function visualEditAllowed(original: string, serialized: string, linked: boolean): boolean {
  if (hasUnsupportedSyntax(original)) return false
  if (!survivesTrip(original, serialized)) return false
  if (linked && addsEscapes(original, serialized)) return false
  return true
}
