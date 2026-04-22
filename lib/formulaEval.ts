import { GridColumn } from '@/types'

export function evaluateFormula(
  formula: string,
  columns: GridColumn[],
  row: Record<string, string | number>
): number | null {
  let expr = formula.trim()

  // Replace column names with their values (longest names first to avoid partial matches)
  const sorted = [...columns].sort((a, b) => b.name.length - a.name.length)
  for (const col of sorted) {
    const val = Number(row[col.id])
    const replacement = isFinite(val) ? String(val) : 'NaN'
    const escapedName = col.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapedName}(?=$|[^A-Za-z0-9_])`, 'g')
    expr = expr.replace(pattern, (_, prefix: string) => `${prefix}${replacement}`)
  }

  // Map friendly function names to Math.*
  expr = expr
    .replace(/\bsqrt\s*\(/g, 'Math.sqrt(')
    .replace(/\blog10\s*\(/g, 'Math.log10(')
    .replace(/\blog\s*\(/g, 'Math.log10(')
    .replace(/\bln\s*\(/g, 'Math.log(')
    .replace(/\babs\s*\(/g, 'Math.abs(')
    .replace(/\bround\s*\(/g, 'Math.round(')
    .replace(/\^/g, '**')

  try {
    const fn = new Function(`"use strict"; return (${expr})`)
    const result = fn()
    return typeof result === 'number' && isFinite(result) ? result : null
  } catch {
    return null
  }
}

export function computeColumnValues(
  formula: string,
  columns: GridColumn[],
  rows: Record<string, string | number>[]
): (number | null)[] {
  return rows.map(row => evaluateFormula(formula, columns, row))
}
