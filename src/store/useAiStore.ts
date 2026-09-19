import { create } from 'zustand'
import {
  streamChat,
  complete,
  fetchBalance,
  isProxyEndpoint,
  AiError,
  type AiModel,
  type AiConfig,
  type BalanceInfo,
} from '../api/ai'
import { newId, type ChatMessage, type Pin } from '../api/board'
import { useBoardStore } from './useBoardStore'
import { useUiStore } from './useUiStore'
import { makeNotePin } from '../utils/boardPinFactories'
import { resolvePush } from '../utils/boardGeo'

// The proxy is the default on purpose: it keeps the DeepSeek key on the
// server (nginx injects it, see nginx.conf.template's /ai/ location) so a
// stock deployment never has a key in the browser at all. The direct
// endpoint exists for people running Gauge without that proxy, and it
// costs them a CSP edit — documented, not hidden.
const DEFAULT_ENDPOINT = '/ai/'

const KEY_STORAGE = 'gauge-ai-key'
const ENDPOINT_STORAGE = 'gauge-ai-endpoint'
const MODEL_STORAGE = 'gauge-ai-model'

export const DEFAULT_SYSTEM_PROMPT = [
  'Ты — ассистент внутри доски-мудборда файлового менеджера Gauge.',
  'Пользователь работает с пинами: заметками, картинками, видео, файлами и ссылками.',
  'Отвечай кратко и по делу, на русском языке.',
  'Если тебе передан контекст доски — опирайся на него, не выдумывай содержимое пинов.',
  '',
  'Ты умеешь менять доску. Для этого добавь в КОНЕЦ ответа блок (кроме него ничего в блоке быть не должно):',
  '',
  'Создать заметки:',
  '```gauge:notes',
  '[{"text":"текст заметки в markdown","color":"#fbbf24"}]',
  '```',
  '',
  'Переставить существующие пины (id бери из контекста доски):',
  '```gauge:layout',
  '[{"id":"...","x":0,"y":0}]',
  '```',
  '',
  'Правила: блок добавляй только когда пользователь явно просит что-то сделать на доске.',
  'Перед блоком одной строкой скажи, что делаешь. Не пересказывай содержимое блока текстом.',
].join('\n')

// sessionStorage, not localStorage: same rule as the WebDAV credential —
// a key typed into this browser dies with the tab. See the security notes
// in README.
function readStored(key: string): string | null {
  try {
    return sessionStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, value)
  } catch {
    // Private mode — config just won't survive a reload.
  }
}

function readModel(): AiModel {
  return readStored(MODEL_STORAGE) === 'deepseek-reasoner' ? 'deepseek-reasoner' : 'deepseek-chat'
}

export interface SessionUsage {
  promptTokens: number
  completionTokens: number
  costUsd: number
}

interface AiState {
  endpoint: string
  apiKey: string | null
  model: AiModel
  // Derived from endpoint, kept in state so components can select it
  // without re-deriving on every render.
  isProxy: boolean

  // Id of the assistant message currently being streamed into, or null.
  streamingId: string | null
  abortController: AbortController | null

  sessionUsage: SessionUsage
  balance: BalanceInfo | null
  balanceLoading: boolean

  setEndpoint: (endpoint: string) => void
  setApiKey: (key: string) => void
  setModel: (model: AiModel) => void

  sendMessage: (text: string, contextPinIds: string[]) => Promise<void>
  stopStreaming: () => void
  refreshBalance: () => Promise<void>
  applyContentAction: (
    actionId: string,
    prompt: string,
    pins: Pin[],
    resultType: 'note' | 'apply' | 'chat',
  ) => Promise<void>
  // Asks the model for a layout and applies it. Returns how many pins moved.
  arrangeBoard: (instruction?: string) => Promise<number>
}

// One pin rendered as plain text for the model. Deliberately lossy: the
// model gets what a human would read off the card, not the JSON — geometry,
// z-order and ids are noise that would eat tokens for nothing. Asset pins
// can't send their bytes, so they send what's known about the file.
// What a pin looks like to the model: what a human would read off the card,
// plus its id and geometry. Geometry was left out at first as noise — wrong
// call. "Tidy the board up", "what sits next to what", "group these" are all
// questions about the layout, and without coordinates the model can only
// answer in generalities. Asset pins can't send their bytes, so they send
// what is known about the file.
function pinBody(pin: Pin): string {
  switch (pin.type) {
    case 'note':
      return `[Заметка]${pin.sourcePath ? ` (файл ${pin.sourcePath})` : ''}
${pin.text}`
    case 'link':
      return `[Ссылка] ${pin.title ? `${pin.title} — ` : ''}${pin.url}`
    case 'image':
    case 'video':
    case 'file':
      return `[${pin.type === 'image' ? 'Картинка' : pin.type === 'video' ? 'Видео' : 'Файл'}] ${pin.fileName}${pin.description ? `
Описание: ${pin.description}` : ''}`
    case 'audio':
      return `[Аудио] ${pin.title ?? pin.fileName}${pin.artist ? ` — ${pin.artist}` : ''}${pin.description ? `
Описание: ${pin.description}` : ''}`
    case 'shape':
      return `[Фигура: ${pin.shape}]${pin.fileName ? ` с картинкой ${pin.fileName}` : ''}${pin.text ? `
${pin.text}` : ''}`
    case 'frame':
      // Contents are listed as their own pins; the frame contributes
      // only the grouping it implies.
      return `[Контейнер] ${pin.title || 'без названия'}`
  }
}

function pinToText(pin: Pin): string {
  const geom = `id=${pin.id} x=${Math.round(pin.x)} y=${Math.round(pin.y)} w=${Math.round(pin.w)} h=${Math.round(pin.h)}`
  return `${pinBody(pin)}
(${geom})`
}

function pinsToContext(pins: Pin[]): string {
  if (pins.length === 0) return ''
  return pins.map(pinToText).join('\n\n')
}

// One line of identification per pin for the layout prompt.
function shortLabel(pin: Pin): string {
  switch (pin.type) {
    case 'note':
      return (pin.text.split('\n').find((l) => l.trim()) ?? 'пустая заметка').replace(/^#+\s*/, '').slice(0, 80)
    case 'link':
      return pin.title ?? pin.url
    case 'shape':
      return pin.text.split('\n')[0]?.slice(0, 80) || `фигура (${pin.shape})`
    case 'frame':
      return `контейнер «${pin.title || 'без названия'}»`
    default:
      return pin.fileName
  }
}

// Models wrap JSON in prose or a ```json fence often enough that trusting a
// bare JSON.parse would make this feature fail at random. Take the outermost
// array and validate every entry against pins that actually exist — a
// hallucinated id must not silently move the wrong card.
export function parseLayout(raw: string, pins: Pin[]): Array<{ id: string; x: number; y: number }> {
  const start = raw.indexOf('[')
  const end = raw.lastIndexOf(']')
  if (start === -1 || end <= start) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.slice(start, end + 1))
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  const byId = new Map(pins.map((p) => [p.id, p]))
  const moves: Array<{ id: string; x: number; y: number }> = []
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue
    const { id, x, y } = item as { id?: unknown; x?: unknown; y?: unknown }
    if (typeof id !== 'string' || !byId.has(id)) continue
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue
    const pin = byId.get(id)!
    if (Math.round(x) === Math.round(pin.x) && Math.round(y) === Math.round(pin.y)) continue
    // Clamp to a sane world range: a stray exponent shouldn't fling a pin
    // somewhere the user can't scroll back to.
    moves.push({ id, x: clamp(Math.round(x), -50000, 50000), y: clamp(Math.round(y), -50000, 50000) })
  }
  return moves
}

// Runs the fenced action blocks a reply may end with. Returns the text
// with those blocks removed, so the chat shows the sentence and not the
// JSON behind it.
function applyActionBlocks(text: string): { cleaned: string; applied: boolean } {
  const boardStore = useBoardStore.getState()
  const ui = useUiStore.getState()
  const board = boardStore.board
  if (!board) return { cleaned: text, applied: false }

  let applied = false
  const cleaned = text.replace(/```gauge:(notes|layout)\s*([\s\S]*?)```/g, (_match, kind: string, body: string) => {
    if (kind === 'notes') {
      const created = createNotesFromJson(body)
      if (created > 0) {
        applied = true
        ui.pushToast(`AI добавил заметок: ${created}`)
      }
    } else {
      const moves = parseLayout(body, useBoardStore.getState().board?.pins ?? [])
      if (moves.length > 0) {
        useBoardStore.getState().movePins(moves)
        applied = true
        ui.pushToast(`AI переставил ${moves.length} пин(ов) — Ctrl+Z вернёт как было`)
      }
    }
    return ''
  })

  return { cleaned: cleaned.trimEnd(), applied }
}

function createNotesFromJson(body: string): number {
  const start = body.indexOf('[')
  const end = body.lastIndexOf(']')
  if (start === -1 || end <= start) return 0
  let parsed: unknown
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    return 0
  }
  if (!Array.isArray(parsed)) return 0

  const store = useBoardStore.getState()
  const board = store.board
  if (!board) return 0

  // Lay new notes out in a row starting near the top-left of what the user
  // is currently looking at, then let the usual push resolve any overlap.
  const vp = board.viewport
  let z = board.pins.reduce((m, p) => Math.max(m, p.z), 0)
  let created = 0
  parsed.forEach((item, i) => {
    if (!item || typeof item !== 'object') return
    const { text, color } = item as { text?: unknown; color?: unknown }
    if (typeof text !== 'string' || !text.trim()) return
    const pin = makeNotePin(
      {
        x: Math.round(vp.x + 80 + (i % 4) * 240),
        y: Math.round(vp.y + 80 + Math.floor(i / 4) * 210),
        z: ++z,
      },
      text,
      typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color) ? color : '#fbbf24',
    )
    const current = useBoardStore.getState()
    current.addPin(pin)
    const others = (current.board?.pins ?? [])
      .filter((p) => p.id !== pin.id)
      .map((p) => ({ id: p.id, x: p.x, y: p.y, w: p.w, h: p.h }))
    const pushed = resolvePush(others, pin, 24)
    if (pushed.length) current.movePins(pushed)
    created++
  })
  return created
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

function config(state: AiState): AiConfig {
  return { endpoint: state.endpoint, apiKey: state.apiKey, model: state.model }
}

function errorText(e: unknown): string {
  if (e instanceof AiError) {
    // DeepSeek's own statuses are worth translating — "402" on its own
    // tells the user nothing, and running out of balance is by far the
    // most common failure in practice.
    if (e.status === 401) return 'DeepSeek: неверный или отсутствующий API-ключ'
    if (e.status === 402) return 'DeepSeek: закончился баланс'
    if (e.status === 429) return 'DeepSeek: слишком много запросов, попробуй через минуту'
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export const useAiStore = create<AiState>((set, get) => ({
  endpoint: readStored(ENDPOINT_STORAGE) ?? DEFAULT_ENDPOINT,
  apiKey: readStored(KEY_STORAGE),
  model: readModel(),
  isProxy: isProxyEndpoint(readStored(ENDPOINT_STORAGE) ?? DEFAULT_ENDPOINT),

  streamingId: null,
  abortController: null,

  sessionUsage: { promptTokens: 0, completionTokens: 0, costUsd: 0 },
  balance: null,
  balanceLoading: false,

  setEndpoint: (endpoint) => {
    const value = endpoint.trim() || DEFAULT_ENDPOINT
    writeStored(ENDPOINT_STORAGE, value === DEFAULT_ENDPOINT ? null : value)
    // Balance belongs to whoever the old endpoint was talking to.
    set({ endpoint: value, isProxy: isProxyEndpoint(value), balance: null })
  },

  setApiKey: (key) => {
    const value = key.trim()
    writeStored(KEY_STORAGE, value || null)
    set({ apiKey: value || null, balance: null })
  },

  setModel: (model) => {
    writeStored(MODEL_STORAGE, model)
    set({ model })
  },

  sendMessage: async (text, contextPinIds) => {
    const state = get()
    if (state.streamingId) return

    const boardStore = useBoardStore.getState()
    const board = boardStore.board
    const pins = board ? board.pins.filter((p) => contextPinIds.includes(p.id)) : []

    const userMessage: ChatMessage = {
      id: newId(),
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
      ...(contextPinIds.length > 0 ? { contextPinIds } : {}),
    }
    const assistantId = newId()
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
    }

    // Everything the model sees, built before the two new bubbles land in
    // the log — the history it gets is the conversation up to this turn.
    const history = boardStore.chat.messages
      .filter((m) => !m.error && m.content)
      .map((m) => ({ role: m.role === 'user' ? ('user' as const) : ('assistant' as const), content: m.content }))

    const context = pinsToContext(pins)
    const userContent = context ? `${text}\n\n---\nКонтекст доски:\n\n${context}` : text

    boardStore.setChat({ messages: [...boardStore.chat.messages, userMessage, assistantMessage] })

    const controller = new AbortController()
    set({ streamingId: assistantId, abortController: controller })

    // The streamed message is patched in place on every chunk. Reading the
    // log fresh each time (rather than closing over it) keeps edits and
    // deletions made mid-stream from being clobbered.
    const patch = (fields: Partial<ChatMessage>) => {
      const store = useBoardStore.getState()
      const messages = store.chat.messages.map((m) => (m.id === assistantId ? { ...m, ...fields } : m))
      store.setChat({ messages })
    }

    let content = ''
    let reasoning = ''

    try {
      await streamChat({
        config: config(state),
        messages: [
          { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
          ...history,
          { role: 'user', content: userContent },
        ],
        signal: controller.signal,
        onChunk: (chunk) => {
          if (chunk.reasoningDelta) {
            reasoning += chunk.reasoningDelta
            patch({ reasoning })
          }
          if (chunk.delta) {
            content += chunk.delta
            patch({ content })
          }
          if (chunk.usage) {
            const u = chunk.usage
            patch({ usage: u })
            set((s) => ({
              sessionUsage: {
                promptTokens: s.sessionUsage.promptTokens + u.promptTokens,
                completionTokens: s.sessionUsage.completionTokens + u.completionTokens,
                costUsd: s.sessionUsage.costUsd + u.costUsd,
              },
            }))
          }
        },
      })
      // A stop mid-stream aborts the fetch, which streamChat swallows —
      // so "was it cancelled" is decided here, by the signal, not by a
      // thrown error.
      if (controller.signal.aborted) {
        patch({ interrupted: true })
      } else {
        // The model can ask for board changes in a fenced block; run them
        // and strip the block from what's displayed, so the chat reads as
        // prose and the board just changes.
        const { cleaned, applied } = applyActionBlocks(content)
        if (applied) {
          content = cleaned
          patch({ content: cleaned })
        }
      }
    } catch (e) {
      patch({ error: errorText(e) })
      useUiStore.getState().pushToast(errorText(e), 'error')
    } finally {
      set({ streamingId: null, abortController: null })
      // The chat log lives in the board file — flush it now rather than
      // waiting for the next board mutation to trigger a save.
      void useBoardStore.getState().flushSave()
    }
  },

  stopStreaming: () => {
    const { abortController } = get()
    abortController?.abort()
    set({ streamingId: null, abortController: null })
  },

  refreshBalance: async () => {
    const state = get()
    if (state.balanceLoading) return
    set({ balanceLoading: true })
    try {
      const balance = await fetchBalance(config(state))
      set({ balance })
    } catch {
      // Balance is decoration — a failure here must never interrupt a
      // chat that otherwise works.
      set({ balance: null })
    } finally {
      set({ balanceLoading: false })
    }
  },

  arrangeBoard: async (instruction) => {
    const state = get()
    const ui = useUiStore.getState()
    const boardStore = useBoardStore.getState()
    const board = boardStore.board
    if (!board || board.pins.length === 0) return 0

    // A compact table rather than the full pin text: laying out a board is
    // a geometry problem, and sending every note's body would spend a lot of
    // tokens to answer a question about rectangles. One short label per pin
    // is enough for the model to group things sensibly.
    const table = board.pins
      .map((p) => [p.id, p.type, JSON.stringify(shortLabel(p)), `w=${Math.round(p.w)}`, `h=${Math.round(p.h)}`].join('\t'))
      .join('\n')

    const prompt = [
      'Ты раскладываешь пины на бесконечной доске. Ниже таблица: id, тип, подпись, ширина, высота.',
      '',
      table,
      '',
      'Разложи их аккуратно: сгруппируй по смыслу, выровняй в колонки и ряды с одинаковыми отступами',
      '(зазор между пинами 32-48 px), между группами оставь больше места, ничего не должно перекрываться.',
      'Начинай от точки (0, 0) и веди вправо и вниз. Размеры пинов не меняй.',
      instruction ? `Дополнительное пожелание пользователя: ${instruction}` : '',
      '',
      'Верни ТОЛЬКО JSON-массив вида [{"id":"...","x":123,"y":456}] без пояснений и без markdown-обёртки.',
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const result = await complete(config(state), [
        { role: 'system', content: 'Ты помощник-раскладчик. Отвечаешь строго JSON, без комментариев.' },
        { role: 'user', content: prompt },
      ])
      set((s) => ({
        sessionUsage: {
          promptTokens: s.sessionUsage.promptTokens + result.promptTokens,
          completionTokens: s.sessionUsage.completionTokens + result.completionTokens,
          costUsd: s.sessionUsage.costUsd + result.costUsd,
        },
      }))

      const moves = parseLayout(result.content, board.pins)
      if (moves.length === 0) {
        ui.pushToast('AI не вернул раскладку — попробуй ещё раз', 'error')
        return 0
      }
      // One batch, so Ctrl+Z undoes the whole rearrangement at once.
      boardStore.movePins(moves)
      ui.pushToast(`AI переставил ${moves.length} пин(ов) — Ctrl+Z вернёт как было`)
      return moves.length
    } catch (e) {
      ui.pushToast(errorText(e), 'error')
      return 0
    }
  },

  applyContentAction: async (actionId, prompt, pins, resultType) => {
    const state = get()
    const ui = useUiStore.getState()
    const boardStore = useBoardStore.getState()
    const board = boardStore.board
    if (!board) return

    const selection = pinsToContext(pins)
    // {selection} is the documented placeholder; a prompt without it gets
    // the context appended so a user-written action can't silently lose it.
    const filled = prompt.includes('{selection}')
      ? prompt.replace('{selection}', selection)
      : `${prompt}\n\n${selection}`

    if (resultType === 'chat') {
      await get().sendMessage(filled, pins.map((p) => p.id))
      return
    }

    try {
      const result = await complete(config(state), [
        { role: 'system', content: DEFAULT_SYSTEM_PROMPT },
        { role: 'user', content: filled },
      ])
      const text = result.content
      set((s) => ({
        sessionUsage: {
          promptTokens: s.sessionUsage.promptTokens + result.promptTokens,
          completionTokens: s.sessionUsage.completionTokens + result.completionTokens,
          costUsd: s.sessionUsage.costUsd + result.costUsd,
        },
      }))

      if (resultType === 'apply') {
        // "apply" only makes sense for notes — anything else has no text
        // field to write back into, so it falls through to a new note
        // rather than silently doing nothing.
        const notes = pins.filter((p) => p.type === 'note')
        if (notes.length > 0) {
          for (const note of notes) boardStore.updatePin(note.id, 'text', text)
          ui.pushToast('Текст обновлён', 'success')
          return
        }
      }

      const vp = board.viewport
      const maxZ = board.pins.reduce((acc, p) => Math.max(acc, p.z), 0)
      const pin = makeNotePin(
        { x: Math.round(-vp.x / vp.zoom + 80), y: Math.round(-vp.y / vp.zoom + 80), z: maxZ + 1 },
        text,
      )
      boardStore.addPin(pin)
      ui.pushToast('Ответ добавлен на доску', 'success')
    } catch (e) {
      ui.pushToast(errorText(e), 'error')
    }
    void actionId
  },
}))
