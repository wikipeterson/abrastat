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

function quantile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = (sorted.length - 1) * p
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]
  const weight = idx - lo
  return sorted[lo] * (1 - weight) + sorted[hi] * weight
}

function tukeyFences(values: number[]) {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const q1 = quantile(sorted, 0.25)
  const q3 = quantile(sorted, 0.75)
  const iqr = q3 - q1
  return {
    lower: q1 - 1.5 * iqr,
    upper: q3 + 1.5 * iqr,
  }
}

export function BoxPlot({ colId, groupColId, orientation = 'v' }: BoxPlotProps) {
  const { grid } = useStore()
  const { hideAxisTitles, colors, showOutlierFences } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupColId ? (grid.columns.find(c => c.id === groupColId) ?? null) : null
  const isH = orientation === 'h'
  type PlotShape = Partial<import('plotly.js').Shape>

  const { traces, fenceShapes } = useMemo(() => {
    if (!col || !colId) return { traces: [], fenceShapes: [] as PlotShape[] }
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
        boxpoints: 'outliers',
        whiskerwidth: 0.6,
        boxmean: false,
        showwhiskers: true,
      }))
      const fenceShapes: PlotShape[] = []
      if (showOutlierFences) {
        uniqueGroups.forEach((_, i) => {
          const values = traces[i].values
          const fences = tukeyFences(values)
          if (!fences) return
          if (isH) {
            fenceShapes.push(
              { type: 'line', xref: 'x', yref: 'paper', x0: fences.lower, x1: fences.lower, y0: 0, y1: 1, line: { color: colors[i % colors.length], width: 1, dash: 'dot' } },
              { type: 'line', xref: 'x', yref: 'paper', x0: fences.upper, x1: fences.upper, y0: 0, y1: 1, line: { color: colors[i % colors.length], width: 1, dash: 'dot' } },
            )
          } else {
            fenceShapes.push(
              { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: fences.lower, y1: fences.lower, line: { color: colors[i % colors.length], width: 1, dash: 'dot' } },
              { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: fences.upper, y1: fences.upper, line: { color: colors[i % colors.length], width: 1, dash: 'dot' } },
            )
          }
        })
      }
      return {
        traces: traces.map(({ values, ...trace }) => trace),
        fenceShapes,
      }
    }

    const fences = tukeyFences(numericValues)
    return {
      traces: [{
      type: 'box',
      name: hideAxisTitles ? '' : col.name,
      orientation,
      ...(isH ? { x: numericValues } : { y: numericValues }),
      marker: { color: colors[0], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
      line: { color: colors[0], width: 1.5 },
      fillcolor: colors[0] + '28',
      boxpoints: 'outliers',
      whiskerwidth: 0.6,
      boxmean: false,
      showwhiskers: true,
      hovertemplate:
        'Max: %{upperfence}<br>Q3: %{q3}<br>Median: %{median}<br>Q1: %{q1}<br>Min: %{lowerfence}<extra></extra>',
    }],
      fenceShapes: (() => {
        const shapes: PlotShape[] = []
        if (!showOutlierFences || !fences) return shapes
        if (isH) {
          shapes.push(
            { type: 'line', xref: 'x', yref: 'paper', x0: fences.lower, x1: fences.lower, y0: 0, y1: 1, line: { color: colors[0], width: 1, dash: 'dot' } },
            { type: 'line', xref: 'x', yref: 'paper', x0: fences.upper, x1: fences.upper, y0: 0, y1: 1, line: { color: colors[0], width: 1, dash: 'dot' } },
          )
        } else {
          shapes.push(
            { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: fences.lower, y1: fences.lower, line: { color: colors[0], width: 1, dash: 'dot' } },
            { type: 'line', xref: 'paper', yref: 'y', x0: 0, x1: 1, y0: fences.upper, y1: fences.upper, line: { color: colors[0], width: 1, dash: 'dot' } },
          )
        }
        return shapes
      })(),
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
            shapes: fenceShapes,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `Box plot — ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
        />
      </div>
    </div>
  )
}
