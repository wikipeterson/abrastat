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

interface BarChartProps {
  colId: string | null
  orientation?: 'h' | 'v'   // 'h' = variable on horizontal axis (vertical bars); 'v' = variable on vertical axis (horizontal bars)
}

export function BarChart({ colId, orientation = 'h' }: BarChartProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId)

  const freqTable = useMemo(() => {
    if (!colId) return []
    const values = getStringValues(grid, colId).filter(v => v.trim())
    return getFrequencyTable(values).slice(0, 20)
  }, [grid, colId])

  if (!colId || !col) {
    return <EmptyState icon="🔢" title="Drop a categorical variable" description="Drag a categorical variable to see a bar chart of frequencies." />
  }

  const colors = freqTable.map((_, i) => ABRA_COLORS[i % ABRA_COLORS.length])

  // orientation='h': variable on x-axis → standard vertical bars (column chart)
  // orientation='v': variable on y-axis → horizontal bars
  const traces: Data[] = orientation === 'h'
    ? [{
        type: 'bar',
        x: freqTable.map(r => r.value || '(blank)'),
        y: freqTable.map(r => r.count),
        text: freqTable.map(r => String(r.count)),
        textposition: 'outside',
        marker: { color: colors, opacity: 0.9 },
        hovertemplate: '%{x}: %{y}<extra></extra>',
      }]
    : [{
        type: 'bar',
        orientation: 'h',
        x: freqTable.map(r => r.count),
        y: freqTable.map(r => r.value || '(blank)'),
        text: freqTable.map(r => String(r.count)),
        textposition: 'outside',
        marker: { color: colors, opacity: 0.9 },
        hovertemplate: '%{y}: %{x}<extra></extra>',
      }]

  const layout = orientation === 'h'
    ? {
        xaxis: { title: hideAxisTitles ? undefined : { text: col.name } },
        yaxis: { title: hideAxisTitles ? undefined : { text: 'Count' } },
        margin: hideAxisTitles ? { t: 8, r: 16, b: 44, l: 52 } : { l: 60, r: 40, t: 36, b: 80 },
      }
    : {
        xaxis: { title: hideAxisTitles ? undefined : { text: 'Count' } },
        yaxis: { autorange: 'reversed' as const },
        margin: hideAxisTitles ? { t: 8, r: 16, b: 44, l: 52 } : { l: 130, r: 80, t: 36, b: 60 },
      }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={layout}
          title={hideAxisTitles ? undefined : `${col.name} — Frequency`}
        />
      </div>
    </div>
  )
}
