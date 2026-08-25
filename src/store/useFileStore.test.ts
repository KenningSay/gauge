import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as webdav from '../api/webdav'
import { withCopySuffix, copyWithAutoRename } from './useFileStore'
import type { FileEntry } from '../api/types'

vi.mock('../api/webdav', async () => {
  const actual = await vi.importActual<typeof webdav>('../api/webdav')
  return { ...actual, copyEntry: vi.fn() }
})

const entry: FileEntry = { name: 'photo.jpg', path: '/Vault/photo.jpg', isDir: false, size: 0, modified: '', contentType: '' }

describe('withCopySuffix', () => {
  it('uses "(копия)" with no number for the first copy', () => {
    expect(withCopySuffix('photo.jpg', 1)).toBe('photo (копия).jpg')
  })
  it('numbers subsequent copies', () => {
    expect(withCopySuffix('photo.jpg', 2)).toBe('photo (копия 2).jpg')
  })
  it('preserves the extension', () => {
    expect(withCopySuffix('archive.tar.gz', 1)).toBe('archive.tar (копия).gz')
  })
  it('handles a name with no extension', () => {
    expect(withCopySuffix('README', 1)).toBe('README (копия)')
  })
})

describe('copyWithAutoRename', () => {
  beforeEach(() => {
    vi.mocked(webdav.copyEntry).mockReset()
  })

  it('tries the plain name first when there is no collision', async () => {
    vi.mocked(webdav.copyEntry).mockResolvedValueOnce(undefined)
    await copyWithAutoRename(entry, '/Other')
    expect(webdav.copyEntry).toHaveBeenCalledTimes(1)
    expect(webdav.copyEntry).toHaveBeenCalledWith(entry, '/Other', 'photo.jpg')
  })

  it('falls through to "(копия)" then "(копия 2)" on repeated collisions', async () => {
    vi.mocked(webdav.copyEntry)
      .mockRejectedValueOnce(new webdav.AlreadyExistsError('exists'))
      .mockRejectedValueOnce(new webdav.AlreadyExistsError('exists'))
      .mockResolvedValueOnce(undefined)
    await copyWithAutoRename(entry, '/Vault')
    expect(webdav.copyEntry).toHaveBeenNthCalledWith(1, entry, '/Vault', 'photo.jpg')
    expect(webdav.copyEntry).toHaveBeenNthCalledWith(2, entry, '/Vault', 'photo (копия).jpg')
    expect(webdav.copyEntry).toHaveBeenNthCalledWith(3, entry, '/Vault', 'photo (копия 2).jpg')
  })

  it('propagates a non-collision error immediately without retrying', async () => {
    vi.mocked(webdav.copyEntry).mockRejectedValueOnce(new webdav.WebDavError('boom', 500))
    await expect(copyWithAutoRename(entry, '/Vault')).rejects.toBeInstanceOf(webdav.WebDavError)
    expect(webdav.copyEntry).toHaveBeenCalledTimes(1)
  })
})
