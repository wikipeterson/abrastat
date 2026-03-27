'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/lib/store'
import { getStringValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import { useGraphCardContext } from '@/lib/graphCardContext'

interface SegmentedBarProps {
  xColId: string | null
  fillColId: string | null
}

export function SegmentedBar({ xColId, fillColId }: SegmentedBarProps) {
  const { grid } = useStore()
  const { hideAxisTitles } = useGraphCardContext()
  const [mode, setMode] = useState<'count' | 'percent'>('count')

  const xCol = grid.columns.find(c => c.id === xColId)
  const fillCol = grid.columns.find(c => c.id === fillColId)

  const traces = useMemo(() => {
    if (!xCol || !fillCol) return []

    const xVals = getStringValues(grid, xCol.id)
    const fillVals = getStringValues(grid, fillCol.id)

    const xGroups = [...new Set(xVals)].filter(Boolean).sort()
    const fillGroups = [...new Set(fillVals)].filter(Boolean).sort()

    return fillGroups.map((fillGroup, gi) => {
      const counts = xGroups.map(xGroup =>
        xVals.filter((v, i) => v === xGroup && fillVals[i] === fillGroup).length
      )
      const values = mode === 'count'
        ? counts
        : xGroups.map((xGroup, xi) => {
            const total = xVals.filter(v => v === xGroup).length
            return total ? (counts[xi] / total) * 100 : 0
          })

      return {
        type: 'bar',
        name: fillGroup,
        x: xGroups,
        y: values,
        marker: { color: ABRA_COLORS[gi % ABRA_COLORS.length], opacity: 0.9 },
        hovertemplate: mode === 'count'
          ? `${fillGroup}: %{y}<extra></extra>`
          : `${fillGroup}: %{y:.1f}%<extra></extra>`,
      }
    })
  }, [grid, xCol, fillCol, mode])

  if (!xCol || !fillCol) {
    return <EmptyState icon="📊" title="Select two variables" description="Choose an X variable and a Fill variable above." />
  }

  return (
    <div className="h-full flex flex-col">
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
      <div className="flex-1 min-h-0 px-4">
        <PlotlyChart
          data={traces as import("plotly.js").Data[]}
          layout={{
            barmode: 'stack',
            xaxis: { title: hideAxisTitles ? undefined : { text: xCol.name } },
            yaxis: { title: hideAxisTitles ? undefined : { text: mode === 'count' ? 'Count' : 'Percent' }, ticksuffix: mode === 'percent' ? '%' : '' },
            showlegend: true,
            legend: { title: { text: fillCol.name } },
            ...(hideAxisTitles ? { margin: { t: 8, r: 16, b: 44, l: 52 } } : {}),
          }}
          title={hideAxisTitles ? undefined : `${xCol.name} by ${fillCol.name}`}
        />
      </div>
    </div>
  )
}
