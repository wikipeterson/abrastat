'use client'

import { useMemo } from 'react'
import { useStore } from '@/lib/store'
import { getNumericValues } from '@/lib/gridHelpers'
import { ABRA_COLORS } from '@/lib/plotlyTheme'
import { PlotlyChart } from './PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'
import jStat from 'jstat'

interface NormalProbPlotProps {
  colId: string | null
}

export function NormalProbPlot({ colId }: NormalProbPlotProps) {
  const { grid } = useStore()
  const col = grid.columns.find(c => c.id === colId)

  const { theoretical, actual } = useMemo(() => {
    if (!colId) return { theoretical: [], actual: [] }
    const vals = [...getNumericValues(grid, colId)].sort((a, b) => a - b)
    const n = vals.length
    const jStatDist = (jStat as unknown as { normal: { inv: (p: number, mu: number, sigma: number) => number } })
    const theoretical = vals.map((_, i) => jStatDist.normal.inv((i + 0.5) / n, 0, 1))
    return { theoretical, actual: vals }
  }, [grid, colId])

  if (!col || actual.length === 0) {
    return <EmptyState icon="📉" title="Drop a numeric variable" description="Drag a numeric variable to the horizontal axis to check for normality." />
  }

  // Best-fit reference line
  const n = actual.length
  const q1Idx = Math.floor(n * 0.25)
  const q3Idx = Math.floor(n * 0.75)
  const slope = (actual[q3Idx] - actual[q1Idx]) / (theoretical[q3Idx] - theoretical[q1Idx])
  const intercept = actual[q1Idx] - slope * theoretical[q1Idx]
  const xMin = theoretical[0]
  const xMax = theoretical[n - 1]

  return (
    <div className="px-4">
      <PlotlyChart
        data={[
          {
            type: 'scatter',
            mode: 'markers',
            name: col.name,
            x: theoretical,
            y: actual,
            marker: { color: ABRA_COLORS[0], size: 7, opacity: 0.85, line: { width: 0 } },
            hovertemplate: 'Theoretical: %{x:.3f}<br>Actual: %{y}<extra></extra>',
          },
          {
            type: 'scatter',
            mode: 'lines',
            name: 'Normal reference',
            x: [xMin, xMax],
            y: [slope * xMin + intercept, slope * xMax + intercept],
            line: { color: '#EF4444', width: 2, dash: 'dash' },
            hoverinfo: 'skip',
          },
        ]}
        layout={{
          xaxis: { title: { text: 'Theoretical Normal Quantiles' } },
          yaxis: { title: { text: col.name } },
          showlegend: false,
          annotations: [{
            xref: 'paper', yref: 'paper',
            x: 0.5, y: -0.18,
            xanchor: 'center', yanchor: 'top',
            text: 'Points close to the line suggest the data is approximately normal.',
            showarrow: false,
            font: { size: 11, color: '#64748B' },
          }],
        }}
        title={`Normal Probability Plot — ${col.name}`}
      />
    </div>
  )
}
