import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { User as FirebaseUser } from 'firebase/auth'
import { ColumnType, GridState } from '@/types'
import { ExploreCard, CardConfig } from './exploreTypes'
import { createEmptyGrid } from './gridHelpers'
import { computeColumnValues } from './formulaEval'

const MAX_UNDO = 20

function snapshot(grid: GridState): GridState {
  return {
    columns: grid.columns.map(c => ({ ...c })),
    rows: grid.rows.map(r => ({ ...r })),
  }
}

interface AbraStatStore {
  // Auth
  user: FirebaseUser | null
  setUser: (user: FirebaseUser | null) => void

  // Active dataset grid
  grid: GridState
  activeDatasetId: string | null
  activeDatasetName: string
  isDirty: boolean
  undoStack: GridState[]

  // Grid mutations
  setGrid: (grid: GridState) => void
  updateCell: (rowIndex: number, colId: string, value: string | number) => void
  addRow: (afterIndex?: number) => void
  deleteRows: (rowIndices: number[]) => void
  addColumn: (afterIndex?: number) => void
  deleteColumn: (colId: string) => void
  renameColumn: (colId: string, newName: string) => void
  setColumnType: (colId: string, type: ColumnType) => void
  addComputedColumn: (name: string, formula: string) => void
  undo: () => void

  setActiveDatasetId: (id: string | null) => void
  setActiveDatasetName: (name: string) => void
  markClean: () => void
  clearGrid: () => void

  // Column selection for analysis
  selectedColumnIds: string[]
  toggleColumnSelection: (colId: string) => void
  setSelectedColumnIds: (ids: string[]) => void

  // Explore canvas
  exploreCards: ExploreCard[]
  addExploreCard: (type: CardConfig['type'], position?: { x: number; y: number }) => void
  removeExploreCard: (id: string) => void
  updateExploreCard: (id: string, updates: Partial<Omit<ExploreCard, 'id'>>) => void
  purgeExploreStaleIds: (validIds: Set<string>) => void

  // Inference canvas (separate state, same canvas model)
  inferenceCards: ExploreCard[]
  addInferenceCard: (type: CardConfig['type'], position?: { x: number; y: number }) => void
  removeInferenceCard: (id: string) => void
  updateInferenceCard: (id: string, updates: Partial<Omit<ExploreCard, 'id'>>) => void
  purgeInferenceStaleIds: () => void
}

export const useStore = create<AbraStatStore>((set) => ({
  user: null,
  setUser: (user) => set({ user }),

  grid: createEmptyGrid(),
  activeDatasetId: null,
  activeDatasetName: '',
  isDirty: false,
  undoStack: [],

  setGrid: (grid) => set({ grid, isDirty: true, undoStack: [], selectedColumnIds: [] }),

  updateCell: (rowIndex, colId, value) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const rows = state.grid.rows.map((r, i) => i === rowIndex ? { ...r, [colId]: value } : r)
    return { grid: { ...state.grid, rows }, isDirty: true, undoStack: stack }
  }),

  addRow: (afterIndex) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const emptyRow = Object.fromEntries(state.grid.columns.map(c => [c.id, '']))
    const idx = afterIndex !== undefined ? afterIndex + 1 : state.grid.rows.length
    const rows = [...state.grid.rows.slice(0, idx), emptyRow, ...state.grid.rows.slice(idx)]
    return { grid: { ...state.grid, rows }, isDirty: true, undoStack: stack }
  }),

  deleteRows: (rowIndices) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const indexSet = new Set(rowIndices)
    const rows = state.grid.rows.filter((_, i) => !indexSet.has(i))
    return { grid: { ...state.grid, rows }, isDirty: true, undoStack: stack }
  }),

  addColumn: (afterIndex) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const id = uuid()
    const existingNames = new Set(state.grid.columns.map(c => c.name))
    let n = state.grid.columns.length + 1
    while (existingNames.has(`var${n}`)) n++
    const newCol = { id, name: `var${n}`, type: 'numeric' as ColumnType }
    const idx = afterIndex !== undefined ? afterIndex + 1 : state.grid.columns.length
    const columns = [...state.grid.columns.slice(0, idx), newCol, ...state.grid.columns.slice(idx)]
    const rows = state.grid.rows.map(r => ({ ...r, [id]: '' }))
    return { grid: { columns, rows }, isDirty: true, undoStack: stack }
  }),

  deleteColumn: (colId) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = state.grid.columns.filter(c => c.id !== colId)
    const rows = state.grid.rows.map(r =>
      Object.fromEntries(Object.entries(r).filter(([k]) => k !== colId)) as Record<string, string | number>
    )
    const selectedColumnIds = state.selectedColumnIds.filter(id => id !== colId)
    return { grid: { columns, rows }, isDirty: true, undoStack: stack, selectedColumnIds }
  }),

  renameColumn: (colId, newName) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = state.grid.columns.map(c => c.id === colId ? { ...c, name: newName } : c)
    return { grid: { ...state.grid, columns }, isDirty: true, undoStack: stack }
  }),

  setColumnType: (colId, type) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = state.grid.columns.map(c => c.id === colId ? { ...c, type } : c)
    return { grid: { ...state.grid, columns }, isDirty: true, undoStack: stack }
  }),

  addComputedColumn: (name, formula) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const id = uuid()
    const newCol = { id, name, type: 'numeric' as ColumnType, computedFormula: formula }
    const columns = [...state.grid.columns, newCol]
    const values = computeColumnValues(formula, state.grid.columns, state.grid.rows)
    const rows = state.grid.rows.map((r, i) => ({ ...r, [id]: values[i] ?? '' }))
    return { grid: { columns, rows }, isDirty: true, undoStack: stack }
  }),

  undo: () => set(state => {
    if (state.undoStack.length === 0) return state
    const undoStack = [...state.undoStack]
    const grid = undoStack.pop()!
    return { grid, undoStack, isDirty: true }
  }),

  setActiveDatasetId: (id) => set({ activeDatasetId: id }),
  setActiveDatasetName: (name) => set({ activeDatasetName: name }),
  markClean: () => set({ isDirty: false }),
  clearGrid: () => set({ grid: createEmptyGrid(), activeDatasetId: null, activeDatasetName: '', isDirty: false, undoStack: [], selectedColumnIds: [] }),

  // ─── Explore canvas ──────────────────────────────────────────────────────────
  exploreCards: [],
  addExploreCard: (type, position) => set(state => {
    const idx = state.exploreCards.length
    const x = position?.x ?? 20 + (idx % 2) * 660
    const y = position?.y ?? 20 + Math.floor(idx / 2) * 520
    const config: CardConfig =
      type === 'graph'      ? { type: 'graph',      xColId: null, yColId: null, groupColId: null } :
      type === 'summary'    ? { type: 'summary',     variableColIds: [], groupColId: null } :
      type === 'regression' ? { type: 'regression',  xColId: null, yColId: null } :
                               { type: 'table',       rowsColId: null, colsColId: null }
    return { exploreCards: [...state.exploreCards, { id: uuid(), config, x, y, width: 620, height: 520 }] }
  }),
  removeExploreCard: (id) => set(state => ({
    exploreCards: state.exploreCards.filter(c => c.id !== id),
  })),
  updateExploreCard: (id, updates) => set(state => ({
    exploreCards: state.exploreCards.map(c => c.id === id ? { ...c, ...updates } : c),
  })),
  purgeExploreStaleIds: (validIds) => set(state => ({
    exploreCards: state.exploreCards.map(card => {
      const nil = (id: string | null) => (id && !validIds.has(id) ? null : id)
      const cfg = card.config
      if (cfg.type === 'graph')      return { ...card, config: { ...cfg, xColId: nil(cfg.xColId), yColId: nil(cfg.yColId), groupColId: nil(cfg.groupColId) } }
      if (cfg.type === 'summary')    return { ...card, config: { ...cfg, variableColIds: cfg.variableColIds.filter(id => validIds.has(id)), groupColId: nil(cfg.groupColId) } }
      if (cfg.type === 'table')      return { ...card, config: { ...cfg, rowsColId: nil(cfg.rowsColId), colsColId: nil(cfg.colsColId) } }
      if (cfg.type === 'regression') return { ...card, config: { ...cfg, xColId: nil(cfg.xColId), yColId: nil(cfg.yColId) } }
      return card
    }),
  })),

  // ─── Inference canvas ────────────────────────────────────────────────────────
  inferenceCards: [],
  addInferenceCard: (type, position) => set(state => {
    const idx = state.inferenceCards.length
    const x = position?.x ?? 20 + (idx % 2) * 660
    const y = position?.y ?? 20 + Math.floor(idx / 2) * 520
    const config: CardConfig =
      type === 'distribution' ? { type: 'distribution' } :
      type === 'testinterval' ? { type: 'testinterval' } :
                                 { type: 'simulation' }
    return { inferenceCards: [...state.inferenceCards, { id: uuid(), config, x, y, width: 620, height: 520 }] }
  }),
  removeInferenceCard: (id) => set(state => ({
    inferenceCards: state.inferenceCards.filter(c => c.id !== id),
  })),
  updateInferenceCard: (id, updates) => set(state => ({
    inferenceCards: state.inferenceCards.map(c => c.id === id ? { ...c, ...updates } : c),
  })),
  purgeInferenceStaleIds: () => set(state => ({
    // Inference cards in their current scaffolded form don't hold column references,
    // so purging is a no-op. Implement when inference cards gain column bindings.
    inferenceCards: state.inferenceCards,
  })),

  selectedColumnIds: [],
  toggleColumnSelection: (colId) => set(state => {
    const ids = state.selectedColumnIds.includes(colId)
      ? state.selectedColumnIds.filter(id => id !== colId)
      : [...state.selectedColumnIds, colId]
    return { selectedColumnIds: ids }
  }),
  setSelectedColumnIds: (ids) => set({ selectedColumnIds: ids }),
}))
