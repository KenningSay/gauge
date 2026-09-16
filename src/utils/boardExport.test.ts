import { describe, it, expect } from 'vitest'
import { exportFileName, exportScale, exportTooSmall } from './boardExport'

describe('exportScale', () => {
  it('renders a small board at 2× for a crisp picture', () => {
    expect(exportScale({ width: 1200, height: 800 })).toBe(2)
  })

  it('backs off on a board too large to fit in a canvas', () => {
    // The failure this exists to prevent is silent: a canvas larger than
    // the browser will allocate comes back blank rather than throwing.
    const scale = exportScale({ width: 12000, height: 9000 })
    expect(scale).toBeLessThan(2)
    expect(12000 * scale * (9000 * scale)).toBeLessThanOrEqual(24_000_000 * 1.01)
  })

  it('keeps the cap even when that means a coarse picture', () => {
    // There is deliberately no floor: a floor would put the canvas back
    // over the limit, and over the limit comes back blank, not small.
    const size = { width: 200000, height: 200000 }
    expect(exportScale(size)).toBeLessThan(0.5)
    expect(exportTooSmall(size)).toBe(true)
  })

  it('does not call a normal board coarse', () => {
    expect(exportTooSmall({ width: 3000, height: 2000 })).toBe(false)
  })

  it('survives a zero-sized board', () => {
    expect(Number.isFinite(exportScale({ width: 0, height: 0 }))).toBe(true)
  })
})

describe('exportFileName', () => {
  const at = new Date(2026, 8, 16, 9, 5)

  it('sorts by date and carries the board name', () => {
    expect(exportFileName('Переезд сервера', 'png', at)).toBe('Переезд сервера 20260916-0905.png')
  })

  it('strips the characters a filesystem refuses', () => {
    expect(exportFileName('a/b:c*d?"e<f>g|h', 'pdf', at)).toBe('a-b-c-d-e-f-g-h 20260916-0905.pdf')
  })

  it('falls back when the name is empty or only punctuation', () => {
    expect(exportFileName('', 'png', at)).toBe('board 20260916-0905.png')
    expect(exportFileName('///', 'png', at)).toBe('board 20260916-0905.png')
  })

  it('pads the time so names sort correctly', () => {
    expect(exportFileName('b', 'png', new Date(2026, 0, 2, 3, 4))).toBe('b 20260102-0304.png')
  })
})
