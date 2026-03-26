'use client'

import { useState, useMemo } from 'react'
import { useStore } from '@/lib/store'
import { Histogram } from './Histogram'
import { BoxPlot } from './BoxPlot'
import { ScatterPlot } from './ScatterPlot'
import { BarChart } from './BarChart'
import { DotPlot } from './DotPlot'
import { SegmentedBar } from './SegmentedBar'
import { NormalProbPlot } from './NormalProbPlot'
import { EmptyState } from '@/components/ui/EmptyState'

import { ChartType, CHART_META, inferCharts } from '@/lib/chartHelpers'

export function ChartBuilder() {
  const { grid } = useStore()
  const [hColId, setHColId] = useState<string | null>(null)
  const [vColId, setVColId] = useState<string | null>(null)
  const [groupColId, setGroupColId] = useState<string | null>(null)
  // Store chart override paired with the column key it was chosen for
  const [chartOverride, setChartOverride] = useState<{ type: ChartType; forKey: string } | null>(null)
  const [dragOver, setDragOver] = useState<'h' | 'v' | 'group' | null>(null)

  const hasData = grid.rows.some(r => Object.values(r).some(v => String(v).trim()))

  // Derive effective col IDs — if a column was deleted, treat as unset (no setState in effect needed)
  const colIdSet = useMemo(() => new Set(grid.columns.map(c => c.id)), [grid.columns])
  const effectiveHColId = hColId && colIdSet.has(hColId) ? hColId : null
  const effectiveVColId = vColId && colIdSet.has(vColId) ? vColId : null
  const effectiveGroupColId = groupColId && colIdSet.has(groupColId) ? groupColId : null

  const hCol = grid.columns.find(c => c.id === effectiveHColId) ?? null
  const vCol = grid.columns.find(c => c.id === effectiveVColId) ?? null
  const groupCol = grid.columns.find(c => c.id === effectiveGroupColId) ?? null

  const { primary, alternatives, orientation } = useMemo(
    () => inferCharts(hCol?.type ?? null, vCol?.type ?? null, groupCol?.type ?? null),
    [hCol, vCol, groupCol]
  )

  // Chart override is only valid when columns match the key it was chosen for
  const colKey = `${effectiveHColId}:${effectiveVColId}:${effectiveGroupColId}`
  const activeChart = chartOverride?.forKey === colKey ? chartOverride.type : null
  const currentChart = activeChart ?? primary

  if (!hasData) {
    return <EmptyState icon="📈" title="No data loaded" description="Add data in the Data tab to start charting." />
  }

  function handleDrop(zone: 'h' | 'v' | 'group', e: React.DragEvent) {
    e.preventDefault()
    setDragOver(null)
    const colId = e.dataTransfer.getData('text/plain')
    if (!colId) return
    // Remove from any other zone
    if (hColId === colId && zone !== 'h') setHColId(null)
    if (vColId === colId && zone !== 'v') setVColId(null)
    if (groupColId === colId && zone !== 'group') setGroupColId(null)
    if (zone === 'h') setHColId(colId)
    if (zone === 'v') setVColId(colId)
    if (zone === 'group') setGroupColId(colId)
  }

  function zoneHandlers(zone: 'h' | 'v' | 'group') {
    return {
      onDragOver: (e: React.DragEvent) => { e.preventDefault(); setDragOver(zone) },
      onDragLeave: () => setDragOver(null),
      onDrop: (e: React.DragEvent) => handleDrop(zone, e),
    }
  }

  function clearZone(zone: 'h' | 'v' | 'group') {
    if (zone === 'h') setHColId(null)
    if (zone === 'v') setVColId(null)
    if (zone === 'group') setGroupColId(null)
  }

  function renderChart() {
    // For single-axis charts the main variable lives on whichever axis was used
    const mainColId = orientation === 'h' ? effectiveHColId : effectiveVColId
    const hCatAndVNum = hCol?.type === 'categorical' && vCol?.type === 'numeric'

    switch (currentChart) {
      case 'histogram':
        return <Histogram colId={mainColId} groupColId={effectiveGroupColId} orientation={orientation} />
      case 'dot':
        return hCatAndVNum
          ? <DotPlot colId={effectiveVColId} groupByColId={effectiveHColId} orientation="h" />
          : <DotPlot colId={mainColId} groupByColId={effectiveGroupColId} orientation={orientation} />
      case 'box':
        return hCatAndVNum
          ? <BoxPlot colId={effectiveVColId} groupColId={effectiveHColId} />
          : <BoxPlot colId={mainColId} groupColId={effectiveGroupColId} />
      case 'scatter':
        return <ScatterPlot xColId={effectiveHColId} yColId={effectiveVColId} colorByColId={effectiveGroupColId} />
      case 'bar':
        return <BarChart colId={mainColId} orientation={orientation} />
      case 'segmented':
        return <SegmentedBar xColId={effectiveHColId} fillColId={effectiveGroupColId} />
      case 'normalprob':
        return <NormalProbPlot colId={mainColId} />
      default:
        return (
          <EmptyState
            icon="📈"
            title="Drag a variable to get started"
            description="Drag a variable from the sidebar on the left onto the Horizontal or Vertical axis zone above."
          />
        )
    }
  }

  const zones: { key: 'h' | 'v' | 'group'; label: string; hint: string; colId: string | null }[] = [
    { key: 'h', label: 'Horizontal axis', hint: '← drag a variable here', colId: effectiveHColId },
    { key: 'v', label: 'Vertical axis', hint: '← drag a numeric variable', colId: effectiveVColId },
    { key: 'group', label: 'Grouping variable', hint: '← drag a categorical variable', colId: effectiveGroupColId },
  ]

  return (
    <div className="space-y-4 px-4 pt-4">
      {/* Drop zones */}
      <div className="grid grid-cols-3 gap-3">
        {zones.map(({ key, label, hint, colId }) => {
          const assignedCol = colId ? grid.columns.find(c => c.id === colId) : null
          const isTarget = dragOver === key
          return (
            <div
              key={key}
              {...zoneHandlers(key)}
              className={`rounded-xl border-2 p-3 min-h-[76px] flex flex-col gap-2 transition-colors ${
                isTarget
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                  : 'border-dashed border-[var(--color-border)] bg-slate-50'
              }`}
            >
              <div className="text-xs font-semibold text-[var(--color-muted)] uppercase tracking-wide leading-none">
                {label}
              </div>
              {assignedCol ? (
                <div
                  draggable
                  onDragStart={e => {
                    e.dataTransfer.setData('text/plain', colId!)
                    e.dataTransfer.effectAllowed = 'move'
                  }}
                  onDragEnd={() => {}}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--color-accent)] text-white text-sm font-medium self-start cursor-grab active:cursor-grabbing"
                >
                  <span className="opacity-70 text-xs font-mono">{assignedCol.type === 'numeric' ? '#' : 'A'}</span>
                  <span>{assignedCol.name}</span>
                  <button
                    onClick={e => { e.stopPropagation(); clearZone(key) }}
                    className="ml-1 opacity-70 hover:opacity-100 text-base leading-none"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
              ) : (
                <div className="text-xs text-[var(--color-muted)] italic">{hint}</div>
              )}
            </div>
          )
        })}
      </div>

      {/* Chart type selector (shown only when there's something to chart) */}
      {primary && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-[var(--color-muted)]">Chart type:</span>
          {[primary, ...alternatives].map(ct => (
            <button
              key={ct}
              onClick={() => setChartOverride({ type: ct, forKey: colKey })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
                currentChart === ct
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                  : 'border-[var(--color-border)] bg-white text-[var(--color-muted)] hover:border-slate-300'
              }`}
            >
              <span>{CHART_META[ct].icon}</span>
              {CHART_META[ct].label}
            </button>
          ))}
        </div>
      )}

      {/* Chart output */}
      <div>{renderChart()}</div>
    </div>
  )
}
