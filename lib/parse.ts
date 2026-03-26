import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { parsedRowsToGrid } from './gridHelpers'
import { GridState } from '@/types'

function detectDelimiter(text: string): string {
  const tabCount = (text.match(/\t/g) || []).length
  const commaCount = (text.match(/,/g) || []).length
  return tabCount > commaCount ? '\t' : ','
}

function autoHeaders(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `var${i + 1}`)
}

export function parsePastedText(text: string, hasHeaders = true): GridState {
  const delimiter = detectDelimiter(text)
  const result = Papa.parse<string[]>(text.trim(), {
    delimiter,
    header: false,
    skipEmptyLines: true,
  })
  const rows = result.data as string[][]
  if (rows.length === 0) throw new Error('No data found.')
  if (hasHeaders) {
    const headers = rows[0].map((h, i) => String(h).trim() || `var${i + 1}`)
    return parsedRowsToGrid(headers, rows.slice(1))
  } else {
    return parsedRowsToGrid(autoHeaders(rows[0].length), rows)
  }
}

export function parseCsvText(text: string, hasHeaders = true): GridState {
  const result = Papa.parse<string[]>(text.trim(), {
    header: false,
    skipEmptyLines: true,
  })
  const rows = result.data as string[][]
  if (rows.length === 0) throw new Error('No data found.')
  if (hasHeaders) {
    const headers = rows[0].map((h, i) => String(h).trim() || `var${i + 1}`)
    return parsedRowsToGrid(headers, rows.slice(1))
  } else {
    return parsedRowsToGrid(autoHeaders(rows[0].length), rows)
  }
}

export async function parseFile(file: File, hasHeaders = true): Promise<GridState> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcelFile(file, hasHeaders)
  }
  return parseCsvFile(file, hasHeaders)
}

function parseCsvFile(file: File, hasHeaders: boolean): Promise<GridState> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete(results) {
        const rows = results.data as string[][]
        if (rows.length === 0) return reject(new Error('Empty file.'))
        if (hasHeaders) {
          const headers = rows[0].map((h, i) => String(h).trim() || `var${i + 1}`)
          resolve(parsedRowsToGrid(headers, rows.slice(1)))
        } else {
          resolve(parsedRowsToGrid(autoHeaders(rows[0].length), rows))
        }
      },
      error(err) {
        reject(new Error(err.message))
      },
    })
  })
}

async function parseExcelFile(file: File, hasHeaders: boolean): Promise<GridState> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })
  if (rows.length === 0) throw new Error('Empty spreadsheet.')
  const allRows = rows as unknown[][]
  if (hasHeaders) {
    const headers = allRows[0].map((h, i) => String(h ?? '').trim() || `var${i + 1}`)
    return parsedRowsToGrid(headers, allRows.slice(1))
  } else {
    return parsedRowsToGrid(autoHeaders(allRows[0].length), allRows)
  }
}
