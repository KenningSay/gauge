import { describe, it, expect } from 'vitest'
import { isKey, hasMod } from './keys'

// A KeyboardEvent as the browser reports it: `key` is what the layout
// produces, `code` is the physical key.
const ev = (key: string, code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ key, code, ctrlKey: false, metaKey: false, ...mods }) as KeyboardEvent

describe('isKey', () => {
  it('matches a latin layout', () => {
    expect(isKey(ev('z', 'KeyZ'), 'z')).toBe(true)
  })

  it('matches a cyrillic layout, where the same key reports "я"', () => {
    // This is the whole point: Ctrl+Z under a Russian layout arrives as
    // "я", and every shortcut compared against "z" silently died.
    expect(isKey(ev('я', 'KeyZ'), 'z')).toBe(true)
    expect(isKey(ev('ф', 'KeyA'), 'a')).toBe(true)
    expect(isKey(ev('ы', 'KeyS'), 's')).toBe(true)
  })

  it('is case-insensitive, so Shift-held shortcuts still match', () => {
    expect(isKey(ev('Z', 'KeyZ'), 'z')).toBe(true)
  })

  it('falls back to key when the browser reports no useful code', () => {
    expect(isKey(ev('z', ''), 'z')).toBe(true)
  })

  it('does not match a different key', () => {
    expect(isKey(ev('y', 'KeyY'), 'z')).toBe(false)
    expect(isKey(ev('я', 'KeyZ'), 'y')).toBe(false)
  })
})

describe('hasMod', () => {
  it('accepts either platform modifier', () => {
    expect(hasMod(ev('z', 'KeyZ', { ctrlKey: true }))).toBe(true)
    expect(hasMod(ev('z', 'KeyZ', { metaKey: true }))).toBe(true)
    expect(hasMod(ev('z', 'KeyZ'))).toBe(false)
  })
})
