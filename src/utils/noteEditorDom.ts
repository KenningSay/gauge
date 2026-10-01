// The logic behind the note editor that shows a note's formatting instead of
// its markup.
//
// A note is a string with inline tags in it (`<span style="…">…</span>`,
// `<u>…</u>`). The editor is a contenteditable element in which each of
// those pairs is a real element and the tags themselves are invisible. This
// module converts both ways and keeps track of where the caret is.
//
// Two coordinate systems are in play, and mixing them up is the classic way
// to get this wrong:
//   - a *string offset* counts every character of the stored text, tags
//     included — it is what applySpanStyle / toggleWrap work in;
//   - a *plain offset* counts only the characters a person can see — what
//     the DOM selection actually points at, and the thing that stays put
//     when tags are added or taken away around it.
//
// Pure functions over strings and DOM nodes, no React, so all of it can be
// tested without mounting anything.

import { parseOpenTag, spanCss } from './inlineSpans'

const TAG_RE = /<span(?:\s+(?:style="[^"]*"|data-font="[A-Za-z0-9-]+"))*\s*>|<\/span>|<u>|<\/u>/g

type Kind = 'span' | 'u'

export interface TextNode {
  kind: 'text'
  value: string
}

export interface ElNode {
  kind: 'el'
  tag: Kind
  open: string
  close: string
  kids: NoteNode[]
}

export type NoteNode = TextNode | ElNode

// Where a real tag sits: at which plain offset, and at which string offset
// with what length. Only tags that found their partner count — a stray one
// is just text.
export interface TagMark {
  plain: number
  str: number
  len: number
}

interface Token {
  tag: string
  index: number
  kind: Kind
  closing: boolean
}

function tokenize(text: string): Token[] {
  const out: Token[] = []
  TAG_RE.lastIndex = 0
  for (let m = TAG_RE.exec(text); m; m = TAG_RE.exec(text)) {
    const tag = m[0]
    if (tag.startsWith('<span') && parseOpenTag(tag) === null) continue
    out.push({
      tag,
      index: m.index,
      kind: tag.includes('span') ? 'span' : 'u',
      closing: tag.startsWith('</'),
    })
  }
  return out
}

// Which tokens are one half of a pair. Everything else stays in the text.
function pairUp(tokens: Token[]): Set<number> {
  const real = new Set<number>()
  const stack: number[] = []
  tokens.forEach((t, i) => {
    if (!t.closing) {
      stack.push(i)
      return
    }
    const top = stack[stack.length - 1]
    if (top !== undefined && tokens[top].kind === t.kind) {
      stack.pop()
      real.add(top)
      real.add(i)
    }
    // A closer with no matching opener is plain text.
  })
  return real
}

export interface ParsedNote {
  nodes: NoteNode[]
  marks: TagMark[]
}

export function parseNote(text: string): ParsedNote {
  const tokens = tokenize(text)
  const real = pairUp(tokens)
  const marks: TagMark[] = []
  const root: NoteNode[] = []
  const stack: { el: ElNode; kids: NoteNode[] }[] = []
  const current = () => (stack.length > 0 ? stack[stack.length - 1].kids : root)

  let plain = 0
  let pos = 0
  const pushText = (value: string) => {
    if (value === '') return
    const kids = current()
    const last = kids[kids.length - 1]
    if (last && last.kind === 'text') last.value += value
    else kids.push({ kind: 'text', value })
    plain += value.length
  }

  tokens.forEach((t, i) => {
    pushText(text.slice(pos, t.index))
    pos = t.index + t.tag.length
    if (!real.has(i)) {
      pushText(t.tag)
      return
    }
    marks.push({ plain, str: t.index, len: t.tag.length })
    if (!t.closing) {
      const el: ElNode = {
        kind: 'el',
        tag: t.kind,
        open: t.tag,
        close: t.kind === 'u' ? '</u>' : '</span>',
        kids: [],
      }
      current().push(el)
      stack.push({ el, kids: el.kids })
    } else {
      stack.pop()
    }
  })
  pushText(text.slice(pos))
  return { nodes: root, marks }
}

export function serializeNodes(nodes: NoteNode[]): string {
  return nodes
    .map((n) => (n.kind === 'text' ? n.value : n.open + serializeNodes(n.kids) + n.close))
    .join('')
}

// Brings a string to the shape the markdown renderer needs: a span never
// straddles a line break (pressing Enter inside a coloured word would
// otherwise leave one open across it, and a blank line then splits the
// paragraph and loses the colour), and an element with nothing in it is
// dropped.
export function normalizeNote(text: string): string {
  const emit = (nodes: NoteNode[]): string =>
    nodes
      .map((n) => {
        if (n.kind === 'text') return n.value
        const inner = emit(n.kids)
        if (inner === '') return ''
        return inner
          .split('\n')
          .map((line) => (line.trim() === '' ? line : n.open + line + n.close))
          .join('\n')
      })
      .join('')
  return emit(parseNote(text).nodes)
}

// ---- string <-> plain offsets -------------------------------------------

// `bias` decides what to do at a boundary where tags sit between two
// characters. A selection's start belongs after them (so a word selected
// right after a closing tag is not dragged into the previous span), its end
// before them.
export function plainToString(marks: TagMark[], plain: number, bias: 'start' | 'end'): number {
  let extra = 0
  for (const m of marks) {
    if (m.plain < plain || (m.plain === plain && bias === 'start')) extra += m.len
  }
  return plain + extra
}

export function stringToPlain(marks: TagMark[], str: number): number {
  let removed = 0
  for (const m of marks) {
    if (m.str + m.len <= str) removed += m.len
    else {
      if (m.str < str) removed += str - m.str
      break
    }
  }
  return str - removed
}

// What formatting the text at a plain offset has, innermost winning.
export interface StyleAt {
  style: Record<string, unknown>
  underline: boolean
}

export function styleAtPlain(nodes: NoteNode[], at: number): StyleAt {
  const style: Record<string, unknown> = {}
  let underline = false
  let pos = 0
  const walk = (list: NoteNode[]): boolean => {
    for (const n of list) {
      if (n.kind === 'text') {
        if (at >= pos && at < pos + n.value.length) return true
        pos += n.value.length
        continue
      }
      const from = pos
      const found = walk(n.kids)
      if (found) {
        // This runs while unwinding from the innermost element outwards, so
        // a property already set came from something closer to the text and
        // wins.
        const own = n.tag === 'u' ? null : parseOpenTag(n.open)
        if (n.tag === 'u') underline = true
        if (own) for (const [k, v] of Object.entries(own)) if (!(k in style)) style[k] = v
        return true
      }
      pos = from + plainLength(n.kids)
    }
    return false
  }
  walk(nodes)
  return { style, underline }
}

function plainLength(nodes: NoteNode[]): number {
  return nodes.reduce((n, k) => n + (k.kind === 'text' ? k.value.length : plainLength(k.kids)), 0)
}

// ---- DOM ------------------------------------------------------------------

function elementFor(doc: Document, n: ElNode): HTMLElement {
  const el = doc.createElement('span')
  el.dataset.open = n.open
  el.dataset.close = n.close
  if (n.tag === 'u') el.style.textDecoration = 'underline'
  else {
    const css = spanCss(parseOpenTag(n.open) ?? {})
    if (css) el.setAttribute('style', css)
  }
  return el
}

function fill(doc: Document, parent: Node, nodes: NoteNode[]) {
  for (const n of nodes) {
    if (n.kind === 'text') parent.appendChild(doc.createTextNode(n.value))
    else {
      const el = elementFor(doc, n)
      fill(doc, el, n.kids)
      parent.appendChild(el)
    }
  }
}

// Replaces the editor's content. A trailing newline (and an empty note)
// gets a `<br>` after it: without one the browser does not draw the empty
// last line, so the caret has nowhere to go.
export function renderInto(root: HTMLElement, text: string) {
  const doc = root.ownerDocument
  root.textContent = ''
  fill(doc, root, parseNote(text).nodes)
  if (text === '' || text.endsWith('\n')) root.appendChild(doc.createElement('br'))
}

function lastLeaf(root: Node): Node | null {
  let n: Node | null = root
  while (n && n.lastChild) n = n.lastChild
  return n === root ? null : n
}

// DOM back to the stored string. The `<br>` the browser keeps at the very
// end as a caret placeholder is not a newline.
export function readFrom(root: HTMLElement): string {
  const placeholder = lastLeaf(root)
  const walk = (node: Node): string => {
    let out = ''
    node.childNodes.forEach((c) => {
      if (c.nodeType === 3) out += (c as Text).data
      else if (c.nodeName === 'BR') out += c === placeholder ? '' : '\n'
      else if (c.nodeType === 1) {
        const el = c as HTMLElement
        const inner = walk(el)
        out += el.dataset.open ? el.dataset.open + inner + (el.dataset.close ?? '') : inner
      }
    })
    return out
  }
  return walk(root)
}

// Characters a person can see before a DOM point.
export function plainOffsetOf(root: HTMLElement, node: Node, offset: number): number {
  const range = root.ownerDocument.createRange()
  range.selectNodeContents(root)
  try {
    range.setEnd(node, offset)
  } catch {
    return 0
  }
  const frag = range.cloneContents()
  let n = 0
  const walk = (parent: Node) =>
    parent.childNodes.forEach((c) => {
      if (c.nodeType === 3) n += (c as Text).data.length
      else if (c.nodeName === 'BR') n += 1
      else walk(c)
    })
  walk(frag)
  return n
}

// The DOM point for a plain offset. At a boundary between two text nodes it
// stays at the end of the earlier one, so a caret at the end of a coloured
// word is still inside it — typing there keeps the colour.
export function domPointAtPlain(root: HTMLElement, plain: number): { node: Node; offset: number } {
  let remaining = plain
  let result: { node: Node; offset: number } | null = null
  const walk = (parent: Node): boolean => {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const c = parent.childNodes[i]
      if (c.nodeType === 3) {
        const len = (c as Text).data.length
        if (remaining <= len) {
          result = { node: c, offset: remaining }
          return true
        }
        remaining -= len
      } else if (c.nodeName === 'BR') {
        if (remaining === 0) {
          result = { node: parent, offset: i }
          return true
        }
        remaining -= 1
      } else if (walk(c)) return true
    }
    return false
  }
  walk(root)
  return result ?? { node: root, offset: root.childNodes.length }
}
