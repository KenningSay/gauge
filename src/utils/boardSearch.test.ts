import { describe, it, expect } from 'vitest'
import type { Pin } from '../api/board'
import { centreOn, findMatches, searchableText, stepMatch } from './boardSearch'

const note = (id: string, text: string, x = 0, y = 0): Pin =>
  ({ id, type: 'note', text, x, y, w: 200, h: 160, z: 1, color: '#fff', opacity: 100 }) as unknown as Pin

describe('searchableText', () => {
  it('reads whatever field the pin keeps its text in', () => {
    const link = { id: 'l', type: 'link', url: 'https://example.com', title: 'Пример' } as unknown as Pin
    expect(searchableText(link)).toContain('example.com')
    expect(searchableText(link)).toContain('Пример')
  })

  it('ignores fields that are not strings', () => {
    const odd = { id: 'o', type: 'note', text: 42 } as unknown as Pin
    expect(searchableText(odd)).toBe('note')
  })
})

describe('findMatches', () => {
  it('is case-insensitive across alphabets', () => {
    expect(findMatches([note('a', 'Переезд сервера')], 'ПЕРЕЕЗД')).toHaveLength(1)
    expect(findMatches([note('a', 'Nginx Config')], 'nginx')).toHaveLength(1)
  })

  it('treats ё and е as the same letter', () => {
    // Typing "переезд" must find "перёезд" and the other way round; nobody
    // remembers which one they used three months ago.
    expect(findMatches([note('a', 'НаЁмный узел')], 'наемный')).toHaveLength(1)
  })

  it('returns nothing for an empty or blank query', () => {
    expect(findMatches([note('a', 'x')], '')).toEqual([])
    expect(findMatches([note('a', 'x')], '   ')).toEqual([])
  })

  it('orders matches the way the eye reads the board', () => {
    const pins = [note('low', 'нужное', 0, 900), note('right', 'нужное', 500, 0), note('left', 'нужное', 0, 0)]
    expect(findMatches(pins, 'нужное').map((m) => m.id)).toEqual(['left', 'right', 'low'])
  })

  it('reports the centre of the pin, not its corner', () => {
    expect(findMatches([note('a', 'x', 100, 200)], 'x')[0]).toMatchObject({ cx: 200, cy: 280 })
  })

  it('matches on the pin type, so "видео" finds video pins', () => {
    const video = { id: 'v', type: 'video', x: 0, y: 0, w: 10, h: 10 } as unknown as Pin
    expect(findMatches([video], 'video')).toHaveLength(1)
  })
})

describe('stepMatch', () => {
  it('wraps at both ends', () => {
    expect(stepMatch(2, 3, 1)).toBe(0)
    expect(stepMatch(0, 3, -1)).toBe(2)
  })

  it('survives an empty result rather than dividing by zero', () => {
    expect(stepMatch(0, 0, 1)).toBe(0)
  })
})

describe('centreOn', () => {
  it('puts the point in the middle at the current zoom', () => {
    expect(centreOn(1000, 500, 1, { w: 800, h: 600 })).toEqual({ x: 600, y: 200 })
  })

  it('accounts for zoom rather than assuming 1', () => {
    expect(centreOn(1000, 500, 2, { w: 800, h: 600 })).toEqual({ x: 800, y: 350 })
  })

  it('returns whole numbers, so the viewport never lands on a fraction', () => {
    const v = centreOn(333, 777, 3, { w: 801, h: 601 })
    expect(Number.isInteger(v.x)).toBe(true)
    expect(Number.isInteger(v.y)).toBe(true)
  })
})
