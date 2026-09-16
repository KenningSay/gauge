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

// The proxy is the default on purpose: it keeps the DeepSeek key on the
// server (nginx injects it, see nginx.conf.template's /ai/ location) so a
// stock deployment never has a key in the browser at all. The direct
// endpoint exists for people running Gauge without that proxy, and it
// costs them a CSP edit — documented, not hidden.
const DEFAULT_ENDPOINT = '/ai/'

const KEY_STORAGE = 'gauge-ai-key'
const ENDPOINT_STORAGE = 'gauge-ai-endpoint'
const MODEL_STORAGE = 'gauge-ai-model'

export const DEFAULT_SYSTEM_PROMPT =
  'Ты — ассистент внутри доски-мудборда файлового менеджера Gauge. ' +
  'Пользователь работает с пинами: заметками, картинками, видео, файлами и ссылками. ' +
  'Отвечай кратко и по делу, на русском языке. ' +
  'Если тебе передан контекст доски — опирайся на него, не выдумывай содержимое пинов.'

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
}

// One pin rendered as plain text for the model. Deliberately lossy: the
// model gets what a human would read off the card, not the JSON — geometry,
// z-order and ids are noise that would eat tokens for nothing. Asset pins
// can't send their bytes, so they send what's known about the file.
function pinToText(pin: Pin): string {
  switch (pin.type) {
    case 'note':
      return `[Заметка]\n${pin.text}`
    case 'link':
      return `[Ссылка] ${pin.title ? `${pin.title} — ` : ''}${pin.url}`
    case 'image':
    case 'video':
    case 'file':
      return `[${pin.type === 'image' ? 'Картинка' : pin.type === 'video' ? 'Видео' : 'Файл'}] ${pin.fileName}${pin.description ? `\nОписание: ${pin.description}` : ''}`
    case 'audio':
      return `[Аудио] ${pin.title ?? pin.fileName}${pin.artist ? ` — ${pin.artist}` : ''}${pin.description ? `\nОписание: ${pin.description}` : ''}`
  }
}

function pinsToContext(pins: Pin[]): string {
  if (pins.length === 0) return ''
  return pins.map(pinToText).join('\n\n')
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
      if (controller.signal.aborted) patch({ interrupted: true })
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
