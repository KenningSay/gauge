/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import { readFileSync, existsSync } from 'node:fs'
import { createNoteExtensions } from './noteExtensions'
import { survivesTrip } from './roundtrip'

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

// Constructs it does not: the valve has to catch each one, so the note is
// opened as text instead of being rewritten.
const UNSAFE: Record<string, string> = {
  inlineMath: 'energy $E_k = m_a v_b$ here',
  blockMath: '$$\nx_1^2 + y_2^2\n$$',
}

describe('safety valve', () => {
  for (const [name, md] of Object.entries(SAFE)) {
    it(`lets ${name} through`, () => expect(survivesTrip(md, trip(md))).toBe(true))
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
