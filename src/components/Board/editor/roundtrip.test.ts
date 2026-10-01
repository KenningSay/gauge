/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { readFileSync, existsSync } from 'node:fs'
import { createNoteExtensions } from './noteExtensions'
import { addsEscapes, hasUnsupportedSyntax, semanticForm, survivesTrip, visualEditAllowed } from './roundtrip'

const trip = (md: string) => {
  const ed = new Editor({
    element: document.createElement('div'),
    extensions: createNoteExtensions(),
    content: md,
    contentType: 'markdown',
  })
  const out = ed.getMarkdown()
  ed.destroy()
  return out
}

// Constructs the editor handles: the valve must let them through.
const SAFE: Record<string, string> = {
  plain: 'just text',
  twoLines: 'one\ntwo\n\nthree',
  bold: 'a **b** _c_ ~~d~~ `e`',
  headings: '# One\n\n## Two\n\ntext',
  bullets: '- a\n- b\n  - nested',
  ordered: '1. a\n2. b',
  tasks: '- [ ] a\n- [x] b',
  quote: '> quoted\n> more',
  link: '[x](https://example.com)',
  code: '```js\nconst a = 1\n```',
  mermaid: '```mermaid\ngraph TD; A-->B\n```',
  hr: 'a\n\n---\n\nb',
  styled: 'a <span style="color:#ff0000;font-size:24px">b</span> c',
  boldColour: '<span style="color:#ff0000">**b**</span>',
  underline: 'x <u>y</u> z',
  aligned: '<span style="text-align:center">c</span>\n\nnext',
}

// What typing leaves behind. None of it is content, and none of it may send a
// note to the plain-text editor — which shows the raw tags, the very thing the
// visual editor exists to hide.
const BENIGN: Record<string, string> = {
  emptyLastNumber: '1. a\n2. b\n3. ',
  emptyLastBullet: '- a\n- ',
  emptyLastTask: '- [ ] a\n- [ ] ',
  trailingBlankLines: 'text\n\n\n',
  leadingBlankLines: '\n\ntext',
  manyBlankLines: 'a\n\n\n\nb',
  blankWithSpaces: 'a\n\n \n\nb',
  trailingSpaces: 'a   \nnext',
  trailingNewline: 'text\n',
  bareHash: '# ',
  styledHeadingThenEmptyItem: '<span style="text-align:center"><span style="color:#ff8000;font-size:48px">ЧЕК</span></span>\n\n1. Архив\n2. Это жуть\n3. ',
}

// Constructs it does not: the valve has to catch each one, so the note is
// opened as text instead of being rewritten.
const UNSAFE: Record<string, string> = {
  inlineMath: 'energy $E_k = m_a v_b$ here',
  blockMath: '$$\nx_1^2 + y_2^2\n$$',
}

describe('what counts as content', () => {
  it('an image on its own is content, not an empty block', () => {
    expect(semanticForm('![alt](http://x/y.png)')).toContain('image')
  })
  it('a missing item with text in it is still caught', () => {
    expect(survivesTrip('- a\n- b\n- c', '- a\n- c')).toBe(false)
  })
})

describe('safety valve', () => {
  for (const [name, md] of Object.entries(SAFE)) {
    it(`lets ${name} through`, () => expect(survivesTrip(md, trip(md))).toBe(true))
  }
  for (const [name, md] of Object.entries(BENIGN)) {
    it(`lets typing leftovers through: ${name}`, () => expect(survivesTrip(md, trip(md))).toBe(true))
  }
  for (const [name, md] of Object.entries(UNSAFE)) {
    it(`catches ${name}`, () => expect(survivesTrip(md, trip(md))).toBe(false))
  }
  it('treats a different marker for the same thing as the same note', () => {
    expect(survivesTrip('a _b_', 'a *b*')).toBe(true)
  })
})

// An optional corpus of real notes, dumped from the live boards for a
// one-off check and deliberately not part of the repository.
const CORPUS = process.env.NOTE_CORPUS
describe.skipIf(!CORPUS || !existsSync(CORPUS))('real notes', () => {
  it('every note either survives the trip or is caught by the valve', () => {
    const notes: string[] = JSON.parse(readFileSync(CORPUS!, 'utf8'))
    const verdicts = notes.map((n) => ({ ok: survivesTrip(n, trip(n)), n }))
    const lossy = verdicts.filter((v) => !v.ok)
    // Not an assertion on the count: a lossy note is allowed, silently
    // rewriting it is not — and the valve is what stops that.
    expect(verdicts.length).toBe(notes.length)
    console.info(`${verdicts.length} notes, ${lossy.length} would open as text`)
  })
})

// The rules above are about what the reader draws. These are about what is
// stored: a note that draws the same but is rewritten differently is still a
// note the editor has damaged.
describe('what the editor may be trusted with', () => {
  const allowed = (md: string, linked = false) => visualEditAllowed(md, trip(md), linked)

  it('everything the editor handles is allowed, linked or not', () => {
    for (const md of Object.values(SAFE)) expect(allowed(md)).toBe(true)
    for (const md of Object.values(BENIGN)) expect(allowed(md)).toBe(true)
  })

  const UNSUPPORTED_SAMPLES: Record<string, string> = {
    wikilink: 'see [[Note Name]]',
    embed: '![[img.png]]',
    callout: '> [!note] Title\n> body',
    frontMatter: '---\ntitle: x\n---\n\nbody',
    htmlTag: 'press <kbd>Ctrl</kbd>',
    lineBreakTag: 'a<br>b',
    comment: 'a <!-- todo --> b',
    image: '![alt](http://x/y.png)',
    table: '| a | b |\n|---|---|\n| 1 | 2 |',
    formula: 'energy $E_k = m_a$',
    footnote: 'text[^1]\n\n[^1]: note',
  }
  for (const [name, md] of Object.entries(UNSUPPORTED_SAMPLES)) {
    it(`${name} is refused, so the note opens as text and is not rewritten`, () => {
      expect(hasUnsupportedSyntax(md)).toBe(true)
      expect(allowed(md)).toBe(false)
    })
  }

  it('plain text with characters the editor would escape is fine on a board', () => {
    for (const md of ['pass fort_icecream88yum', 'C:\\Users\\alex\\file_name.txt', 'array[0] and AT&T', 'ref[1]']) {
      expect(addsEscapes(md, trip(md))).toBe(true)
      expect(allowed(md, false)).toBe(true)
    }
  })

  it('but the same text in a linked file opens as text, so the file is not rewritten', () => {
    for (const md of ['pass fort_icecream88yum', 'array[0] and AT&T']) expect(allowed(md, true)).toBe(false)
  })

  it('a linked file with nothing to escape is still edited visually', () => {
    expect(allowed('# Title\n\n- a\n- b\n\n**bold** text', true)).toBe(true)
  })

  it('text the editor has already escaped is stable: reopening it is fine', () => {
    const once = trip('x file_name y')
    expect(allowed(once)).toBe(true)
  })

  it('spaces inside a coloured span are not formatting', () => {
    const md = '<span style="color:#ff0000"> a </span>b'
    expect(survivesTrip(md, trip(md))).toBe(true)
  })
})
