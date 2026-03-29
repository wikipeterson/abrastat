import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { User as FirebaseUser } from 'firebase/auth'
import { ColumnType, GridState } from '@/types'
import { ExploreCard, CardConfig, DistributionPreFill } from './exploreTypes'
import { createEmptyGrid, getStringValues } from './gridHelpers'
import { computeColumnValues } from './formulaEval'

// ─── Chi-square context scanner ───────────────────────────────────────────────
// Scans the most recent Two-Way Table card for a chi² test statistic so the
// Distribution card can be pre-populated as a one-time snapshot.

function scanChiSquareContext(
  cards: ExploreCard[],
  grid: GridState,
): DistributionPreFill | undefined {
  const tableCard = [...cards].reverse().find(c => c.config.type === 'table')
  if (!tableCard || tableCard.config.type !== 'table') return undefined
  const { rowsColId, colsColId } = tableCard.config
  if (!rowsColId || !colsColId) return undefined

  const rowVals = getStringValues(grid, rowsColId).filter(v => v.trim())
  const colVals = getStringValues(grid, colsColId).filter(v => v.trim())
  if (rowVals.length < 2 || colVals.length < 2) return undefined

  // Build observed counts
  const rowLabels = [...new Set(rowVals)].sort()
  const colLabels = [...new Set(colVals)].sort()
  const O: number[][] = rowLabels.map(r =>
    colLabels.map(c => rowVals.filter((rv, i) => rv === r && colVals[i] === c).length)
  )
  const rowTotals = O.map(row => row.reduce((a, b) => a + b, 0))
  const colTotals = colLabels.map((_, ci) => O.reduce((sum, row) => sum + row[ci], 0))
  const grand = rowTotals.reduce((a, b) => a + b, 0)
  if (grand === 0) return undefined

  let chiSq = 0
  for (let ri = 0; ri < rowLabels.length; ri++) {
    for (let ci = 0; ci < colLabels.length; ci++) {
      const expected = (rowTotals[ri] * colTotals[ci]) / grand
      if (expected > 0) chiSq += Math.pow(O[ri][ci] - expected, 2) / expected
    }
  }
  const df = (rowLabels.length - 1) * (colLabels.length - 1)
  if (df < 1 || !isFinite(chiSq)) return undefined

  return {
    dist: 'chi2',
    df,
    calcMode: 'area',
    areaTail: 'right',
    bound: parseFloat(chiSq.toFixed(4)),
    sourceLabel: 'Two-Way Table',
  }
}

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
  reorderColumns: (fromIndex: number, toIndex: number) => void
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

  reorderColumns: (fromIndex, toIndex) => set(state => {
    if (fromIndex === toIndex) return state
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = [...state.grid.columns]
    const [moved] = columns.splice(fromIndex, 1)
    columns.splice(toIndex, 0, moved)
    // rows are keyed by column ID so no row data changes
    return { grid: { ...state.grid, columns }, isDirty: true, undoStack: stack }
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
      type === 'graph'        ? { type: 'graph',       xColId: null, yColId: null, groupColId: null } :
      type === 'summary'      ? { type: 'summary',     variableColIds: [], groupColId: null } :
      type === 'table'        ? { type: 'table',       rowsColId: null, colsColId: null } :
      type === 'regression'   ? { type: 'regression',  xColId: null, yColId: null } :
      type === 'distribution' ? { type: 'distribution', preFill: scanChiSquareContext(state.exploreCards, state.grid) } :
      type === 'generator'    ? { type: 'generator' } :
      type === 'testinterval' ? { type: 'testinterval' } :
                                 { type: 'simulation' }
    const { width, height } =
      type === 'table'   ? { width: 780, height: 520 } :
      type === 'summary' ? { width: 700, height: 620 } :
                           { width: 620, height: 520 }
    return { exploreCards: [...state.exploreCards, { id: uuid(), config, x, y, width, height }] }
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

  // ─── Inference canvas (legacy, currently unused) ────────────────────────────
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
