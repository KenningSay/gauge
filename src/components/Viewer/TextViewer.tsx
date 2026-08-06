import { useEffect, useState, useCallback } from 'react'
import { Save, Loader2 } from 'lucide-react'
import { getTextContent, putTextContent } from '../../api/webdav'
import type { FileEntry } from '../../api/types'
import styles from './TextViewer.module.css'

export function TextViewer({ entry }: { entry: FileEntry }) {
  const [content, setContent] = useState<string | null>(null)
  const [original, setOriginal] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setContent(null)
    setError(null)
    getTextContent(entry.path)
      .then((text) => {
        if (cancelled) return
        setContent(text)
        setOriginal(text)
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
    return () => { cancelled = true }
  }, [entry.path])

  const dirty = content !== null && content !== original

  const save = useCallback(async () => {
    if (content === null || !dirty) return
    setSaving(true)
    try {
      await putTextContent(entry.path, content)
      setOriginal(content)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }, [content, dirty, entry.path])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        save()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [save])

  return (
    <div className={styles.wrap} onClick={(e) => e.stopPropagation()}>
      <div className={styles.bar}>
        <span className={`${styles.status} ${dirty ? styles.dirty : ''}`}>
          {error ? `Ошибка: ${error}` : dirty ? 'Есть несохранённые изменения' : 'Сохранено'}
        </span>
        <button className={styles.saveBtn} disabled={!dirty || saving} onClick={save}>
          {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
          Сохранить
        </button>
      </div>
      {content === null ? (
        <div className={styles.loading}>{error ? 'Не удалось загрузить' : 'Загрузка…'}</div>
      ) : (
        <textarea
          className={styles.editor}
          value={content}
          spellCheck={false}
          onChange={(e) => setContent(e.target.value)}
        />
      )}
    </div>
  )
}
