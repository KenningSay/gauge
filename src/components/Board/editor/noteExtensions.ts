// The editor's extensions, and the bridge from what it shows to the string
// a note is stored as.
//
// The stored form is markdown with a few inline tags in it — the form the
// reader, the search, the AI and the Obsidian-linked files already use, and
// the one thing this editor must not change. Tiptap's markdown support
// covers bold, lists, headings and the like; what it cannot write is
// formatting that markdown has no syntax for (colour, size, typeface,
// alignment, underline). Those go through `<span style="…">` / `<u>` here,
// built and read by the same whitelist parser the renderer uses, so a note
// edited in the editor and a note read by the renderer agree on what a tag
// means — and nothing a note contains can smuggle in CSS.

import { Extension, InputRule, type JSONContent, type MarkdownParseHelpers, type MarkdownRendererHelpers, type MarkdownToken, type RenderContext } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from '@tiptap/markdown'
import { Color, FontSize, TextStyle } from '@tiptap/extension-text-style'
import TextAlign from '@tiptap/extension-text-align'
import Underline from '@tiptap/extension-underline'
import Paragraph from '@tiptap/extension-paragraph'
import Heading from '@tiptap/extension-heading'
import { ListItem } from '@tiptap/extension-list'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import type { NoteFont } from '../../../api/board'
import { FONT_BY_ID } from '../pins/noteStyles'
import { buildOpenTag, isBlockStyle, parseOpenTag, type SpanStyle } from '../../../utils/inlineSpans'

const HEX = /^#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?$/

type MdToken = MarkdownToken

// A span around a whole paragraph or heading is how a block's alignment and
// leading are stored. It arrives as one token (see the span tokenizer), so
// "the whole block" is simply "the only token".
function unwrapBlockSpan(tokens: MdToken[]): { style: SpanStyle; inner: MdToken[] } | null {
  if (tokens.length !== 1) return null
  const only = tokens[0] as MdToken & { style?: SpanStyle }
  if (only.type !== 'noteSpan' || !only.style || !isBlockStyle(only.style)) return null
  return { style: only.style, inner: only.tokens ?? [] }
}

function blockStyleOf(attrs: Record<string, unknown> | undefined): SpanStyle {
  const style: SpanStyle = {}
  const align = attrs?.textAlign
  if (typeof align === 'string' && ['left', 'center', 'right', 'justify'].includes(align)) {
    style.align = align as SpanStyle['align']
  }
  const lh = attrs?.lineHeight
  if (typeof lh === 'number') style.lineHeight = lh
  return style
}

function wrapBlock(content: string, attrs: Record<string, unknown> | undefined): string {
  const style = blockStyleOf(attrs)
  if (!isBlockStyle(style) || content === '') return content
  return buildOpenTag(style) + content + '</span>'
}

// Puts a mark on every piece of inline content — what `applyMark` does for
// the library's own parser, but for content that is being handed straight to
// a node instead of being returned from a mark's parse.
function markAll(content: JSONContent[], type: string, attrs: Record<string, unknown>): JSONContent[] {
  return content.map((n) => ({
    ...n,
    marks: [...(n.marks ?? []), { type, attrs }],
    ...(n.content ? { content: markAll(n.content, type, attrs) } : {}),
  }))
}

function parseBlock(
  name: 'paragraph' | 'heading',
  token: MdToken & { depth?: number },
  helpers: MarkdownParseHelpers,
): ReturnType<MarkdownParseHelpers['createNode']> {
  const toks = token.tokens ?? []
  const base = name === 'heading' ? { level: token.depth || 1 } : {}
  const wrapped = unwrapBlockSpan(toks)
  if (!wrapped) return helpers.createNode(name, base, helpers.parseInline(toks))
  // One span can carry both kinds of property (a centred, coloured line, as
  // the old selection formatting wrote it). The block half becomes the
  // paragraph's attributes; the text half stays on the text as a mark.
  const inner = helpers.parseInline(wrapped.inner)
  const content = hasInline(wrapped.style) ? markAll(inner, 'textStyle', markAttrsOf(wrapped.style)) : inner
  return helpers.createNode(
    name,
    { ...base, textAlign: wrapped.style.align ?? null, lineHeight: wrapped.style.lineHeight ?? null },
    content,
  )
}

// What a textStyle mark's attributes mean as a span's whitelisted style.
function markStyleOf(attrs: Record<string, unknown>): SpanStyle {
  const style: SpanStyle = {}
  if (typeof attrs.color === 'string' && HEX.test(attrs.color)) style.color = attrs.color.toLowerCase()
  const px = typeof attrs.fontSize === 'string' ? /^(\d{1,3})px$/.exec(attrs.fontSize) : null
  if (px) style.size = Number(px[1])
  if (typeof attrs.fontId === 'string' && FONT_BY_ID.has(attrs.fontId as NoteFont)) style.font = attrs.fontId
  if (typeof attrs.letterSpacing === 'number' && attrs.letterSpacing !== 0) style.tracking = attrs.letterSpacing
  if (attrs.upper) style.upper = true
  return style
}


// A balanced `<span …>…</span>` at the start of `src`, or null. Written by
// hand because the library hands inline HTML to its HTML parser as one
// lump, and markdown inside it (a bold word in a coloured span) then comes
// out as literal asterisks. Tokenising it here lets the inside be parsed as
// markdown like everything else.
const SPAN_OPEN = /^<span(?:\s+(?:style="[^"]*"|data-font="[A-Za-z0-9-]+"))*\s*>/

function scanSpan(src: string): { raw: string; inner: string; style: SpanStyle } | null {
  const m = SPAN_OPEN.exec(src)
  if (!m) return null
  const style = parseOpenTag(m[0])
  if (!style) return null
  const re = /<span(?:\s[^>]*)?>|<\/span>/g
  re.lastIndex = m[0].length
  let depth = 1
  for (let x = re.exec(src); x; x = re.exec(src)) {
    depth += x[0].startsWith('</') ? -1 : 1
    if (depth === 0) {
      return { raw: src.slice(0, x.index + x[0].length), inner: src.slice(m[0].length, x.index), style }
    }
  }
  return null
}

function scanUnderline(src: string): { raw: string; inner: string } | null {
  if (!src.startsWith('<u>')) return null
  const end = src.indexOf('</u>')
  return end === -1 ? null : { raw: src.slice(0, end + 4), inner: src.slice(3, end) }
}

function markAttrsOf(style: SpanStyle): Record<string, unknown> {
  const attrs: Record<string, unknown> = {}
  if (style.color) attrs.color = style.color
  if (style.size) attrs.fontSize = `${style.size}px`
  if (style.font) attrs.fontId = style.font
  if (style.tracking) attrs.letterSpacing = style.tracking
  if (style.upper) attrs.upper = true
  return attrs
}

const hasInline = (style: SpanStyle) => Object.keys(markAttrsOf(style)).length > 0

const NoteTextStyle = TextStyle.extend({
  markdownTokenName: 'noteSpan',
  markdownTokenizer: {
    name: 'noteSpan',
    level: 'inline',
    start: (src: string) => src.indexOf('<span'),
    tokenize: (src: string, _tokens: unknown, lexer: { inlineTokens: (s: string) => MarkdownToken[] }) => {
      const found = scanSpan(src)
      if (!found) return undefined
      return { type: 'noteSpan', raw: found.raw, style: found.style, tokens: lexer.inlineTokens(found.inner) }
    },
  },
  parseMarkdown(rawToken: MarkdownToken, helpers: MarkdownParseHelpers) {
    const token = rawToken as MarkdownToken & { style: SpanStyle }
    const content = helpers.parseInline(token.tokens ?? [])
    // Block properties belong to a whole paragraph, which the paragraph
    // handles; met mid-line they mean nothing and only the text is kept.
    return hasInline(token.style) ? helpers.applyMark('textStyle', content, markAttrsOf(token.style)) : content
  },
  addAttributes() {
    return {
      ...this.parent?.(),
      fontId: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const id = el.getAttribute('data-font')
          return id && FONT_BY_ID.has(id as NoteFont) ? id : null
        },
        renderHTML: (attrs: Record<string, unknown>) => {
          const def = typeof attrs.fontId === 'string' ? FONT_BY_ID.get(attrs.fontId as NoteFont) : undefined
          return def ? { 'data-font': attrs.fontId as string, style: `font-family:${def.css}` } : {}
        },
      },
      letterSpacing: {
        default: null,
        parseHTML: (el: HTMLElement) => {
          const m = /^(-?\d*\.?\d+)em$/.exec(el.style.letterSpacing)
          return m ? Math.round(Number(m[1]) * 100) : null
        },
        renderHTML: (attrs: Record<string, unknown>) =>
          typeof attrs.letterSpacing === 'number' && attrs.letterSpacing !== 0
            ? { style: `letter-spacing:${attrs.letterSpacing / 100}em` }
            : {},
      },
      upper: {
        default: null,
        parseHTML: (el: HTMLElement) => (el.style.textTransform === 'uppercase' ? true : null),
        renderHTML: (attrs: Record<string, unknown>) => (attrs.upper ? { style: 'text-transform:uppercase' } : {}),
      },
    }
  },
  parseHTML() {
    return [
      {
        tag: 'span',
        consuming: false,
        getAttrs: (el: HTMLElement | string) => {
          if (typeof el === 'string') return false
          // A block span is the paragraph's business, not a text mark.
          if (el.style.textAlign || el.style.lineHeight) return false
          return el.hasAttribute('style') || el.hasAttribute('data-font') ? {} : false
        },
      },
    ]
  },
  renderMarkdown(node: { attrs?: Record<string, unknown>; content?: JSONContent[] }, h: { renderChildren: (c: JSONContent[]) => string }) {
    const inner = h.renderChildren(node.content ?? [])
    const style = markStyleOf(node.attrs ?? {})
    return Object.keys(style).length === 0 ? inner : buildOpenTag(style) + inner + '</span>'
  },
})

const NoteUnderline = Underline.extend({
  markdownTokenName: 'noteU',
  markdownTokenizer: {
    name: 'noteU',
    level: 'inline',
    start: (src: string) => src.indexOf('<u>'),
    tokenize: (src: string, _tokens: unknown, lexer: { inlineTokens: (s: string) => MarkdownToken[] }) => {
      const found = scanUnderline(src)
      if (!found) return undefined
      return { type: 'noteU', raw: found.raw, tokens: lexer.inlineTokens(found.inner) }
    },
  },
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return helpers.applyMark('underline', helpers.parseInline(token.tokens ?? []))
  },
  renderMarkdown(node: { content?: JSONContent[] }, h: { renderChildren: (c: JSONContent[]) => string }) {
    return `<u>${h.renderChildren(node.content ?? [])}</u>`
  },
})

// Leading, per block. Alignment comes from TextAlign; this is the same idea
// for line-height, which TextStyleKit only offers per run of text.
const BlockLineHeight = Extension.create({
  name: 'blockLineHeight',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          lineHeight: {
            default: null,
            parseHTML: (el: HTMLElement) => {
              const n = Number(el.style.lineHeight)
              return Number.isFinite(n) && n > 0 ? n : null
            },
            renderHTML: (attrs: Record<string, unknown>) =>
              typeof attrs.lineHeight === 'number' ? { style: `line-height:${attrs.lineHeight}` } : {},
          },
        },
      },
    ]
  },
})

// In a tight list the text of an item arrives as a bare `text` token, not a
// `paragraph` one, and only paragraphs go through the block-span handling
// above — so an aligned bullet came back unaligned. Telling the two apart is
// all it takes: a text token whose only content is a block span is a
// paragraph that happens to be aligned.
function asParagraphWhenAligned(token: MdToken): MdToken {
  const inner = token.tokens
  if (token.type !== 'text' || !inner) return token
  return unwrapBlockSpan(inner) ? { ...token, type: 'paragraph' } : token
}

const NoteListItem = ListItem.extend({
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    const fixed = { ...token, tokens: token.tokens?.map(asParagraphWhenAligned) }
    return this.parent?.(fixed, helpers) ?? []
  },
})

const NoteParagraph = Paragraph.extend({
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return parseBlock('paragraph', token, helpers)
  },
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, ctx: RenderContext) {
    const out = this.parent?.(node, h, ctx) ?? ''
    return wrapBlock(out, node.attrs)
  },
})

const NoteHeading = Heading.extend({
  parseMarkdown(token: MarkdownToken, helpers: MarkdownParseHelpers) {
    return parseBlock('heading', token, helpers)
  },
  renderMarkdown(node: JSONContent, h: MarkdownRendererHelpers, ctx: RenderContext) {
    const out = this.parent?.(node, h, ctx) ?? ''
    const m = /^(#{1,6} )(.*)$/s.exec(out)
    return m ? m[1] + wrapBlock(m[2], node.attrs) : out
  },
})

// "- [ ] " the way GitHub and Obsidian take it. Typing the "- " turns the line
// into a bullet at once, so what arrives is "[ ] " at the start of a bullet's
// paragraph — which the library's own rule only expects outside a list. Turn
// that bullet list into a task list.
const GithubTaskRule = Extension.create({
  name: 'githubTaskRule',
  addInputRules() {
    return [
      new InputRule({
        find: /^\[([ xX])?\]\s$/,
        handler: ({ state, range, match, chain }) => {
          const { $from } = state.selection
          let inBullet = false
          for (let d = $from.depth; d > 0; d--) if ($from.node(d).type.name === 'bulletList') inBullet = true
          if (!inBullet) return null
          const checked = /x/i.test(match[1] ?? '')
          const c = chain().deleteRange(range).toggleTaskList()
          if (checked) c.updateAttributes('taskItem', { checked: true })
          c.run()
          return undefined
        },
      }),
    ]
  },
})

export function createNoteExtensions() {
  return [
    StarterKit.configure({ underline: false, paragraph: false, heading: false, listItem: false }),
    NoteListItem,
    NoteParagraph,
    NoteHeading,
    NoteUnderline,
    NoteTextStyle,
    Color,
    FontSize,
    TextAlign.configure({ types: ['paragraph', 'heading'] }),
    BlockLineHeight,
    TaskList,
    TaskItem.configure({ nested: true }),
    GithubTaskRule,
    Markdown,
  ]
}
