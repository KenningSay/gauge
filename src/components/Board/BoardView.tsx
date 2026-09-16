// Root container for the "Доски" tab. Owns:
//   - loading the board index on mount
//   - reconciling persisted tabs against what actually exists on disk
//   - the create-board flow (dialog → board API → open tab)
//   - rendering the active board's canvas + AI panel
//
// The canvas itself is BoardCanvas (next deliverable). Until that lands,
// BoardView renders the tab bar and a placeholder — the file compiles
// standalone so integration wiring can be verified before the canvas is
// written.

import { useCallback, useEffect, useState } from 'react'
import { Plus, Loader2, AlertCircle } from 'lucide-react'
import type { BoardIndex, BoardMeta, Pin } from '../../api/board'
import * as boardApi from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useBoardTabsStore } from '../../store/useBoardTabsStore'
import { useUiStore } from '../../store/useUiStore'
import {
  BUILT_IN_TEMPLATES,
  createEmptyBoard,
  instantiateBuiltInTemplate,
  isBuiltInTemplate,
} from '../../utils/boardDefaults'
import { BoardTabs } from './BoardTabs'
import { BoardCanvas } from './BoardCanvas'
import { AiPanel } from './AiPanel'
import styles from './BoardView.module.css'

// Tracks the tab list in memory across mounts of BoardView (switching
// away to Files and back shouldn't re-fetch the index if nothing changed).
// The index is small (~50 boards max realistically) so an in-memory cache
// is trivially correct; invalidation happens on explicit create/delete.
let cachedIndex: BoardIndex | null = null

interface CreateDialogState {
  open: boolean
  name: string
  templateId: string
}

export function BoardView() {
  const [index, setIndex] = useState<BoardIndex | null>(cachedIndex)
  const [loading, setLoading] = useState(!cachedIndex)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [createDialog, setCreateDialog] = useState<CreateDialogState>({
    open: false,
    name: '',
    templateId: 'builtin-empty',
  })
  const [userTemplates, setUserTemplates] = useState<{ id: string; name: string }[]>([])

  const openIds = useBoardTabsStore((s) => s.openIds)
  const activeId = useBoardTabsStore((s) => s.activeId)
  const openTab = useBoardTabsStore((s) => s.openTab)
  const setActive = useBoardTabsStore((s) => s.setActive)
  const reconcile = useBoardTabsStore((s) => s.reconcile)

  const board = useBoardStore((s) => s.board)
  const loadBoard = useBoardStore((s) => s.loadBoard)
  const unloadBoard = useBoardStore((s) => s.unloadBoard)
  const saveState = useBoardStore((s) => s.saveState)
  const saveError = useBoardStore((s) => s.saveError)

  const promptDialog = useUiStore((s) => s.promptDialog)
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const pushToast = useUiStore((s) => s.pushToast)

  // ---- initial load ----

  const loadIndex = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      await boardApi.bootstrap()
      let idx: BoardIndex
      try {
        idx = await boardApi.loadBoardIndex()
      } catch {
        // Missing or malformed _index.json — rebuild it from whatever
        // *.json files actually exist in the boards-index folder. This is
        // the recovery path for a user who hand-edited the vault, or for
        // the very first time the index file was expected.
        const ids = await boardApi.listBoardIdsOnDisk()
        const boards: BoardMeta[] = []
        for (const id of ids) {
          try {
            const loaded = await boardApi.loadBoard(id)
            if (!loaded) continue
            boards.push({
              id: loaded.board.id,
              name: loaded.board.name,
              createdAt: loaded.board.createdAt,
              updatedAt: loaded.board.updatedAt,
            })
          } catch {
            // Skip a board whose file is unreadable — one bad file
            // shouldn't hide every other board.
          }
        }
        idx = { version: 1, boards }
        await boardApi.saveBoardIndex(idx)
      }
      cachedIndex = idx
      setIndex(idx)
      reconcile(idx.boards.map((b) => b.id))
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [reconcile])

  useEffect(() => {
    if (!cachedIndex) void loadIndex()
  }, [loadIndex])

  // ---- load active board ----

  useEffect(() => {
    if (!activeId) {
      if (board) unloadBoard()
      return
    }
    if (board?.id === activeId) return
    void loadBoard(activeId).catch((e) => {
      pushToast(`Не удалось открыть доску: ${e instanceof Error ? e.message : String(e)}`, 'error')
    })
  }, [activeId, board, loadBoard, unloadBoard, pushToast])

  // ---- user templates ----

  const loadUserTemplates = useCallback(async () => {
    try {
      const tIndex = await boardApi.loadTemplateIndex()
      setUserTemplates(tIndex.templates.map((t) => ({ id: t.id, name: t.name })))
    } catch {
      // A missing/broken template index just means no user templates to
      // offer — not an error worth a toast.
      setUserTemplates([])
    }
  }, [])

  useEffect(() => {
    void loadUserTemplates()
  }, [loadUserTemplates])

  // ---- create board ----

  const handleOpenCreateDialog = () => {
    setCreateDialog({ open: true, name: '', templateId: 'builtin-empty' })
  }

  const handleCreate = async () => {
    const name = createDialog.name.trim() || 'Новая доска'
    const templateId = createDialog.templateId
    setCreateDialog((s) => ({ ...s, open: false }))
    try {
      const newBoard = isBuiltInTemplate(templateId)
        ? instantiateBuiltInTemplate(templateId, crypto.randomUUID(), name)
        : await buildFromUserTemplate(templateId, name)
      await boardApi.bootstrap()
      await boardApi.saveBoard(newBoard)
      const idx = await boardApi.loadBoardIndex()
      idx.boards.push({
        id: newBoard.id,
        name: newBoard.name,
        createdAt: newBoard.createdAt,
        updatedAt: newBoard.updatedAt,
      })
      await boardApi.saveBoardIndex(idx)
      cachedIndex = idx
      setIndex(idx)
      openTab(newBoard.id)
      pushToast(`Доска «${name}» создана`)
    } catch (e) {
      pushToast(`Не удалось создать доску: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  // ---- delete board ----

  const handleDeleteBoard = async (id: string, name: string) => {
    const ok = await confirmDialog(`Удалить доску «${name}»?`)
    if (!ok) return
    const deleteAssets = await confirmDialog(
      'Удалить вместе с файлами доски?\n\nОК — удалить доску и все её файлы.\nОтмена — удалить только доску (файлы останутся).',
    )
    try {
      await boardApi.deleteBoard(id, { deleteAssets })
      const idx = await boardApi.loadBoardIndex()
      idx.boards = idx.boards.filter((b) => b.id !== id)
      await boardApi.saveBoardIndex(idx)
      cachedIndex = idx
      setIndex(idx)
      useBoardTabsStore.getState().removeBoard(id)
      if (board?.id === id) unloadBoard()
      pushToast(`Доска «${name}» удалена`)
    } catch (e) {
      pushToast(`Не удалось удалить: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  // ---- rename board ----

  const handleRenameBoard = async (id: string, currentName: string) => {
    const newName = await promptDialog('Новое имя доски', currentName)
    if (!newName || newName === currentName) return
    try {
      const loaded = await boardApi.loadBoard(id)
      if (!loaded) {
        pushToast('Доска не найдена', 'error')
        return
      }
      loaded.board.name = newName
      await boardApi.saveBoard(loaded.board)
      const idx = await boardApi.loadBoardIndex()
      const meta = idx.boards.find((b) => b.id === id)
      if (meta) meta.name = newName
      await boardApi.saveBoardIndex(idx)
      cachedIndex = idx
      setIndex(idx)
      // If this board is currently open, reflect the new name in the store
      // too — the store holds its own copy of the Board object.
      if (board?.id === id) {
        useBoardStore.setState({ board: { ...board, name: newName } })
      }
    } catch (e) {
      pushToast(`Не удалось переименовать: ${e instanceof Error ? e.message : String(e)}`, 'error')
    }
  }

  // ---- rendering ----

  if (loading) {
    return (
      <div className={styles.center}>
        <Loader2 size={28} className="spin" color="var(--signal)" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className={styles.center}>
        <AlertCircle size={28} color="var(--danger)" />
        <div style={{ marginTop: 12, color: 'var(--text-dim)' }}>
          Не удалось загрузить доски: {loadError}
        </div>
        <button className={styles.retryBtn} onClick={() => void loadIndex()}>
          Повторить
        </button>
      </div>
    )
  }

  const hasBoards = (index?.boards.length ?? 0) > 0

  return (
    <div className={styles.wrap}>
      <BoardTabs
        boards={index?.boards ?? []}
        openIds={openIds}
        activeId={activeId}
        onActivate={setActive}
        onClose={(id) => useBoardTabsStore.getState().closeTab(id)}
        onRename={handleRenameBoard}
        onDelete={handleDeleteBoard}
        onCreate={handleOpenCreateDialog}
        onOpenExisting={openTab}
      />

      <div className={styles.body}>
        {!hasBoards && !activeId && (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Пока нет ни одной доски</div>
            <div className={styles.emptyHint}>
              Доска — это бесконечный холст для заметок, картинок, видео и ссылок.
            </div>
            <button className={styles.primaryBtn} onClick={handleOpenCreateDialog}>
              <Plus size={16} /> Создать первую доску
            </button>
          </div>
        )}

        {activeId && board?.id === activeId && (
          <>
            <BoardCanvas />
            <AiPanel />
          </>
        )}

        {activeId && (!board || board.id !== activeId) && (
          <div className={styles.center}>
            <Loader2 size={24} className="spin" color="var(--signal)" />
          </div>
        )}
      </div>

      <BoardSaveIndicator saveState={saveState} saveError={saveError} />

      {createDialog.open && (
        <CreateBoardDialog
          state={createDialog}
          userTemplates={userTemplates}
          onCancel={() => setCreateDialog((s) => ({ ...s, open: false }))}
          onChange={(patch) => setCreateDialog((s) => ({ ...s, ...patch }))}
          onConfirm={handleCreate}
        />
      )}
    </div>
  )
}

// ---------- Create dialog ----------

interface CreateDialogProps {
  state: CreateDialogState
  userTemplates: { id: string; name: string }[]
  onCancel: () => void
  onChange: (patch: Partial<CreateDialogState>) => void
  onConfirm: () => void
}

function CreateBoardDialog({ state, userTemplates, onCancel, onChange, onConfirm }: CreateDialogProps) {
  // focus trap — same convention as the existing Dialog.tsx, but a
  // self-contained modal so the board's create form can have its own
  // layout (name input + template picker) that doesn't map cleanly onto
  // the shared confirm/prompt component.
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onCancel()
    if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault()
      onConfirm()
    }
  }
  return (
    <div className={styles.dialogOverlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <div className={styles.dialogTitle}>Новая доска</div>
        <label className={styles.fieldLabel}>
          Имя
          <input
            className={styles.fieldInput}
            value={state.name}
            autoFocus
            placeholder="Новая доска"
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </label>
        <div className={styles.fieldLabel}>Шаблон</div>
        <div className={styles.templateList}>
          {BUILT_IN_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className={`${styles.templateBtn} ${state.templateId === t.id ? styles.templateActive : ''}`}
              onClick={() => onChange({ templateId: t.id })}
            >
              {t.name}
            </button>
          ))}
          {userTemplates.map((t) => (
            <button
              key={t.id}
              className={`${styles.templateBtn} ${state.templateId === t.id ? styles.templateActive : ''}`}
              onClick={() => onChange({ templateId: t.id })}
            >
              {t.name}
            </button>
          ))}
        </div>
        <div className={styles.dialogActions}>
          <button className={styles.secondaryBtn} onClick={onCancel}>
            Отмена
          </button>
          <button className={styles.primaryBtn} onClick={onConfirm}>
            Создать
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Save indicator ----------

function BoardSaveIndicator({ saveState, saveError }: { saveState: string; saveError: string | null }) {
  const dotClass =
    saveState === 'saved'
      ? styles.dotGreen
      : saveState === 'saving' || saveState === 'dirty'
        ? styles.dotYellow
        : saveState === 'error' || saveState === 'conflict'
          ? styles.dotRed
          : styles.dotIdle
  const title =
    saveState === 'saving'
      ? 'Сохранение…'
      : saveState === 'saved'
        ? 'Сохранено'
        : saveState === 'dirty'
          ? 'Есть несохранённые изменения'
          : saveState === 'conflict'
            ? 'Доска изменена в другом месте'
            : saveState === 'error'
              ? saveError ?? 'Ошибка сохранения'
              : 'Сохранено'
  return (
    <div className={styles.saveIndicator} title={title}>
      <span className={`${styles.dot} ${dotClass}`} />
    </div>
  )
}

// ---------- helpers ----------

async function buildFromUserTemplate(templateId: string, boardName: string) {
  const template = await boardApi.loadTemplate(templateId)
  if (!template) throw new Error('Шаблон не найден')
  const fresh = createEmptyBoard(boardName, crypto.randomUUID())
  // Copy structural fields (pins, viewport, settings) but keep the new id
  // and name. Pins get fresh ids so undo history from the template doesn't
  // alias across instances.
  const idMap = new Map<string, string>()
  const pins: Pin[] = template.pins.map((p) => {
    const freshId = crypto.randomUUID()
    idMap.set(p.id, freshId)
    return { ...p, id: freshId }
  })
  // Rewrite sourceIds through the id map — a template pin that was an AI
  // result of other pins should still point at its (now-remapped) sources.
  const remappedPins = pins.map((p) =>
    p.sourceIds ? { ...p, sourceIds: p.sourceIds.map((sid) => idMap.get(sid) ?? sid) } : p,
  )
  fresh.pins = remappedPins
  fresh.viewport = { ...template.viewport }
  fresh.settings = { ...template.settings }
  // Assets are NOT copied here — the create flow in this component only
  // duplicates state. Template asset copying is a follow-up (see
  // boardApi.copyVaultAssetToBoard, currently unused by the UI). Boards
  // created from a user template will reference the template's asset
  // paths directly, which works as long as the template exists — this is
  // the known limitation documented in §4.9 of the handoff.
  return fresh
}