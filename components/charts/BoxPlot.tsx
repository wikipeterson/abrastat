'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'

interface BoxPlotProps {
  colId: string | null
  groupColId?: string | null
  orientation?: 'h' | 'v'
}

export function BoxPlot({ colId, groupColId, orientation = 'v' }: BoxPlotProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupColId ? (grid.columns.find(c => c.id === groupColId) ?? null) : null
  const isH = orientation === 'h'

  const traces = useMemo(() => {
    if (!col || !colId) return []
    const numericValues = getNumericValues(grid, colId)

    if (groupCol && groupColId) {
      const groups = getStringValues(grid, groupColId)
      const uniqueGroups = [...new Set(groups)].filter(Boolean)
      return uniqueGroups.map((group, i) => ({
        type: 'box',
        name: group,
        orientation,
        ...(isH
          ? { x: numericValues.filter((_, idx) => groups[idx] === group) }
          : { y: numericValues.filter((_, idx) => groups[idx] === group) }),
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
      orientation,
      ...(isH ? { x: numericValues } : { y: numericValues }),
      marker: { color: ABRA_COLORS[0], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
      line: { color: ABRA_COLORS[0], width: 1.5 },
      fillcolor: ABRA_COLORS[0] + '28',
      boxpoints: 'outliers',
      whiskerwidth: 0.6,
      boxmean: false,
      hovertemplate:
        'Max: %{upperfence}<br>Q3: %{q3}<br>Median: %{median}<br>Q1: %{q1}<br>Min: %{lowerfence}<extra></extra>',
    }]
  }, [grid, colId, col, groupColId, groupCol, orientation, isH])

  if (!col) {
    return <EmptyState icon="📦" title="Drop a numeric variable" description="Drag a numeric variable to build a box plot." />
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            ...(isH
              ? { xaxis: { title: hideAxisTitles ? undefined : { text: col.name } } }
              : { yaxis: { title: hideAxisTitles ? undefined : { text: col.name } } }),
            showlegend: !!groupCol,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `Box plot — ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
        />
      </div>
    </div>
  )
}
