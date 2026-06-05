import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { User as FirebaseUser } from 'firebase/auth'
import { ColumnType, GridState, RowFilter, RecodeRule } from '@/types'
import { ExploreCard, CardConfig, DistributionPreFill, GraphCardConfig, SimResultsCardConfig, TableOutputCardConfig, TwoPropSimCardConfig, TwoMeanSimCardConfig, OnePropSimCardConfig } from './exploreTypes'
import { createEmptyGrid } from './gridHelpers'
import { computeColumnValues } from './formulaEval'
import { sortCategoryValues } from './categoryOrder'
import { normalizeGraphConfigForColumns } from './suggest'

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

function cardsOverlap(
  ax: number,
  ay: number,
  aw: number,
  ah: number,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  padding = 28,
) {
  return (
    ax < bx + bw + padding &&
    ax + aw + padding > bx &&
    ay < by + bh + padding &&
    ay + ah + padding > by
  )
}

function findOpenCardPosition(
  cards: ExploreCard[],
  startX: number,
  startY: number,
  width: number,
  height: number,
) {
  const stepX = 72
  const stepY = 72

  for (let row = 0; row < 24; row++) {
    for (let col = 0; col < 8; col++) {
      const x = startX + col * stepX
      const y = startY + row * stepY
      const blocked = cards.some(card =>
        cardsOverlap(x, y, width, height, card.x, card.y, card.width, card.height ?? 520),
      )
      if (!blocked) return { x, y }
    }
  }

  return { x: startX, y: startY }
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

function scanChiSquareContext(
  cards: ExploreCard[],
  grid: GridState,
): DistributionPreFill | undefined {
  const tableCard = [...cards].reverse().find(c => c.config.type === 'table')
  if (!tableCard || tableCard.config.type !== 'table') return undefined
  const { rowsColId, colsColId } = tableCard.config
  if (!rowsColId || !colsColId) return undefined

  const pairs = grid.rows
    .map(r => [String(r[rowsColId] ?? '').trim(), String(r[colsColId] ?? '').trim()] as [string, string])
    .filter(([a, b]) => a !== '' && b !== '')
  const rowVals = pairs.map(p => p[0])
  const colVals = pairs.map(p => p[1])
  if (rowVals.length < 2 || colVals.length < 2) return undefined

  const rowLabels = sortCategoryValues([...new Set(rowVals)])
  const colLabels = sortCategoryValues([...new Set(colVals)])
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

  // Row filters (non-destructive)
  activeFilters: RowFilter[]
  setRowFilters: (filters: RowFilter[]) => void

  // Data operations
  sortRows: (colId: string, direction: 'asc' | 'desc', scope: 'table' | 'column' | 'selected', selectedColIds: string[]) => void
  addZScoreColumn: (colId: string) => { error: string | null }
  addSequentialColumn: (name: string, start: number, increment: number, count: number) => void
  stackColumns: (valueColIds: string[], keepColIds: string[], valueName: string, groupName: string) => { error: string | null }
  unstackColumns: (valueColId: string, groupColId: string, idColId: string | null) => { error: string | null }
  recodeColumn: (sourceColId: string, newName: string, rules: RecodeRule[]) => void
  addRandomColumn: (name: string, dist: 'normal' | 'uniform' | 'binomial' | 'geometric', params: Record<string, number>, rowCount: number) => void

  // Explore canvas
  exploreCards: ExploreCard[]
  addExploreCard: (
    type: CardConfig['type'],
    opts?: { position?: { x: number; y: number }; initialConfig?: Partial<CardConfig> | null }
  ) => void
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
  addTwoPropSimCard: (
    config: Omit<TwoPropSimCardConfig, 'type' | 'nullDist' | 'simCount' | 'extremeCount'>,
    sourceCard: ExploreCard,
  ) => string
  addTwoMeanSimCard: (
    config: Omit<TwoMeanSimCardConfig, 'type' | 'nullDist' | 'simCount' | 'extremeCount'>,
    sourceCard: ExploreCard,
  ) => string
  addOnePropSimCard: (
    config: Omit<OnePropSimCardConfig, 'type' | 'nullDist' | 'simCount' | 'extremeCount'>,
    sourceCard: ExploreCard,
  ) => string
  pushSimResult: (cardId: string, roll: number[]) => void
  pushSimResultsBatch: (cardId: string, rolls: number[][]) => void
  clearSimResults: (cardId: string) => void

  // Inference canvas
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

  setGrid: (grid) => set({ grid, isDirty: true, undoStack: [], selectedColumnIds: [], activeFilters: [] }),

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
    return { grid: { ...state.grid, columns }, isDirty: true, undoStack: stack }
  }),

  deleteColumn: (colId) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = state.grid.columns.filter(c => c.id !== colId)
    const rows = state.grid.rows.map(r =>
      Object.fromEntries(Object.entries(r).filter(([k]) => k !== colId)) as Record<string, string | number>
    )
    const selectedColumnIds = state.selectedColumnIds.filter(id => id !== colId)
    const activeFilters = state.activeFilters.filter(f => f.colId !== colId)
    return { grid: { columns, rows }, isDirty: true, undoStack: stack, selectedColumnIds, activeFilters }
  }),

  renameColumn: (colId, newName) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const columns = state.grid.columns.map(c => c.id === colId ? { ...c, name: newName } : c)
    // Update filter colNames too
    const activeFilters = state.activeFilters.map(f =>
      f.colId === colId ? { ...f, colName: newName } : f
    )
    return { grid: { ...state.grid, columns }, isDirty: true, undoStack: stack, activeFilters }
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
    activeFilters: [],
    exploreCards: [createDataGridCard()],
  }),

  selectedColumnIds: [],
  toggleColumnSelection: (colId) => set(state => {
    const ids = state.selectedColumnIds.includes(colId)
      ? state.selectedColumnIds.filter(id => id !== colId)
      : [...state.selectedColumnIds, colId]
    return { selectedColumnIds: ids }
  }),
  setSelectedColumnIds: (ids) => set({ selectedColumnIds: ids }),

  // ─── Row filters ─────────────────────────────────────────────────────────────
  activeFilters: [],
  setRowFilters: (filters) => set({ activeFilters: filters }),

  // ─── Data operations ─────────────────────────────────────────────────────────

  sortRows: (colId, direction, scope, selectedColIds) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const { rows } = state.grid

    const cmp = (a: string | number, b: string | number) => {
      const as = String(a), bs = String(b)
      if (as === '' && bs === '') return 0
      if (as === '') return 1
      if (bs === '') return -1
      const an = Number(a), bn = Number(b)
      if (isFinite(an) && isFinite(bn)) return direction === 'asc' ? an - bn : bn - an
      return direction === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as)
    }

    if (scope === 'table') {
      const sorted = [...rows].sort((a, b) => cmp(a[colId] ?? '', b[colId] ?? ''))
      return { grid: { ...state.grid, rows: sorted }, isDirty: true, undoStack: stack }
    }

    if (scope === 'column') {
      const vals = rows.map(r => r[colId] ?? '')
      const sorted = [...vals].sort(cmp)
      const newRows = rows.map((r, i) => ({ ...r, [colId]: sorted[i] }))
      return { grid: { ...state.grid, rows: newRows }, isDirty: true, undoStack: stack }
    }

    // scope === 'selected': sort key col + all selected cols together
    const colIds = [...new Set([colId, ...selectedColIds])]
    const indices = rows.map((_, i) => i)
    indices.sort((a, b) => cmp(rows[a][colId] ?? '', rows[b][colId] ?? ''))
    const newRows = rows.map((row, i) => {
      const src = indices[i]
      const updates: Record<string, string | number> = {}
      colIds.forEach(id => { updates[id] = rows[src][id] ?? '' })
      return { ...row, ...updates }
    })
    return { grid: { ...state.grid, rows: newRows }, isDirty: true, undoStack: stack }
  }),

  addZScoreColumn: (colId) => {
    let result: { error: string | null } = { error: null }
    set(state => {
      const col = state.grid.columns.find(c => c.id === colId)
      if (!col) { result = { error: 'Column not found' }; return state }
      const nums = state.grid.rows
        .map(r => r[colId])
        .filter(v => v !== '' && v !== undefined && isFinite(Number(v)))
        .map(Number)
      if (nums.length < 2) { result = { error: 'Need at least 2 numeric values' }; return state }
      const mean = nums.reduce((s, v) => s + v, 0) / nums.length
      const sd = Math.sqrt(nums.reduce((s, v) => s + (v - mean) ** 2, 0) / (nums.length - 1))
      if (sd === 0) { result = { error: 'Standard deviation is 0 — all values are identical' }; return state }
      const id = uuid()
      const newCol = { id, name: `z_${col.name}`, type: 'numeric' as ColumnType, width: 140 }
      const columns = [...state.grid.columns, newCol]
      const rows = state.grid.rows.map(r => {
        const v = r[colId]
        const z = v !== '' && v !== undefined && isFinite(Number(v))
          ? parseFloat(((Number(v) - mean) / sd).toFixed(4))
          : ''
        return { ...r, [id]: z }
      })
      const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
      return { grid: { columns, rows }, isDirty: true, undoStack: stack }
    })
    return result
  },

  addSequentialColumn: (name, start, increment, count) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const id = uuid()
    const newCol = { id, name, type: 'numeric' as ColumnType, width: 140 }
    const columns = [...state.grid.columns, newCol]
    const rows = state.grid.rows.map((r, i) => ({
      ...r,
      [id]: i < count ? parseFloat((start + i * increment).toPrecision(12)) : '',
    }))
    return { grid: { columns, rows }, isDirty: true, undoStack: stack }
  }),

  stackColumns: (valueColIds, keepColIds, valueName, groupName) => {
    let result: { error: string | null } = { error: null }
    set(state => {
      if (valueColIds.length === 0) { result = { error: 'Select at least one column to stack' }; return state }
      const keepCols = keepColIds.map(id => state.grid.columns.find(c => c.id === id)).filter(Boolean) as typeof state.grid.columns
      const valueCols = valueColIds.map(id => state.grid.columns.find(c => c.id === id)).filter(Boolean) as typeof state.grid.columns
      if (valueCols.length === 0) { result = { error: 'No valid value columns found' }; return state }

      const groupId = uuid()
      const valueId = uuid()
      const newColumns = [
        ...keepCols,
        { id: groupId, name: groupName, type: 'categorical' as ColumnType, width: 140 },
        { id: valueId, name: valueName, type: 'numeric' as ColumnType, width: 140 },
      ]

      const dataRows = state.grid.rows.filter(r =>
        Object.values(r).some(v => String(v).trim() !== '')
      )

      const newRows: Record<string, string | number>[] = []
      for (const row of dataRows) {
        for (const col of valueCols) {
          const newRow: Record<string, string | number> = {}
          for (const kc of keepCols) newRow[kc.id] = row[kc.id] ?? ''
          newRow[groupId] = col.name
          newRow[valueId] = row[col.id] ?? ''
          newRows.push(newRow)
        }
      }

      const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
      return { grid: { columns: newColumns, rows: newRows }, isDirty: true, undoStack: stack }
    })
    return result
  },

  unstackColumns: (valueColId, groupColId, idColId) => {
    let result: { error: string | null } = { error: null }
    set(state => {
      const groupCol = state.grid.columns.find(c => c.id === groupColId)
      const valueCol = state.grid.columns.find(c => c.id === valueColId)
      if (!groupCol || !valueCol) { result = { error: 'Invalid column selection' }; return state }

      const dataRows = state.grid.rows.filter(r => String(r[groupColId] ?? '').trim() !== '')
      const groups = [...new Set(dataRows.map(r => String(r[groupColId])))]
      if (groups.length === 0) { result = { error: 'No data to unstack' }; return state }
      if (groups.length > 50) { result = { error: 'Too many groups to unstack (max 50)' }; return state }

      const otherCols = state.grid.columns.filter(c => c.id !== groupColId && c.id !== valueColId)
      const newValueCols = groups.map(g => ({
        id: uuid(),
        name: g,
        type: 'numeric' as ColumnType,
        width: 140,
      }))
      const newColumns = [...otherCols, ...newValueCols]

      const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)

      if (idColId) {
        const idMap = new Map<string, Record<string, string | number>>()
        for (const row of dataRows) {
          const idVal = String(row[idColId] ?? '')
          if (!idMap.has(idVal)) {
            const newRow: Record<string, string | number> = {}
            otherCols.forEach(c => { newRow[c.id] = row[c.id] ?? '' })
            newValueCols.forEach(nc => { newRow[nc.id] = '' })
            idMap.set(idVal, newRow)
          }
          const r = idMap.get(idVal)!
          const gi = groups.indexOf(String(row[groupColId]))
          if (gi >= 0) r[newValueCols[gi].id] = row[valueColId] ?? ''
        }
        return { grid: { columns: newColumns, rows: [...idMap.values()] }, isDirty: true, undoStack: stack }
      } else {
        const groupCounters = new Map<string, number>()
        const outputMap = new Map<number, Record<string, string | number>>()
        for (const row of dataRows) {
          const groupVal = String(row[groupColId])
          const cnt = groupCounters.get(groupVal) ?? 0
          groupCounters.set(groupVal, cnt + 1)
          if (!outputMap.has(cnt)) {
            const newRow: Record<string, string | number> = {}
            otherCols.forEach(c => { newRow[c.id] = row[c.id] ?? '' })
            newValueCols.forEach(nc => { newRow[nc.id] = '' })
            outputMap.set(cnt, newRow)
          }
          const r = outputMap.get(cnt)!
          const gi = groups.indexOf(groupVal)
          if (gi >= 0) r[newValueCols[gi].id] = row[valueColId] ?? ''
        }
        const newRows = [...outputMap.entries()].sort((a, b) => a[0] - b[0]).map(e => e[1])
        return { grid: { columns: newColumns, rows: newRows }, isDirty: true, undoStack: stack }
      }
    })
    return result
  },

  recodeColumn: (sourceColId, newName, rules) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const id = uuid()
    const newCol = { id, name: newName, type: 'categorical' as ColumnType, width: 140 }
    const columns = [...state.grid.columns, newCol]
    const rows = state.grid.rows.map(r => {
      const v = r[sourceColId]
      const n = Number(v)
      let label = ''
      if (v !== '' && v !== undefined && isFinite(n)) {
        for (const rule of rules) {
          const minOk = rule.minVal === '' || (rule.minOp === '>=' ? n >= Number(rule.minVal) : n > Number(rule.minVal))
          const maxOk = rule.maxVal === '' || (rule.maxOp === '<=' ? n <= Number(rule.maxVal) : n < Number(rule.maxVal))
          if (minOk && maxOk) { label = rule.label; break }
        }
      }
      return { ...r, [id]: label }
    })
    return { grid: { columns, rows }, isDirty: true, undoStack: stack }
  }),

  addRandomColumn: (name, dist, params, rowCount) => set(state => {
    const stack = [...state.undoStack, snapshot(state.grid)].slice(-MAX_UNDO)
    const id = uuid()
    const newCol = { id, name, type: 'numeric' as ColumnType, width: 140 }
    const columns = [...state.grid.columns, newCol]

    function sample(): number {
      if (dist === 'normal') {
        const u = Math.max(1e-10, Math.random()), v = Math.random()
        const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
        return params.mean + params.sd * z
      }
      if (dist === 'uniform') {
        return Math.floor(Math.random() * (params.max - params.min + 1)) + params.min
      }
      if (dist === 'binomial') {
        let k = 0
        for (let i = 0; i < params.n; i++) if (Math.random() < params.p) k++
        return k
      }
      // geometric
      let k = 0
      while (Math.random() >= params.p) k++
      return k + 1
    }

    const emptyRowTemplate = Object.fromEntries(state.grid.columns.map(c => [c.id, '']))
    const baseRows = state.grid.rows.length < rowCount
      ? [...state.grid.rows, ...Array.from({ length: rowCount - state.grid.rows.length }, () => ({ ...emptyRowTemplate }))]
      : state.grid.rows

    const rows = baseRows.map((r, i) => ({
      ...r,
      [id]: i < rowCount ? parseFloat(sample().toFixed(dist === 'normal' ? 4 : 0)) : '',
    }))

    return { grid: { columns, rows }, isDirty: true, undoStack: stack }
  }),

  // ─── Explore canvas ──────────────────────────────────────────────────────────
  exploreCards: [createDataGridCard()],
  addExploreCard: (type, opts) => set(state => {
    const analysisCards = state.exploreCards.filter(card => card.config.type !== 'data-grid')
    const idx = analysisCards.length
    const defaultConfig: CardConfig =
      type === 'data-grid'    ? { type: 'data-grid' } :
      type === 'graph'        ? { type: 'graph',       xColId: null, yColId: null, groupColId: null, title: '', bestFitMode: 'none', barValueMode: 'count', dotSize: 'medium', showMeans: false, showMedian: false, showOutlierFences: false } :
      type === 'summary'      ? { type: 'summary',     variableColIds: [], groupColId: null } :
      type === 'table'        ? { type: 'table',       rowsColId: null, colsColId: null } :
      type === 'regression'   ? { type: 'regression',  xColId: null, yColId: null, groupColId: null } :
      type === 'regression-by-eye' ? { type: 'regression-by-eye', xColId: null, yColId: null } :
      type === 'one-prop-randomization' ? { type: 'one-prop-randomization', var1ColId: null } :
      type === 'one-prop-sim' ? { type: 'one-prop-sim', n: 0, x: 0, successLabel: 'Success', failureLabel: 'Failure', nullP: '0.5', alternative: 'two' as const, nullDist: [], simCount: 0, extremeCount: 0, showNormalCurve: false } :
      type === 'distribution'    ? { type: 'distribution', preFill: scanChiSquareContext(state.exploreCards, state.grid) } :
      type === 'compare-normals' ? { type: 'compare-normals' } :
      type === 'generator'       ? { type: 'generator' } :
      type === 'proportions'  ? { type: 'proportions', var1ColId: null, var2ColId: null } :
      type === 'two-prop-randomization' ? { type: 'two-prop-randomization', var1ColId: null, var2ColId: null } :
      type === 'two-mean-randomization' ? { type: 'two-mean-randomization', var1ColId: null, var2ColId: null, dataShape: 'grouping' } :
      type === 'means'        ? { type: 'means', var1ColId: null, var2ColId: null } :
      type === 'dice-roller'  ? { type: 'dice-roller', linkedResultsCardId: null, trackedMode: 'sum' } :
      type === 'sim-results'  ? { type: 'sim-results', sourceCardId: '', sourceLabel: '', trackedMode: 'sum', valueMode: 'count', thresholdOp: '>=', thresholdValue: 1, supportsDifference: false, minValue: 1, maxValue: 6, rolls: [], values: [] } :
                                 { type: 'simulation', linkedResultsCardId: null }
    const mergedConfig = opts?.initialConfig
      ? ({ ...defaultConfig, ...opts.initialConfig } as CardConfig)
      : defaultConfig
    const config = mergedConfig.type === 'graph'
      ? normalizeGraphConfigForColumns(mergedConfig as GraphCardConfig, state.grid.columns)
      : mergedConfig
    const { width, height } =
      type === 'summary'     ? { width: 700, height: 620 } :
      type === 'table'       ? { width: 960, height: 740 } :
      type === 'regression-by-eye' ? { width: 860, height: 700 } :
      type === 'one-prop-randomization' ? { width: 820, height: 520 } :
      type === 'means'       ? { width: 760, height: 500 } :
      type === 'distribution'    ? { width: 700, height: 540 } :
      type === 'compare-normals' ? { width: 760, height: 560 } :
      type === 'proportions'     ? { width: 860, height: 620 } :
      type === 'two-prop-randomization' ? { width: 980, height: 560 } :
      type === 'two-mean-randomization' ? { width: 980, height: 560 } :
      type === 'dice-roller' ? { width: 760, height: 700 } :
                           { width: 620, height: 520 }
    const rightmostX = state.exploreCards.reduce((max, card) => Math.max(max, card.x + card.width), 20)
    const startX = opts?.position?.x ?? Math.max(1040 + (idx % 2) * 500, rightmostX + 40)
    const startY = opts?.position?.y ?? 24 + Math.floor(idx / 2) * 520
    const { x, y } = findOpenCardPosition(state.exploreCards, startX, startY, width, height)
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
      if (cfg.type === 'regression') return { ...card, config: { ...cfg, xColId: nil(cfg.xColId), yColId: nil(cfg.yColId), groupColId: nil(cfg.groupColId) } }
      if (cfg.type === 'regression-by-eye') return { ...card, config: { ...cfg, xColId: nil(cfg.xColId), yColId: nil(cfg.yColId) } }
      if (cfg.type === 'one-prop-randomization') return { ...card, config: { ...cfg, var1ColId: nil(cfg.var1ColId) } }
      if (cfg.type === 'means')      return { ...card, config: { ...cfg, var1ColId: nil(cfg.var1ColId), var2ColId: nil(cfg.var2ColId) } }
      if (cfg.type === 'proportions') return { ...card, config: { ...cfg, var1ColId: nil(cfg.var1ColId), var2ColId: nil(cfg.var2ColId) } }
      if (cfg.type === 'two-prop-randomization') return { ...card, config: { ...cfg, var1ColId: nil(cfg.var1ColId), var2ColId: nil(cfg.var2ColId) } }
      if (cfg.type === 'two-mean-randomization') return { ...card, config: { ...cfg, var1ColId: nil(cfg.var1ColId), var2ColId: nil(cfg.var2ColId) } }
      return card
    }),
  })),
  addTwoPropSimCard: (config, sourceCard) => {
    const id = uuid()
    set(state => {
      const x = sourceCard.x + sourceCard.width + 40
      const y = sourceCard.y
      const width = 1120, height = 860
      const { x: fx, y: fy } = findOpenCardPosition(state.exploreCards, x, y, width, height)
      const simConfig: TwoPropSimCardConfig = { type: 'two-prop-sim', ...config, nullDist: [], simCount: 0, extremeCount: 0, showNormalCurve: false }
      return { exploreCards: [...state.exploreCards, { id, config: simConfig, x: fx, y: fy, width, height }] }
    })
    return id
  },
  addTwoMeanSimCard: (config, sourceCard) => {
    const id = uuid()
    set(state => {
      const x = sourceCard.x + sourceCard.width + 40
      const y = sourceCard.y
      const width = 1120, height = 860
      const { x: fx, y: fy } = findOpenCardPosition(state.exploreCards, x, y, width, height)
      const simConfig: TwoMeanSimCardConfig = { type: 'two-mean-sim', ...config, nullDist: [], simCount: 0, extremeCount: 0, showNormalCurve: false }
      return { exploreCards: [...state.exploreCards, { id, config: simConfig, x: fx, y: fy, width, height }] }
    })
    return id
  },
  addOnePropSimCard: (config, sourceCard) => {
    const id = uuid()
    set(state => {
      const x = sourceCard.x + sourceCard.width + 40
      const y = sourceCard.y
      const width = 1180, height = 760
      const { x: fx, y: fy } = findOpenCardPosition(state.exploreCards, x, y, width, height)
      const simConfig: OnePropSimCardConfig = { type: 'one-prop-sim', ...config, nullDist: [], simCount: 0, extremeCount: 0, showNormalCurve: false }
      return { exploreCards: [...state.exploreCards, { id, config: simConfig, x: fx, y: fy, width, height }] }
    })
    return id
  },
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
          thresholdOp: '>=',
          thresholdValue: sourceLabel === 'Coin Flipper'
            ? range.minValue + (range.maxValue - range.minValue) / 2
            : range.minValue,
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
    set(state => {
      const width = 620
      const height = 520
      const { x, y } = findOpenCardPosition(state.exploreCards, position.x, position.y, width, height)
      return { exploreCards: [...state.exploreCards, { id, config, x, y, width, height }] }
    })
    return id
  },
  addLinkedTableCard: (config, position) => {
    const id = uuid()
    set(state => {
      const width = 960
      const height = 740
      const { x, y } = findOpenCardPosition(state.exploreCards, position.x, position.y, width, height)
      return { exploreCards: [...state.exploreCards, { id, config, x, y, width, height }] }
    })
    return id
  },
  pushSimResult: (cardId, roll) => set(state => ({
    exploreCards: state.exploreCards.map(c =>
      c.id === cardId && c.config.type === 'sim-results'
        ? (() => {
            const cfg = c.config as SimResultsCardConfig
            const derived = deriveSimValue(roll, cfg.trackedMode, cfg.valueMode)
            if (derived == null) return c
            return { ...c, config: { ...cfg, rolls: [...cfg.rolls, roll], values: [...cfg.values, derived] } }
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
            return { ...c, config: { ...cfg, rolls: [...cfg.rolls, ...rolls], values: [...cfg.values, ...derived] } }
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

  // ─── Inference canvas ────────────────────────────────────────────────────────
  inferenceCards: [],
  addInferenceCard: (type, position) => set(state => {
    const idx = state.inferenceCards.length
    const x = position?.x ?? 20 + (idx % 2) * 660
    const y = position?.y ?? 20 + Math.floor(idx / 2) * 520
    const config: CardConfig =
      type === 'distribution' ? { type: 'distribution' } :
      type === 'proportions' ? { type: 'proportions', var1ColId: null, var2ColId: null } :
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
    inferenceCards: state.inferenceCards,
  })),
}))
