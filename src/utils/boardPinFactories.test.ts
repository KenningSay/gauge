import { describe, it, expect } from 'vitest'
import { pinFromVaultEntry, looksLikeUrl, normalizeUrl } from './boardPinFactories'
import type { FileEntry } from '../api/types'

const entry = (name: string, contentType = ''): FileEntry => ({
  name,
  path: `/x/${name}`,
  isDir: false,
  size: 10,
  modified: '',
  contentType,
})

const args = { x: 0, y: 0, z: 1 }

describe('pin type detection', () => {
  it('reads the extension in preference to a misleading MIME type', () => {
    // Servers report .m4a as video/mp4 (it is an MPEG-4 container), which
    // used to turn a voice memo into a video pin: a black rectangle with
    // no picture and no way to play it.
    expect(pinFromVaultEntry(entry('memo.m4a', 'video/mp4'), args).type).toBe('audio')
  })

  it('classifies by extension across the types', () => {
    expect(pinFromVaultEntry(entry('a.png'), args).type).toBe('image')
    expect(pinFromVaultEntry(entry('a.mp3'), args).type).toBe('audio')
    expect(pinFromVaultEntry(entry('a.mp4'), args).type).toBe('video')
    expect(pinFromVaultEntry(entry('a.pdf'), args).type).toBe('file')
  })

  it('falls back to the MIME type when the name has no useful extension', () => {
    expect(pinFromVaultEntry(entry('recording', 'audio/mpeg'), args).type).toBe('audio')
    expect(pinFromVaultEntry(entry('clip', 'video/webm'), args).type).toBe('video')
  })

  it('keeps the vault path so the pin references the file instead of copying it', () => {
    const pin = pinFromVaultEntry(entry('a.mp3'), args)
    expect('assetPath' in pin && pin.assetPath).toBe('/x/a.mp3')
  })
})

describe('url helpers', () => {
  it('accepts urls and bare domains, rejects plain words', () => {
    expect(looksLikeUrl('https://layerp.ru')).toBe(true)
    expect(looksLikeUrl('layerp.ru')).toBe(true)
    expect(looksLikeUrl('привет')).toBe(false)
  })

  it('adds a scheme to a bare domain', () => {
    expect(normalizeUrl('layerp.ru')).toBe('https://layerp.ru')
    expect(normalizeUrl('http://x.dev')).toBe('http://x.dev')
  })
})
