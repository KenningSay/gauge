// Factory functions for a fresh board and the four built-in layout
// templates. Kept separate from boardApi.ts (which is pure storage) so
// the "what does a new board look like" question has exactly one answer.

import type {
  Board,
  BoardSettings,
  NotePin,
  Pin,
  TemplateMeta,
  Viewport,
} from '../api/board'
import { newId } from '../api/board'

export const DEFAULT_VIEWPORT: Viewport = { x: 0, y: 0, zoom: 1 }

export const DEFAULT_SETTINGS: BoardSettings = {
  snapEnabled: false,
  snapStep: 20,
  gridVisible: true,
  backgroundColor: '#1b1a18',
  backgroundTexture: 'dots',
}

// The four built-in starter layouts. Referenced by id in the "create new
// board" flow; a fifth entry "empty" (no pins) is implicit and doesn't
// need its own function since it's just a board with zero pins.
export const BUILT_IN_TEMPLATES: TemplateMeta[] = [
  { id: 'builtin-empty', name: 'Пусто', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'builtin-kanban', name: 'Канбан-сетка', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'builtin-grid3x3', name: 'Сетка 3×3', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'builtin-bignote', name: 'Большая заметка', createdAt: '2026-01-01T00:00:00.000Z' },
]

export function isBuiltInTemplate(id: string): boolean {
  return id.startsWith('builtin-')
}

// Fresh board with a given name and no pins — the "Пусто" template.
// The id is generated here; callers that already have an id (e.g. the
// dialog that creates the board and immediately opens it) pass it in.
export function createEmptyBoard(name: string, id?: string): Board {
  const now = new Date().toISOString()
  return {
    id: id ?? newId(),
    name: name.trim() || 'Без названия',
    createdAt: now,
    updatedAt: now,
    viewport: { ...DEFAULT_VIEWPORT },
    settings: { ...DEFAULT_SETTINGS },
    pins: [],
  }
}

// Built-in templates as full board structures. Not persisted — the user
// picking one in the "create" dialog gets the pins copied into their new
// board, and the template itself never touches WebDAV.
export function instantiateBuiltInTemplate(templateId: string, boardId: string, boardName: string): Board {
  const base = createEmptyBoard(boardName, boardId)
  switch (templateId) {
    case 'builtin-kanban': {
      const columns = ['Идеи', 'В работе', 'Готово']
      base.pins = columns.map((title, i) => makeHeaderNote(title, i * 300, 0))
      base.viewport = { x: -40, y: -40, zoom: 1 }
      return base
    }
    case 'builtin-grid3x3': {
      const pins: Pin[] = []
      let z = 1
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          pins.push(makeEmptyNote(col * 240, row * 240, z++))
        }
      }
      base.pins = pins
      return base
    }
    case 'builtin-bignote': {
      const big = makeEmptyNote(0, 0, 1)
      big.w = 640
      big.h = 400
      base.pins = [big]
      base.viewport = { x: -100, y: -100, zoom: 0.9 }
      return base
    }
    case 'builtin-empty':
    default:
      return base
  }
}

function makeHeaderNote(text: string, x: number, y: number): NotePin {
  const now = new Date().toISOString()
  return {
    id: newId(),
    type: 'note',
    x,
    y,
    w: 260,
    h: 80,
    z: 1,
    createdAt: now,
    updatedAt: now,
    text: `## ${text}`,
    color: '#fbbf24',
    opacity: 100,
    texture: 'plain',
  }
}

function makeEmptyNote(x: number, y: number, z: number): NotePin {
  const now = new Date().toISOString()
  return {
    id: newId(),
    type: 'note',
    x,
    y,
    w: 200,
    h: 200,
    z,
    createdAt: now,
    updatedAt: now,
    text: '',
    color: '#fbbf24',
    opacity: 90,
    texture: 'plain',
  }
}