// Turns user actions (drop, paste, "add note here") into Pin objects.
// Kept out of boardDefaults (which is about board structure) and out of
// boardApi (which is about storage) — this is the one place that decides
// "what kind of pin does this file become, and what does it look like on
// the board."

import type { FileEntry } from '../api/types'
import type { AudioPin, FilePin, ImagePin, LinkPin, NotePin, Pin, ShapeKind, ShapePin, VideoPin } from '../api/board'
import { newId } from '../api/board'
import { saveAsset } from '../api/board'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'])
const VIDEO_EXT = new Set(['mp4', 'webm', 'ogv', 'mov', 'mkv'])
const AUDIO_EXT = new Set(['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus'])

function ext(name: string): string {
  const parts = name.toLowerCase().split('.')
  return parts.length > 1 ? parts.pop()! : ''
}

const DEFAULT_W = 240
const DEFAULT_H = 180
const NOTE_W = 220
const NOTE_H = 200

interface BaseArgs {
  x: number
  y: number
  z: number
}

function base(z: number) {
  const now = new Date().toISOString()
  return { id: newId(), createdAt: now, updatedAt: now, z }
}

export function makeShapePin(args: BaseArgs, shape: ShapeKind = 'rect'): ShapePin {
  return {
    ...base(args.z),
    type: 'shape',
    x: args.x,
    y: args.y,
    // Wider than a note: shapes are usually frames or callouts around
    // something, not something to read.
    w: 260,
    h: 180,
    shape,
    fill: '#2dd4bf',
    stroke: '#2dd4bf',
    fillOpacity: 14,
    text: '',
  }
}

export function makeNotePin(args: BaseArgs, text = '', color = '#fbbf24'): NotePin {
  return {
    ...base(args.z),
    type: 'note',
    x: args.x,
    y: args.y,
    w: NOTE_W,
    h: NOTE_H,
    text,
    color,
    opacity: 90,
    texture: 'plain',
  }
}

export function makeLinkPin(args: BaseArgs, url: string, title?: string): LinkPin {
  return {
    ...base(args.z),
    type: 'link',
    x: args.x,
    y: args.y,
    w: 400,
    h: 320,
    url,
    title,
  }
}

// Wraps an already-on-WebDAV path into the correct pin type. Used for both
// internal (vault file, no copy) and external (already uploaded to
// /.gauge/boards/<id>/assets/, path is a copy) cases — the assetPath is
// what differs, not the pin shape.
function pinFromPath(
  args: BaseArgs,
  path: string,
  name: string,
  size: number,
  mime: string,
): Pin {
  const e = ext(name)
  const common = {
    ...base(args.z),
    x: args.x,
    y: args.y,
    w: DEFAULT_W,
    h: DEFAULT_H,
    assetPath: path,
    fileName: name,
    fileSize: size,
    mimeType: mime,
  }
  if (IMAGE_EXT.has(e) || mime.startsWith('image/')) {
    const p: ImagePin = { ...common, type: 'image' }
    return p
  }
  if (VIDEO_EXT.has(e) || mime.startsWith('video/')) {
    const p: VideoPin = { ...common, type: 'video' }
    return p
  }
  if (AUDIO_EXT.has(e) || mime.startsWith('audio/')) {
    const p: AudioPin = { ...common, type: 'audio' }
    return p
  }
  const p: FilePin = { ...common, type: 'file' }
  return p
}

// A file dropped from the OS. Uploads it into the board's own assets
// folder, then creates a pin pointing at the uploaded copy.
export async function pinFromDroppedFile(
  boardId: string,
  file: File,
  args: BaseArgs,
): Promise<Pin> {
  const path = await saveAsset(boardId, file)
  return pinFromPath(args, path, file.name, file.size, file.type || '')
}

// A file dragged in from the file manager (or pasted from the internal
// clipboard). No upload — the pin references the vault path directly.
export function pinFromVaultEntry(entry: FileEntry, args: BaseArgs): Pin {
  return pinFromPath(args, entry.path, entry.name, entry.size, entry.contentType || '')
}

// Heuristic for "this looks like a URL" when the user pastes into the
// board. Accepts "http(s)://..." and bare domains with a dot; refuses to
// treat a bare word as a link because "hello" is more likely a mis-paste
// than a URL the user wanted pinned.
export function looksLikeUrl(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/^https?:\/\/\S+$/i.test(t)) return true
  return /^[\w-]+(\.[\w-]+)+([/?#]\S*)?$/.test(t)
}

export function normalizeUrl(text: string): string {
  const t = text.trim()
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

// Best-effort favicon URL — Google's favicon service is reliable, cached
// globally, and avoids us having to proxy anything. Not used for any
// privacy-sensitive request: the domain is already being embedded in an
// iframe by the user's own choice.
export function faviconFor(url: string): string {
  try {
    const u = new URL(url)
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(u.hostname)}&sz=64`
  } catch {
    return ''
  }
}