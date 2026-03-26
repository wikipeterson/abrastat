import { v4 as uuid } from 'uuid'
import { ColumnType, GridColumn, GridState } from '@/types'

export function createEmptyGrid(cols = 5, rows = 20): GridState {
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

export function getNumericValues(grid: GridState, colId: string): number[] {
  return grid.rows.map(r => Number(r[colId])).filter(v => isFinite(v))
}

export function getStringValues(grid: GridState, colId: string): string[] {
  return grid.rows.map(r => String(r[colId] ?? ''))
}
