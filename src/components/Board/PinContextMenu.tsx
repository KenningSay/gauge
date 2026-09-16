import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUpToLine,
  ArrowDownToLine,
  ArrowUp,
  Copy,
  Trash2,
  Palette,
  ExternalLink,
  Download,
  StickyNote,
  Link as LinkIcon,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import type { CustomAction, Pin } from '../../api/board'
import { newId } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useAiStore } from '../../store/useAiStore'
import { downloadEntry } from '../../utils/download'
import styles from './PinContextMenu.module.css'

export type PinMenuTarget =
  | { kind: 'pin'; screen: { x: number; y: number }; pin: Pin }
  | { kind: 'empty'; screen: { x: number; y: number }; world: { x: number; y: number } }

interface Props {
  target: PinMenuTarget
  onClose: () => void
  onCreateNote: (world: { x: number; y: number }) => void
  onCreateLink: (world: { x: number; y: number }) => void
}

export function PinContextMenu({ target, onClose, onCreateNote, onCreateLink }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [pos, setPos] = useState(target.screen)

  // Clamp to the viewport — a menu near the right/bottom edge would
  // otherwise render partially off-screen. useLayoutEffect so the
  // adjustment happens before paint, avoiding a visible jump.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const maxX = window.innerWidth - r.width - 8
    const maxY = window.innerHeight - r.height - 8
    setPos({
      x: Math.min(target.screen.x, maxX),
      y: Math.min(target.screen.y, maxY),
    })
  }, [target.screen])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ left: pos.x, top: pos.y }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {target.kind === 'pin' ? (
        <PinMenuItems pin={target.pin} onClose={onClose} />
      ) : (
        <EmptyMenuItems
          onClose={onClose}
          onCreateNote={() => {
            onCreateNote(target.world)
            onClose()
          }}
          onCreateLink={() => {
            onCreateLink(target.world)
            onClose()
          }}
        />
      )}
    </div>
  )
}

function PinMenuItems({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const store = useBoardStore
  const maxZ = () => {
    const board = store.getState().board
    return board ? board.pins.reduce((m, p) => Math.max(m, p.z), 0) : 0
  }
  const minZ = () => {
    const board = store.getState().board
    return board ? board.pins.reduce((m, p) => Math.min(m, p.z), 0) : 0
  }

  const handleDuplicate = () => {
    const board = store.getState().board
    if (!board) return
    const z = maxZ() + 1
    const copy: Pin = {
      ...pin,
      id: newId(),
      x: pin.x + 24,
      y: pin.y + 24,
      z,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    store.getState().addPin(copy)
    onClose()
  }

  const handleDelete = () => {
    store.getState().removePins([pin.id])
    onClose()
  }

  const handleColor = () => {
    if (pin.type !== 'note') return
    const v = window.prompt('Цвет (HEX)', pin.color)
    if (!v) return
    store.getState().updatePin(pin.id, 'color', v)
    onClose()
  }

  const handleDescription = () => {
    if (pin.type === 'note' || pin.type === 'link') return
    const cur = 'description' in pin ? pin.description ?? '' : ''
    const v = window.prompt('Описание', cur)
    if (v === null) return
    store.getState().updatePin(pin.id, 'description', v)
    onClose()
  }

  const handleDownload = () => {
    // Notes and links have no backing file — the menu item is hidden for
    // them, but the union still has to be narrowed for the compiler.
    if (pin.type === 'link' || pin.type === 'note') return
    void downloadEntry(pin.assetPath, pin.fileName)
    onClose()
  }

  const handleOpenLink = () => {
    if (pin.type !== 'link') return
    window.open(pin.url, '_blank', 'noopener,noreferrer')
    onClose()
  }

  return (
    <>
      <MenuItem icon={<ArrowUpToLine size={13} />} onClick={() => { store.getState().reorderPin(pin.id, maxZ() + 1); onClose() }}>
        На передний план
      </MenuItem>
      <MenuItem icon={<ArrowUp size={13} />} onClick={() => { store.getState().reorderPin(pin.id, pin.z + 1); onClose() }}>
        Выше
      </MenuItem>
      <MenuItem icon={<ArrowDownToLine size={13} />} onClick={() => { store.getState().reorderPin(pin.id, minZ() - 1); onClose() }}>
        В самый низ
      </MenuItem>
      <div className={styles.divider} />
      <MenuItem icon={<Copy size={13} />} onClick={handleDuplicate}>Дублировать</MenuItem>
      {pin.type === 'note' && (
        <MenuItem icon={<Palette size={13} />} onClick={handleColor}>Изменить цвет</MenuItem>
      )}
      {(pin.type === 'image' || pin.type === 'video' || pin.type === 'audio' || pin.type === 'file') && (
        <MenuItem icon={<StickyNote size={13} />} onClick={handleDescription}>
          Описание
        </MenuItem>
      )}
      {pin.type === 'link' && (
        <MenuItem icon={<ExternalLink size={13} />} onClick={handleOpenLink}>
          Открыть в новой вкладке
        </MenuItem>
      )}
      {pin.type !== 'link' && pin.type !== 'note' && (
        <MenuItem icon={<Download size={13} />} onClick={handleDownload}>Скачать</MenuItem>
      )}
      <div className={styles.divider} />
      <AiSubmenu pin={pin} onClose={onClose} />
      <div className={styles.divider} />
      <MenuItem icon={<Trash2 size={13} />} danger onClick={handleDelete}>
        Удалить
      </MenuItem>
    </>
  )
}

function EmptyMenuItems({
  onClose,
  onCreateNote,
  onCreateLink,
}: {
  onClose: () => void
  onCreateNote: () => void
  onCreateLink: () => void
}) {
  const store = useBoardStore
  const paste = () => {
    const clip = store.getState()
    void clip
    onClose()
  }
  void paste
  return (
    <>
      <MenuItem icon={<StickyNote size={13} />} onClick={onCreateNote}>Создать заметку здесь</MenuItem>
      <MenuItem icon={<LinkIcon size={13} />} onClick={onCreateLink}>Создать ссылку здесь</MenuItem>
    </>
  )
}

// The built-in AI actions. Prompts live here rather than in the store so
// the store stays a transport: it fills {selection} and talks to DeepSeek,
// it doesn't decide what to ask. resultType picks where the answer lands —
// 'apply' rewrites the note in place, 'note' drops a new note on the board.
const AI_ACTIONS: Array<{ id: string; label: string; prompt: string; resultType: 'note' | 'apply' }> = [
  {
    id: 'improve',
    label: 'Улучшить текст',
    prompt: 'Перепиши следующий текст лучше, сохраняя смысл. Не добавляй пояснений, верни только переписанный текст:\n\n{selection}',
    resultType: 'apply',
  },
  {
    id: 'fix',
    label: 'Исправить ошибки',
    prompt: 'Исправь орфографические, пунктуационные и грамматические ошибки. Верни только исправленный текст:\n\n{selection}',
    resultType: 'apply',
  },
  {
    id: 'shorten',
    label: 'Сократить',
    prompt: 'Сократи следующий текст, сохранив главное. Верни только сокращённый вариант:\n\n{selection}',
    resultType: 'apply',
  },
  {
    id: 'expand',
    label: 'Расширить',
    prompt: 'Дополни следующий текст деталями и примерами. Верни только расширенный вариант:\n\n{selection}',
    resultType: 'apply',
  },
  {
    id: 'summarize',
    label: 'Суммировать',
    prompt: 'Суммируй следующие материалы в одну заметку. Верни только текст заметки без пояснений:\n\n{selection}',
    resultType: 'note',
  },
  {
    id: 'relate',
    label: 'Найти связи',
    prompt: 'Проанализируй следующие пины и опиши, как они связаны между собой. Верни текст заметки без пояснений:\n\n{selection}',
    resultType: 'note',
  },
  {
    id: 'tag',
    label: 'Тегировать',
    prompt: 'Сгенерируй 3-7 тегов для следующих пинов. Верни только список тегов через запятую:\n\n{selection}',
    resultType: 'note',
  },
]

// Actions that rewrite text in place are only offered for notes — on an
// image pin there is nothing to rewrite, and the store would silently fall
// back to creating a note instead.
// A module-level constant, not an inline `?? []`: a fresh array literal in
// the selector is a new reference on every store read, which makes Zustand
// think the slice changed and re-render forever.
const NO_ACTIONS: CustomAction[] = []

function AiSubmenu({ pin, onClose }: { pin: Pin; onClose: () => void }) {
  const [open, setOpen] = useState(false)
  const applyContentAction = useAiStore((s) => s.applyContentAction)
  const customActions = useBoardStore((s) => s.board?.customActions) ?? NO_ACTIONS

  const actions = AI_ACTIONS.filter((a) => a.resultType !== 'apply' || pin.type === 'note')

  const run = (id: string, prompt: string, resultType: 'note' | 'apply' | 'chat') => {
    void applyContentAction(id, prompt, [pin], resultType)
    onClose()
  }

  return (
    <div className={styles.submenuWrap}>
      <button className={styles.item} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.itemIcon}><Sparkles size={13} /></span>
        AI
        <span className={styles.submenuChevron}><ChevronRight size={13} /></span>
      </button>
      {open && (
        <div className={styles.submenu}>
          {actions.map((a) => (
            <MenuItem key={a.id} icon={<Sparkles size={13} />} onClick={() => run(a.id, a.prompt, a.resultType)}>
              {a.label}
            </MenuItem>
          ))}
          {customActions.length > 0 && <div className={styles.divider} />}
          {customActions.map((a) => (
            <MenuItem key={a.id} icon={<Sparkles size={13} />} onClick={() => run(a.id, a.prompt, a.resultType)}>
              {a.name}
            </MenuItem>
          ))}
        </div>
      )}
    </div>
  )
}

function MenuItem({
  icon,
  children,
  onClick,
  danger,
}: {
  icon: React.ReactNode
  children: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  return (
    <button
      className={`${styles.item} ${danger ? styles.itemDanger : ''}`}
      onClick={onClick}
    >
      <span className={styles.itemIcon}>{icon}</span>
      {children}
    </button>
  )
}