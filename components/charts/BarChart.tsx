'use client'

import { useMemo } from 'react'
import type { Data } from 'plotly.js'
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
  const { hideAxisTitles, colors } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId)

  const freqTable = useMemo(() => {
    if (!colId) return []
    const values = getStringValues(grid, colId).filter(v => v.trim())
    return getFrequencyTable(values).slice(0, 20)
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
  const traces: Data[] = orientation === 'h'
    ? [{
        type: 'bar',
        x: freqTable.map(r => r.value || '(blank)'),
        y: displayValues,
        text: displayLabels,
        textposition: 'outside',
        marker: { color: barColors, opacity: 0.9 },
        hovertemplate: valueMode === 'percent'
          ? '%{x}: %{y:.1f}%<extra></extra>'
          : '%{x}: %{y}<extra></extra>',
      }]
    : [{
        type: 'bar',
        orientation: 'h',
        x: displayValues,
        y: freqTable.map(r => r.value || '(blank)'),
        text: displayLabels,
        textposition: 'outside',
        marker: { color: barColors, opacity: 0.9 },
        hovertemplate: valueMode === 'percent'
          ? '%{y}: %{x:.1f}%<extra></extra>'
          : '%{y}: %{x}<extra></extra>',
      }]

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
        />
      </div>
    </div>
  )
}
