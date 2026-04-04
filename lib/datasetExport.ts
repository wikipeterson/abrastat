import { GridState } from '@/types'

function sanitizeFileName(name: string) {
  const cleaned = name.trim().replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ')
  return cleaned || 'dataset'
}

function gridToMatrix(grid: GridState): (string | number)[][] {
  const headers = grid.columns.map(col => col.name)
  const rows = grid.rows.map(row => grid.columns.map(col => row[col.id] ?? ''))
  return [headers, ...rows]
}

function toCsvValue(value: string | number) {
  const text = String(value ?? '')
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export function exportGridAsCsv(grid: GridState, datasetName: string) {
  const csv = gridToMatrix(grid)
    .map(row => row.map(toCsvValue).join(','))
    .join('\n')
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${sanitizeFileName(datasetName)}.csv`)
}

export async function exportGridAsXlsx(grid: GridState, datasetName: string) {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet(gridToMatrix(grid))
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data')
  const output = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  downloadBlob(
    new Blob([output], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `${sanitizeFileName(datasetName)}.xlsx`,
  )
}
