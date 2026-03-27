'use client'

import { useState, useMemo } from 'react'
import type { Data } from 'plotly.js'
import { useStore } from '@/lib/store'
import { getNumericValues, getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'

interface HistogramProps {
  colId: string | null
  groupColId?: string | null
  orientation?: 'h' | 'v'   // 'h' = values on x-axis (default); 'v' = values on y-axis (horizontal bars)
}

export function Histogram({ colId, groupColId, orientation = 'h' }: HistogramProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()
  const [showNormal, setShowNormal] = useState(false)

  const col = grid.columns.find(c => c.id === colId)
  const groupCol = groupColId ? grid.columns.find(c => c.id === groupColId) : null

  const values = useMemo(() => colId ? getNumericValues(grid, colId) : [], [grid, colId])
  const defaultBins = values.length ? Math.ceil(Math.log2(values.length) + 1) : 12
  const [bins, setBins] = useState(defaultBins)

  if (!col || values.length === 0) {
    return <EmptyState icon="📊" title="Drop a numeric variable" description="Drag a numeric variable to the horizontal axis to build a histogram." />
  }

  let traces: Data[]

  const vert = orientation === 'v'
  const binKey = vert ? 'y' : 'x'
  const binCountKey = vert ? 'nbinsy' : 'nbinsx'

  if (groupCol) {
    const groups = getStringValues(grid, groupCol.id)
    const uniqueGroups = [...new Set(groups)].filter(Boolean)
    traces = uniqueGroups.map((group, i) => ({
      type: 'histogram',
      name: group,
      [binKey]: values.filter((_, idx) => groups[idx] === group),
      [binCountKey]: Math.max(4, Math.min(bins, 50)),
      marker: { color: ABRA_COLORS[i % ABRA_COLORS.length], opacity: 0.85, line: { color: 'white', width: 0.5 } },
      hovertemplate: vert
        ? `${group} — Range: %{y}<br>Count: %{x}<extra></extra>`
        : `${group} — Range: %{x}<br>Count: %{y}<extra></extra>`,
    }))
  } else {
    traces = [{
      type: 'histogram',
      name: col.name,
      [binKey]: values,
      [binCountKey]: Math.max(4, Math.min(bins, 50)),
      marker: { color: ABRA_COLORS[0], opacity: 0.85, line: { color: 'white', width: 0.5 } },
      hovertemplate: vert ? 'Range: %{y}<br>Count: %{x}<extra></extra>' : 'Range: %{x}<br>Count: %{y}<extra></extra>',
    }]

    if (!vert && showNormal && values.length > 1) {
      const mean = values.reduce((a, b) => a + b, 0) / values.length
      const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1))
      const xMin = Math.min(...values) - std
      const xMax = Math.max(...values) + std
      const xs = Array.from({ length: 100 }, (_, i) => xMin + (i / 99) * (xMax - xMin))
      const pdf = xs.map(x => (values.length * (xMax - xMin) / bins) * (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / std) ** 2))
      traces.push({ type: 'scatter', mode: 'lines', name: 'Normal curve', x: xs, y: pdf, line: { color: '#EF4444', width: 2 }, hoverinfo: 'skip' })
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-4 px-4 pt-2">
        <label className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <span>Bins: {bins}</span>
          <input type="range" min={5} max={50} value={bins} onChange={e => setBins(Number(e.target.value))} className="w-32 accent-[var(--color-accent)]" />
        </label>
        {!groupCol && !vert && (
          <label className="flex items-center gap-2 text-sm text-[var(--color-muted)] cursor-pointer">
            <input type="checkbox" checked={showNormal} onChange={e => setShowNormal(e.target.checked)} className="accent-[var(--color-accent)]" />
            Normal curve
          </label>
        )}
      </div>
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            barmode: groupCol ? 'overlay' : 'relative',
            xaxis: { title: hideAxisTitles ? undefined : { text: vert ? 'Frequency' : col.name } },
            yaxis: { title: hideAxisTitles ? undefined : { text: vert ? col.name : 'Frequency' } },
            showlegend: !!groupCol,
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `Distribution of ${col.name}${groupCol ? ` by ${groupCol.name}` : ''}`}
        />
      </div>
    </div>
  )
}
