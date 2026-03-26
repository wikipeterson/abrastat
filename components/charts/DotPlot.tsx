'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'

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
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupByColId ? (grid.columns.find(c => c.id === groupByColId) ?? null) : null

  const { traces, maxStack } = useMemo(() => {
    if (!col || !colId) return { traces: [], maxStack: 1 }
    const values = getNumericValues(grid, colId)
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
  }, [grid, colId, col, groupByColId, groupCol, orientation])

  if (!col) {
    return <EmptyState icon="⚫" title="Drop a numeric variable" description="Drag a numeric variable to an axis to build a dot plot." />
  }

  const vert = orientation === 'v'
  const stackAxis = {
    showticklabels: false,
    showline: false,
    showgrid: false,
    zeroline: false,
    ticks: '',
    range: [0, maxStack + 1.5],
    fixedrange: true,
  }

  // For horizontal plots, chart height scales with max stack; for vertical, use fixed width feel
  const chartHeight = vert ? 420 : Math.min(420, Math.max(180, maxStack * 20 + 90))

  return (
    <div className="px-4">
      <PlotlyChart
        data={traces}
        height={chartHeight}
        layout={{
          xaxis: vert ? stackAxis : { title: col.name },
          yaxis: vert ? { title: col.name } : stackAxis,
          showlegend: !!groupCol,
        }}
        title={`Dot plot — ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
      />
    </div>
  )
}
