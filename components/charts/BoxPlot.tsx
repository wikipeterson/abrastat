'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'

interface BoxPlotProps {
  colId: string | null
  groupColId?: string | null
}

export function BoxPlot({ colId, groupColId }: BoxPlotProps) {
  const { grid } = useStore()
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupColId ? (grid.columns.find(c => c.id === groupColId) ?? null) : null

  const traces = useMemo(() => {
    if (!col || !colId) return []
    const numericValues = getNumericValues(grid, colId)

    if (groupCol && groupColId) {
      const groups = getStringValues(grid, groupColId)
      const uniqueGroups = [...new Set(groups)].filter(Boolean)
      return uniqueGroups.map((group, i) => ({
        type: 'box',
        name: group,
        y: numericValues.filter((_, idx) => groups[idx] === group),
        marker: { color: ABRA_COLORS[i % ABRA_COLORS.length], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
        line: { color: ABRA_COLORS[i % ABRA_COLORS.length], width: 1.5 },
        fillcolor: ABRA_COLORS[i % ABRA_COLORS.length] + '28',
        boxpoints: 'outliers',
        whiskerwidth: 0.6,
        boxmean: false,
      }))
    }

    return [{
      type: 'box',
      name: col.name,
      y: numericValues,
      marker: { color: ABRA_COLORS[0], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
      line: { color: ABRA_COLORS[0], width: 1.5 },
      fillcolor: ABRA_COLORS[0] + '28',
      boxpoints: 'outliers',
      whiskerwidth: 0.6,
      boxmean: false,
      hovertemplate:
        'Max: %{upperfence}<br>Q3: %{q3}<br>Median: %{median}<br>Q1: %{q1}<br>Min: %{lowerfence}<extra></extra>',
    }]
  }, [grid, colId, col, groupColId, groupCol])

  if (!col) {
    return <EmptyState icon="📦" title="Drop a numeric variable" description="Drag a numeric variable to the horizontal axis to build a box plot." />
  }

  return (
    <div className="px-4">
      <PlotlyChart
        data={traces}
        layout={{
          yaxis: { title: col.name },
          showlegend: !!groupCol,
        }}
        title={`Box plot — ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
      />
    </div>
  )
}
