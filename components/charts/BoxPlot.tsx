'use client'

import { useMemo } from 'react'
import { createPlotlySelectionStyles, extractRowsFromPlotlyPoints, selectedPointIndicesForTrace, unionBrushRows, useEffectiveBrushSet } from '@/lib/linkedBrush'
import { useStore } from '@/lib/store'
import { getNumericValues, getNumericGroup } from '@/lib/gridHelpers'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { sortCategoryValues } from '@/lib/categoryOrder'
import { truncateChartLabel } from '@/lib/chartLabels'

interface BoxPlotProps {
  colId: string | null
  groupColId?: string | null
  orientation?: 'h' | 'v'
}

export function BoxPlot({ colId, groupColId, orientation = 'v' }: BoxPlotProps) {
  const { grid } = useStore()
  const pinnedBrush = useStore(state => state.brush.pinned)
  const setBrushHover = useStore(state => state.setBrushHover)
  const setBrushPinned = useStore(state => state.setBrushPinned)
  const clearBrush = useStore(state => state.clearBrush)
  const effectiveBrushSet = useEffectiveBrushSet()
  const { hideAxisTitles, colors, showOutlierFences } = useGraphCardContext()
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupColId ? (grid.columns.find(c => c.id === groupColId) ?? null) : null
  const isH = orientation === 'h'

  const { traces } = useMemo(() => {
    if (!col || !colId) return { traces: [] }
    const numericValues = getNumericValues(grid, colId)

    if (groupCol && groupColId) {
      const allData = grid.rows.flatMap((row, rowIndex) => {
        const value = Number(row[colId])
        const group = String(row[groupColId] ?? '').trim()
        if (!Number.isFinite(value) || !group) return []
        return [{ rowIndex, value, group }]
      })
      const uniqueGroups = sortCategoryValues([...new Set(allData.map(d => d.group))])
      const traces = uniqueGroups.map((group, i) => ({
        values: allData.filter(d => d.group === group).map(d => d.value),
        rowIndices: allData.filter(d => d.group === group).map(d => d.rowIndex),
        type: 'box',
        name: group,
        orientation,
        ...(isH
          ? { x: allData.filter(d => d.group === group).map(d => d.value) }
          : { y: allData.filter(d => d.group === group).map(d => d.value) }),
        marker: { color: colors[i % colors.length], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
        line: { color: colors[i % colors.length], width: 1.5 },
        fillcolor: colors[i % colors.length] + '28',
        boxpoints: effectiveBrushSet.size > 0 ? 'all' : (showOutlierFences ? 'outliers' : false),
        jitter: effectiveBrushSet.size > 0 ? 0.35 : 0,
        pointpos: effectiveBrushSet.size > 0 ? 0 : 0,
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
        traces: traces.map(({ values, rowIndices, ...trace }) => createPlotlySelectionStyles({
          ...((trace as unknown) as import("plotly.js").Data),
          customdata: rowIndices,
          selectedpoints: effectiveBrushSet.size > 0
            ? selectedPointIndicesForTrace(rowIndices, effectiveBrushSet) ?? undefined
            : undefined,
        })),
      }
    }

    return {
      traces: [createPlotlySelectionStyles({
      type: 'box',
      name: hideAxisTitles ? '' : truncateChartLabel(col.name),
      orientation,
      ...(isH ? { x: numericValues } : { y: numericValues }),
      marker: { color: colors[0], outliercolor: '#EF4444', size: 5, line: { width: 0 } },
      line: { color: colors[0], width: 1.5 },
      fillcolor: colors[0] + '28',
      boxpoints: effectiveBrushSet.size > 0 ? 'all' : (showOutlierFences ? 'outliers' : false),
      jitter: effectiveBrushSet.size > 0 ? 0.35 : 0,
      pointpos: effectiveBrushSet.size > 0 ? 0 : 0,
      customdata: grid.rows.flatMap((row, rowIndex) => Number.isFinite(Number(row[colId])) ? [rowIndex] : []),
      selectedpoints: effectiveBrushSet.size > 0
        ? selectedPointIndicesForTrace(
            grid.rows.flatMap((row, rowIndex) => Number.isFinite(Number(row[colId])) ? [rowIndex] : []),
            effectiveBrushSet,
          ) ?? undefined
        : undefined,
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
    } as unknown as import("plotly.js").Data)],
    }
  }, [grid, colId, col, groupColId, groupCol, orientation, isH, hideAxisTitles, colors, showOutlierFences, effectiveBrushSet])

  if (!col) {
    return <EmptyState icon="📦" title="Drop a numeric variable" description="Drag a numeric variable to build a box plot." />
  }
  const colLabel = truncateChartLabel(col.name)
  const groupLabel = truncateChartLabel(groupCol?.name)

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            ...(isH
              ? { xaxis: { title: hideAxisTitles ? undefined : { text: colLabel } } }
              : { yaxis: { title: hideAxisTitles ? undefined : { text: colLabel } } }),
            showlegend: !!groupCol,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `Box plot — ${colLabel}${groupCol ? ` by ${groupLabel}` : ''}`}
          onHover={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            setBrushHover(rows)
          }}
          onUnhover={() => setBrushHover([])}
          onClick={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            if (rows.length === 0) return
            setBrushPinned(unionBrushRows(pinnedBrush, rows))
          }}
          onSelected={event => {
            const rows = extractRowsFromPlotlyPoints((event as { points?: unknown[] })?.points as never)
            setBrushPinned(unionBrushRows(pinnedBrush, rows))
          }}
          onDeselect={clearBrush}
        />
      </div>
    </div>
  )
}
