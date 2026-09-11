import { describe, it, expect } from 'vitest'
import { formatDate, formatSize, extensionOf } from './format'

describe('formatDate', () => {
  it('spells the month for a date in the current year', () => {
    const d = new Date(new Date().getFullYear(), 8, 1, 13, 40)
    expect(formatDate(d.toISOString())).toMatch(/^01 сент\., 13:40$/)
  })

  it('falls back to an all-numeric form for other years, which fits the same column', () => {
    const d = new Date(new Date().getFullYear() - 2, 8, 1, 13, 40)
    expect(formatDate(d.toISOString())).toMatch(/^01\.09\.\d{2}, 13:40$/)
  })

  it('never renders the wide "2025 г." form the modified column cannot fit', () => {
    const d = new Date(new Date().getFullYear() - 1, 0, 5, 9, 5)
    expect(formatDate(d.toISOString())).not.toContain('г.')
  })

  it('handles missing and unparseable values', () => {
    expect(formatDate('')).toBe('—')
    expect(formatDate('not a date')).toBe('—')
  })
})

describe('formatSize', () => {
  it('shows a dash for directories and scales units', () => {
    expect(formatSize(0, true)).toBe('—')
    expect(formatSize(0, false)).toBe('0 B')
    expect(formatSize(128, false)).toBe('128 B')
    expect(formatSize(1536, false)).toBe('1.5 KB')
  })
})

describe('extensionOf', () => {
  it('uppercases the extension and returns empty for names without one', () => {
    expect(extensionOf('заметка.md')).toBe('MD')
    expect(extensionOf('README')).toBe('')
  })
})
