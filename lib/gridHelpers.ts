import { v4 as uuid } from 'uuid'
import { ColumnType, GridColumn, GridState } from '@/types'

export function createEmptyGrid(cols = 4, rows = 20): GridState {
  const columns: GridColumn[] = Array.from({ length: cols }, (_, i) => ({
    id: uuid(),
    name: `var${i + 1}`,
    type: 'numeric' as ColumnType,
  }))
  const emptyRow = () => Object.fromEntries(columns.map(c => [c.id, '']))
  return { columns, rows: Array.from({ length: rows }, emptyRow) }
}

export function inferColumnType(values: unknown[]): ColumnType {
  const nonEmpty = values.filter(v => v !== '' && v != null)
  if (nonEmpty.length === 0) return 'numeric'
  const numericCount = nonEmpty.filter(v => isFinite(Number(v))).length
  return numericCount / nonEmpty.length > 0.8 ? 'numeric' : 'categorical'
}

export function parsedRowsToGrid(headers: string[], dataRows: unknown[][]): GridState {
  const columns: GridColumn[] = headers.map(name => ({
    id: uuid(),
    name,
    type: 'numeric' as ColumnType,
  }))
  const rows = dataRows.map(row =>
    Object.fromEntries(columns.map((col, i) => {
      const v = row[i]
      return [col.id, (v === null || v === undefined) ? '' : (v as string | number)]
    }))
  )
  columns.forEach(col => {
    col.type = inferColumnType(rows.map(r => r[col.id]))
  })
  return { columns, rows }
}

/**
 * Numeric values for a single column, blanks excluded.
 * IMPORTANT: filters out '' and null/undefined BEFORE Number() so that blank
 * cells are never silently coerced to 0.
 */
export function getNumericValues(grid: GridState, colId: string): number[] {
  return grid.rows
    .filter(r => r[colId] !== '' && r[colId] != null)
    .map(r => Number(r[colId]))
    .filter(v => isFinite(v))
}

/**
 * Raw string values preserving row alignment (blanks become '').
 * Use this when you need positional alignment across multiple columns.
 * For single-column categorical use, prefer getValidStringValues.
 */
export function getStringValues(grid: GridState, colId: string): string[] {
  return grid.rows.map(r => String(r[colId] ?? ''))
}

/**
 * Categorical values with blanks and whitespace-only strings removed.
 */
export function getValidStringValues(grid: GridState, colId: string): string[] {
  return grid.rows.map(r => String(r[colId] ?? '').trim()).filter(v => v !== '')
}

/**
 * Complete-case extraction for one numeric variable with optional categorical
 * grouping. Excludes rows where the numeric value is blank/non-finite, and
 * (when grouping) rows where the group value is blank.
 */
export function getNumericGroup(
  grid: GridState,
  numColId: string,
  groupColId?: string | null,
): { value: number; group: string }[] {
  return grid.rows.flatMap(r => {
    const raw = r[numColId]
    if (raw === '' || raw == null) return []
    const value = Number(raw)
    if (!isFinite(value)) return []
    if (groupColId) {
      const group = String(r[groupColId] ?? '').trim()
      if (!group) return []
      return [{ value, group }]
    }
    return [{ value, group: '' }]
  })
}

/**
 * Complete-case extraction for two numeric variables (scatter / regression).
 * Only returns rows where BOTH values are non-blank and finite.
 */
export function getNumericPairs(
  grid: GridState,
  col1Id: string,
  col2Id: string,
): [number, number][] {
  return grid.rows.flatMap(r => {
    const r1 = r[col1Id], r2 = r[col2Id]
    if (r1 === '' || r1 == null || r2 === '' || r2 == null) return []
    const v1 = Number(r1), v2 = Number(r2)
    if (!isFinite(v1) || !isFinite(v2)) return []
    return [[v1, v2] as [number, number]]
  })
}
