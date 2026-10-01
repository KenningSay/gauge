import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import {
  applySpanStyle,
  buildOpenTag,
  clearSpans,
  parseOpenTag,
  remarkInlineSpans,
  toggleTag,
} from './inlineSpans'

const render = (md: string) =>
  renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks, remarkInlineSpans]}>{md}</ReactMarkdown>,
  )

describe('applySpanStyle', () => {
  it('wraps a selection', () => {
    const r = applySpanStyle('hello world', 6, 11, { color: '#ff0000' })
    expect(r.text).toBe('hello <span style="color:#ff0000">world</span>')
    expect(r.text.slice(r.start, r.end)).toBe('world')
  })

  it('edits the span in place instead of nesting a second one', () => {
    const first = applySpanStyle('a word b', 2, 6, { color: '#ff0000' })
    const second = applySpanStyle(first.text, first.start, first.end, { color: '#00ff00' })
    expect(second.text).toBe('a <span style="color:#00ff00">word</span> b')
  })

  it('adds a second property to the same span', () => {
    const first = applySpanStyle('word', 0, 4, { color: '#ff0000' })
    const second = applySpanStyle(first.text, first.start, first.end, { size: 24 })
    expect(second.text).toBe('<span style="color:#ff0000;font-size:24px">word</span>')
  })

  it('removes the span when its last property is cleared', () => {
    const first = applySpanStyle('word', 0, 4, { color: '#ff0000' })
    const second = applySpanStyle(first.text, first.start, first.end, { color: null })
    expect(second.text).toBe('word')
  })

  it('does nothing for an empty selection', () => {
    expect(applySpanStyle('word', 2, 2, { size: 20 }).text).toBe('word')
  })

  it('wraps each line separately and skips blank ones', () => {
    const r = applySpanStyle('one\n\ntwo', 0, 8, { size: 20 })
    expect(r.text).toBe(
      '<span style="font-size:20px">one</span>\n\n<span style="font-size:20px">two</span>',
    )
  })

  it('keeps the font as an id, not as css', () => {
    expect(applySpanStyle('x', 0, 1, { font: 'mono' }).text).toBe('<span data-font="mono">x</span>')
  })
})

describe('applySpanStyle: block and extra properties', () => {
  it('aligns whole lines even when only a word is selected', () => {
    const r = applySpanStyle('one two\nthree', 2, 4, { align: 'center' })
    expect(r.text).toBe('<span style="text-align:center">one two</span>\nthree')
  })

  it('aligns several lines, one wrapper each, leaving the others alone', () => {
    const r = applySpanStyle('a\nb\nc', 0, 3, { align: 'right' })
    expect(r.text).toBe(
      '<span style="text-align:right">a</span>\n<span style="text-align:right">b</span>\nc',
    )
  })

  it('changing the alignment edits the same wrapper', () => {
    const first = applySpanStyle('word', 0, 4, { align: 'center' })
    const second = applySpanStyle(first.text, first.start, first.end, { align: 'right' })
    expect(second.text).toBe('<span style="text-align:right">word</span>')
  })

  it('keeps the list marker outside the wrapper so the list survives', () => {
    const r = applySpanStyle('- item\n- two', 0, 6, { align: 'center' })
    expect(r.text).toBe('- <span style="text-align:center">item</span>\n- two')
    const h = applySpanStyle('## Title', 0, 8, { color: '#ff0000' })
    expect(h.text).toBe('## <span style="color:#ff0000">Title</span>')
  })

  it('stores leading, tracking and case', () => {
    const r = applySpanStyle('abc', 0, 3, { lineHeight: 2, tracking: 5, upper: true })
    expect(parseOpenTag(r.text.slice(0, r.text.indexOf('>') + 1))).toEqual({
      lineHeight: 2,
      tracking: 5,
      upper: true,
    })
  })

  it('turning case off removes it again', () => {
    const on = applySpanStyle('abc', 0, 3, { upper: true })
    const off = applySpanStyle(on.text, on.start, on.end, { upper: false })
    expect(off.text).toBe('abc')
  })
})

describe('parseOpenTag', () => {
  it('reads only the supported properties', () => {
    expect(parseOpenTag('<span style="color:#abc;position:fixed;font-size:30px">')).toEqual({
      color: '#abc',
      size: 30,
    })
  })
  it('refuses a tag with unknown attributes', () => {
    expect(parseOpenTag('<span onclick="x()">')).toBeNull()
  })
  it('round-trips', () => {
    const s = { color: '#112233', size: 18, font: 'mono' }
    expect(parseOpenTag(buildOpenTag(s))).toEqual(s)
  })
})

describe('clearSpans / toggleTag', () => {
  it('strips span and underline tags from the selection', () => {
    const t = 'a <span style="color:#ff0000">b</span> <u>c</u>'
    expect(clearSpans(t, 0, t.length).text).toBe('a b c')
  })
  it('toggles an underline on and off', () => {
    const on = toggleTag('word', 0, 4, '<u>', '</u>')
    expect(on.text).toBe('<u>word</u>')
    expect(toggleTag(on.text, on.start, on.end, '<u>', '</u>').text).toBe('word')
  })
})

describe('remarkInlineSpans', () => {
  it('renders a span with colour, size and font as real css', () => {
    const html = render('a <span style="color:#ff0000;font-size:24px" data-font="mono">word</span> b')
    expect(html).toContain('<span style="color:#ff0000;font-size:24px;font-family:')
    expect(html).toContain('word</span>')
  })
  it('renders alignment as a block so it can take effect', () => {
    const html = render('<span style="text-align:center">mid</span>')
    expect(html).toContain('text-align:center')
    expect(html).toContain('display:block')
  })
  it('renders <u> and the old ++ markers as underline', () => {
    expect(render('<u>x</u>')).toContain('<u>x</u>')
    expect(render('++x++')).toContain('<u>x</u>')
  })
  it('keeps markdown working inside a span', () => {
    expect(render('<span style="color:#ff0000">**bold**</span>')).toContain('<strong>bold</strong>')
  })
  it('does not let css through that it did not parse', () => {
    const html = render('<span style="color:#ff0000;background:url(http://evil)">x</span>')
    expect(html).not.toContain('evil')
    expect(html).not.toContain('background')
  })
  it('drops other raw html and unpaired tags', () => {
    const html = render('a <script>alert(1)</script> b </span> c')
    expect(html).not.toContain('script')
    expect(html).not.toContain('</span>')
  })
})
