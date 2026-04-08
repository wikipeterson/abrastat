'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getNumericValues, getNumericGroup } from '@/lib/gridHelpers'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { sortCategoryValues } from '@/lib/categoryOrder'

interface BoxPlotProps {
  colId: string | null
  groupColId?: string | null
  orientation?: 'h' | 'v'
}

export function BoxPlot({ colId, groupColId, orientation = 'v' }: BoxPlotProps) {
  const { grid } = useStore()
  const { hideAxisTitles, colors, showOutlierFences } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupColId ? (grid.columns.find(c => c.id === groupColId) ?? null) : null
  const isH = orientation === 'h'

  const { traces } = useMemo(() => {
    if (!col || !colId) return { traces: [] }
    const numericValues = getNumericValues(grid, colId)

    if (groupCol && groupColId) {
      const allData = getNumericGroup(grid, colId, groupColId)
      const uniqueGroups = sortCategoryValues([...new Set(allData.map(d => d.group))])
      const traces = uniqueGroups.map((group, i) => ({
        values: allData.filter(d => d.group === group).map(d => d.value),
        type: 'box',
        name: group,
        orientation,
        ...(isH
          ? { x: allData.filter(d => d.group === group).map(d => d.value) }
          : { y: allData.filter(d => d.group === group).map(d => d.value) }),
        marker: { color: colors[i % colors.length], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
        line: { color: colors[i % colors.length], width: 1.5 },
        fillcolor: colors[i % colors.length] + '28',
        boxpoints: showOutlierFences ? 'outliers' : false,
        whiskerwidth: 0.6,
        boxmean: false,
        showwhiskers: true,
        ...(showOutlierFences
          ? {}
          : {
              lowerfence: [Math.min(...allData.filter(d => d.group === group).map(d => d.value))],
              upperfence: [Math.max(...allData.filter(d => d.group === group).map(d => d.value))],
            }),
      }))
      return {
        traces: traces.map(({ values, ...trace }) => trace),
      }
    }

    return {
      traces: [{
      type: 'box',
      name: hideAxisTitles ? '' : col.name,
      orientation,
      ...(isH ? { x: numericValues } : { y: numericValues }),
      marker: { color: colors[0], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
      line: { color: colors[0], width: 1.5 },
      fillcolor: colors[0] + '28',
      boxpoints: showOutlierFences ? 'outliers' : false,
      whiskerwidth: 0.6,
      boxmean: false,
      showwhiskers: true,
      ...(showOutlierFences
        ? {}
        : {
            lowerfence: [Math.min(...numericValues)],
            upperfence: [Math.max(...numericValues)],
          }),
      hovertemplate:
        'Max: %{upperfence}<br>Q3: %{q3}<br>Median: %{median}<br>Q1: %{q1}<br>Min: %{lowerfence}<extra></extra>',
    }],
    }
  }, [grid, colId, col, groupColId, groupCol, orientation, isH, hideAxisTitles, colors, showOutlierFences])

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
