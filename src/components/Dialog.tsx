import { useState } from 'react'
import { useUiStore } from '../store/useUiStore'
import styles from './Dialog.module.css'

export function Dialog() {
  const dialog = useUiStore((s) => s.dialog)
  const resolveDialog = useUiStore((s) => s.resolveDialog)
  const [value, setValue] = useState('')

  if (!dialog) return null

  const isPrompt = dialog.kind === 'prompt'

  return (
    <div className={styles.overlay} onClick={() => resolveDialog(isPrompt ? null : false)}>
      <div
        className={styles.box}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') resolveDialog(isPrompt ? (value || dialog.defaultValue || '') : true)
          if (e.key === 'Escape') resolveDialog(isPrompt ? null : false)
        }}
      >
        <div className={styles.message}>{dialog.message}</div>
        {isPrompt && (
          <input
            autoFocus
            className={styles.input}
            defaultValue={dialog.defaultValue}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.target.select()}
          />
        )}
        <div className={styles.actions}>
          <button className={styles.btn} onClick={() => resolveDialog(isPrompt ? null : false)}>
            Отмена
          </button>
          <button
            className={isPrompt ? styles.btnPrimary : styles.btnDanger}
            autoFocus={!isPrompt}
            onClick={() => resolveDialog(isPrompt ? (value || dialog.defaultValue || '') : true)}
          >
            {isPrompt ? 'Создать' : 'Удалить'}
          </button>
        </div>
      </div>
    </div>
  )
}
