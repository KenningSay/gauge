// Point-in-time versions of a board, and the button that brings one back.
//
// This exists because a board was lost. The server does not enforce
// If-Match (see webdav.ts), two clients autosaved over each other for an
// hour, and there was nothing underneath to fall back to — no snapshots, no
// container backup, and an op-log that had been overwritten alongside the
// state it described. Conflict detection now catches that case, but
// detection is a promise about the future; this list is the part that also
// covers the failures nobody predicted.
//
// A version is previewed before it is restored: "12 заметок" next to a
// timestamp is what tells you whether this is the one you want, and it
// costs one GET to find out.

import { useCallback, useEffect, useState } from 'react'
import { History, Loader2, RotateCcw, Shield, Trash2 } from 'lucide-react'
import * as boardApi from '../../api/board'
import type { BackupEntry } from '../../api/board'
import { useBoardStore } from '../../store/useBoardStore'
import { useUiStore } from '../../store/useUiStore'
import styles from './BackupsDialog.module.css'

interface Props {
  boardId: string
  boardName: string
  onClose: () => void
}

const KIND_LABEL: Record<BackupEntry['kind'], string> = {
  auto: 'автосохранение',
  conflict: 'конфликт',
  manual: 'перед заменой',
}

function formatWhen(at: Date): string {
  return at.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  return `${Math.round(bytes / 1024)} КБ`
}

export function BackupsDialog({ boardId, boardName, onClose }: Props) {
  const [entries, setEntries] = useState<BackupEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // path -> pin count, filled in as previews load. Undefined means "not
  // fetched yet", null means "fetched and unreadable".
  const [counts, setCounts] = useState<Record<string, number | null>>({})
  const confirmDialog = useUiStore((s) => s.confirmDialog)
  const pushToast = useUiStore((s) => s.pushToast)

  const reload = useCallback(async () => {
    try {
      const list = await boardApi.listBackups(boardId)
      setEntries(list)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setEntries([])
    }
  }, [boardId])

  useEffect(() => {
    void reload()
  }, [reload])

  // Previews are fetched one at a time and only for what is on screen's
  // worth of versions. Forty parallel GETs against a home server on the
  // other end of a VPN is how you make a dialog feel broken.
  useEffect(() => {
    if (!entries) return
    let cancelled = false
    void (async () => {
      for (const e of entries.slice(0, 12)) {
        if (cancelled) return
        try {
          const b = await boardApi.loadBackup(e.path)
          if (cancelled) return
          setCounts((c) => ({ ...c, [e.path]: b.pins?.length ?? 0 }))
        } catch {
          if (cancelled) return
          setCounts((c) => ({ ...c, [e.path]: null }))
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [entries])

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const handleRestore = async (entry: BackupEntry) => {
    const n = counts[entry.path]
    const what = typeof n === 'number' ? ` (${n} шт.)` : ''
    const ok = await confirmDialog(
      `Восстановить версию от ${formatWhen(entry.at)}${what}?\n\n` +
        'Текущее состояние доски сохранится отдельной версией, так что откат можно отменить.',
    )
    if (!ok) return
    setBusy(entry.path)
    try {
      await useBoardStore.getState().restoreFromBackup(entry.path)
      onClose()
    } catch (e) {
      pushToast(`Не удалось восстановить: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (entry: BackupEntry) => {
    const ok = await confirmDialog(`Удалить версию от ${formatWhen(entry.at)}?`)
    if (!ok) return
    setBusy(entry.path)
    try {
      await boardApi.deleteBackup(entry.path)
      await reload()
    } catch (e) {
      pushToast(`Не удалось удалить: ${e instanceof Error ? e.message : String(e)}`, 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <History size={18} className={styles.headIcon} />
          <div className={styles.headText}>
            <div className={styles.title}>История версий</div>
            <div className={styles.subtitle}>{boardName}</div>
          </div>
        </div>

        <div className={styles.body}>
          {entries === null && (
            <div className={styles.center}>
              <Loader2 size={18} className={styles.spinner} /> Загрузка…
            </div>
          )}

          {error && <div className={styles.error}>Не удалось прочитать версии: {error}</div>}

          {entries?.length === 0 && !error && (
            <div className={styles.center}>
              <Shield size={18} />
              <div>
                Версий пока нет. Копия сохраняется автоматически каждые несколько минут работы
                над доской, а также перед любой заменой содержимого.
              </div>
            </div>
          )}

          {entries?.map((e) => {
            const n = counts[e.path]
            return (
              <div key={e.path} className={styles.row}>
                <div className={styles.rowMain}>
                  <div className={styles.when}>{formatWhen(e.at)}</div>
                  <div className={styles.meta}>
                    <span
                      className={e.kind === 'conflict' ? styles.kindAlert : styles.kind}
                    >
                      {KIND_LABEL[e.kind]}
                    </span>
                    <span className={styles.dot}>·</span>
                    <span>
                      {n === undefined ? '…' : n === null ? 'повреждена' : `${n} объектов`}
                    </span>
                    <span className={styles.dot}>·</span>
                    <span>{formatSize(e.size)}</span>
                  </div>
                </div>
                <div className={styles.rowActions}>
                  <button
                    className={styles.restoreBtn}
                    onClick={() => void handleRestore(e)}
                    disabled={busy !== null}
                    title="Восстановить эту версию"
                  >
                    {busy === e.path ? (
                      <Loader2 size={16} className={styles.spinner} />
                    ) : (
                      <RotateCcw size={16} />
                    )}
                    Восстановить
                  </button>
                  <button
                    className={styles.iconBtn}
                    onClick={() => void handleDelete(e)}
                    disabled={busy !== null}
                    title="Удалить версию"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className={styles.foot}>
          <button className={styles.closeBtn} onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}
