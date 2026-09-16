// AI chat panel for the board view. Opens from a vertical tongue on the
// right edge of the canvas; when open, pushes the canvas left (desktop)
// or covers the screen (mobile, via CSS media query).
//
// Owns the chat UI. All AI network traffic goes through useAiStore.
// The chat transcript itself lives in useBoardStore.chat (persisted to
// <board-id>.chat.json alongside the board) — this component reads and
// renders it, and never holds message state locally.
//
// Panel open/close state is local for now; the integration delivery will
// lift it into useUiStore so the state survives switching to the Files
// tab and back.

import { useEffect, useMemo, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send,
  Square,
  Sparkles,
  X,
  Settings,
  MoreHorizontal,
  Copy,
  StickyNote,
  RefreshCw,
  Trash2,
  Loader2,
  AlertTriangle,
  Coins,
  ChevronDown,
  Brain,
  Zap,
} from 'lucide-react'
import type { AiModel } from '../../api/ai'
import { isProxyEndpoint } from '../../api/ai'
import type { ChatMessage } from '../../api/board'
import { useAiStore } from '../../store/useAiStore'
import { useBoardStore } from '../../store/useBoardStore'
import { useUiStore } from '../../store/useUiStore'
import { makeNotePin } from '../../utils/boardPinFactories'
import { BookOpen, LayoutTemplate } from 'lucide-react'
import { TemplatePanel } from './TemplatePanel'
import { HelpPanel } from './HelpPanel'
import styles from './AiPanel.module.css'

// The side panel holds more than the chat now: AI on one tab, the template
// library on the other. The tongue stays a single control — two tongues
// stacked down the edge of the board would be clutter — and switching tabs
// while it's open is one click.
type PanelTab = 'ai' | 'templates' | 'help'

export function AiPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<PanelTab>('ai')

  // The board's floating toolbar has to know the panel is up, and the two
  // are in different component trees. A z-index race would be the other
  // answer and it is the fragile one: they sit in different stacking
  // contexts and the winner depends on which parent happens to make one.
  const setBoardPanelOpen = useUiStore((s) => s.setBoardPanelOpen)
  useEffect(() => {
    setBoardPanelOpen(open)
    return () => setBoardPanelOpen(false)
  }, [open, setBoardPanelOpen])

  const toggleTab = (next: PanelTab) => {
    if (open && tab === next) {
      setOpen(false)
      return
    }
    setTab(next)
    setOpen(true)
  }
  const boardId = useBoardStore((s) => s.board?.id)
  const streaming = useAiStore((s) => !!s.streamingId)

  // Auto-open on a fresh board with no chat history so the user sees the
  // feature exists. On a board with history, stay closed — the user has
  // already used it and probably doesn't want the panel in the way.
  const historyLength = useBoardStore((s) => s.chat.messages.length)
  const [autoOpenedOnce, setAutoOpenedOnce] = useState(false)
  useEffect(() => {
    if (autoOpenedOnce) return
    if (boardId && historyLength === 0) {
      // Delay a tick so the board canvas mounts first — otherwise the
      // panel slides in over a still-loading canvas and looks broken.
      const t = setTimeout(() => {
        setOpen(true)
        setAutoOpenedOnce(true)
      }, 200)
      return () => clearTimeout(t)
    }
    setAutoOpenedOnce(true)
  }, [boardId, historyLength, autoOpenedOnce])

  if (!boardId) return null

  return (
    <>
      {/* One tongue per tab, stacked down the edge. Clicking a tongue opens
          its tab, switches to it if the other one is showing, and closes the
          panel if it's already the one you're looking at. */}
      <div className={`${styles.tongues} ${open ? styles.tonguesOpen : ''}`}>
        <button
          className={`${styles.tongue} ${open && tab === 'ai' ? styles.tongueActive : ''}`}
          onClick={() => toggleTab('ai')}
          title="AI-помощник"
          aria-label="AI-помощник"
          aria-pressed={open && tab === 'ai'}
        >
          <Sparkles size={14} />
          <span className={styles.tongueLabel}>AI</span>
        </button>
        <button
          className={`${styles.tongue} ${open && tab === 'templates' ? styles.tongueActive : ''}`}
          onClick={() => toggleTab('templates')}
          title="Шаблоны заметок"
          aria-label="Шаблоны заметок"
          aria-pressed={open && tab === 'templates'}
        >
          <LayoutTemplate size={14} />
          <span className={styles.tongueLabel}>Шаблоны</span>
        </button>
        <button
          className={`${styles.tongue} ${open && tab === 'help' ? styles.tongueActive : ''}`}
          onClick={() => toggleTab('help')}
          title="Как всё это работает"
          aria-label="Справка"
          aria-pressed={open && tab === 'help'}
        >
          <BookOpen size={14} />
          <span className={styles.tongueLabel}>Справка</span>
        </button>
      </div>

      {/* Always mounted so it can transition in and out; its contents are
          only built while it's open, since the template gallery is not
          cheap to render. */}
      <div
        className={`${styles.panel} ${open ? styles.panelOpen : ''}`}
        role="complementary"
        aria-label="Панель доски"
        aria-hidden={!open}
      >
        {open && (
        <>
          {tab === 'help' ? (
            <>
              <div className={styles.simpleHeader}>
                <span className={styles.headerTitleText}>Справка по доске</span>
                <button
                  className={styles.headerBtn}
                  onClick={() => setOpen(false)}
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X size={15} />
                </button>
              </div>
              <HelpPanel />
            </>
          ) : tab === 'ai' ? (
            <>
              <PanelHeader onClose={() => setOpen(false)} streaming={streaming} />
              <ChatLog />
              <ChatInput onSendRequest={() => undefined} />
            </>
          ) : (
            <>
              <div className={styles.simpleHeader}>
                <span className={styles.headerTitleText}>Шаблоны заметок</span>
                <button
                  className={styles.headerBtn}
                  onClick={() => setOpen(false)}
                  title="Закрыть"
                  aria-label="Закрыть"
                >
                  <X size={15} />
                </button>
              </div>
              <TemplatePanel />
            </>
          )}
        </>
        )}
      </div>
    </>
  )
}

// ---------- header ----------

function PanelHeader({ onClose, streaming }: { onClose: () => void; streaming: boolean }) {
  const [usageOpen, setUsageOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const sessionUsage = useAiStore((s) => s.sessionUsage)
  const model = useAiStore((s) => s.model)

  return (
    <div className={styles.header}>
      <div className={styles.headerTitle}>
        <Sparkles size={15} color="var(--tick)" />
        <span>AI</span>
        <span className={styles.headerModel}>
          {model === 'deepseek-reasoner' ? 'R1' : 'V3'}
          {streaming && <span className={styles.streamDot} />}
        </span>
      </div>

      <div className={styles.headerActions}>
        <button
          className={styles.headerBtn}
          onClick={() => setUsageOpen((v) => !v)}
          title={`${sessionUsage.promptTokens + sessionUsage.completionTokens} токенов · $${sessionUsage.costUsd.toFixed(4)}`}
          aria-label="Использование токенов"
        >
          <Coins size={14} />
          {sessionUsage.costUsd > 0 && (
            <span className={styles.costBadge}>${formatCost(sessionUsage.costUsd)}</span>
          )}
        </button>
        <button
          className={styles.headerBtn}
          onClick={() => setSettingsOpen((v) => !v)}
          title="Настройки AI"
          aria-label="Настройки AI"
        >
          <Settings size={14} />
        </button>
        <button className={styles.headerBtn} onClick={onClose} title="Закрыть" aria-label="Закрыть">
          <X size={14} />
        </button>
      </div>

      {usageOpen && <UsagePopover onClose={() => setUsageOpen(false)} />}
      {settingsOpen && <SettingsPopover onClose={() => setSettingsOpen(false)} />}
    </div>
  )
}

// ---------- usage popover ----------

function UsagePopover({ onClose }: { onClose: () => void }) {
  const sessionUsage = useAiStore((s) => s.sessionUsage)
  const balance = useAiStore((s) => s.balance)
  const balanceLoading = useAiStore((s) => s.balanceLoading)
  const refreshBalance = useAiStore((s) => s.refreshBalance)
  const isProxy = useAiStore((s) => s.isProxy)
  const apiKey = useAiStore((s) => s.apiKey)

  // Auto-refresh balance on first open. Not polled anywhere else — the
  // cost of a request every few seconds to keep a number visible isn't
  // worth it, and DeepSeek charges nothing for the endpoint but the user
  // pays in latency for no reason.
  useEffect(() => {
    if (balance === null && !balanceLoading) void refreshBalance()
  }, [balance, balanceLoading, refreshBalance])

  const canFetchBalance = isProxy || !!apiKey

  return (
    <>
      <div className={styles.popoverBackdrop} onClick={onClose} />
      <div className={styles.popover} onClick={(e) => e.stopPropagation()}>
        <div className={styles.popoverSection}>
          <div className={styles.popoverLabel}>Сессия</div>
          <div className={styles.usageRow}>
            <span>Промпт</span>
            <span className={styles.mono}>{sessionUsage.promptTokens.toLocaleString('ru')}</span>
          </div>
          <div className={styles.usageRow}>
            <span>Ответ</span>
            <span className={styles.mono}>{sessionUsage.completionTokens.toLocaleString('ru')}</span>
          </div>
          <div className={`${styles.usageRow} ${styles.usageTotal}`}>
            <span>Итого</span>
            <span className={styles.mono}>${sessionUsage.costUsd.toFixed(4)}</span>
          </div>
        </div>

        <div className={styles.divider} />

        <div className={styles.popoverSection}>
          <div className={styles.popoverLabel}>
            Баланс
            <button
              className={styles.refreshBtn}
              onClick={() => void refreshBalance()}
              disabled={balanceLoading || !canFetchBalance}
              title={canFetchBalance ? 'Обновить баланс' : 'Установите endpoint или ключ'}
            >
              {balanceLoading ? <Loader2 size={11} className="spin" /> : <RefreshCw size={11} />}
            </button>
          </div>
          {balance ? (
            <div className={`${styles.usageRow} ${styles.usageTotal}`}>
              <span>DeepSeek</span>
              <span className={styles.mono}>
                {balance.totalBalance.toFixed(2)} {balance.currency}
              </span>
            </div>
          ) : (
            <div className={styles.emptyHint}>
              {canFetchBalance ? 'Не удалось получить' : 'Требуется endpoint или ключ'}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

// ---------- settings popover ----------

function SettingsPopover({ onClose }: { onClose: () => void }) {
  const endpoint = useAiStore((s) => s.endpoint)
  const apiKey = useAiStore((s) => s.apiKey)
  const model = useAiStore((s) => s.model)
  const setEndpoint = useAiStore((s) => s.setEndpoint)
  const setApiKey = useAiStore((s) => s.setApiKey)
  const setModel = useAiStore((s) => s.setModel)
  const isProxy = isProxyEndpoint(endpoint)

  const [endpointDraft, setEndpointDraft] = useState(endpoint)
  const [keyDraft, setKeyDraft] = useState(apiKey ?? '')

  const commitEndpoint = () => {
    const v = endpointDraft.trim() || '/ai/'
    if (v !== endpoint) setEndpoint(v)
  }
  const commitKey = () => {
    const v = keyDraft.trim()
    if (v !== (apiKey ?? '')) setApiKey(v)
  }

  return (
    <>
      <div className={styles.popoverBackdrop} onClick={onClose} />
      <div className={`${styles.popover} ${styles.popoverWide}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.popoverSection}>
          <div className={styles.popoverLabel}>Модель</div>
          <ModelPicker value={model} onChange={setModel} />
        </div>

        <div className={styles.divider} />

        <div className={styles.popoverSection}>
          <div className={styles.popoverLabel}>Endpoint</div>
          <input
            className={styles.popoverInput}
            value={endpointDraft}
            onChange={(e) => setEndpointDraft(e.target.value)}
            onBlur={commitEndpoint}
            placeholder="/ai/"
          />
          <div className={styles.popoverHint}>
            {isProxy
              ? 'Прокси на сервере. Ключ не нужен — nginx подставит его сам.'
              : 'Прямой запрос к DeepSeek. Требуется ключ и разрешение в CSP.'}
          </div>
        </div>

        {!isProxy && (
          <>
            <div className={styles.divider} />
            <div className={styles.popoverSection}>
              <div className={styles.popoverLabel}>API-ключ</div>
              <input
                className={styles.popoverInput}
                type="password"
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                onBlur={commitKey}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
              />
              <div className={styles.popoverHint}>
                Хранится в sessionStorage текущей вкладки. Не записывается на сервер.
              </div>
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ModelPicker({ value, onChange }: { value: AiModel; onChange: (m: AiModel) => void }) {
  return (
    <div className={styles.modelPicker}>
      <button
        className={`${styles.modelBtn} ${value === 'deepseek-chat' ? styles.modelActive : ''}`}
        onClick={() => onChange('deepseek-chat')}
      >
        <Zap size={13} />
        <div>
          <div className={styles.modelName}>V3</div>
          <div className={styles.modelHint}>Быстрая, дешёвая</div>
        </div>
      </button>
      <button
        className={`${styles.modelBtn} ${value === 'deepseek-reasoner' ? styles.modelActive : ''}`}
        onClick={() => onChange('deepseek-reasoner')}
      >
        <Brain size={13} />
        <div>
          <div className={styles.modelName}>R1</div>
          <div className={styles.modelHint}>Думает пошагово</div>
        </div>
      </button>
    </div>
  )
}

// ---------- chat log ----------

function ChatLog() {
  const messages = useBoardStore((s) => s.chat.messages)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const lastContentRef = useRef<string>('')

  const lastContent = useMemo(() => {
    const last = messages[messages.length - 1]
    return last ? last.id + '|' + last.content.length + '|' + (last.error ?? '') : ''
  }, [messages])

  // Autoscroll on new content, but only if the user was already at the
  // bottom. If they scrolled up to re-read an earlier reply, yanking them
  // down on the next token would be hostile.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const wasNearBottom = lastContentRef.current === '' || isNearBottom(el)
    lastContentRef.current = lastContent
    if (wasNearBottom) {
      el.scrollTop = el.scrollHeight
    }
  }, [lastContent])

  if (messages.length === 0) {
    return (
      <div className={styles.emptyChat}>
        <Sparkles size={32} color="var(--tick)" style={{ opacity: 0.6 }} />
        <div className={styles.emptyChatTitle}>Чем помочь?</div>
        <div className={styles.emptyChatHint}>
          Спроси что угодно, или выдели пины на доске и запусти AI-действие из контекстного меню.
        </div>
      </div>
    )
  }

  return (
    <div ref={scrollRef} className={styles.log}>
      {messages.map((m) => (
        <ChatBubble key={m.id} message={m} />
      ))}
      <div className={styles.logSpacer} />
    </div>
  )
}

function isNearBottom(el: HTMLElement): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight < 80
}

// ---------- single message ----------

function ChatBubble({ message }: { message: ChatMessage }) {
  const streaming = useAiStore((s) => !!s.streamingId && s.streamingId === message.id)
  const model = useAiStore((s) => s.model)
  const [reasoningOpen, setReasoningOpen] = useState(false)

  if (message.role === 'user') {
    return (
      <div className={`${styles.bubble} ${styles.bubbleUser}`}>
        <div className={styles.bubbleContent}>
          <UserBubbleText text={message.content} />
        </div>
        <BubbleActions message={message} side="right" />
      </div>
    )
  }

  return (
    <div className={`${styles.bubble} ${styles.bubbleAssistant}`}>
      {message.reasoning && model === 'deepseek-reasoner' && (
        <div className={styles.reasoningBlock}>
          <button className={styles.reasoningToggle} onClick={() => setReasoningOpen((v) => !v)}>
            <Brain size={12} />
            <span>Размышления</span>
            <ChevronDown
              size={12}
              className={reasoningOpen ? styles.reasoningChevronOpen : styles.reasoningChevron}
            />
          </button>
          {reasoningOpen && <div className={styles.reasoningText}>{message.reasoning}</div>}
        </div>
      )}

      {message.error ? (
        <div className={styles.errorBubble}>
          <AlertTriangle size={14} />
          <span>{message.error}</span>
        </div>
      ) : (
        <div className={styles.bubbleContent}>
          {message.content ? (
            <div className={styles.markdown}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
            </div>
          ) : (
            <div className={styles.skeleton}>
              <span className={styles.skeletonDot} />
              <span className={styles.skeletonDot} />
              <span className={styles.skeletonDot} />
            </div>
          )}
          {streaming && <span className={styles.caret} />}
        </div>
      )}

      {message.interrupted && <div className={styles.interruptedTag}>прервано</div>}

      {message.usage && (
        <div className={styles.usageTag}>
          {message.usage.promptTokens + message.usage.completionTokens} tok · ${formatCost(message.usage.costUsd)}
        </div>
      )}

      {!streaming && !message.error && <BubbleActions message={message} side="left" />}
    </div>
  )
}

function UserBubbleText({ text }: { text: string }) {
  // User messages are rendered as plain text (with line breaks), not
  // markdown — a user pasting "*foo*" almost certainly means it literally,
  // and rendering their own text as markdown would surprise them.
  return <>{text.split('\n').map((line, i) => (
    <span key={i}>
      {line}
      {i < text.split('\n').length - 1 && <br />}
    </span>
  ))}</>
}

function BubbleActions({ message, side }: { message: ChatMessage; side: 'left' | 'right' }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const boardStore = useBoardStore
  const sendMessage = useAiStore((s) => s.sendMessage)
  const pushToast = useUiStore((s) => s.pushToast)

  const handleCopy = () => {
    void navigator.clipboard.writeText(message.content)
    pushToast('Скопировано', 'info')
    setMenuOpen(false)
  }

  const handleSaveAsNote = () => {
    const board = boardStore.getState().board
    if (!board) return
    // Place the note at the center of the current viewport, with a z-index
    // one above everything. Doesn't run the "капля в воду" push — a
    // note the user explicitly asked for shouldn't shove their existing
    // layout around.
    const vp = board.viewport
    const z = board.pins.reduce((m, p) => Math.max(m, p.z), 0) + 1
    // A rough "center of a typical canvas" — BoardCanvas knows the actual
    // size, but the note is going to be dropped somewhere reasonable and
    // the user can drag it. Good enough.
    const cx = vp.x + 400
    const cy = vp.y + 300
    const note = makeNotePin({ x: cx, y: cy, z }, message.content, '#fbbf24')
    boardStore.getState().addPin(note)
    pushToast('Сохранено как заметка на доске')
    setMenuOpen(false)
  }

  const handleRegenerate = () => {
    // Find the preceding user message and re-send it. The current
    // assistant reply and everything after it is dropped — same behaviour
    // as ChatGPT's regenerate.
    const messages = boardStore.getState().chat.messages
    const idx = messages.findIndex((m) => m.id === message.id)
    if (idx < 1) return
    const prevUser = messages
      .slice(0, idx)
      .reverse()
      .find((m) => m.role === 'user')
    if (!prevUser) return
    // Truncate everything from the previous user message onwards, then
    // sendMessage will re-add it — except sendMessage takes text, so we
    // keep the user message and drop only this assistant + anything after.
    const kept = messages.slice(0, idx)
    boardStore.getState().setChat({ messages: kept })
    void sendMessage(prevUser.content, prevUser.contextPinIds ?? [])
    setMenuOpen(false)
  }

  const handleEdit = () => {
    // For user messages: edit and resend. For simplicity, put the content
    // into the textarea via a custom event the input component listens
    // for — otherwise we'd need to lift the input state here.
    window.dispatchEvent(new CustomEvent('gauge-ai-edit', { detail: message.content }))
    setMenuOpen(false)
  }

  const handleDelete = () => {
    const messages = boardStore.getState().chat.messages
    const idx = messages.findIndex((m) => m.id === message.id)
    if (idx === -1) return
    // User message: drop it and any immediately-following assistant reply.
    // Assistant message: drop just itself.
    let removeCount = 1
    if (message.role === 'user' && messages[idx + 1]?.role === 'assistant') {
      removeCount = 2
    }
    const next = [...messages.slice(0, idx), ...messages.slice(idx + removeCount)]
    boardStore.getState().setChat({ messages: next })
    setMenuOpen(false)
  }

  return (
    <div className={`${styles.actions} ${side === 'right' ? styles.actionsRight : ''}`}>
      <button
        className={styles.actionBtn}
        onClick={() => setMenuOpen((v) => !v)}
        title="Действия"
        aria-label="Действия с сообщением"
      >
        <MoreHorizontal size={13} />
      </button>
      {menuOpen && (
        <>
          <div className={styles.actionsBackdrop} onClick={() => setMenuOpen(false)} />
          <div className={`${styles.actionsMenu} ${side === 'right' ? styles.actionsMenuRight : ''}`}>
            <button className={styles.actionsMenuItem} onClick={handleCopy}>
              <Copy size={12} /> Копировать
            </button>
            {message.role === 'assistant' && !message.error && (
              <>
                <button className={styles.actionsMenuItem} onClick={handleSaveAsNote}>
                  <StickyNote size={12} /> Сохранить как заметку
                </button>
                <button className={styles.actionsMenuItem} onClick={handleRegenerate}>
                  <RefreshCw size={12} /> Перегенерировать
                </button>
              </>
            )}
            {message.role === 'user' && (
              <button className={styles.actionsMenuItem} onClick={handleEdit}>
                <RefreshCw size={12} /> Изменить и отправить
              </button>
            )}
            <div className={styles.actionsMenuDivider} />
            <button className={`${styles.actionsMenuItem} ${styles.actionsMenuItemDanger}`} onClick={handleDelete}>
              <Trash2 size={12} /> Удалить
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ---------- input ----------

function ChatInput({ onSendRequest }: { onSendRequest: () => void }) {
  const [text, setText] = useState('')
  const [contextMode, setContextMode] = useState<'selection' | 'board'>('selection')
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  const streaming = useAiStore((s) => !!s.streamingId)
  const sendMessage = useAiStore((s) => s.sendMessage)
  const stopStreaming = useAiStore((s) => s.stopStreaming)
  const model = useAiStore((s) => s.model)
  const setModel = useAiStore((s) => s.setModel)

  const selected = useBoardStore((s) => s.selected)
  const board = useBoardStore((s) => s.board)

  // Listens for the "edit message" event dispatched from BubbleActions.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<string>).detail
      if (typeof detail === 'string') {
        setText(detail)
        textareaRef.current?.focus()
      }
    }
    window.addEventListener('gauge-ai-edit', handler)
    return () => window.removeEventListener('gauge-ai-edit', handler)
  }, [])

  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const selectedCount = selected.size
  const boardPinCount = board?.pins.length ?? 0

  const handleSend = async () => {
    const t = text.trim()
    if (!t || streaming) return

    if (contextMode === 'board' && boardPinCount > 20) {
      // Rough token guard: the spec calls for a warning above ~30k tokens,
      // and a conservative "20 pins is already several thousand tokens"
      // approximation is good enough for a UI hint. Real token counting
      // (tiktoken or similar) would add a megabyte of dependencies for a
      // warning that the user can override anyway.
      const ok = await confirmDialog(
        `В доске ${boardPinCount} пинов. Отправить всю доску в AI может быть дорого и медленно. Продолжить?`,
      )
      if (!ok) return
    }

    setText('')
    onSendRequest()
    // Context pins are those currently selected — the model sees them
    // appended to the message via the store's serialization. In "board"
    // mode, the store will append every pin instead.
    // Two fixes in one line. "Whole board" used to send an empty list — the
    // store doesn't know which mode the panel is in, so the model was asked
    // about a board it had never been shown. And "selection" with nothing
    // selected also sent nothing, which is how you get "I can't see your
    // board" in reply to "tidy it up": falling back to the whole board is
    // what the user meant.
    const allIds = (board?.pins ?? []).map((p) => p.id)
    const ctxIds =
      contextMode === 'selection' && selected.size > 0 ? Array.from(selected) : allIds
    await sendMessage(t, ctxIds)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // Auto-grow the textarea up to a cap. Past the cap it scrolls.
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 140) + 'px'
  }, [text])

  // Selection count feedback — when the user has pins selected, show them
  // that the AI will see those specifically. Silent in "board" mode since
  // it's obvious what's being sent.
  const contextLabel = (() => {
    if (contextMode === 'board') return `вся доска · ${boardPinCount}`
    // Says what will actually be sent, not what the mode is called: with
    // nothing selected the request falls back to the whole board.
    if (selectedCount === 0) return `вся доска · ${boardPinCount}`
    return `выделенное · ${selectedCount}`
  })()

  return (
    <div className={styles.inputWrap}>
      <div className={styles.inputControls}>
        <button
          className={styles.modeBtn}
          onClick={() => setModel(model === 'deepseek-chat' ? 'deepseek-reasoner' : 'deepseek-chat')}
          title={model === 'deepseek-chat' ? 'Переключить на R1 (умнее)' : 'Переключить на V3 (быстрее)'}
        >
          {model === 'deepseek-chat' ? <Zap size={11} /> : <Brain size={11} />}
          {model === 'deepseek-chat' ? 'V3' : 'R1'}
        </button>
        <button
          className={styles.modeBtn}
          onClick={() => setContextMode((v) => (v === 'selection' ? 'board' : 'selection'))}
          title="Что видит AI: только выделенное или вся доска"
        >
          {contextLabel}
        </button>
      </div>

      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            contextMode === 'board'
              ? 'Спроси что угодно про эту доску…'
              : selectedCount > 0
                ? `Спроси про ${selectedCount} выделенных…`
                : 'Выдели пины или спроси что угодно…'
          }
          rows={1}
          disabled={streaming}
        />
        {streaming ? (
          <button className={styles.stopBtn} onClick={stopStreaming} title="Остановить">
            <Square size={14} fill="currentColor" />
          </button>
        ) : (
          <button
            className={styles.sendBtn}
            onClick={() => void handleSend()}
            disabled={!text.trim()}
            title="Отправить"
          >
            <Send size={14} />
          </button>
        )}
      </div>

      {!streaming && text.length === 0 && (
        <div className={styles.inputHint}>
          Enter — отправить · Shift+Enter — новая строка
        </div>
      )}
    </div>
  )
}

// ---------- misc ----------

function formatCost(usd: number): string {
  if (usd === 0) return '0'
  if (usd < 0.01) return usd.toFixed(4)
  return usd.toFixed(3)
}
