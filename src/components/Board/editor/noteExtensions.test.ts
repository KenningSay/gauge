import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { createNoteExtensions } from './noteExtensions'

const open = (md: string) =>
  new Editor({
    element: document.createElement('div'),
    extensions: createNoteExtensions(),
    content: md,
    contentType: 'markdown',
  })
const roundtrip = (md: string) => {
  const ed = open(md)
  const out = ed.getMarkdown()
  ed.destroy()
  return out
}

describe('note editor: markdown round-trip', () => {
  const same: Record<string, string> = {
    bold: 'a **bold** and ~~del~~ and `code`',
    lists: '- one\n- two\n\n1. a\n2. b\n\n- [ ] todo\n- [x] done',
    heading: '# H1\n\n## H2\n\ntext',
    link: 'see [site](https://example.com) now',
    mermaid: '```mermaid\ngraph TD; A-->B\n```',
    breaks: 'line one\nline two\n\nnew para',
    colourAndSize: 'hello <span style="color:#ff0000;font-size:24px">world</span> foo',
    fontOnly: 'x <span data-font="mono">mono</span> y',
    everything: 'a <span style="color:#00aa00;font-size:32px;letter-spacing:0.05em;text-transform:uppercase" data-font="mono">w</span> b',
    underline: 'x <u>under</u> y',
    nested: '<span style="color:#ff0000">red <u>and under</u></span>',
    boldInColour: '<span style="color:#ff0000">**bold**</span> plain',
    alignCentre: '<span style="text-align:center">centered line</span>\n\nnext',
    alignAndLeading: '<span style="line-height:2;text-align:right">r</span>',
    headingAligned: '# <span style="text-align:center">Title</span>',
    bulletItemAligned: '- <span style="text-align:center">item</span>\n- two',
    orderedItemAligned: '1. <span style="text-align:center">item</span>\n2. two',
  }
  for (const [name, md] of Object.entries(same)) {
    it(`keeps ${name} byte for byte`, () => expect(roundtrip(md)).toBe(md))
  }

  it('a task item loses its alignment but never its text (the bar does not offer alignment there)', () => {
    expect(roundtrip('- [ ] <span style="text-align:center">item</span>')).toBe('- [ ] item')
  })

  it('italic comes back with the other marker, which means the same', () => {
    expect(roundtrip('a _it_ b')).toBe('a *it* b')
  })

  it('reads formatting into marks and attributes', () => {
    const ed = open('<span style="color:#ff0000">r</span>\n\n<span style="text-align:center">c</span>')
    const json = JSON.stringify(ed.getJSON())
    expect(json).toContain('"color":"#ff0000"')
    expect(json).toContain('"textAlign":"center"')
    ed.destroy()
  })

  it('does not let foreign css survive the trip', () => {
    const out = roundtrip('<span style="color:#ff0000;background:url(http://evil)">x</span>')
    expect(out).not.toContain('evil')
    expect(out).not.toContain('background')
  })
})
