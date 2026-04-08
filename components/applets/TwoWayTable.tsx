'use client'

import { useEffect, useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { getStringValues } from '@/lib/gridHelpers'
import { DropZone } from '@/components/explore/DropZone'
import { ManualTwoWayTableSnapshot } from '@/lib/exploreTypes'
import { writeClipboardTable } from '@/lib/clipboardTable'
// ─── Types ────────────────────────────────────────────────────────────────────

type InputMode = 'raw' | 'manual'
type TableView = 'counts' | 'row' | 'col'

interface TwoWayData {
  explName: string
  respName: string
  rowLabels: string[] // response variable categories
  colLabels: string[] // explanatory variable categories
  cells: number[][]  // cells[rowIdx][colIdx]
}

// ─── Stat helpers ─────────────────────────────────────────────────────────────

function getRowTotals(cells: number[][]): number[] {
  return cells.map(row => row.reduce((a, b) => a + b, 0))
}

function getColTotals(cells: number[][], numCols: number): number[] {
  return Array.from({ length: numCols }, (_, ci) =>
    cells.reduce((sum, row) => sum + (row[ci] ?? 0), 0)
  )
}

function getGrandTotal(cells: number[][]): number {
  return cells.flat().reduce((a, b) => a + b, 0)
}

// ─── Manual table input ───────────────────────────────────────────────────────

interface ManualInputProps {
  explName: string
  respName: string
  rowLabels: string[]
  colLabels: string[]
  cells: number[][]
  onExplName: (v: string) => void
  onRespName: (v: string) => void
  onRowLabel: (ri: number, v: string) => void
  onColLabel: (ci: number, v: string) => void
  onCell: (ri: number, ci: number, v: string) => void
  onAddRow: () => void
  onRemoveRow: (ri: number) => void
  onAddCol: () => void
  onRemoveCol: (ci: number) => void
}

function ManualInput({
  explName, respName, rowLabels, colLabels, cells,
  onExplName, onRespName, onRowLabel, onColLabel, onCell,
  onAddRow, onRemoveRow, onAddCol, onRemoveCol,
}: ManualInputProps) {
  const textInput =
    'rounded border border-slate-200 px-2 py-1 text-sm focus:outline-none focus:border-[var(--color-accent)]'
  const numInput =
    'w-20 text-center rounded border border-slate-200 px-2 py-1.5 text-sm tabular-nums focus:outline-none focus:border-[var(--color-accent)]'

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-5">
      {/* Variable name inputs */}
      <div className="flex flex-wrap gap-4">
        <div>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
            Column Variable Name
          </div>
          <input
            value={explName}
            onChange={e => onExplName(e.target.value)}
            className={`${textInput} w-48`}
            placeholder="e.g. Gender"
          />
        </div>
        <div>
          <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
            Row Variable Name
          </div>
          <input
            value={respName}
            onChange={e => onRespName(e.target.value)}
            className={`${textInput} w-48`}
            placeholder="e.g. Preferred Sport"
          />
        </div>
      </div>

      {/* Editable count grid */}
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              {/* Top-left corner */}
              <th className="pr-3 pb-1.5 text-left w-36">
                <span className="text-[10px] text-[var(--color-muted)] font-normal leading-tight">
            {respName || 'Response'}<br />
            <span className="opacity-60">\ {explName || 'Explanatory'}</span>
                </span>
              </th>
              {colLabels.map((cl, ci) => (
                <th key={ci} className="px-1 pb-1.5">
                  <div className="flex flex-col items-center gap-0.5">
                    <input
                      value={cl}
                      onChange={e => onColLabel(ci, e.target.value)}
                      className={`${textInput} w-24 text-center text-xs`}
                      placeholder={`Col ${ci + 1}`}
                    />
                    <button
                      onClick={() => onRemoveCol(ci)}
                      disabled={colLabels.length <= 1}
                      className="text-slate-300 hover:text-red-400 text-[11px] leading-none disabled:opacity-20 transition-colors"
                      title="Remove column"
                    >
                      ×
                    </button>
                  </div>
                </th>
              ))}
              <th className="px-1 pb-1.5 align-bottom">
                <button
                  onClick={onAddCol}
                  className="text-xs text-[var(--color-accent)] font-semibold px-2 py-1 rounded border border-dashed border-[var(--color-accent)] hover:opacity-75 transition-opacity"
                >
                  + Col
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rl, ri) => (
              <tr key={ri}>
                <td className="pr-3 py-1">
                  <div className="flex items-center gap-1">
                    <input
                      value={rl}
                      onChange={e => onRowLabel(ri, e.target.value)}
                      className={`${textInput} w-28 text-xs`}
                      placeholder={`Row ${ri + 1}`}
                    />
                    <button
                      onClick={() => onRemoveRow(ri)}
                      disabled={rowLabels.length <= 1}
                      className="text-slate-300 hover:text-red-400 text-sm leading-none disabled:opacity-20 transition-colors"
                      title="Remove row"
                    >
                      ×
                    </button>
                  </div>
                </td>
                {colLabels.map((_, ci) => (
                  <td key={ci} className="px-1 py-1">
                    <input
                      type="number"
                      min={0}
                      value={cells[ri]?.[ci] ?? 0}
                      onChange={e => onCell(ri, ci, e.target.value)}
                      className={numInput}
                    />
                  </td>
                ))}
                <td />
              </tr>
            ))}
            <tr>
              <td className="pt-2">
                <button
                  onClick={onAddRow}
                  className="text-xs text-[var(--color-accent)] font-semibold px-2 py-1 rounded border border-dashed border-[var(--color-accent)] hover:opacity-75 transition-opacity"
                >
                  + Row
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Output table ─────────────────────────────────────────────────────────────

function OutputTable({ data, view }: { data: TwoWayData; view: TableView }) {
  const rTotals = getRowTotals(data.cells)
  const cTotals = getColTotals(data.cells, data.colLabels.length)
  const grand = getGrandTotal(data.cells)

  function fmt(n: number, isPercent: boolean) {
    return isPercent ? `${n.toFixed(1)}%` : String(n)
  }

  function cellDisplay(ri: number, ci: number): string {
    const raw = data.cells[ri][ci]
    if (view === 'counts') return String(raw)
    if (view === 'row') return rTotals[ri] ? fmt((raw / rTotals[ri]) * 100, true) : '—'
    return cTotals[ci] ? fmt((raw / cTotals[ci]) * 100, true) : '—'
  }

  function rowTotalDisplay(ri: number): string {
    if (view === 'counts') return String(rTotals[ri])
    if (view === 'row') return '100%'
    return grand ? fmt((rTotals[ri] / grand) * 100, true) : '—'
  }

  function colTotalDisplay(ci: number): string {
    if (view === 'counts') return String(cTotals[ci])
    if (view === 'col') return '100%'
    return grand ? fmt((cTotals[ci] / grand) * 100, true) : '—'
  }

  const th = 'px-3 py-2 text-xs font-semibold text-[var(--color-muted)] border border-slate-200'
  const td = 'px-3 py-2 text-sm text-center tabular-nums border border-slate-200'

  return (
    <table className="border-collapse min-w-full">
      <thead>
        <tr>
          <th className={`${th} text-left bg-slate-50 whitespace-nowrap`}>
            {data.explName}
            <span className="block font-normal text-slate-400 text-[10px]">\ {data.respName}</span>
          </th>
          {data.colLabels.map(cl => (
            <th key={cl} className={`${th} text-center bg-slate-50`}>{cl}</th>
          ))}
          <th className={`${th} text-center bg-slate-100`}>Total</th>
        </tr>
      </thead>
      <tbody>
        {data.rowLabels.map((rl, ri) => (
          <tr key={rl}>
            <td className={`${td} text-left font-semibold bg-slate-50`}>{rl}</td>
            {data.colLabels.map((_, ci) => (
              <td key={ci} className={`${td} bg-white`}>{cellDisplay(ri, ci)}</td>
            ))}
            <td className={`${td} font-semibold bg-slate-50`}>{rowTotalDisplay(ri)}</td>
          </tr>
        ))}
        <tr>
          <td className={`${td} text-left font-semibold bg-slate-100`}>Total</td>
          {data.colLabels.map((_, ci) => (
            <td key={ci} className={`${td} font-semibold bg-slate-100`}>{colTotalDisplay(ci)}</td>
          ))}
          <td className={`${td} font-bold bg-slate-200`}>
            {view === 'counts' ? grand : '100%'}
          </td>
        </tr>
      </tbody>
    </table>
  )
}

function buildCopiedTableText(data: TwoWayData, view: TableView) {
  const rTotals = getRowTotals(data.cells)
  const cTotals = getColTotals(data.cells, data.colLabels.length)
  const grand = getGrandTotal(data.cells)

  function fmt(n: number, isPercent: boolean) {
    return isPercent ? `${n.toFixed(1)}%` : String(n)
  }

  function cellDisplay(ri: number, ci: number): string {
    const raw = data.cells[ri][ci]
    if (view === 'counts') return String(raw)
    if (view === 'row') return rTotals[ri] ? fmt((raw / rTotals[ri]) * 100, true) : '—'
    return cTotals[ci] ? fmt((raw / cTotals[ci]) * 100, true) : '—'
  }

  function rowTotalDisplay(ri: number): string {
    if (view === 'counts') return String(rTotals[ri])
    if (view === 'row') return '100%'
    return grand ? fmt((rTotals[ri] / grand) * 100, true) : '—'
  }

  function colTotalDisplay(ci: number): string {
    if (view === 'counts') return String(cTotals[ci])
    if (view === 'col') return '100%'
    return grand ? fmt((cTotals[ci] / grand) * 100, true) : '—'
  }

  const header = [data.explName, ...data.colLabels, 'Total']
  const body = data.rowLabels.map((rowLabel, ri) => [
    rowLabel,
    ...data.colLabels.map((_, ci) => cellDisplay(ri, ci)),
    rowTotalDisplay(ri),
  ])
  const totals = ['Total', ...data.colLabels.map((_, ci) => colTotalDisplay(ci)), view === 'counts' ? String(grand) : '100%']

  return [header, ...body, totals].map(row => row.join('\t')).join('\n')
}

function buildCopiedTableRows(data: TwoWayData, view: TableView) {
  const rTotals = getRowTotals(data.cells)
  const cTotals = getColTotals(data.cells, data.colLabels.length)
  const grand = getGrandTotal(data.cells)

  function fmt(n: number, isPercent: boolean) {
    return isPercent ? `${n.toFixed(1)}%` : String(n)
  }

  function cellDisplay(ri: number, ci: number): string {
    const raw = data.cells[ri][ci]
    if (view === 'counts') return String(raw)
    if (view === 'row') return rTotals[ri] ? fmt((raw / rTotals[ri]) * 100, true) : '—'
    return cTotals[ci] ? fmt((raw / cTotals[ci]) * 100, true) : '—'
  }

  function rowTotalDisplay(ri: number): string {
    if (view === 'counts') return String(rTotals[ri])
    if (view === 'row') return '100%'
    return grand ? fmt((rTotals[ri] / grand) * 100, true) : '—'
  }

  function colTotalDisplay(ci: number): string {
    if (view === 'counts') return String(cTotals[ci])
    if (view === 'col') return '100%'
    return grand ? fmt((cTotals[ci] / grand) * 100, true) : '—'
  }

  const header = [data.explName, ...data.colLabels, 'Total']
  const body = data.rowLabels.map((rowLabel, ri) => [
    rowLabel,
    ...data.colLabels.map((_, ci) => cellDisplay(ri, ci)),
    rowTotalDisplay(ri),
  ])
  const totals = ['Total', ...data.colLabels.map((_, ci) => colTotalDisplay(ci)), view === 'counts' ? String(grand) : '100%']
  return [header, ...body, totals]
}

// ─── Applet ───────────────────────────────────────────────────────────────────

interface TwoWayTableProps {
  /** When provided, variable slots use drag-and-drop DropZones (canvas card mode).
   *  When absent, falls back to select dropdowns (standalone / GameHub mode). */
  cardId?: string
  rowsColId?: string | null
  colsColId?: string | null
  onClearZone?: (zone: string) => void
  inputMode?: InputMode
  onInputModeChange?: (mode: InputMode) => void
  onManualTableDataChange?: (snapshot: ManualTwoWayTableSnapshot | null) => void
}

export function TwoWayTable({
  cardId,
  rowsColId,
  colsColId,
  onClearZone,
  inputMode: controlledInputMode,
  onInputModeChange,
  onManualTableDataChange,
}: TwoWayTableProps = {}) {
  const { grid } = useStore()
  function handleNativeDrop(zone: 'rows' | 'cols') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId || !cardId) return
      e.preventDefault()
      const current = useStore.getState().exploreCards.find(c => c.id === cardId)
      if (!current || current.config.type !== 'table') return
      useStore.getState().updateExploreCard(cardId, {
        config: {
          ...current.config,
          ...(zone === 'rows' ? { rowsColId: colId } : { colsColId: colId }),
        },
      })
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const isCardMode = !!cardId

  const [localInputMode, setLocalInputMode] = useState<InputMode>('raw')
  const inputMode = controlledInputMode ?? localInputMode
  const setInputMode = onInputModeChange ?? setLocalInputMode
  // Local state only used in standalone (non-card) mode
  const [explColIdLocal, setExplColIdLocal] = useState('')
  const [respColIdLocal, setRespColIdLocal] = useState('')

  // Resolve which IDs to use
  const explColId = isCardMode ? (colsColId ?? '') : explColIdLocal
  const respColId = isCardMode ? (rowsColId ?? '') : respColIdLocal
  const [tableView, setTableView] = useState<TableView>('counts')
  const [isCopying, setIsCopying] = useState(false)

  // Manual table state
  const [mExplName, setMExplName] = useState('Group')
  const [mRespName, setMRespName] = useState('Category')
  const [mRowLabels, setMRowLabels] = useState(['Group A', 'Group B'])
  const [mColLabels, setMColLabels] = useState(['Category 1', 'Category 2'])
  const [mCells, setMCells] = useState<number[][]>([[0, 0], [0, 0]])

  const categoricalCols = grid.columns.filter(c => c.type === 'categorical')
  // ── Derive TwoWayData ────────────────────────────────────────────────────

  const data = useMemo<TwoWayData | null>(() => {
    if (inputMode === 'raw') {
      if (!explColId || !respColId) return null
      const explCol = grid.columns.find(c => c.id === explColId)
      const respCol = grid.columns.find(c => c.id === respColId)
      if (!explCol || !respCol) return null
      const explVals = getStringValues(grid, explColId)
      const respVals = getStringValues(grid, respColId)
      const pairs = explVals
        .map((e, i) => [e.trim(), respVals[i].trim()] as [string, string])
        .filter(([e, r]) => e && r)
      if (pairs.length === 0) return null
      const rowLabels = [...new Set(pairs.map(p => p[1]))].sort()
      const colLabels = [...new Set(pairs.map(p => p[0]))].sort()
      const cells = rowLabels.map(rl =>
        colLabels.map(cl => pairs.filter(([e, r]) => e === cl && r === rl).length)
      )
      return { explName: explCol.name, respName: respCol.name, rowLabels, colLabels, cells }
    }

    // Manual mode
    if (mRowLabels.length === 0 || mColLabels.length === 0) return null
    if (mCells.some(row => row.some(c => !Number.isFinite(c) || c < 0))) return null
    return {
      explName: mExplName || 'Explanatory',
      respName: mRespName || 'Response',
      rowLabels: mRowLabels,
      colLabels: mColLabels,
      cells: mCells,
    }
  }, [
    inputMode, grid, explColId, respColId,
    mExplName, mRespName, mRowLabels, mColLabels, mCells,
  ])

  const showTopControls = !isCardMode && inputMode === 'raw'

  useEffect(() => {
    if (!onManualTableDataChange) return
    onManualTableDataChange(isCardMode && inputMode === 'manual' ? (data ? {
      explName: data.explName,
      respName: data.respName,
      rowLabels: [...data.rowLabels],
      colLabels: [...data.colLabels],
      cells: data.cells.map(row => [...row]),
    } : null) : null)
  }, [data, inputMode, isCardMode, onManualTableDataChange])

  // ── Manual table mutations ───────────────────────────────────────────────

  function resizeCells(rows: number, cols: number, prev: number[][]): number[][] {
    return Array.from({ length: rows }, (_, ri) =>
      Array.from({ length: cols }, (_, ci) => prev[ri]?.[ci] ?? 0)
    )
  }

  function handleRowLabel(ri: number, v: string) {
    setMRowLabels(prev => prev.map((l, i) => (i === ri ? v : l)))
  }
  function handleColLabel(ci: number, v: string) {
    setMColLabels(prev => prev.map((l, i) => (i === ci ? v : l)))
  }
  function handleCell(ri: number, ci: number, v: string) {
    const n = parseInt(v, 10)
    setMCells(prev =>
      prev.map((row, r) =>
        r === ri ? row.map((c, c2) => (c2 === ci ? (isNaN(n) ? 0 : Math.max(0, n)) : c)) : row
      )
    )
  }
  function handleAddRow() {
    const newLabels = [...mRowLabels, `Group ${String.fromCharCode(65 + mRowLabels.length)}`]
    setMRowLabels(newLabels)
    setMCells(prev => resizeCells(newLabels.length, mColLabels.length, prev))
  }
  function handleRemoveRow(ri: number) {
    if (mRowLabels.length <= 1) return
    const newLabels = mRowLabels.filter((_, i) => i !== ri)
    setMRowLabels(newLabels)
    setMCells(prev => resizeCells(newLabels.length, mColLabels.length, prev.filter((_, i) => i !== ri)))
  }
  function handleAddCol() {
    const newLabels = [...mColLabels, `Category ${mColLabels.length + 1}`]
    setMColLabels(newLabels)
    setMCells(prev => resizeCells(mRowLabels.length, newLabels.length, prev))
  }
  function handleRemoveCol(ci: number) {
    if (mColLabels.length <= 1) return
    const newLabels = mColLabels.filter((_, i) => i !== ci)
    setMColLabels(newLabels)
    setMCells(prev =>
      resizeCells(mRowLabels.length, newLabels.length, prev.map(row => row.filter((_, i) => i !== ci)))
    )
  }

  // ── Pill button helper ───────────────────────────────────────────────────

  function pill(active: boolean, accent = true) {
    return `px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
      active
        ? accent
          ? 'bg-[var(--color-accent)] text-white'
          : 'bg-slate-600 text-white'
        : 'bg-slate-100 text-[var(--color-muted)] hover:bg-slate-200'
    }`
  }

  const outputContent = data ? (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--color-muted)]">Table:</span>
        {([['counts', 'Counts'], ['row', 'Row %'], ['col', 'Column %']] as [TableView, string][]).map(
          ([v, label]) => (
            <button key={v} onClick={() => setTableView(v)} className={pill(tableView === v)}>
              {label}
            </button>
          )
        )}
        <button
          onClick={async () => {
            try {
              setIsCopying(true)
              await writeClipboardTable(buildCopiedTableRows(data, tableView))
            } finally {
              window.setTimeout(() => setIsCopying(false), 400)
            }
          }}
          className="ml-auto rounded-lg border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
        >
          {isCopying ? 'Copied' : 'Copy Table'}
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 overflow-x-auto">
        <OutputTable data={data} view={tableView} />
      </div>

    </div>
  ) : (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8 text-[var(--color-muted)]">
      <div className="text-4xl opacity-25">📋</div>
      <p className="text-sm font-medium">
        {inputMode === 'raw'
          ? 'Drag in a Column Variable and a Row Variable to begin.'
          : 'Enter counts in the table above to get started.'}
      </p>
      {isCardMode && inputMode === 'raw' && (
        <p className="text-xs text-[var(--color-muted)]">
          Use the header Plot Card button after assigning both variables.
        </p>
      )}
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      className={`max-w-5xl mx-auto px-4 ${
        isCardMode ? 'pt-0 pb-6 space-y-2' : 'py-6 space-y-5'
      }`}
    >
      {/* Top controls */}
      {showTopControls && (
      <div className="flex flex-wrap items-end gap-4">
        {!isCardMode && (
          <div className="flex rounded-lg border border-[var(--color-border)] overflow-hidden bg-white">
            {(['raw', 'manual'] as InputMode[]).map(m => (
              <button
                key={m}
                onClick={() => setInputMode(m)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  inputMode === m
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-white text-[var(--color-muted)] hover:bg-slate-50'
                }`}
              >
                {m === 'raw' ? 'Raw Data' : 'Enter Table'}
              </button>
            ))}
          </div>
        )}

        {/* Column selectors — raw mode */}
        {inputMode === 'raw' && !isCardMode && (
          <>
            <div>
              <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
                Column Variable
              </div>
              <select
                value={explColIdLocal}
                onChange={e => setExplColIdLocal(e.target.value)}
                className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">— select —</option>
                {categoricalCols.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide mb-1.5">
                Row Variable
              </div>
              <select
                value={respColIdLocal}
                onChange={e => setRespColIdLocal(e.target.value)}
                className="text-sm border border-[var(--color-border)] rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">— select —</option>
                {categoricalCols.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            {categoricalCols.length < 2 && (
              <p className="text-sm text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg self-center">
                Add two categorical variables to use raw-data mode, or switch to Enter Table.
              </p>
            )}
          </>
        )}
      </div>
      )}

      {/* Drop zones — card mode, raw data */}
      {isCardMode && inputMode === 'raw' && (
        <div
          className="min-h-[520px]"
          style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr',
            gridTemplateRows: 'auto 1fr',
            gap: '6px',
          }}
        >
          <div
            style={{ gridRow: '2', gridColumn: '1' }}
            className="h-full self-stretch"
          >
            <div
              onDragOver={handleNativeDragOver}
              onDrop={handleNativeDrop('rows')}
              className="h-full"
            >
              <DropZone
                id={`${cardId}:rows`}
                label="Row Variable"
                assignedCol={grid.columns.find(c => c.id === respColId) ?? null}
                onClear={() => onClearZone?.('rows')}
                variant="vertical"
              />
            </div>
          </div>

          <div style={{ gridRow: '1', gridColumn: '2' }}>
            <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('cols')}>
              <DropZone
                id={`${cardId}:cols`}
                label="Column Variable"
                assignedCol={grid.columns.find(c => c.id === explColId) ?? null}
                onClear={() => onClearZone?.('cols')}
              />
            </div>
          </div>

          <div
            style={{ gridRow: '2', gridColumn: '2' }}
            className="min-h-[420px] h-full rounded-2xl border border-dashed border-[var(--color-border)] bg-slate-50/70 p-4"
          >
            {outputContent}
          </div>
        </div>
      )}

      {/* Manual entry grid */}
      {inputMode === 'manual' && (
        <ManualInput
          explName={mExplName} respName={mRespName}
          rowLabels={mRowLabels} colLabels={mColLabels} cells={mCells}
          onExplName={setMExplName} onRespName={setMRespName}
          onRowLabel={handleRowLabel} onColLabel={handleColLabel}
          onCell={handleCell}
          onAddRow={handleAddRow} onRemoveRow={handleRemoveRow}
          onAddCol={handleAddCol} onRemoveCol={handleRemoveCol}
        />
      )}

      {/* Empty state */}
      {!isCardMode && !data && (
        <div className="text-center py-14 text-[var(--color-muted)]">
          <div className="text-4xl mb-3 opacity-25">📋</div>
          <p className="text-sm">
            {inputMode === 'raw'
              ? 'Select a Column Variable and a Row Variable above.'
              : 'Enter counts in the table above to get started.'}
          </p>
        </div>
      )}

      {/* ── Output ── */}
      {!isCardMode && data && outputContent}
    </div>
  )
}
