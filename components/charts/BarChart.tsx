'use client'

import { useMemo } from 'react'
import type { Data } from 'plotly.js'
import { areBrushRowsEqual, createPlotlySelectionStyles, extractRowsFromPlotlyPoints, selectedPointIndicesForTrace, useEffectiveBrushSet } from '@/lib/linkedBrush'
import { useStore } from '@/lib/store'
import { getStringValues } from '@/lib/gridHelpers'
import { getFrequencyTable } from '@/lib/statistics'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { truncateChartLabel } from '@/lib/chartLabels'

interface BarChartProps {
  colId: string | null
  valueMode?: 'count' | 'percent'
  orientation?: 'h' | 'v'   // 'h' = variable on horizontal axis (vertical bars); 'v' = variable on vertical axis (horizontal bars)
}

export function BarChart({ colId, valueMode = 'count', orientation = 'h' }: BarChartProps) {
  const { grid } = useStore()
  const pinnedBrush = useStore(state => state.brush.pinned)
  const setBrushHover = useStore(state => state.setBrushHover)
  const setBrushPinned = useStore(state => state.setBrushPinned)
  const clearBrush = useStore(state => state.clearBrush)
  const effectiveBrushSet = useEffectiveBrushSet()
  const { hideAxisTitles, colors } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId)

  const freqTable = useMemo(() => {
    if (!colId) return []
    const rowsByValue = new Map<string, number[]>()
    grid.rows.forEach((row, rowIndex) => {
      const value = String(row[colId] ?? '').trim()
      if (!value) return
      const entries = rowsByValue.get(value) ?? []
      entries.push(rowIndex)
      rowsByValue.set(value, entries)
    })
    return getFrequencyTable([...rowsByValue.keys()])
      .slice(0, 20)
      .map(row => ({ ...row, rowIndices: rowsByValue.get(row.value) ?? [] }))
  }, [grid, colId])

  if (!colId || !col) {
    return <EmptyState icon="🔢" title="Drop a categorical variable" description="Drag a categorical variable to see a bar chart of frequencies." />
  }

  const colLabel = truncateChartLabel(col.name)

  const barColors = freqTable.map((_, i) => colors[i % colors.length])
  const totalCount = freqTable.reduce((sum, row) => sum + row.count, 0)
  const displayValues = valueMode === 'percent'
    ? freqTable.map(row => (totalCount ? (row.count / totalCount) * 100 : 0))
    : freqTable.map(row => row.count)
  const displayLabels = valueMode === 'percent'
    ? displayValues.map(value => `${value.toFixed(1)}%`)
    : freqTable.map(r => String(r.count))

  // orientation='h': variable on x-axis → standard vertical bars (column chart)
  // orientation='v': variable on y-axis → horizontal bars
  const selectedpoints = effectiveBrushSet.size > 0
    ? selectedPointIndicesForTrace(freqTable.map(row => row.rowIndices), effectiveBrushSet) ?? undefined
    : undefined

  const traces: Data[] = orientation === 'h'
    ? [createPlotlySelectionStyles({
        type: 'bar',
        x: freqTable.map(r => r.value || '(blank)'),
        y: displayValues,
        customdata: freqTable.map(r => r.rowIndices),
        selectedpoints,
        text: displayLabels,
        textposition: 'outside',
        marker: { color: barColors, opacity: 0.9 },
        hovertemplate: valueMode === 'percent'
          ? '%{x}: %{y:.1f}%<extra></extra>'
          : '%{x}: %{y}<extra></extra>',
      })]
    : [createPlotlySelectionStyles({
        type: 'bar',
        orientation: 'h',
        x: displayValues,
        y: freqTable.map(r => r.value || '(blank)'),
        customdata: freqTable.map(r => r.rowIndices),
        selectedpoints,
        text: displayLabels,
        textposition: 'outside',
        marker: { color: barColors, opacity: 0.9 },
        hovertemplate: valueMode === 'percent'
          ? '%{y}: %{x:.1f}%<extra></extra>'
          : '%{y}: %{x}<extra></extra>',
      })]

  const layout = orientation === 'h'
    ? {
        xaxis: { title: hideAxisTitles ? undefined : { text: colLabel } },
        yaxis: {
          title: hideAxisTitles ? undefined : { text: valueMode === 'percent' ? 'Percent' : 'Count' },
          ticksuffix: valueMode === 'percent' ? '%' : '',
          range: valueMode === 'percent' ? [0, 100] : undefined,
        },
        // t: 36 gives room for 'outside' text labels above the tallest bar
        margin: hideAxisTitles ? { t: 36, r: 16, b: 44, l: 52 } : { l: 60, r: 40, t: 36, b: 80 },
      }
    : {
        xaxis: {
          title: hideAxisTitles ? undefined : { text: valueMode === 'percent' ? 'Percent' : 'Count' },
          ticksuffix: valueMode === 'percent' ? '%' : '',
          range: valueMode === 'percent' ? [0, 100] : undefined,
        },
        yaxis: { autorange: 'reversed' as const },
        // r: 48 gives room for 'outside' text labels to the right of the longest bar
        margin: hideAxisTitles ? { t: 8, r: 48, b: 44, l: 52 } : { l: 130, r: 80, t: 36, b: 60 },
      }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={layout}
          title={hideAxisTitles ? undefined : `${colLabel} — ${valueMode === 'percent' ? 'Percent' : 'Frequency'}`}
          onHover={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            setBrushHover(rows)
          }}
          onUnhover={() => setBrushHover([])}
          onClick={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            if (rows.length === 0) return
            if (areBrushRowsEqual(rows, pinnedBrush)) clearBrush()
            else setBrushPinned(rows)
          }}
          onSelected={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            setBrushPinned(rows)
          }}
          onDeselect={clearBrush}
        />
      </div>
    </div>
  )
}
