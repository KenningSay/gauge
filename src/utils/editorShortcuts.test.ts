import { describe, it, expect } from 'vitest'
import { editorShortcut } from './editorShortcuts'

const key = (over: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, ...over }) as KeyboardEvent

const ctrl = (letter: string, shift = false) =>
  key({ key: letter, code: `Key${letter.toUpperCase()}`, ctrlKey: true, shiftKey: shift })

describe('editorShortcut', () => {
  it('ignores a plain keystroke', () => {
    expect(editorShortcut(key({ key: 'b', code: 'KeyB' }), 'ab', 0, 2)).toBeNull()
  })

  it('ignores a modified key it does not own', () => {
    // Ctrl+Z has to reach the editor's own undo rather than being eaten.
    expect(editorShortcut(ctrl('z'), 'ab', 0, 2)).toBeNull()
  })

  it('bolds the selection', () => {
    expect(editorShortcut(ctrl('b'), 'one two', 4, 7)?.text).toBe('one **two**')
  })

  it('italicises and strikes', () => {
    expect(editorShortcut(ctrl('i'), 'word', 0, 4)?.text).toBe('_word_')
    expect(editorShortcut(ctrl('x', true), 'word', 0, 4)?.text).toBe('~~word~~')
  })

  it('works on a non-latin layout', () => {
    // The real complaint that started keys.ts: with a russian layout Ctrl+B
    // arrives as "и", and matching on `key` alone silently does nothing.
    const cyrillic = key({ key: 'и', code: 'KeyB', ctrlKey: true })
    expect(editorShortcut(cyrillic, 'one two', 4, 7)?.text).toBe('one **two**')
  })

  it('makes a list out of the selected lines', () => {
    expect(editorShortcut(ctrl('8', true), 'a\nb', 0, 3)?.text).toBe('- a\n- b')
  })

  it('makes a checklist', () => {
    expect(editorShortcut(ctrl('c', true), 'task', 0, 4)?.text).toBe('- [ ] task')
  })

  it('puts the caret inside the url of a new link', () => {
    const r = editorShortcut(ctrl('k'), 'Gauge', 0, 5)!
    expect(r.text).toBe('[Gauge]()')
    expect(r.start).toBe(8)
    expect(r.text.slice(0, r.start)).toBe('[Gauge](')
  })

  it('toggles bold off again', () => {
    const on = editorShortcut(ctrl('b'), 'word', 0, 4)!
    const off = editorShortcut(ctrl('b'), on.text, on.start, on.end)!
    expect(off.text).toBe('word')
  })
})
