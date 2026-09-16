// A small floating toolbar for creating things on the board.
//
// Everything here was already reachable from the right-click menu, which is
// fine once you know it and invisible until you do — an empty board with no
// visible way to put anything on it is a dead end. Placed bottom-centre,
// out of the way of the tab strip and the AI panel, the way most canvas
// tools place theirs.

import { useState } from 'react'
import { StickyNote, FileText, Link as LinkIcon, Square, Circle, Diamond, Triangle } from 'lucide-react'
import type { ShapeKind } from '../../api/board'
import styles from './BoardToolbar.module.css'

interface Props {
  // Hides the connection hint once the user has made some — it's an
  // onboarding line, not a permanent label.
  hasEdges: boolean
  onCreateNote: () => void
  onCreateVaultNote: () => void
  onCreateLink: () => void
  onCreateShape: (kind: ShapeKind) => void
}

const SHAPES: Array<{ id: ShapeKind; label: string; icon: React.ReactNode }> = [
  { id: 'rect', label: 'Прямоугольник', icon: <Square size={16} /> },
  { id: 'ellipse', label: 'Овал', icon: <Circle size={16} /> },
  { id: 'diamond', label: 'Ромб', icon: <Diamond size={16} /> },
  { id: 'triangle', label: 'Треугольник', icon: <Triangle size={16} /> },
]

export function BoardToolbar({ hasEdges, onCreateNote, onCreateVaultNote, onCreateLink, onCreateShape }: Props) {
  const [shapesOpen, setShapesOpen] = useState(false)

  return (
    <div className={styles.wrap}>
      {!hasEdges && (
        <div className={styles.hint}>Потяни точку на краю карточки, чтобы связать её с другой</div>
      )}
      {shapesOpen && (
        <div className={styles.shapes} onPointerLeave={() => setShapesOpen(false)}>
          {SHAPES.map((s) => (
            <button
              key={s.id}
              className={styles.shapeBtn}
              title={s.label}
              aria-label={s.label}
              onClick={() => {
                onCreateShape(s.id)
                setShapesOpen(false)
              }}
            >
              {s.icon}
            </button>
          ))}
        </div>
      )}

      <div className={styles.bar}>
        <button className={styles.btn} title="Заметка" aria-label="Создать заметку" onClick={onCreateNote}>
          <StickyNote size={17} />
        </button>
        <button
          className={styles.btn}
          title="Заметка из хранилища (.md)"
          aria-label="Заметка из хранилища"
          onClick={onCreateVaultNote}
        >
          <FileText size={17} />
        </button>
        <button className={styles.btn} title="Ссылка" aria-label="Создать ссылку" onClick={onCreateLink}>
          <LinkIcon size={17} />
        </button>

        <span className={styles.sep} />

        <button
          className={`${styles.btn} ${shapesOpen ? styles.btnActive : ''}`}
          title="Фигура"
          aria-label="Создать фигуру"
          aria-expanded={shapesOpen}
          onClick={() => setShapesOpen((v) => !v)}
        >
          <Square size={17} />
        </button>
      </div>

    </div>
  )
}
