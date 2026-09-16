import { describe, it, expect } from 'vitest'
import { parseLayout } from './useAiStore'
import type { NotePin, Pin } from '../api/board'

function note(id: string, x = 0, y = 0): NotePin {
  return {
    id,
    type: 'note',
    x,
    y,
    w: 200,
    h: 160,
    z: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    text: '',
    color: '#fbbf24',
    opacity: 90,
    texture: 'plain',
  }
}

const pins: Pin[] = [note('a', 0, 0), note('b', 300, 0)]

// A model's JSON arrives wrapped in prose, fenced, or subtly wrong often
// enough that a bare JSON.parse would make board rearrangement fail at
// random. These are the shapes actually seen in the wild.
describe('parseLayout', () => {
  it('reads a clean array', () => {
    const moves = parseLayout('[{"id":"a","x":10,"y":20}]', pins)
    expect(moves).toEqual([{ id: 'a', x: 10, y: 20 }])
  })

  it('digs the array out of surrounding prose and a code fence', () => {
    const raw = 'Вот раскладка:\n```json\n[{"id":"b","x":5,"y":6}]\n```\nГотово.'
    expect(parseLayout(raw, pins)).toEqual([{ id: 'b', x: 5, y: 6 }])
  })

  it('drops entries for ids that do not exist', () => {
    const moves = parseLayout('[{"id":"ghost","x":1,"y":2},{"id":"a","x":3,"y":4}]', pins)
    expect(moves).toEqual([{ id: 'a', x: 3, y: 4 }])
  })

  it('drops entries with non-numeric or infinite coordinates', () => {
    const raw = '[{"id":"a","x":"10","y":20},{"id":"b","x":1e400,"y":0}]'
    expect(parseLayout(raw, pins)).toEqual([])
  })

  it('skips pins that are already where the model put them', () => {
    // Otherwise "tidy up" on an already-tidy board writes a move op for
    // every pin and pollutes the undo history with a no-op step.
    expect(parseLayout('[{"id":"a","x":0,"y":0}]', pins)).toEqual([])
  })

  it('clamps coordinates to a reachable range', () => {
    const moves = parseLayout('[{"id":"a","x":9e9,"y":-9e9}]', pins)
    expect(moves).toEqual([{ id: 'a', x: 50000, y: -50000 }])
  })

  it('returns nothing for malformed or non-array payloads', () => {
    expect(parseLayout('no json here', pins)).toEqual([])
    expect(parseLayout('[{"id":"a",', pins)).toEqual([])
    expect(parseLayout('{"id":"a","x":1,"y":2}', pins)).toEqual([])
  })
})
