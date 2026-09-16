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
  FileText,
  Unlink,
  Sparkles,
  ChevronRight,
  Pipette,
  Square,
  Circle,
  Diamond,
  Triangle,
  Image as ImageIcon,
  Eraser,
  Type,
  Check,
} from 'lucide-react'
import type { CustomAction, NotePin as NotePinT, NoteStyle, NoteTexture, Pin, ShapeKind, ShapePin as ShapePinT } from '../../api/board'
import { newId } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { HUD_STYLES, NOTE_FONTS, readableOn } from './pins/noteStyles'
import { putTextContent } from '../../api/webdav'
import { useAiStore } from '../../store/useAiStore'
import { useUiStore } from '../../store/useUiStore'
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
  onCreateVaultNote: (world: { x: number; y: number }) => void
  onCreateShape: (world: { x: number; y: number }, kind: ShapeKind) => void
  // Opens the vault picker to put a picture inside an existing shape.
  onPickShapeImage: (pinId: string) => void
}

export function PinContextMenu({ target, onClose, onCreateNote, onCreateLink, onCreateVaultNote, onCreateShape, onPickShapeImage }: Props) {
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
        <PinMenuItems pin={target.pin} onClose={onClose} onPickShapeImage={onPickShapeImage} />
      ) : (
        <EmptyMenuItems
          onClose={onClose}
          onCreateNote={() => {
            onCreateNote(target.world)
            onClose()
          }}
          onCreateVaultNote={() => {
            onCreateVaultNote(target.world)
            onClose()
          }}
          onCreateShape={(kind) => {
            onCreateShape(target.world, kind)
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

function PinMenuItems({ pin, onClose, onPickShapeImage }: { pin: Pin; onClose: () => void; onPickShapeImage: (pinId: string) => void }) {
  const store = useBoardStore
  const promptDialog = useUiStore((s) => s.promptDialog)
  const pushToast = useUiStore((s) => s.pushToast)
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

  // Turns a board-owned note into a real vault file: writes the .md, then
  // links the pin to it. After this the note is editable from Obsidian, the
  // file manager, or any other WebDAV client — which is the whole reason to
  // keep boards inside the vault rather than beside it.
  const handleSaveAsMd = async () => {
    if (pin.type !== 'note') return
    const firstLine = (pin.text.split('\n').find((l) => l.trim()) ?? 'Заметка')
      .replace(/^#+\s*/, '')
      .slice(0, 60)
      .trim()
    const suggested = `/${sanitizeName(firstLine || 'Заметка')}.md`
    const target = await promptDialog('Путь в хранилище', suggested)
    if (!target) return
    const path = target.endsWith('.md') ? target : `${target}.md`
    try {
      await putTextContent(path, pin.text)
      store.getState().updatePin(pin.id, 'sourcePath', path)
      pushToast(`Сохранено в ${path}`)
    } catch (e) {
      pushToast(`Не удалось сохранить: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
    onClose()
  }

  const handleUnlink = () => {
    if (pin.type !== 'note') return
    store.getState().updatePin(pin.id, 'sourcePath', undefined)
    pushToast('Связь с файлом убрана, текст остался на доске', 'info')
    onClose()
  }

  const handleDescription = async () => {
    if (pin.type === 'note' || pin.type === 'link') return
    const cur = 'description' in pin ? pin.description ?? '' : ''
    const v = await promptDialog('Описание', cur)
    if (v === null) return
    store.getState().updatePin(pin.id, 'description', v)
    onClose()
  }

  const handleDownload = () => {
    // Notes and links have no backing file — the menu item is hidden for
    // them, but the union still has to be narrowed for the compiler.
    if (pin.type === 'link' || pin.type === 'note') return
    // A shape may or may not carry a picture; the others always do.
    if (!pin.assetPath || !pin.fileName) return
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
        <ColorSubmenu pin={pin} />
      )}
      {pin.type === 'note' && (
        <FontSubmenu pin={pin} />
      )}
      {pin.type === 'shape' && (
        <ShapeColorSubmenu pin={pin} />
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
      {pin.type === 'shape' && (
        <MenuItem
          icon={<ImageIcon size={13} />}
          onClick={() => {
            onPickShapeImage(pin.id)
            onClose()
          }}
        >
          {pin.assetPath ? 'Заменить картинку…' : 'Вставить картинку…'}
        </MenuItem>
      )}
      {pin.type === 'shape' && pin.assetPath && (
        <MenuItem
          icon={<Unlink size={13} />}
          onClick={() => {
            store.getState().updatePin(pin.id, 'assetPath', undefined)
            store.getState().updatePin(pin.id, 'fileName', undefined)
            onClose()
          }}
        >
          Убрать картинку
        </MenuItem>
      )}
      {pin.type === 'note' && (pin.decor?.length ?? 0) > 0 && (
        <MenuItem
          icon={<Eraser size={13} />}
          onClick={() => {
            store.getState().updatePin(pin.id, 'decor', [])
            onClose()
          }}
        >
          Убрать штучки ({pin.decor?.length})
        </MenuItem>
      )}
      {pin.type === 'note' && !pin.sourcePath && (
        <MenuItem icon={<FileText size={13} />} onClick={handleSaveAsMd}>
          Сохранить в хранилище (.md)…
        </MenuItem>
      )}
      {pin.type === 'note' && pin.sourcePath && (
        <MenuItem icon={<Unlink size={13} />} onClick={handleUnlink}>
          Отвязать от файла
        </MenuItem>
      )}
      {pin.type !== 'link' && pin.type !== 'note' && pin.assetPath && (
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

const SHAPES: Array<{ id: ShapeKind; label: string; icon: React.ReactNode }> = [
  { id: 'rect', label: 'Прямоугольник', icon: <Square size={13} /> },
  { id: 'ellipse', label: 'Овал', icon: <Circle size={13} /> },
  { id: 'diamond', label: 'Ромб', icon: <Diamond size={13} /> },
  { id: 'triangle', label: 'Треугольник', icon: <Triangle size={13} /> },
]

function EmptyMenuItems({
  onCreateNote,
  onCreateLink,
  onCreateVaultNote,
  onCreateShape,
}: {
  onClose: () => void
  onCreateNote: () => void
  onCreateLink: () => void
  onCreateVaultNote: () => void
  onCreateShape: (kind: ShapeKind) => void
}) {
  const [shapesOpen, setShapesOpen] = useState(false)
  return (
    <>
      <MenuItem icon={<StickyNote size={13} />} onClick={onCreateNote}>Создать заметку здесь</MenuItem>
      <MenuItem icon={<FileText size={13} />} onClick={onCreateVaultNote}>Заметка из хранилища (.md)…</MenuItem>
      <MenuItem icon={<LinkIcon size={13} />} onClick={onCreateLink}>Создать ссылку здесь</MenuItem>

      <div className={styles.submenuWrap}>
        <button className={styles.item} onClick={() => setShapesOpen((v) => !v)} aria-expanded={shapesOpen}>
          <span className={styles.itemIcon}><Square size={13} /></span>
          Фигура
          <span className={styles.submenuChevron}><ChevronRight size={13} /></span>
        </button>
        {shapesOpen && (
          <div className={styles.submenu}>
            {SHAPES.map((s) => (
              <MenuItem key={s.id} icon={s.icon} onClick={() => onCreateShape(s.id)}>
                {s.label}
              </MenuItem>
            ))}
          </div>
        )}
      </div>
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
// Sticky-note palette. Hand-picked rather than a colour wheel: these all
// stay legible with the automatic black/white text, and picking from eight
// good colours is faster than dialling in a hex. The native picker is right
// there for anything else.
const NOTE_COLORS = [
  '#fbbf24', '#f97316', '#ef4444', '#ec4899',
  '#a855f7', '#3b82f6', '#10b981', '#64748b',
]

const TEXT_COLORS = ['#16150f', '#f4f3ef', '#7f1d1d', '#1e3a8a']

// Shapes get the accent-forward set: these read as structure (frames,
// groupings, callouts) rather than as sticky notes.
const SHAPE_COLORS = ['#2dd4bf', '#fbbf24', '#f87171', '#a855f7', '#60a5fa', '#4ade80', '#f472b6', '#94a3b8']

// What the note is dressed as. Ordered from plainest to loudest, so the
// two you reach for most are first.
const NOTE_STYLES: Array<{ id: NoteStyle; label: string }> = [
  { id: 'sticky', label: 'Стикер' },
  { id: 'paper', label: 'Листок' },
  { id: 'spiral', label: 'Блокнот' },
  { id: 'clip', label: 'На скрепке' },
  { id: 'tape', label: 'На скотче' },
  { id: 'card', label: 'Карточка' },
  { id: 'folder', label: 'Папка' },
  { id: 'ribbon', label: 'Лента' },
]

// Paper textures. Already supported by the renderer and stored per note —
// there was simply no way to pick one.
const NOTE_TEXTURES: Array<{ id: NoteTexture; label: string }> = [
  { id: 'plain', label: 'Гладкая' },
  { id: 'ruled', label: 'Линейка' },
  { id: 'grid', label: 'Клетка' },
  { id: 'dots', label: 'Точки' },
  { id: 'graph', label: 'Миллиметровка' },
]

function ShapeColorSubmenu({ pin }: { pin: ShapePinT }) {
  const [open, setOpen] = useState(false)
  const updatePin = useBoardStore((s) => s.updatePin)

  // Outline and fill move together by default: two colours to pick for
  // every shape is tedious, and a differently-coloured outline is the rare
  // case. The opacity slider is what actually distinguishes a frame (a few
  // percent) from a filled callout.
  const setColor = (value: string) => {
    updatePin(pin.id, 'fill', value)
    updatePin(pin.id, 'stroke', value)
  }

  return (
    <div className={styles.submenuWrap}>
      <button className={styles.item} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.itemIcon}><Palette size={13} /></span>
        Цвет и заливка
        <span className={styles.submenuChevron}><ChevronRight size={13} /></span>
      </button>
      {open && (
        <div className={styles.submenu}>
          <div className={styles.swatchLabel}>Цвет</div>
          <div className={styles.swatches}>
            {SHAPE_COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.swatch} ${pin.fill.toLowerCase() === c ? styles.swatchActive : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={`Цвет ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
            <label className={styles.swatchCustom} title="Свой цвет">
              <Pipette size={12} />
              <input type="color" value={pin.fill} onChange={(e) => setColor(e.target.value)} />
            </label>
          </div>

          <div className={styles.swatchLabel}>Заливка</div>
          <div className={styles.fillRow}>
            <input
              type="range"
              min={0}
              max={100}
              step={2}
              value={pin.fillOpacity}
              onChange={(e) => updatePin(pin.id, 'fillOpacity', Number(e.target.value))}
            />
            <span className={styles.fillValue}>{pin.fillOpacity}%</span>
          </div>

          <div className={styles.swatchLabel}>Форма</div>
          <div className={styles.textureChips}>
            {SHAPES.map((sh) => (
              <button
                key={sh.id}
                className={`${styles.textureChip} ${pin.shape === sh.id ? styles.textureChipActive : ''}`}
                onClick={() => updatePin(pin.id, 'shape', sh.id)}
              >
                {sh.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Which typeface the note is set in. Every row is rendered in the font it
// names, because a list of font names in one font tells you nothing.
function FontSubmenu({ pin }: { pin: NotePinT }) {
  const [open, setOpen] = useState(false)
  const updatePin = useBoardStore((s) => s.updatePin)
  const current = pin.font ?? (HUD_STYLES.has(pin.style ?? 'sticky') ? 'mono' : 'default')

  return (
    <div className={styles.submenuWrap}>
      <button className={styles.item} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.itemIcon}><Type size={13} /></span>
        Шрифт
        <span className={styles.submenuChevron}><ChevronRight size={13} /></span>
      </button>
      {open && (
        <div className={styles.submenu}>
          {NOTE_FONTS.map((f) => (
            <button
              key={f.id}
              className={`${styles.item} ${current === f.id ? styles.itemActive : ''}`}
              style={{ fontFamily: f.css }}
              onClick={() => updatePin(pin.id, 'font', f.id)}
            >
              <span className={styles.itemIcon}>{current === f.id ? <Check size={13} /> : null}</span>
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function ColorSubmenu({ pin }: { pin: NotePinT }) {
  const [open, setOpen] = useState(false)
  const updatePin = useBoardStore((s) => s.updatePin)

  // Changes apply live and stay open — picking a colour is a "try it and
  // look" action, and closing the menu on every click would mean reopening
  // it for each attempt.
  const setColor = (value: string) => updatePin(pin.id, 'color', value)
  const setTextColor = (value: string) => updatePin(pin.id, 'textColor', value)

  return (
    <div className={styles.submenuWrap}>
      <button className={styles.item} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className={styles.itemIcon}><Palette size={13} /></span>
        Цвет
        <span className={styles.submenuChevron}><ChevronRight size={13} /></span>
      </button>
      {open && (
        <div className={styles.submenu}>
          <div className={styles.swatchLabel}>Фон</div>
          <div className={styles.swatches}>
            {NOTE_COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.swatch} ${pin.color.toLowerCase() === c ? styles.swatchActive : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={`Фон ${c}`}
                onClick={() => setColor(c)}
              />
            ))}
            <label className={styles.swatchCustom} title="Свой цвет">
              <Pipette size={12} />
              <input type="color" value={pin.color} onChange={(e) => setColor(e.target.value)} />
            </label>
          </div>

          <div className={styles.swatchLabel}>Вид</div>
          <div className={styles.textureChips}>
            {NOTE_STYLES.map((st) => (
              <button
                key={st.id}
                className={`${styles.textureChip} ${(pin.style ?? 'sticky') === st.id ? styles.textureChipActive : ''}`}
                onClick={() => updatePin(pin.id, 'style', st.id)}
              >
                {st.label}
              </button>
            ))}
          </div>

          <div className={styles.swatchLabel}>Бумага</div>
          <div className={styles.textureChips}>
            {NOTE_TEXTURES.map((t) => (
              <button
                key={t.id}
                className={`${styles.textureChip} ${pin.texture === t.id ? styles.textureChipActive : ''}`}
                onClick={() => updatePin(pin.id, 'texture', t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className={styles.swatchLabel}>Текст</div>
          <div className={styles.swatches}>
            <button
              className={`${styles.swatch} ${styles.swatchAuto} ${!pin.textColor ? styles.swatchActive : ''}`}
              title="Автоматически по фону"
              aria-label="Цвет текста автоматически"
              onClick={() => updatePin(pin.id, 'textColor', undefined)}
            >
              A
            </button>
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                className={`${styles.swatch} ${pin.textColor?.toLowerCase() === c ? styles.swatchActive : ''}`}
                style={{ background: c }}
                title={c}
                aria-label={`Текст ${c}`}
                onClick={() => setTextColor(c)}
              />
            ))}
            <label className={styles.swatchCustom} title="Свой цвет">
              <Pipette size={12} />
              <input
                type="color"
                value={pin.textColor ?? readableOn(pin.color)}
                onChange={(e) => setTextColor(e.target.value)}
              />
            </label>
          </div>
        </div>
      )}
    </div>
  )
}

// WebDAV rejects these outright and davUrl refuses path segments, so a
// note titled "TODO: 12/09" would otherwise fail to save with a raw error.
function sanitizeName(name: string): string {
  return name.replace(/[\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
}

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