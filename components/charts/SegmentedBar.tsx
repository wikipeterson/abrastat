'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'
import { sortCategoryValues } from '@/lib/categoryOrder'
import { ManualTwoWayTableSnapshot } from '@/lib/exploreTypes'
import { truncateChartLabel } from '@/lib/chartLabels'

interface SegmentedBarProps {
  xColId: string | null
  fillColId: string | null
  manualTable?: ManualTwoWayTableSnapshot
  modeOverride?: 'count' | 'row'
  barmodeOverride?: 'stack' | 'group'
  showControls?: boolean
}

export function SegmentedBar({
  xColId,
  fillColId,
  manualTable,
  modeOverride,
  barmodeOverride,
  showControls = true,
}: SegmentedBarProps) {
  const { grid } = useStore()
  const { hideAxisTitles, colors } = useGraphCardContext()
  const [mode, setMode] = useState<'count' | 'percent'>('count')
  const effectiveMode = modeOverride ?? mode

  const xCol = grid.columns.find(c => c.id === xColId)
  const fillCol = grid.columns.find(c => c.id === fillColId)

  const traces = useMemo(() => {
    if (manualTable) {
      return manualTable.rowLabels.map((rowLabel, gi) => {
        const counts = manualTable.colLabels.map((_, ci) => manualTable.cells[gi]?.[ci] ?? 0)
        const values = effectiveMode === 'count'
          ? counts
          : manualTable.colLabels.map((_, ci) => {
              const total = manualTable.cells.reduce((sum, row) => sum + (row[ci] ?? 0), 0)
              return total ? (counts[ci] / total) * 100 : 0
            })

        return {
          type: 'bar',
          name: rowLabel,
          x: manualTable.colLabels,
          y: values,
          marker: { color: colors[gi % colors.length], opacity: 0.9 },
          hovertemplate: effectiveMode === 'count'
            ? `${rowLabel}: %{y}<extra></extra>`
            : `${rowLabel}: %{y:.1f}%<extra></extra>`,
        }
      })
    }

    if (!xCol || !fillCol) return []

    const pairedValues = grid.rows.flatMap(row => {
      const xValue = String(row[xCol.id] ?? '').trim()
      const fillValue = String(row[fillCol.id] ?? '').trim()
      if (!xValue || !fillValue) return []
      return [{ xValue, fillValue }]
    })

    const xGroups = sortCategoryValues([...new Set(pairedValues.map(pair => pair.xValue))])
    const fillGroups = sortCategoryValues([...new Set(pairedValues.map(pair => pair.fillValue))])

    return fillGroups.map((fillGroup, gi) => {
      const counts = xGroups.map(xGroup =>
        pairedValues.filter(pair => pair.xValue === xGroup && pair.fillValue === fillGroup).length
      )
      const values = effectiveMode === 'count'
        ? counts
        : xGroups.map((xGroup, xi) => {
            const total = pairedValues.filter(pair => pair.xValue === xGroup).length
            return total ? (counts[xi] / total) * 100 : 0
          })

      return {
        type: 'bar',
        name: fillGroup,
        x: xGroups,
        y: values,
        marker: { color: colors[gi % colors.length], opacity: 0.9 },
        hovertemplate: effectiveMode === 'count'
          ? `${fillGroup}: %{y}<extra></extra>`
          : `${fillGroup}: %{y:.1f}%<extra></extra>`,
      }
    })
  }, [grid, xCol, fillCol, manualTable, effectiveMode])

  if (!manualTable && (!xCol || !fillCol)) {
    return <EmptyState icon="📊" title="Select two variables" description="Choose an X variable and a Fill variable above." />
  }

  const xAxisTitle = truncateChartLabel(manualTable ? manualTable.explName : xCol?.name)
  const legendTitle = truncateChartLabel(manualTable ? manualTable.respName : fillCol?.name)
  const chartTitle = manualTable
    ? `${truncateChartLabel(manualTable.explName)} by ${truncateChartLabel(manualTable.respName)}`
    : `${truncateChartLabel(xCol?.name)} by ${truncateChartLabel(fillCol?.name)}`
  const compactLegend = hideAxisTitles

  return (
    <div className="h-full flex flex-col">
      {showControls && (
        <div className="flex-shrink-0 flex gap-2 px-4 pt-2">
          {(['count', 'percent'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${mode === m ? 'bg-[var(--color-accent)] text-white' : 'bg-slate-100 text-[var(--color-muted)] hover:bg-slate-200'}`}
            >
              {m === 'count' ? 'Counts' : '100% (Proportions)'}
            </button>
          ))}
        </div>
      )}
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            barmode: barmodeOverride ?? 'stack',
            xaxis: { title: hideAxisTitles ? undefined : { text: xAxisTitle } },
            yaxis: { title: hideAxisTitles ? undefined : { text: effectiveMode === 'count' ? 'Count' : 'Percent' }, ticksuffix: effectiveMode === 'count' ? '' : '%' },
            showlegend: true,
            legend: compactLegend
              ? { orientation: 'h', x: 0, xanchor: 'left', y: 1.08, yanchor: 'bottom', font: { size: 11 } }
              : { title: { text: legendTitle }, x: 1.02, xanchor: 'left', y: 1, yanchor: 'top' },
            ...(hideAxisTitles ? { margin: { t: 28, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : chartTitle}
        />
      </div>
    </div>
  )
}
