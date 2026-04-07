'use client'

import { useMemo, useState } from 'react'
import type { Data, Annotations, Layout } from 'plotly.js'
import { useStore } from '@/lib/store'
import { getNumericValues, getNumericGroup } from '@/lib/gridHelpers'
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
 * Accepts an optional forceBinWidth to use a pre-computed width (for consistent
 * cross-group comparison in faceted layouts).
 */
function stackDots(values: number[], forceBinWidth?: number): { x: number[]; y: number[]; binWidth: number } {
  if (values.length === 0) return { x: [], y: [], binWidth: forceBinWidth ?? 1 }

  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min

  // Use integer binning if all values are integers, otherwise pick ~30 bins
  const allIntegers = values.every(v => Number.isInteger(v))
  let binWidth: number
  if (forceBinWidth != null) {
    binWidth = forceBinWidth
  } else if (allIntegers || range === 0) {
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

interface NormalResult {
  type: 'normal'
  traces: Data[]
  maxStack: number
}

interface FacetedResult {
  type: 'faceted'
  traces: Data[]
  facetAxes: Record<string, unknown>
  facetAnnotations: Partial<Annotations>[]
  facetHeight: number
}

type DotResult = NormalResult | FacetedResult

export function DotPlot({ colId, groupByColId, orientation = 'h' }: DotPlotProps) {
  const { grid } = useStore()
  const { hideAxisTitles, colors } = useGraphCardContext()
  const [showMean, setShowMean] = useState(false)
  const [showMedian, setShowMedian] = useState(false)
  const col = grid.columns.find(c => c.id === colId) ?? null
  const groupCol = groupByColId ? (grid.columns.find(c => c.id === groupByColId) ?? null) : null
  const values = useMemo(() => colId ? getNumericValues(grid, colId) : [], [grid, colId])

  const result = useMemo((): DotResult => {
    if (!col || !colId) return { type: 'normal', traces: [], maxStack: 1 }
    const vert = orientation === 'v'

    // ── Faceted: grouped + horizontal orientation ────────────────────────
    if (groupCol && groupByColId && !vert) {
      const allData = getNumericGroup(grid, colId, groupByColId)

      // Compute global bin width from all values for consistent cross-group comparison
      const allValues = allData.map(d => d.value)
      const { binWidth: globalBinWidth } = allValues.length > 0
        ? stackDots(allValues)
        : { binWidth: 1 }

      const uniqueGroups = [...new Set(allData.map(d => d.group))].sort()
      const n = uniqueGroups.length
      const GAP = n > 1 ? 0.04 : 0
      const panelH = n > 1 ? (1 - GAP * (n - 1)) / n : 1

      const facetAxes: Record<string, unknown> = {}
      const facetAnnotations: Partial<Annotations>[] = []

      const traces: Data[] = uniqueGroups.map((group, i) => {
        const groupValues = allData.filter(d => d.group === group).map(d => d.value)
        // Use global bin width so all panels have comparable dot positions
        const { x, y } = stackDots(groupValues, globalBinWidth)
        const localMax = y.length > 0 ? Math.max(...y) : 1

        const yEnd = 1 - i * (panelH + GAP)
        const yStart = Math.max(0, yEnd - panelH)
        const isBottom = i === n - 1
        const xAxisKey = i === 0 ? 'xaxis' : `xaxis${i + 1}`
        const yAxisKey = i === 0 ? 'yaxis' : `yaxis${i + 1}`
        const xRef = i === 0 ? 'x' : `x${i + 1}`
        const yRef = i === 0 ? 'y' : `y${i + 1}`

        facetAxes[xAxisKey] = {
          domain: [0, 1],
          ...(i > 0 ? { matches: 'x' } : {}),
          showticklabels: isBottom,
          gridcolor: '#E2E8F0',
          linecolor: '#CBD5E1',
          zerolinecolor: '#CBD5E1',
        }
        facetAxes[yAxisKey] = {
          domain: [yStart, yEnd],
          anchor: xRef,
          showticklabels: false,
          showgrid: false,
          showline: false,
          zeroline: false,
          ticks: '',
          range: [0, localMax + 1.5],
          fixedrange: true,
        }

        facetAnnotations.push({
          xref: 'paper',
          yref: 'paper',
          x: 0.99,
          y: yEnd - 0.005,
          xanchor: 'right',
          yanchor: 'top',
          text: `<b>${group}</b>`,
          showarrow: false,
          font: { size: 12, color: colors[i % colors.length] },
          bgcolor: 'rgba(255,255,255,0.85)',
          borderpad: 3,
        })

        return {
          type: 'scatter',
          mode: 'markers',
          name: group,
          x,
          y,
          xaxis: xRef,
          yaxis: yRef,
          marker: { color: colors[i % colors.length], size: 9, opacity: 0.9, line: { width: 0 } },
          hovertemplate: `${group}: %{x}<extra></extra>`,
        } as Data
      })

      const facetHeight = Math.max(250, n * 120 + 28)
      return { type: 'faceted', traces, facetAxes, facetAnnotations, facetHeight }
    }

    // ── Standard: ungrouped, or grouped vertical overlay ────────────────
    if (groupCol && groupByColId) {
      // vert=true: keep overlay behavior
      const allData = getNumericGroup(grid, colId, groupByColId)
      const uniqueGroups = [...new Set(allData.map(d => d.group))].sort()
      let globalMax = 1

      const traces = uniqueGroups.map((group, gi) => {
        const groupValues = allData.filter(d => d.group === group).map(d => d.value)
        const { x, y } = stackDots(groupValues)
        globalMax = Math.max(globalMax, ...y)
        return {
          type: 'scatter',
          mode: 'markers',
          name: group,
          x: orientation === 'v' ? y : x,
          y: orientation === 'v' ? x : y,
          marker: { color: ABRA_COLORS[gi % ABRA_COLORS.length], size: 9, opacity: 0.9, line: { width: 0 } },
          hovertemplate: `${group}: %{${orientation === 'v' ? 'y' : 'x'}}<extra></extra>`,
        } as Data
      })
      return { type: 'normal', traces, maxStack: globalMax }
    }

    const { x, y } = stackDots(values)
    const maxStack = Math.max(...y, 1)

    return {
      type: 'normal',
      traces: [{
        type: 'scatter',
        mode: 'markers',
        name: col.name,
        x: vert ? y : x,
        y: vert ? x : y,
        marker: { color: colors[0], size: 9, opacity: 0.9, line: { width: 0 } },
        hovertemplate: `${col.name}: %{${vert ? 'y' : 'x'}}<extra></extra>`,
      }],
      maxStack,
    }
  }, [grid, values, colId, col, groupByColId, groupCol, orientation])

  if (!col) {
    return <EmptyState icon="⚫" title="Drop a numeric variable" description="Drag a numeric variable to an axis to build a dot plot." />
  }

  const vert = orientation === 'v'

  // ── Faceted render ───────────────────────────────────────────────────
  if (result.type === 'faceted') {
    const { traces, facetAxes, facetAnnotations, facetHeight } = result
    const margin = hideAxisTitles
      ? { t: 8, r: 16, b: 44, l: 20 }
      : { t: 30, r: 16, b: 60, l: 20 }

    return (
      <div className="h-full flex flex-col">
        <div className="flex-1 min-h-0 px-4 overflow-auto">
          <PlotlyChart
            data={traces}
            height={facetHeight}
            mode="fixed"
            layout={{
              ...(facetAxes as Partial<Layout>),
              annotations: facetAnnotations,
              showlegend: false,
              margin,
            }}
            title={hideAxisTitles ? undefined : `Dot plot — ${col.name} by ${groupCol?.name}`}
          />
        </div>
      </div>
    )
  }

  // ── Normal render ────────────────────────────────────────────────────
  const { traces, maxStack } = result

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
