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
} from 'lucide-react'
import type { Pin } from '../../api/board'
import { newId } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
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
      <div className={styles.divider} />
      <MenuItem
        icon={<Copy size={13} />}
        onClick={() => {
          // "Вставить" delegates to the same paste pipeline the canvas
          // already listens for on the window — simplest way to reuse it
          // without duplicating the "clipboard vs. URL" logic here.
          document.execCommand('paste')
          onClose()
        }}
      >
        Вставить
      </MenuItem>
    </>
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