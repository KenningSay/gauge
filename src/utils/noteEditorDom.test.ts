import { describe, expect, it } from 'vitest'
import {
  domPointAtPlain,
  normalizeNote,
  parseNote,
  plainOffsetOf,
  plainToString,
  readFrom,
  renderInto,
  serializeNodes,
  styleAtPlain,
  stringToPlain,
} from './noteEditorDom'

const S = '<span style="color:#ff0000">'
const mk = () => document.createElement('div')

describe('parseNote / serializeNodes', () => {
  it('round-trips nested tags, newlines and cyrillic', () => {
    const t = `привет ${S}мир <u>вот</u></span>\nвторая`
    expect(serializeNodes(parseNote(t).nodes)).toBe(t)
  })
  it('keeps a stray or unclosed tag as plain text', () => {
    const t = `a ${S}b </span> c </span> <u>d`
    const { nodes, marks } = parseNote(t)
    expect(serializeNodes(nodes)).toBe(t)
    expect(marks).toHaveLength(2)
  })
})

describe('normalizeNote', () => {
  it('splits a span at a line break so each line carries its own pair', () => {
    expect(normalizeNote(`${S}ab\ncd</span>`)).toBe(`${S}ab</span>\n${S}cd</span>`)
  })
  it('drops an empty span', () => {
    expect(normalizeNote(`a${S}</span>b`)).toBe('ab')
  })
  it('leaves an already normal note alone', () => {
    const t = `a ${S}b</span> <u>c</u>\n\nd`
    expect(normalizeNote(t)).toBe(t)
  })
})

describe('string <-> plain offsets', () => {
  const t = `ab ${S}cd</span> ef`
  const { marks } = parseNote(t)
  it('plain offsets ignore tags', () => {
    // "ab cd ef" -> the c is the 4th visible char (index 3)
    expect(stringToPlain(marks, t.indexOf('cd'))).toBe(3)
    expect(stringToPlain(marks, t.indexOf(' ef'))).toBe(5)
  })
  it('start goes after tags at a boundary, end goes before them', () => {
    expect(plainToString(marks, 3, 'start')).toBe(t.indexOf('cd'))
    expect(plainToString(marks, 3, 'end')).toBe(t.indexOf(S))
    expect(plainToString(marks, 5, 'end')).toBe(t.indexOf('</span>'))
    expect(plainToString(marks, 5, 'start')).toBe(t.indexOf(' ef'))
  })
})

describe('styleAtPlain', () => {
  const { nodes } = parseNote(`a ${S}b <u>c</u></span> d`)
  it('reads the formatting of the character at a position', () => {
    expect(styleAtPlain(nodes, 0)).toEqual({ style: {}, underline: false })
    expect(styleAtPlain(nodes, 2).style).toEqual({ color: '#ff0000' })
    expect(styleAtPlain(nodes, 4)).toEqual({ style: { color: '#ff0000' }, underline: true })
    expect(styleAtPlain(nodes, 7).style).toEqual({})
  })
})

describe('DOM round-trip', () => {
  it('renders without showing any tag and reads back the same string', () => {
    const t = `hello ${S}world <u>x</u></span>\nsecond`
    const root = mk()
    renderInto(root, t)
    expect(root.textContent).toBe('hello world x\nsecond')
    expect(root.textContent).not.toContain('<')
    expect(readFrom(root)).toBe(t)
  })
  it('puts a placeholder after a trailing newline and an empty note, and ignores it on the way back', () => {
    for (const t of ['', 'a\n', `${S}a</span>\n`]) {
      const root = mk()
      renderInto(root, t)
      expect(root.lastChild?.nodeName).toBe('BR')
      expect(readFrom(root)).toBe(t)
    }
  })
  it('maps a plain offset to a DOM point and back', () => {
    const root = mk()
    renderInto(root, `ab ${S}cd</span> ef`)
    for (const p of [0, 2, 3, 4, 5, 6, 8]) {
      const pt = domPointAtPlain(root, p)
      expect(plainOffsetOf(root, pt.node, pt.offset)).toBe(p)
    }
  })
  it('stays inside the coloured span at its trailing edge', () => {
    const root = mk()
    renderInto(root, `ab ${S}cd</span> ef`)
    const pt = domPointAtPlain(root, 5)
    expect((pt.node.parentElement as HTMLElement).dataset.open).toBe(S)
  })
  it('counts a newline as one visible character', () => {
    const root = mk()
    renderInto(root, 'ab\ncd')
    const pt = domPointAtPlain(root, 4)
    expect(plainOffsetOf(root, pt.node, pt.offset)).toBe(4)
  })
})
