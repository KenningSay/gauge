import { describe, it, expect } from 'vitest'
import {
  clampFontSize,
  clampLetterSpacing,
  clampLineHeight,
  hasTextFormat,
  stepFontSize,
  textFormatStyle,
  toggleWrap,
  togglePrefix,
  frequentFonts,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
} from './textFormat'

describe('clampFontSize', () => {
  it('holds the range and rounds', () => {
    expect(clampFontSize(1)).toBe(MIN_FONT_SIZE)
    expect(clampFontSize(9999)).toBe(MAX_FONT_SIZE)
    expect(clampFontSize(17.6)).toBe(18)
  })

  it('falls back rather than writing NaN into the board file', () => {
    expect(clampFontSize(Number.NaN)).toBe(16)
  })
})

describe('stepFontSize', () => {
  it('walks the preset ladder', () => {
    expect(stepFontSize(16, 1)).toBe(18)
    expect(stepFontSize(16, -1)).toBe(14)
  })

  it('snaps a hand-typed size onto the ladder', () => {
    expect(stepFontSize(17, 1)).toBe(18)
    expect(stepFontSize(17, -1)).toBe(16)
  })

  it('keeps going past the ends of the ladder without sticking', () => {
    expect(stepFontSize(96, 1)).toBe(104)
    expect(stepFontSize(200, 1)).toBe(MAX_FONT_SIZE)
    expect(stepFontSize(8, -1)).toBe(MIN_FONT_SIZE)
  })
})

describe('clampLineHeight / clampLetterSpacing', () => {
  it('clamps', () => {
    expect(clampLineHeight(0.1)).toBe(0.8)
    expect(clampLineHeight(9)).toBe(3)
    expect(clampLetterSpacing(-99)).toBe(-10)
    expect(clampLetterSpacing(99)).toBe(50)
  })

  it('keeps line height to two decimals', () => {
    expect(clampLineHeight(1.5555)).toBe(1.56)
  })
})

describe('textFormatStyle', () => {
  it('emits nothing for an unformatted note', () => {
    // The back-compat contract: a note that predates all of this must
    // inherit its style's own sizing, not get a hardcoded default.
    expect(textFormatStyle({})).toEqual({})
  })

  it('combines underline and strike into one property', () => {
    // Assigning them in turn would silently drop the first.
    expect(textFormatStyle({ underline: true, strike: true }).textDecoration).toBe(
      'underline line-through',
    )
  })

  it('converts letter spacing to em', () => {
    expect(textFormatStyle({ letterSpacing: 25 }).letterSpacing).toBe('0.25em')
  })

  it('ignores false flags instead of writing normal/none', () => {
    expect(textFormatStyle({ bold: false, italic: false })).toEqual({})
  })

  it('passes alignment straight through', () => {
    expect(textFormatStyle({ align: 'center' }).textAlign).toBe('center')
  })
})

describe('hasTextFormat', () => {
  it('is false for an untouched note', () => {
    expect(hasTextFormat({})).toBe(false)
  })

  it('counts a zero letter-spacing as formatting, since it was chosen', () => {
    expect(hasTextFormat({ letterSpacing: 0 })).toBe(true)
  })

  it('ignores flags that are explicitly off', () => {
    expect(hasTextFormat({ bold: false })).toBe(false)
  })
})

describe('toggleWrap', () => {
  it('wraps a selection', () => {
    const r = toggleWrap('one two', 4, 7, '**')
    expect(r.text).toBe('one **two**')
    expect(r.text.slice(r.start, r.end)).toBe('two')
  })

  it('unwraps when the markers are inside the selection', () => {
    const r = toggleWrap('one **two**', 4, 11, '**')
    expect(r.text).toBe('one two')
    expect(r.text.slice(r.start, r.end)).toBe('two')
  })

  it('unwraps when the markers are outside the selection', () => {
    // What a double-click gives you: the word without its markers. Without
    // this case the toggle only ever un-toggles half the time.
    const r = toggleWrap('one **two**', 6, 9, '**')
    expect(r.text).toBe('one two')
    expect(r.text.slice(r.start, r.end)).toBe('two')
  })

  it('inserts an empty pair and puts the caret inside', () => {
    const r = toggleWrap('one ', 4, 4, '**')
    expect(r.text).toBe('one ****')
    expect(r.start).toBe(6)
    expect(r.end).toBe(6)
  })

  it('round-trips', () => {
    const once = toggleWrap('word', 0, 4, '_')
    const twice = toggleWrap(once.text, once.start, once.end, '_')
    expect(twice.text).toBe('word')
  })

  it('does not mistake a single marker for a wrapped pair', () => {
    expect(toggleWrap('*', 0, 1, '*').text).toBe('***')
  })
})

describe('togglePrefix', () => {
  it('prefixes every line of the selection', () => {
    const r = togglePrefix('a\nb\nc', 0, 5, '- ')
    expect(r.text).toBe('- a\n- b\n- c')
  })

  it('removes the prefix when every line already has it', () => {
    const r = togglePrefix('- a\n- b', 0, 7, '- ')
    expect(r.text).toBe('a\nb')
  })

  it('adds it to all when only some lines have it', () => {
    const r = togglePrefix('- a\nb', 0, 5, '- ')
    expect(r.text).toBe('- - a\n- b')
  })

  it('works from a caret in the middle of one line', () => {
    const r = togglePrefix('hello world', 6, 6, '> ')
    expect(r.text).toBe('> hello world')
  })

  it('does not run past the end of the selected block', () => {
    const r = togglePrefix('a\nb\nc', 0, 1, '# ')
    expect(r.text).toBe('# a\nb\nc')
  })
})

describe('frequentFonts', () => {
  const FALLBACK = ['default', 'mono', 'condensed', 'serif', 'hand']

  it('falls back to the defaults on an empty board', () => {
    expect(frequentFonts([], FALLBACK)).toEqual(FALLBACK)
  })

  it('ranks by how often the board uses each one', () => {
    const used = ['inter', 'inter', 'inter', 'mono', 'mono', 'pacifico']
    expect(frequentFonts(used, FALLBACK).slice(0, 3)).toEqual(['inter', 'mono', 'pacifico'])
  })

  it('counts notes with no font as the default', () => {
    expect(frequentFonts([undefined, undefined, 'mono'], FALLBACK)[0]).toBe('default')
  })

  it('pads from the fallback without repeating anything', () => {
    const out = frequentFonts(['inter'], FALLBACK)
    expect(out).toHaveLength(5)
    expect(new Set(out).size).toBe(5)
    expect(out[0]).toBe('inter')
  })

  it('never returns more than it was asked for', () => {
    const many = Array.from({ length: 40 }, (_, i) => `f${i}`)
    expect(frequentFonts(many, FALLBACK)).toHaveLength(5)
  })
})
