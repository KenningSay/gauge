// Board storage layer. Everything boards and the AI chat persist lives
// under /dav/.gauge/ — a single top-level folder so users can find (or
// nuke) the whole thing in one go, and so nothing board-related ever
// pollutes their actual vault tree. Layout:
//
//   /.gauge/boards-index/_index.json      list of all boards
//   /.gauge/boards-index/<id>.json        one board's state
//   /.gauge/boards-index/<id>.history.json  that board's op-log
//   /.gauge/boards-index/<id>.chat.json   that board's AI conversation
//   /.gauge/boards/<id>/assets/<file>     all external files for that board
//   /.gauge/templates/_index.json         list of user templates
//   /.gauge/templates/<id>.json           one template's state
//   /.gauge/templates/<id>/assets/<file>  that template's external files
//
// Why history lives in its own file: op-logs are unbounded by design
// (user chose "no limit"), and a board the user drags 500 pins on in one
// evening would otherwise swell board.json into multi-megabyte read-on-
// every-open territory. Board state stays small and fast; history grows
// independently and can be pruned with a button.
//
// Why op-log (deltas) instead of snapshots: a full snapshot of a 100-pin
// board is 200-500 KB of JSON. Multiply by unlimited steps — gigabytes.
// A single move delta is ~100 bytes; 10k steps of anything realistic
// stays under 2 MB.

import type { FileEntry } from './types'
import {
  getTextContent,
  putTextContent,
  putTextContentConditional,
  mkdir,
  list,
  deleteFile,
  uploadFile,
  copyEntry,
  stat,
  AlreadyExistsError,
  WebDavError,
  PreconditionFailedError,
  type ResourceStat,
} from './webdav'

// ---------- Path constants ----------

export const GAUGE_DIR = '/.gauge'
export const BOARDS_INDEX_DIR = `${GAUGE_DIR}/boards-index`
export const BOARDS_DIR = `${GAUGE_DIR}/boards`
export const TEMPLATES_DIR = `${GAUGE_DIR}/templates`
export const BOARD_INDEX_FILE = `${BOARDS_INDEX_DIR}/_index.json`
export const TEMPLATE_INDEX_FILE = `${TEMPLATES_DIR}/_index.json`

export function boardPath(id: string): string {
  return `${BOARDS_INDEX_DIR}/${id}.json`
}
export function historyPath(id: string): string {
  return `${BOARDS_INDEX_DIR}/${id}.history.json`
}
export function chatPath(id: string): string {
  return `${BOARDS_INDEX_DIR}/${id}.chat.json`
}
export function assetsDirFor(boardId: string): string {
  return `${BOARDS_DIR}/${boardId}/assets`
}
export function assetPathFor(boardId: string, fileName: string): string {
  return `${assetsDirFor(boardId)}/${fileName}`
}
export function templatePath(id: string): string {
  return `${TEMPLATES_DIR}/${id}.json`
}
export function templateAssetsDirFor(id: string): string {
  return `${TEMPLATES_DIR}/${id}/assets`
}

// ---------- Types ----------

export type PinType = 'note' | 'image' | 'video' | 'audio' | 'file' | 'link' | 'shape'
export type NoteTexture = 'plain' | 'grid' | 'ruled' | 'dots' | 'graph'

interface PinBase {
  id: string
  type: PinType
  x: number
  y: number
  w: number
  h: number
  z: number
  createdAt: string
  updatedAt: string
  // Only ever set on pins the AI produced as a summary/analysis of others.
  // Used for hover-highlighting the sources a result came from — no visual
  // lines are drawn between pins (that would turn a busy board into
  // spaghetti), so this data is the only link.
  sourceIds?: string[]
}

// How a note is dressed. `texture` is the paper's surface (ruled, grid…);
// this is the object it's pretending to be — a torn sheet, a spiral pad, a
// sheet held by a clip. Absent on notes written before styles existed, and
// read as 'sticky', which is what they looked like.
export type NoteStyle =
  | 'sticky'
  | 'paper'
  | 'torn'
  | 'lined'
  | 'spiral'
  | 'spiralSide'
  | 'clip'
  | 'clipboard'
  | 'tape'
  | 'tapeCorners'
  | 'card'
  | 'folder'
  | 'ribbon'
  | 'banner'
  | 'numbered'
  | 'doubleFrame'
  | 'dashed'
  | 'bolted'
  | 'bubble'
  | 'tag'
  | 'capsule'
  // The monochrome HUD family, from the cyberpunk element sheets in the
  // user's reference folder: chamfered frames, hazard stripes, terminal
  // readouts, dithered plates.
  | 'hud'
  | 'hudBracket'
  | 'terminal'
  | 'hazard'
  | 'scan'
  | 'dither'
  | 'barcode'
  | 'chip'
  // Second pass over the same sheets, for the parts the first pass skipped:
  // outlined frames with cut corners and a lit tab, callout leader lines,
  // hex plates, waveforms, and the pixel-UI panels with screws and meters.
  | 'vrFrame'
  | 'vrPanel'
  | 'callout'
  | 'roundFrame'
  | 'hexFrame'
  | 'stripeBar'
  | 'labelBar'
  | 'waveform'
  | 'arrowTab'
  | 'pixelWindow'
  | 'screwPlate'
  | 'meter'
  | 'octagon'
  | 'stencil'

// A reaction stuck to a note. The count exists because the same mark gets
// used as a tally — three ticks on a note means three of something, and
// having to add three separate ticks to say so would be absurd.
export interface Reaction {
  emoji: string
  count: number
}

// How a note's text is set. Everything here is optional and absent means
// "whatever the style says" — a note written before any of this existed
// must keep looking exactly as it did.
export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type TextVAlign = 'top' | 'middle' | 'bottom'

export interface NoteTextFormat {
  fontSize?: number
  align?: TextAlign
  valign?: TextVAlign
  // A multiplier, not pixels, so it survives a change of font size.
  lineHeight?: number
  // In hundredths of an em, so the stored value stays a round number.
  letterSpacing?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  uppercase?: boolean
}

// The typeface a note is set in. `default` means "whatever the app uses",
// which is what every note written before this existed gets; the HUD styles
// fall back to `mono` instead, since a heads-up panel in a humanist sans
// looks like a mistake.
export type NoteFont =
  | 'default'
  | 'inter'
  | 'montserrat'
  | 'roboto'
  | 'openSans'
  | 'ptSans'
  | 'firaSans'
  | 'manrope'
  | 'nunito'
  | 'raleway'
  | 'round'
  | 'golos'
  | 'onest'
  | 'ubuntu'
  | 'condensed'
  | 'comfortaa'
  | 'serif'
  | 'ptSerif'
  | 'playfair'
  | 'merriweather'
  | 'bitter'
  | 'cormorant'
  | 'alice'
  | 'literata'
  | 'mono'
  | 'plexMono'
  | 'firaCode'
  | 'sourceCode'
  | 'robotoMono'
  | 'ubuntuMono'
  | 'martianMono'
  | 'tech'
  | 'techno'
  | 'exo2'
  | 'geologica'
  | 'unbounded'
  | 'tektur'
  | 'russoOne'
  | 'rubikMono'
  | 'pixelify'
  | 'yeseva'
  | 'hand'
  | 'pacifico'
  | 'amatic'
  | 'badScript'
  | 'marck'
  | 'orbitron'
  | 'audiowide'
  | 'michroma'
  | 'chakra'
  | 'shareTech'
  | 'vt323'
  | 'silkscreen'
  | 'pressStart'
  | 'majorMono'
  | 'syneMono'
  | 'monoton'
  | 'bungee'
  | 'righteous'

// Small things pinned onto a note: a paperclip over the corner, a pushpin,
// a star, a folded ribbon. Each one remembers which corner it was dropped
// on, so it stays where you put it when the note is moved or resized.
export type DecorKind =
  | 'clip'
  | 'pushpin'
  | 'star'
  | 'heart'
  | 'arrow'
  | 'ribbonCorner'
  | 'chevron'
  | 'bracketCorner'
  | 'barcodeTag'
  | 'dot'
  | 'gear'
  | 'target'
  | 'lightning'
  | 'dpad'
  | 'recycle'
  | 'warnTriangle'
  | 'hazardStrip'
  | 'waveLine'
  | 'segBar'
  | 'screw'
  | 'circuit'
  | 'crosshair'
  | 'diamondStack'
  | 'wifi'
  // The animated ones. They run on CSS keyframes rather than on a timer,
  // so they cost nothing when the note is off-screen and they stop dead
  // for anyone who has asked their system for less motion.
  | 'pulseRing'
  | 'soundWave'
  | 'orbit'
  | 'radar'
  | 'spinnerArc'
  | 'blinkDot'
  | 'scanBox'
  | 'loadDots'
  | 'heartbeat'
  | 'gearSpin'
  | 'progressRing'
  | 'dataFall'

export type DecorCorner = 'tl' | 'tr' | 'bl' | 'br'

export interface Decor {
  id: string
  kind: DecorKind
  // Where it sits, as a fraction of the note's own box (0..1, measured to
  // the decoration's centre). Fractions rather than pixels so a decoration
  // keeps its place when the note is resized. Absent on decorations saved
  // before they could be moved — those fall back to `corner`.
  x?: number
  y?: number
  // Drawn size in board units. Absent means the default.
  size?: number
  // The corner it was originally dropped on. Still the fallback position,
  // and still what decides which way the glyph faces, so a paperclip over
  // the right edge hooks the right way round.
  corner: DecorCorner
  color?: string
}

export interface NotePin extends PinBase {
  type: 'note'
  text: string
  color: string
  style?: NoteStyle
  font?: NoteFont
  // Flat rather than nested: updatePin takes a single key, and a nested
  // object would mean read-modify-write on every toggle.
  fontSize?: number
  align?: TextAlign
  valign?: TextVAlign
  lineHeight?: number
  letterSpacing?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  uppercase?: boolean
  // Absent on notes that have nothing pinned to them.
  decor?: Decor[]
  reactions?: Reaction[]
  // Optional override. Left unset, the note picks black or white from the
  // background's luminance, which is right for almost every colour — the
  // field exists for the cases where it isn't.
  textColor?: string
  // When set, this note is a *view onto a vault file* rather than text
  // owned by the board — the same split Obsidian Canvas draws between a
  // text card and a note card. `text` still holds the last content read,
  // so a board renders instantly and survives the file being unreachable,
  // but the file is the source of truth and edits are written back to it.
  sourcePath?: string
  opacity: number // 0-100, 100 = fully opaque
  texture: NoteTexture
}

// Shared shape for anything backed by a file on WebDAV. assetPath is the
// full path — either inside this board's own assets/ folder (files dragged
// in from outside) or a link to an existing vault file (files dragged in
// from the file manager, see §3 of the handoff). The distinction matters:
// external files are copied in and owned by the board; vault files are
// referenced and break if the original is moved/deleted.
interface AssetPinFields {
  assetPath: string
  fileName: string
  fileSize: number
  mimeType: string
  description?: string
}

export interface ImagePin extends PinBase, AssetPinFields {
  type: 'image'
}
export interface VideoPin extends PinBase, AssetPinFields {
  type: 'video'
}
export interface AudioPin extends PinBase, AssetPinFields {
  type: 'audio'
  title?: string
  artist?: string
  duration?: number // seconds
}
export interface FilePin extends PinBase, AssetPinFields {
  type: 'file'
}

export interface LinkPin extends PinBase {
  type: 'link'
  url: string
  title?: string
  favicon?: string
}

// A drawn shape you can put words or a picture inside — the frames,
// callouts and groupings a board needs that a sticky note can't be. Text
// and image are both optional: an empty shape is a valid frame, and a
// shape with an image is a picture cropped to that outline.
export type ShapeKind = 'rect' | 'ellipse' | 'diamond' | 'triangle'

export interface ShapePin extends PinBase {
  type: 'shape'
  shape: ShapeKind
  fill: string
  stroke: string
  // 0-100. A frame around other pins wants a transparent fill; a callout
  // wants a solid one.
  fillOpacity: number
  text: string
  textColor?: string
  // Optional picture clipped to the shape, referenced the same way asset
  // pins reference theirs.
  assetPath?: string
  fileName?: string
}

export type Pin = NotePin | ImagePin | VideoPin | AudioPin | FilePin | LinkPin | ShapePin

export interface Viewport {
  x: number
  y: number
  zoom: number
}

export interface BoardSettings {
  // "Капля в воду": a pin that lands on top of others pushes them clear,
  // chain-reaction style. Absent on boards created before the setting
  // existed, and read as enabled — it's the behaviour the board was
  // specified with.
  pushEnabled?: boolean
  snapEnabled: boolean
  snapStep: number
  gridVisible: boolean
  backgroundColor: string
  backgroundTexture: NoteTexture
  aiSystemPrompt?: string
  aiModel?: 'deepseek-chat' | 'deepseek-reasoner'
}

// A user-authored AI shortcut (see §5.5 of the handoff). resultType decides
// where the model's reply lands: 'note' spawns a new note pin next to the
// selection, 'apply' rewrites the selected pins in place, 'chat' just
// prints in the panel. Kept per-board (not global) because the actions a
// user wants for a mood board of images differ from a board of notes.
export interface CustomAction {
  id: string
  name: string
  icon?: string
  prompt: string // may contain {selection} placeholder
  resultType: 'note' | 'apply' | 'chat'
}

// Which edge of a pin a connection leaves from or arrives at. Kept as a
// side rather than a point so the curve re-anchors itself when either pin
// moves or resizes — the same approach Obsidian Canvas's JSON format takes.
export type PortSide = 'top' | 'right' | 'bottom' | 'left'

export interface Edge {
  id: string
  from: { pinId: string; side: PortSide }
  to: { pinId: string; side: PortSide }
  label?: string
  color?: string
}

export interface Board {
  id: string
  name: string
  createdAt: string
  updatedAt: string
  viewport: Viewport
  settings: BoardSettings
  pins: Pin[]
  // Absent on boards created before connections existed — always read it
  // as `board.edges ?? []`.
  edges?: Edge[]
  customActions?: CustomAction[]
}

export interface BoardMeta {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface BoardIndex {
  version: 1
  boards: BoardMeta[]
}

export interface TemplateMeta {
  id: string
  name: string
  createdAt: string
}

export interface TemplateIndex {
  version: 1
  templates: TemplateMeta[]
}

export type ChatRole = 'user' | 'assistant' | 'system'

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  // Computed client-side from a price table baked into ai.ts — DeepSeek
  // doesn't return a cost, only token counts, and its pricing changes
  // (V3 vs R1, cache hits) so the table is a single place to edit.
  costUsd: number
}

export interface ChatMessage {
  id: string
  role: ChatRole
  content: string
  createdAt: string
  usage?: ChatUsage
  // Which pins were selected when this message was sent, for the "click a
  // message → highlight the pins it was about" affordance. Snapshot of
  // selection at send time, not a live link.
  contextPinIds?: string[]
  // True if the user hit Stop mid-stream — the partial text is kept, but
  // the UI marks it so nobody mistakes it for a complete answer.
  interrupted?: boolean
  // R1's chain-of-thought, kept separate from content so it can be hidden
  // by default (see §5.6). Absent on V3 replies.
  reasoning?: string
  // Set instead of content when the request failed — 401/402/429/500 etc.
  // Rendered as a distinct system bubble in the chat.
  error?: string
}

export interface ChatLog {
  messages: ChatMessage[]
}

// Op-log entries. Kept as a small discriminated union rather than
// "diff of full board state" — each entry must be independently reversible
// without knowing the state that preceded it, so undo after a reload
// (history is persisted, see §4.12) is just "apply .from in reverse".
export type Op =
  | { type: 'addPin'; pin: Pin }
  | { type: 'removePin'; pin: Pin }
  | { type: 'movePin'; id: string; from: { x: number; y: number }; to: { x: number; y: number } }
  | { type: 'resizePin'; id: string; from: { w: number; h: number }; to: { w: number; h: number } }
  | {
      type: 'updatePin'
      id: string
      field: string
      from: unknown
      to: unknown
    }
  | { type: 'reorderPin'; id: string; from: number; to: number }
  | { type: 'addEdge'; edge: Edge }
  | { type: 'removeEdge'; edge: Edge }
  | { type: 'updateEdge'; id: string; field: string; from: unknown; to: unknown }

export interface BoardHistory {
  ops: Op[]
  // Index into ops of the *next* op to apply. 0 = nothing applied yet;
  // ops.length = everything applied. Persisted so that "I undid five moves,
  // closed the tab, came back an hour later" still has Ctrl+Z land on the
  // right step.
  cursor: number
}

// ---------- Small helpers ----------

export function newId(): string {
  // crypto.randomUUID is available in every browser Gauge targets (it's
  // gated on secure context, and Gauge is served over HTTPS in every real
  // deployment — the README's Docker path puts it behind a TLS terminator).
  return crypto.randomUUID()
}

function emptyHistory(): BoardHistory {
  return { ops: [], cursor: 0 }
}

function emptyChat(): ChatLog {
  return { messages: [] }
}

// ---------- Bootstrap ----------

let bootstrapPromise: Promise<void> | null = null

// Idempotent. Every folder creation goes through webdav.mkdir, which
// already tolerates 405 (exists) — so calling this on every board-page
// mount costs at most a handful of PROPFINDs in the happy case and zero
// beyond the first page load in a session. Memoised per-tab so the second
// mount is free.
export function bootstrap(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await mkdir('/', '.gauge')
      await mkdir(GAUGE_DIR, 'boards-index')
      await mkdir(GAUGE_DIR, 'boards')
      await mkdir(GAUGE_DIR, 'templates')
    })().catch((e) => {
      // Don't memoise a failure — the next call should retry (user may have
      // logged in with different creds in between, or the network blipped).
      bootstrapPromise = null
      throw e
    })
  }
  return bootstrapPromise
}

// ---------- Index ----------

export async function loadBoardIndex(): Promise<BoardIndex> {
  const raw = await getTextContent(BOARD_INDEX_FILE)
  const parsed = JSON.parse(raw) as BoardIndex
  if (parsed.version !== 1) throw new Error(`Неподдерживаемая версия индекса: ${parsed.version}`)
  return parsed
}

export async function saveBoardIndex(index: BoardIndex): Promise<void> {
  await putTextContent(BOARD_INDEX_FILE, JSON.stringify(index, null, 2))
}

// Fallback for recovering from a missing/corrupt _index.json — scans the
// boards-index folder for *.json files that aren't the index itself, the
// history, or the chat log. Called only when loadBoardIndex throws, so
// normal operation never pays for it.
export async function listBoardIdsOnDisk(): Promise<string[]> {
  const entries = await list(BOARDS_INDEX_DIR)
  const ids: string[] = []
  for (const e of entries) {
    if (e.isDir) continue
    const m = e.name.match(/^([^.]+)\.json$/)
    if (!m) continue
    const id = m[1]
    if (id === '_index') continue
    ids.push(id)
  }
  return ids
}

// ---------- Board ----------

export interface LoadedBoard {
  board: Board
  etag: string | null
}

export async function loadBoard(id: string): Promise<LoadedBoard | null> {
  let raw: string
  try {
    raw = await getTextContent(boardPath(id))
  } catch (e) {
    if (e instanceof WebDavError && e.status === 404) return null
    throw e
  }
  const board = JSON.parse(raw) as Board
  // etag of the file we just read — kept alongside the board so the store
  // can pass it back to saveBoard and let the server reject a stale write.
  const s = await stat(boardPath(id))
  return { board, etag: s?.etag ?? null }
}

// Saves the board. If `expectedEtag` is passed, the write is conditional:
// on a 412 (someone else modified it since we loaded) this throws
// PreconditionFailedError instead of silently clobbering. Passing null (or
// omitting) is used for a brand-new board that has never been saved, where
// there's nothing to conflict with.
export async function saveBoard(
  board: Board,
  expectedEtag: string | null = null,
): Promise<ResourceStat> {
  board.updatedAt = new Date().toISOString()
  const body = JSON.stringify(board, null, 2)
  return putTextContentConditional(boardPath(board.id), body, expectedEtag)
}

// Deletes a board. deleteAssets controls whether its whole
// /.gauge/boards/<id>/ folder goes too — the dialog in the UI offers both,
// because a user might want to free the disk space or might want to keep
// the files around after deciding the board itself was a bad idea.
export async function deleteBoard(id: string, opts: { deleteAssets: boolean }): Promise<void> {
  // Best-effort: a board may have been created before history/chat existed,
  // or those files may already be gone. Only 404 is swallowed.
  await tryDelete(boardPath(id))
  await tryDelete(historyPath(id))
  await tryDelete(chatPath(id))
  if (opts.deleteAssets) {
    try {
      await deleteFile(`${BOARDS_DIR}/${id}/`)
    } catch (e) {
      if (!(e instanceof WebDavError && e.status === 404)) throw e
    }
  }
}

async function tryDelete(path: string): Promise<void> {
  try {
    await deleteFile(path)
  } catch (e) {
    if (!(e instanceof WebDavError && e.status === 404)) throw e
  }
}

// ---------- History ----------

export async function loadHistory(id: string): Promise<BoardHistory> {
  try {
    const raw = await getTextContent(historyPath(id))
    return JSON.parse(raw) as BoardHistory
  } catch (e) {
    if (e instanceof WebDavError && e.status === 404) return emptyHistory()
    throw e
  }
}

export async function saveHistory(id: string, history: BoardHistory): Promise<void> {
  await putTextContent(historyPath(id), JSON.stringify(history))
}

// ---------- Chat ----------

export async function loadChat(id: string): Promise<ChatLog> {
  try {
    const raw = await getTextContent(chatPath(id))
    return JSON.parse(raw) as ChatLog
  } catch (e) {
    if (e instanceof WebDavError && e.status === 404) return emptyChat()
    throw e
  }
}

export async function saveChat(id: string, chat: ChatLog): Promise<void> {
  await putTextContent(chatPath(id), JSON.stringify(chat))
}

// ---------- Templates ----------

export async function loadTemplateIndex(): Promise<TemplateIndex> {
  try {
    const raw = await getTextContent(TEMPLATE_INDEX_FILE)
    const parsed = JSON.parse(raw) as TemplateIndex
    if (parsed.version !== 1) throw new Error(`Неподдерживаемая версия индекса шаблонов: ${parsed.version}`)
    return parsed
  } catch (e) {
    if (e instanceof WebDavError && e.status === 404) return { version: 1, templates: [] }
    throw e
  }
}

export async function saveTemplateIndex(index: TemplateIndex): Promise<void> {
  await putTextContent(TEMPLATE_INDEX_FILE, JSON.stringify(index, null, 2))
}

export async function loadTemplate(id: string): Promise<Board | null> {
  try {
    const raw = await getTextContent(templatePath(id))
    return JSON.parse(raw) as Board
  } catch (e) {
    if (e instanceof WebDavError && e.status === 404) return null
    throw e
  }
}

export async function saveTemplate(template: Board): Promise<void> {
  await putTextContent(templatePath(template.id), JSON.stringify(template, null, 2))
}

export async function deleteTemplate(id: string, opts: { deleteAssets: boolean }): Promise<void> {
  await tryDelete(templatePath(id))
  if (opts.deleteAssets) {
    try {
      await deleteFile(`${TEMPLATES_DIR}/${id}/`)
    } catch (e) {
      if (!(e instanceof WebDavError && e.status === 404)) throw e
    }
  }
}

// ---------- Assets ----------

// Splits "photo.jpg" into { stem: "photo", ext: ".jpg" } so collision
// suffixes land before the extension, not after it. Multi-dot names
// ("archive.tar.gz") get treated as { stem: "archive.tar", ext: ".gz" } —
// same as every desktop file manager's "copy" behaviour.
function splitName(name: string): { stem: string; ext: string } {
  const dot = name.lastIndexOf('.')
  const hasExt = dot > 0 && dot < name.length - 1
  return hasExt
    ? { stem: name.slice(0, dot), ext: name.slice(dot) }
    : { stem: name, ext: '' }
}

function suffixedName(stem: string, ext: string, n: number): string {
  return n === 0 ? `${stem}${ext}` : `${stem}-${n}${ext}`
}

// Finds a free name for a new asset by probing stat() for each candidate.
// WebDAV has no atomic "create only if not exists" for uploads (If-None-
// Match: * would work on some servers, but nginx's dav module doesn't
// honour it), so the alternative would be a PUT that silently overwrites.
// stat-probe first costs one extra PROPFIND per collision, which in
// practice is rare.
async function freeAssetName(boardId: string, name: string): Promise<string> {
  const { stem, ext } = splitName(name)
  for (let n = 0; n < 50; n++) {
    const candidate = suffixedName(stem, ext, n)
    const s = await stat(assetPathFor(boardId, candidate))
    if (!s) return candidate
  }
  throw new Error(`Не удалось подобрать свободное имя для «${name}»`)
}

// Uploads a File dropped from the OS into a board's assets folder. Returns
// the full /dav-relative path so the caller can build a Pin. Caller is
// responsible for having called bootstrap() at least once.
export async function saveAsset(boardId: string, file: File): Promise<string> {
  await mkdir(BOARDS_DIR, boardId)
  await mkdir(`${BOARDS_DIR}/${boardId}`, 'assets')
  const name = await freeAssetName(boardId, file.name)
  const path = assetPathFor(boardId, name)
  await uploadFile(assetsDirFor(boardId), new File([file], name, { type: file.type }))
  return path
}

// Registers an existing vault file as a board asset without copying it.
// Used when a file dragged onto the board came from the file manager (not
// from the OS) — §3 of the handoff: "внутри vault — ссылка". Because
// nothing is copied, no name collision is possible here: the pin just
// points at the existing path.
export function referenceVaultAsset(sourcePath: string): string {
  return sourcePath
}

// Copies a vault file into the board's assets folder. Used when a template
// is instantiated (its assets become the new board's own copies, so the
// board survives deletion of the template) — and available for a future
// "detach from vault" pin action.
export async function copyVaultAssetToBoard(
  boardId: string,
  sourcePath: string,
  preferredName: string,
): Promise<string> {
  await mkdir(BOARDS_DIR, boardId)
  await mkdir(`${BOARDS_DIR}/${boardId}`, 'assets')
  const name = await freeAssetName(boardId, preferredName)
  const targetDir = assetsDirFor(boardId)
  const synthetic: FileEntry = {
    name: preferredName,
    path: sourcePath,
    isDir: false,
    size: 0,
    modified: '',
    contentType: '',
  }
  await copyEntry(synthetic, targetDir, name)
  return assetPathFor(boardId, name)
}

export async function deleteAsset(boardId: string, fileName: string): Promise<void> {
  try {
    await deleteFile(assetPathFor(boardId, fileName))
  } catch (e) {
    if (!(e instanceof WebDavError && e.status === 404)) throw e
  }
}

// ---------- Re-exports for callers ----------

export { AlreadyExistsError, WebDavError, PreconditionFailedError }
export type { ResourceStat }