'use client'

import { useEffect, useRef, useState } from 'react'
import { SummaryResult, FrequencyRow } from '@/types'
import { linearRegression, twoWayTable } from '@/lib/statistics'
import { ManualTwoWayTableSnapshot } from '@/lib/exploreTypes'
import { writeClipboardTable } from '@/lib/clipboardTable'

const STAT_TOOLTIPS: Record<string, string> = {
  n: 'The number of non-missing values in this column.',
  Mean: 'The average — sum of all values divided by n.',
  Median: 'The middle value when data is sorted; less affected by outliers than the mean.',
  'Std Dev': 'Standard deviation — measures how spread out the values are.',
  Variance: 'The square of the standard deviation.',
  Min: 'The smallest value in the dataset.',
  Max: 'The largest value in the dataset.',
  Range: 'The difference between the maximum and minimum values.',
  Q1: 'The 25th percentile — 25% of values fall below this.',
  Q3: 'The 75th percentile — 75% of values fall below this.',
  IQR: 'Interquartile range — the middle 50% of the data (Q3 − Q1).',
}

function fmt(n: number): string {
  return parseFloat(n.toPrecision(4)).toLocaleString()
}

function CountUp({ target }: { target: number }) {
  const [display, setDisplay] = useState(0)
  const raf = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 600
    function step(now: number) {
      const t = Math.min((now - start) / duration, 1)
      setDisplay(target * t)
      if (t < 1) raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [target])

  return <>{fmt(display)}</>
}

interface StatRowProps {
  label: string
  value: number
  highlight?: boolean
}

function StatRow({ label, value, highlight }: StatRowProps) {
  return (
    <div
      className={`flex justify-between items-center px-3 py-1.5 text-sm rounded ${highlight ? 'bg-[var(--color-gold-light)]' : ''}`}
      title={STAT_TOOLTIPS[label] ?? ''}
    >
      <span className="text-[var(--color-muted)] cursor-help">{label}</span>
      <span className="font-mono font-medium text-[var(--color-text)]">
        <CountUp target={value} />
      </span>
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-muted)] px-3 pt-3 pb-1">
      {children}
    </div>
  )
}

export function NumericStatCard({ result }: { result: SummaryResult }) {
  async function copyAsTable() {
    const rows: Array<Array<string | number>> = [
      ['Statistic', 'Value'],
      ['n', result.n],
      ['Mean', result.mean],
      ['Std Dev', result.stdDev],
      ['Variance', result.variance],
      ['Min', result.min],
      ['Q1', result.q1],
      ['Median', result.median],
      ['Q3', result.q3],
      ['Max', result.max],
    ]
    await writeClipboardTable(rows)
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-[var(--color-text)] truncate">{result.column}</h3>
        <button onClick={() => void copyAsTable()} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors ml-2 flex-shrink-0">
          Copy as Table
        </button>
      </div>

      {/* n */}
      <div className="space-y-0.5">
        <StatRow label="n" value={result.n} />
      </div>

      {/* Center & Spread */}
      <div className="mt-1 border-t border-[var(--color-border)]">
        <SectionLabel>Center &amp; Spread</SectionLabel>
        <div className="space-y-0.5">
          <StatRow label="Mean" value={result.mean} highlight />
          <StatRow label="Std Dev" value={result.stdDev} />
          <StatRow label="Variance" value={result.variance} />
        </div>
      </div>

      {/* Five-Number Summary */}
      <div className="mt-1 border-t border-[var(--color-border)]">
        <SectionLabel>Five-Number Summary</SectionLabel>
        <div className="space-y-0.5">
          <StatRow label="Min" value={result.min} />
          <StatRow label="Q1" value={result.q1} />
          <StatRow label="Median" value={result.median} highlight />
          <StatRow label="Q3" value={result.q3} />
          <StatRow label="Max" value={result.max} />
        </div>
      </div>

      {result.outliers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
          <p className="text-xs text-[var(--color-muted)]">
            <span className="font-medium text-red-500">{result.outliers.length} outlier{result.outliers.length > 1 ? 's' : ''}</span>
            {' '}— {result.outliers.slice(0, 5).map(fmt).join(', ')}{result.outliers.length > 5 ? '…' : ''}
          </p>
        </div>
      )}
    </div>
  )
}

export function LinearRegressionCard({ xName, yName, xs, ys }: { xName: string; yName: string; xs: number[]; ys: number[] }) {
  const { slope, intercept, r } = linearRegression(xs, ys)
  const r2 = r * r
  const absR = Math.abs(r)
  const direction = r >= 0 ? 'positive' : 'negative'
  const strength = absR >= 0.8 ? 'strong' : absR >= 0.5 ? 'moderate' : absR >= 0.3 ? 'weak' : 'very weak'
  const interceptSign = intercept >= 0 ? '+' : '−'

  async function copyRegression() {
    const rows: Array<Array<string | number>> = [
      ['Linear Regression', `${yName} vs ${xName}`],
      ['Equation', `ŷ = ${fmt(slope)}x ${interceptSign} ${fmt(Math.abs(intercept))}`],
      ['r', r.toFixed(4)],
      ['r²', r2.toFixed(4)],
      ['Slope', fmt(slope)],
      ['Intercept', fmt(intercept)],
    ]
    await writeClipboardTable(rows)
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-4 md:col-span-2 xl:col-span-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-[var(--color-text)]">
          Linear Regression — <span className="text-[var(--color-accent)]">{yName}</span> vs <span className="text-[var(--color-accent)]">{xName}</span>
        </h3>
        <button onClick={() => void copyRegression()} className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] flex-shrink-0 ml-2">
          Copy as Table
        </button>
      </div>
      <div className="font-mono text-lg font-medium text-[var(--color-text)] mb-4 bg-[var(--color-gold-light)] rounded-lg px-4 py-2">
        ŷ = {fmt(slope)}x {interceptSign} {fmt(Math.abs(intercept))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'r', value: r.toFixed(4), sub: `${strength} ${direction}` },
          { label: 'r²', value: r2.toFixed(4), sub: `${(r2 * 100).toFixed(1)}% of variation explained` },
          { label: 'Slope', value: fmt(slope), sub: `for each +1 ${xName}` },
          { label: 'Intercept', value: fmt(intercept), sub: `when ${xName} = 0` },
        ].map(item => (
          <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
            <div className="text-xs text-[var(--color-muted)] mb-0.5">{item.label}</div>
            <div className="font-mono font-semibold text-[var(--color-text)] text-base">{item.value}</div>
            <div className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-tight">{item.sub}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

type TableMode = 'count' | 'row' | 'col' | 'total' | 'expected'

function getExpectedCell(counts: number[][], ri: number, ci: number): number {
  const rowTotals = counts.map(row => row.reduce((s, v) => s + v, 0))
  const colTotals = counts[0]
    ? counts[0].map((_, colIdx) => counts.reduce((s, row) => s + row[colIdx], 0))
    : []
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0)
  if (!grandTotal) return 0
  return (rowTotals[ri] * colTotals[ci]) / grandTotal
}

function buildTwoWayCopiedTableText(
  rowLabels: string[],
  colLabels: string[],
  counts: number[][],
  displayAName: string,
  displayBName: string,
  mode: TableMode,
) {
  const rowTotals = counts.map(row => row.reduce((s, v) => s + v, 0))
  const colTotals = colLabels.map((_, ci) => counts.reduce((s, row) => s + row[ci], 0))
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0)

  function cellDisplay(count: number, ri: number, ci: number): string {
    if (mode === 'count') return String(count)
    if (mode === 'row') return rowTotals[ri] ? `${count} (${(count / rowTotals[ri] * 100).toFixed(1)}%)` : String(count)
    if (mode === 'col') return colTotals[ci] ? `${count} (${(count / colTotals[ci] * 100).toFixed(1)}%)` : String(count)
    if (mode === 'expected') return getExpectedCell(counts, ri, ci).toFixed(2).replace(/\.00$/, '')
    return grandTotal ? (count / grandTotal * 100).toFixed(1) + '%' : '—'
  }

  function totalDisplay(val: number, base: number): string {
    if (mode === 'count' || mode === 'row' || mode === 'col' || mode === 'expected') return String(val)
    return base ? (val / base * 100).toFixed(1) + '%' : '—'
  }

  const header = [`${displayAName} \\ ${displayBName}`, ...colLabels, 'Total']
  const body = rowLabels.map((rowLabel, ri) => [
    rowLabel,
    ...colLabels.map((_, ci) => cellDisplay(counts[ri][ci], ri, ci)),
    totalDisplay(rowTotals[ri], grandTotal),
  ])
  const totals = ['Total', ...colLabels.map((_, ci) => totalDisplay(colTotals[ci], grandTotal)), mode === 'total' ? '100%' : String(grandTotal)]

  return [header, ...body, totals].map(row => row.join('\t')).join('\n')
}

function buildTwoWayCopiedTableRows(
  rowLabels: string[],
  colLabels: string[],
  counts: number[][],
  displayAName: string,
  displayBName: string,
  mode: TableMode,
) {
  const rowTotals = counts.map(row => row.reduce((s, v) => s + v, 0))
  const colTotals = colLabels.map((_, ci) => counts.reduce((s, row) => s + row[ci], 0))
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0)

  function cellDisplay(count: number, ri: number, ci: number): string {
    if (mode === 'count') return String(count)
    if (mode === 'row') return rowTotals[ri] ? `${count} (${(count / rowTotals[ri] * 100).toFixed(1)}%)` : String(count)
    if (mode === 'col') return colTotals[ci] ? `${count} (${(count / colTotals[ci] * 100).toFixed(1)}%)` : String(count)
    if (mode === 'expected') return getExpectedCell(counts, ri, ci).toFixed(2).replace(/\.00$/, '')
    return grandTotal ? (count / grandTotal * 100).toFixed(1) + '%' : '—'
  }

  function totalDisplay(val: number, base: number): string {
    if (mode === 'count' || mode === 'row' || mode === 'col' || mode === 'expected') return String(val)
    return base ? (val / base * 100).toFixed(1) + '%' : '—'
  }

  const header = [`${displayAName} \\ ${displayBName}`, ...colLabels, 'Total']
  const body = rowLabels.map((rowLabel, ri) => [
    rowLabel,
    ...colLabels.map((_, ci) => cellDisplay(counts[ri][ci], ri, ci)),
    totalDisplay(rowTotals[ri], grandTotal),
  ])
  const totals = ['Total', ...colLabels.map((_, ci) => totalDisplay(colTotals[ci], grandTotal)), mode === 'total' ? '100%' : String(grandTotal)]
  return [header, ...body, totals]
}

export function TwoWayTableCard({
  colAName,
  colBName,
  colAValues,
  colBValues,
  manualTable,
}: {
  colAName?: string
  colBName?: string
  colAValues?: string[]
  colBValues?: string[]
  manualTable?: ManualTwoWayTableSnapshot
}) {
  const [mode, setMode] = useState<TableMode>('count')
  const [isCopying, setIsCopying] = useState(false)
  const { rowLabels, colLabels, counts, displayAName, displayBName } = manualTable
    ? {
        rowLabels: manualTable.rowLabels,
        colLabels: manualTable.colLabels,
        counts: manualTable.cells,
        displayAName: manualTable.respName,
        displayBName: manualTable.explName,
      }
    : {
        ...twoWayTable(colAValues ?? [], colBValues ?? []),
        displayAName: colAName ?? 'Rows',
        displayBName: colBName ?? 'Columns',
      }

  const rowTotals = counts.map(row => row.reduce((s, v) => s + v, 0))
  const colTotals = colLabels.map((_, ci) => counts.reduce((s, row) => s + row[ci], 0))
  const grandTotal = rowTotals.reduce((s, v) => s + v, 0)

  function cellDisplay(count: number, ri: number, ci: number): string {
    if (mode === 'count') return String(count)
    if (mode === 'row') return rowTotals[ri] ? `${count} (${(count / rowTotals[ri] * 100).toFixed(1)}%)` : String(count)
    if (mode === 'col') return colTotals[ci] ? `${count} (${(count / colTotals[ci] * 100).toFixed(1)}%)` : String(count)
    if (mode === 'expected') return getExpectedCell(counts, ri, ci).toFixed(2).replace(/\.00$/, '')
    return grandTotal ? (count / grandTotal * 100).toFixed(1) + '%' : '—'
  }

  function totalDisplay(val: number, base: number): string {
    if (mode === 'count' || mode === 'row' || mode === 'col' || mode === 'expected') return String(val)
    return base ? (val / base * 100).toFixed(1) + '%' : '—'
  }

  async function copyTable() {
    try {
      setIsCopying(true)
      await writeClipboardTable(
        buildTwoWayCopiedTableRows(rowLabels, colLabels, counts, displayAName, displayBName, mode)
      )
    } finally {
      window.setTimeout(() => setIsCopying(false), 400)
    }
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-4 md:col-span-2 xl:col-span-3">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold text-[var(--color-text)]">
          Two-Way Table — <span className="text-[var(--color-accent)]">{displayAName}</span> × <span className="text-[var(--color-accent)]">{displayBName}</span>
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={copyTable}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1 text-xs font-medium text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors"
          >
            {isCopying ? 'Copied' : 'Copy Table'}
          </button>
          {(['count', 'row', 'col', 'expected', 'total'] as TableMode[]).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${mode === m ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-100 text-[var(--color-muted)] hover:bg-slate-200'}`}
            >
              {m === 'count' ? 'Counts' : m === 'row' ? 'Row %' : m === 'col' ? 'Col %' : m === 'expected' ? 'Expected' : 'Total %'}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr>
                <th className="text-left px-3 py-2 text-[var(--color-muted)] font-medium border-b border-[var(--color-border)]">
                {displayAName} ↓ / {displayBName} →
                </th>
              {colLabels.map(label => (
                <th key={label} className="px-3 py-2 text-center font-medium bg-[var(--color-grid-header)] text-white border-b border-slate-600">
                  {label}
                </th>
              ))}
              <th className="px-3 py-2 text-center font-medium bg-slate-600 text-white border-b border-slate-500">Total</th>
            </tr>
          </thead>
          <tbody>
            {rowLabels.map((rowLabel, ri) => (
              <tr key={rowLabel} className="border-b border-[var(--color-border)] hover:bg-slate-50">
                <td className="px-3 py-2 font-medium text-[var(--color-text)] bg-slate-50">{rowLabel}</td>
                {colLabels.map((_, ci) => (
                  <td key={ci} className="px-3 py-2 text-center font-mono text-[var(--color-text)]">
                    {cellDisplay(counts[ri][ci], ri, ci)}
                  </td>
                ))}
                <td className="px-3 py-2 text-center font-mono font-semibold text-[var(--color-text)] bg-slate-50">
                  {totalDisplay(rowTotals[ri], grandTotal)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-semibold">
              <td className="px-3 py-2 text-[var(--color-text)]">Total</td>
              {colTotals.map((ct, ci) => (
                <td key={ci} className="px-3 py-2 text-center font-mono text-[var(--color-text)]">
                  {totalDisplay(ct, grandTotal)}
                </td>
              ))}
              <td className="px-3 py-2 text-center font-mono text-[var(--color-text)]">{grandTotal}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

const STAT_COLS: { key: string; label: string; get: (s: SummaryResult) => number; highlight?: boolean }[] = [
  { key: 'n',       label: 'n',        get: s => s.n },
  { key: 'mean',    label: 'Mean',     get: s => s.mean,    highlight: true },
  { key: 'stdDev',  label: 'Std. Dev.',get: s => s.stdDev },
  { key: 'variance',label: 'Variance', get: s => s.variance },
  { key: 'min',     label: 'Min',      get: s => s.min },
  { key: 'q1',      label: 'Q1',       get: s => s.q1 },
  { key: 'median',  label: 'Median',   get: s => s.median,  highlight: true },
  { key: 'q3',      label: 'Q3',       get: s => s.q3 },
  { key: 'max',     label: 'Max',      get: s => s.max },
  { key: 'iqr',     label: 'IQR',      get: s => s.iqr },
  { key: 'range',   label: 'Range',    get: s => s.range },
]

export interface NumericTableRow {
  label: string | null
  summary: SummaryResult | null
}

export function NumericStatsTable({
  colName,
  rows,
  groupColName,
  rowLabelHeader,
}: {
  colName: string
  rows: NumericTableRow[]
  groupColName?: string | null
  rowLabelHeader?: string
}) {
  const labelHeader = rowLabelHeader ?? groupColName ?? null
  const showLabel = !!labelHeader

  function copyTable() {
    const header: Array<string | number> = [...(showLabel ? [labelHeader!] : []), ...STAT_COLS.map(c => c.label)]
    const dataRows: Array<Array<string | number>> = rows.filter(r => r.summary).map(r => [
      ...(showLabel ? [r.label ?? '—'] : []),
      ...STAT_COLS.map(c => fmt(c.get(r.summary!))),
    ])
    void writeClipboardTable([header, ...dataRows])
  }

  return (
    <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-[var(--color-text)]">{colName}</h3>
          {groupColName && !rowLabelHeader && (
            <p className="text-xs text-[var(--color-muted)]">Group by: {groupColName}</p>
          )}
        </div>
        <button
          onClick={copyTable}
          className="text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)] transition-colors flex-shrink-0 ml-3"
        >
          Copy as Table
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="bg-[var(--color-grid-header)] text-white text-xs">
              {showLabel && (
                <th className="px-3 py-2 text-left font-medium whitespace-nowrap">{labelHeader}</th>
              )}
              {STAT_COLS.map(c => (
                <th
                  key={c.key}
                  className={`px-3 py-2 text-right font-medium whitespace-nowrap ${c.highlight ? 'border-b-2 border-[var(--color-gold)]' : ''}`}
                  title={STAT_TOOLTIPS[c.label] ?? ''}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.filter(r => r.summary).map((row, i) => (
              <tr key={i} className={`border-t border-[var(--color-border)] hover:bg-slate-50 ${i % 2 === 1 ? 'bg-slate-50/50' : ''}`}>
                {showLabel && (
                  <td className="px-3 py-2 font-medium text-[var(--color-text)] whitespace-nowrap">
                    {row.label ?? '—'}
                  </td>
                )}
                {STAT_COLS.map(c => (
                  <td
                    key={c.key}
                    className={`px-3 py-2 text-right font-mono text-[var(--color-text)] whitespace-nowrap ${c.highlight ? 'bg-[var(--color-gold-light)]' : ''}`}
                  >
                    {fmt(c.get(row.summary!))}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function CategoricalStatCard({ column, rows }: { column: string; rows: FrequencyRow[] }) {
  return (
    <div className="bg-[var(--color-surface)] rounded-2xl shadow-[var(--shadow-card)] border border-[var(--color-border)] p-4">
      <h3 className="font-semibold text-[var(--color-text)] mb-3">{column} <span className="text-xs font-normal text-[var(--color-muted)]">(categorical)</span></h3>
      <div className="space-y-1">
        {rows.slice(0, 10).map(r => (
          <div key={r.value} className="flex items-center gap-2 text-sm">
            <div className="h-2 rounded-full bg-[var(--color-accent)]" style={{ width: `${r.percent}%`, maxWidth: '60%', minWidth: 4 }} />
            <span className="text-[var(--color-text)] truncate flex-1">{r.value || '(blank)'}</span>
            <span className="text-[var(--color-muted)] font-mono text-xs flex-shrink-0">{r.count} ({r.percent.toFixed(1)}%)</span>
          </div>
        ))}
        {rows.length > 10 && <p className="text-xs text-[var(--color-muted)] mt-1">+ {rows.length - 10} more categories</p>}
      </div>
    </div>
  )
}
