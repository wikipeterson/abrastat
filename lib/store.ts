import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { User as FirebaseUser } from 'firebase/auth'
import { ColumnType, GridState } from '@/types'
import { ExploreCard, CardConfig, DistributionPreFill, GraphCardConfig, SimResultsCardConfig, TableOutputCardConfig } from './exploreTypes'
import { createEmptyGrid } from './gridHelpers'
import { computeColumnValues } from './formulaEval'

function getDataGridCardWidth(columnCount: number) {
  return Math.max(620, 48 + columnCount * 140 + 32)
}

function createDataGridCard(): ExploreCard {
  return {
    id: uuid(),
    config: { type: 'data-grid' },
    x: 20,
    y: 20,
    width: getDataGridCardWidth(4),
    height: 760,
  }
}

function deriveSimValue(
  roll: number[],
  trackedMode: 'sum' | 'difference',
  valueMode: 'count' | 'proportion' = 'count',
): number | null {
  if (valueMode === 'proportion') {
    if (roll.length === 0) return null
    const heads = roll.reduce((sum, value) => sum + value, 0)
    return (heads / roll.length) * 100
  }
  if (trackedMode === 'sum') {
    return roll.reduce((sum, value) => sum + value, 0)
  }
  if (trackedMode === 'difference' && roll.length === 2) {
    return Math.abs(roll[0] - roll[1])
  }
  return null
}

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

  // Use complete cases: only rows where BOTH values are non-blank
  const pairs = grid.rows
    .map(r => [String(r[rowsColId] ?? '').trim(), String(r[colsColId] ?? '').trim()] as [string, string])
    .filter(([a, b]) => a !== '' && b !== '')
  const rowVals = pairs.map(p => p[0])
  const colVals = pairs.map(p => p[1])
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
  setColumnWidth: (colId: string, width: number) => void
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
  ensureDataGridCard: () => void
  removeExploreCard: (id: string) => void
  updateExploreCard: (id: string, updates: Partial<Omit<ExploreCard, 'id'>>) => void
  purgeExploreStaleIds: (validIds: Set<string>) => void
  addSimResultsCard: (
    sourceCardId: string,
    trackedMode: 'sum' | 'difference',
    position: { x: number; y: number },
    sourceLabel: string,
    range: { minValue: number; maxValue: number },
    valueLabel?: string,
  ) => string
  addLinkedGraphCard: (
    config: GraphCardConfig,
    position: { x: number; y: number },
  ) => string
  addLinkedTableCard: (
    config: TableOutputCardConfig,
    position: { x: number; y: number },
  ) => string
  pushSimResult: (cardId: string, roll: number[]) => void
  pushSimResultsBatch: (cardId: string, rolls: number[][]) => void
  clearSimResults: (cardId: string) => void

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
    const newCol = { id, name: `var${n}`, type: 'numeric' as ColumnType, width: 140 }
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

  setColumnWidth: (colId, width) => set(state => {
    const nextWidth = Math.max(92, Math.min(360, Math.round(width)))
    const current = state.grid.columns.find(c => c.id === colId)?.width ?? 140
    if (current === nextWidth) return state
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = state.grid.columns.map(c => c.id === colId ? { ...c, width: nextWidth } : c)
    return { grid: { ...state.grid, columns }, isDirty: true, undoStack: stack }
  }),

  addComputedColumn: (name, formula) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const id = uuid()
    const newCol = { id, name, type: 'numeric' as ColumnType, computedFormula: formula, width: 140 }
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
  clearGrid: () => set({
    grid: createEmptyGrid(),
    activeDatasetId: null,
    activeDatasetName: '',
    isDirty: false,
    undoStack: [],
    selectedColumnIds: [],
    exploreCards: [createDataGridCard()],
  }),

  // ─── Explore canvas ──────────────────────────────────────────────────────────
  exploreCards: [createDataGridCard()],
  addExploreCard: (type, position) => set(state => {
    const analysisCards = state.exploreCards.filter(card => card.config.type !== 'data-grid')
    const idx = analysisCards.length
    const x = position?.x ?? 1040 + (idx % 2) * 500
    const y = position?.y ?? 24 + Math.floor(idx / 2) * 520
    const config: CardConfig =
      type === 'data-grid'    ? { type: 'data-grid' } :
      type === 'graph'        ? { type: 'graph',       xColId: null, yColId: null, groupColId: null } :
      type === 'summary'      ? { type: 'summary',     variableColIds: [], groupColId: null } :
      type === 'table'        ? { type: 'table',       rowsColId: null, colsColId: null } :
      type === 'regression'   ? { type: 'regression',  xColId: null, yColId: null } :
      type === 'distribution' ? { type: 'distribution', preFill: scanChiSquareContext(state.exploreCards, state.grid) } :
      type === 'generator'    ? { type: 'generator' } :
      type === 'testinterval' ? { type: 'testinterval' } :
      type === 'means'        ? { type: 'means', var1ColId: null, var2ColId: null } :
      type === 'dice-roller'  ? { type: 'dice-roller', linkedResultsCardId: null, trackedMode: 'sum' } :
      type === 'sim-results'  ? { type: 'sim-results', sourceCardId: '', sourceLabel: '', trackedMode: 'sum', valueMode: 'count', supportsDifference: false, minValue: 1, maxValue: 6, rolls: [], values: [] } :
                                 { type: 'simulation', linkedResultsCardId: null }
    const { width, height } =
      type === 'summary' ? { width: 700, height: 620 } :
      type === 'means'   ? { width: 580, height: 580 } :
      type === 'dice-roller' ? { width: 760, height: 700 } :
                           { width: 620, height: 520 }
    return { exploreCards: [...state.exploreCards, { id: uuid(), config, x, y, width, height }] }
  }),
  ensureDataGridCard: () => set(state => {
    if (state.exploreCards.some(card => card.config.type === 'data-grid')) return state
    return { exploreCards: [createDataGridCard(), ...state.exploreCards] }
  }),
  removeExploreCard: (id) => set(state => ({
    exploreCards: state.exploreCards.filter(c => c.id !== id || c.config.type === 'data-grid'),
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
      if (cfg.type === 'means')      return { ...card, config: { ...cfg, var1ColId: nil(cfg.var1ColId), var2ColId: nil(cfg.var2ColId) } }
      return card
    }),
  })),
  addSimResultsCard: (sourceCardId, trackedMode, position, sourceLabel, range, valueLabel) => {
    const id = uuid()
    set(state => ({
      exploreCards: [...state.exploreCards, {
        id,
        config: {
          type: 'sim-results',
          sourceCardId,
          sourceLabel,
          valueLabel,
          trackedMode,
          valueMode: 'count',
          supportsDifference: trackedMode === 'difference',
          minValue: range.minValue,
          maxValue: range.maxValue,
          rolls: [],
          values: [],
        } as SimResultsCardConfig,
        x: position.x,
        y: position.y,
        width: 500,
        height: 560,
      }],
    }))
    return id
  },
  addLinkedGraphCard: (config, position) => {
    const id = uuid()
    set(state => ({
      exploreCards: [...state.exploreCards, {
        id,
        config,
        x: position.x,
        y: position.y,
        width: 620,
        height: 520,
      }],
    }))
    return id
  },
  addLinkedTableCard: (config, position) => {
    const id = uuid()
    set(state => ({
      exploreCards: [...state.exploreCards, {
        id,
        config,
        x: position.x,
        y: position.y,
        width: 620,
        height: 520,
      }],
    }))
    return id
  },
  pushSimResult: (cardId, roll) => set(state => ({
    exploreCards: state.exploreCards.map(c =>
      c.id === cardId && c.config.type === 'sim-results'
        ? (() => {
            const cfg = c.config as SimResultsCardConfig
            const derived = deriveSimValue(roll, cfg.trackedMode, cfg.valueMode)
            if (derived == null) return c
            return {
              ...c,
              config: {
                ...cfg,
                rolls: [...cfg.rolls, roll],
                values: [...cfg.values, derived],
              },
            }
          })()
        : c,
    ),
  })),
  pushSimResultsBatch: (cardId, rolls) => set(state => ({
    exploreCards: state.exploreCards.map(c =>
      c.id === cardId && c.config.type === 'sim-results'
        ? (() => {
            if (rolls.length === 0) return c
            const cfg = c.config as SimResultsCardConfig
            const derived = rolls
              .map(roll => deriveSimValue(roll, cfg.trackedMode, cfg.valueMode))
              .filter((value): value is number => value != null)
            if (derived.length === 0) return c
            return {
              ...c,
              config: {
                ...cfg,
                rolls: [...cfg.rolls, ...rolls],
                values: [...cfg.values, ...derived],
              },
            }
          })()
        : c,
    ),
  })),
  clearSimResults: (cardId) => set(state => ({
    exploreCards: state.exploreCards.map(c =>
      c.id === cardId && c.config.type === 'sim-results'
        ? { ...c, config: { ...c.config, rolls: [], values: [] } as SimResultsCardConfig }
        : c,
    ),
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
