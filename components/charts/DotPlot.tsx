'use client'

import { useMemo, useState } from 'react'
import type { Data } from 'plotly.js'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'

interface DotPlotProps {
  colId: string | null
  groupByColId?: string | null
  orientation?: 'h' | 'v'   // 'h' = values on x-axis (default); 'v' = values on y-axis
}

/**
 * Compute stacked (x, y) positions for a dot plot.
 * Values that land in the same bin stack vertically: y = 1, 2, 3, ...
 */
function stackDots(values: number[]): { x: number[]; y: number[]; binWidth: number } {
  if (values.length === 0) return { x: [], y: [], binWidth: 1 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  // Use integer binning if all values are integers, otherwise pick ~30 bins
  const allIntegers = values.every(v => Number.isInteger(v))
  let binWidth: number
  if (allIntegers || range === 0) {
    binWidth = 1
  } else {
    const rawWidth = range / 30
    const magnitude = Math.pow(10, Math.floor(Math.log10(rawWidth)))
    const nice = [1, 2, 2.5, 5, 10]
    binWidth = nice.map(f => f * magnitude).find(w => w >= rawWidth) ?? rawWidth
  }

  const counts = new Map<number, number>()
  const xs: number[] = []
  const ys: number[] = []

  for (const v of values) {
    // Snap value to nearest bin center
    const binned = Math.round(v / binWidth) * binWidth
    // Use a rounded key to avoid floating-point map mismatches
    const key = parseFloat(binned.toPrecision(12))
    const stack = (counts.get(key) ?? 0) + 1
    counts.set(key, stack)
    xs.push(key)
    ys.push(stack)
  }

  return { x: xs, y: ys, binWidth }
}

export function DotPlot({ colId, groupByColId, orientation = 'h' }: DotPlotProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()
  const [showMean, setShowMean] = useState(false)
  const [showMedian, setShowMedian] = useState(false)
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupByColId ? (grid.columns.find(c => c.id === groupByColId) ?? null) : null
  const values = useMemo(() => colId ? getNumericValues(grid, colId) : [], [grid, colId])

  const { traces, maxStack } = useMemo(() => {
    if (!col || !colId) return { traces: [], maxStack: 1 }
    const vert = orientation === 'v'

    if (groupCol && groupByColId) {
      const groups = getStringValues(grid, groupByColId)
      const uniqueGroups = [...new Set(groups)].filter(Boolean)
      let globalMax = 1

      const traces = uniqueGroups.map((group, gi) => {
        const groupValues = values.filter((_, idx) => groups[idx] === group)
        const { x, y } = stackDots(groupValues)
        globalMax = Math.max(globalMax, ...y)
        return {
          type: 'scatter',
          mode: 'markers',
          name: group,
          x: vert ? y : x,
          y: vert ? x : y,
          marker: { color: ABRA_COLORS[gi % ABRA_COLORS.length], size: 9, opacity: 0.9, line: { width: 0 } },
          hovertemplate: `${group}: %{${vert ? 'y' : 'x'}}<extra></extra>`,
        }
      })
      return { traces, maxStack: globalMax }
    }

    const { x, y } = stackDots(values)
    const maxStack = Math.max(...y, 1)

    return {
      traces: [{
        type: 'scatter',
        mode: 'markers',
        name: col.name,
        x: vert ? y : x,
        y: vert ? x : y,
        marker: { color: ABRA_COLORS[0], size: 9, opacity: 0.9, line: { width: 0 } },
          hovertemplate: `${col.name}: %{${vert ? 'y' : 'x'}}<extra></extra>`,
      }],
      maxStack,
    }
  }, [grid, values, colId, col, groupByColId, groupCol, orientation])

  if (!col) {
    return <EmptyState icon="⚫" title="Drop a numeric variable" description="Drag a numeric variable to an axis to build a dot plot." />
  }

  const vert = orientation === 'v'
  const mean = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0
  const sorted = [...values].sort((a, b) => a - b)
  const median = sorted.length === 0
    ? 0
    : sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)]
  const stackAxis = {
    showticklabels: false,
    showline: false,
    showgrid: false,
    zeroline: false,
    ticks: '' as const,
    range: [0, maxStack + 1.5],
    fixedrange: true,
  }

  const overlayTraces: Data[] = []
  if (!groupCol && values.length > 1) {
    if (showMean) {
      overlayTraces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Mean',
        x: vert ? [0, maxStack + 1.5] : [mean, mean],
        y: vert ? [mean, mean] : [0, maxStack + 1.5],
        line: { color: '#F59E0B', width: 2, dash: 'dash' },
        hoverinfo: 'skip',
      })
    }

    if (showMedian) {
      overlayTraces.push({
        type: 'scatter',
        mode: 'lines',
        name: 'Median',
        x: vert ? [0, maxStack + 1.5] : [median, median],
        y: vert ? [median, median] : [0, maxStack + 1.5],
        line: { color: '#8B5CF6', width: 2, dash: 'dot' },
        hoverinfo: 'skip',
      })
    }
  }

  // For horizontal plots, chart height scales with max stack; for vertical, use fixed width feel
  const chartHeight = vert ? 420 : Math.min(420, Math.max(180, maxStack * 20 + 90))

  return (
    <div className="h-full flex flex-col">
      {!groupCol && (
        <div className="flex-shrink-0 flex items-center gap-4 px-4 pt-2 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] cursor-pointer">
            <input type="checkbox" checked={showMean} onChange={e => setShowMean(e.target.checked)} className="accent-[var(--color-accent)]" />
            Mean
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] cursor-pointer">
            <input type="checkbox" checked={showMedian} onChange={e => setShowMedian(e.target.checked)} className="accent-[var(--color-accent)]" />
            Median
          </label>
        </div>
      )}
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={[...(traces as Data[]), ...overlayTraces]}
          height={chartHeight}
          layout={{
            xaxis: vert ? stackAxis : { title: hideAxisTitles ? undefined : { text: col.name } },
            yaxis: vert ? { title: hideAxisTitles ? undefined : { text: col.name } } : stackAxis,
            showlegend: !!groupCol,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `Dot plot — ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
        />
      </div>
    </div>
  )
}
