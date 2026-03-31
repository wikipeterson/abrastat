'use client'

import { useMemo } from 'react'
import type { Data } from 'plotly.js'
import { useStore } from '@/lib/store'
import { linearRegression } from '@/lib/statistics'
import { getNumericPairs } from '@/lib/gridHelpers'
import { DropZone } from '../DropZone'
import { PlotlyChart } from '@/components/charts/PlotlyChart'
import { EmptyState } from '@/components/ui/EmptyState'

interface RegressionCardProps {
  cardId: string
  config: { xColId: string | null; yColId: string | null }
  onClearZone: (zone: string) => void
  onRemove: () => void
  hideHeader?: boolean
}

function fmt(n: number): string {
  return parseFloat(n.toPrecision(4)).toLocaleString()
}

export function RegressionCard({ cardId, config, onClearZone, onRemove, hideHeader }: RegressionCardProps) {
  const { grid } = useStore()

  function handleNativeDrop(zone: 'x' | 'y') {
    return (e: React.DragEvent) => {
      const colId = e.dataTransfer.getData('text/plain')
      if (!colId) return
      e.preventDefault()
      const current = useStore.getState().exploreCards.find(c => c.id === cardId)
      if (!current || current.config.type !== 'regression') return
      useStore.getState().updateExploreCard(cardId, {
        config: {
          ...current.config,
          ...(zone === 'x' ? { xColId: colId } : { yColId: colId }),
        },
      })
    }
  }

  function handleNativeDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes('text/plain')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  const xCol = config.xColId ? (grid.columns.find(c => c.id === config.xColId) ?? null) : null
  const yCol = config.yColId ? (grid.columns.find(c => c.id === config.yColId) ?? null) : null

  const paired = useMemo(() => {
    if (!config.xColId || !config.yColId) return { xs: [] as number[], ys: [] as number[] }
    const pairs = getNumericPairs(grid, config.xColId, config.yColId)
    return { xs: pairs.map(p => p[0]), ys: pairs.map(p => p[1]) }
  }, [grid, config.xColId, config.yColId])

  const stats = useMemo(() => {
    if (!xCol || !yCol || xCol.type !== 'numeric' || yCol.type !== 'numeric' || paired.xs.length < 2) {
      return null
    }

    const { slope, intercept, r } = linearRegression(paired.xs, paired.ys)
    const fitted = paired.xs.map(x => slope * x + intercept)
    const residuals = paired.ys.map((y, i) => y - fitted[i])
    const ssRes = residuals.reduce((sum, r0) => sum + r0 ** 2, 0)
    const rmse = Math.sqrt(ssRes / paired.xs.length)
    const r2 = r * r
    const interceptSign = intercept >= 0 ? '+' : '−'

    return { slope, intercept, interceptSign, r, r2, residuals, rmse, n: paired.xs.length }
  }, [xCol, yCol, paired])

  const residualTrace = useMemo<Data[]>(() => {
    if (!stats) return []
    return [{
      type: 'scatter',
      mode: 'markers',
      name: 'Residuals',
      x: paired.xs,
      y: stats.residuals,
      marker: { color: '#14B8A6', size: 7, opacity: 0.9, line: { width: 0 } },
      hovertemplate: `${xCol?.name}: %{x}<br>Residual: %{y}<extra></extra>`,
    }]
  }, [stats, paired.xs, xCol?.name])

  const content = (() => {
    if (!xCol || !yCol) {
      return <EmptyState icon="📉" title="Drop two numeric variables" description="Choose an Explanatory Variable and a Response Variable to fit a linear model." />
    }
    if (xCol.type !== 'numeric' || yCol.type !== 'numeric') {
      return <EmptyState icon="📉" title="Numeric variables only" description="Regression requires both Explanatory and Response variables to be numeric." />
    }
    if (!stats) {
      return <EmptyState icon="📉" title="Not enough paired data" description="Need at least two rows with valid values in both variables." />
    }

    return (
      <div className="space-y-4">
        <div className="bg-[var(--color-accent-light)] rounded-xl px-4 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-1">Regression Equation</div>
          <div className="font-mono text-lg font-semibold text-[var(--color-text)]">
            {yCol.name}&#770; = {fmt(stats.slope)}{xCol.name} {stats.interceptSign} {fmt(Math.abs(stats.intercept))}
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: 'r', value: stats.r.toFixed(4), sub: 'correlation' },
            { label: 'r²', value: stats.r2.toFixed(4), sub: `${(stats.r2 * 100).toFixed(1)}% explained` },
            { label: 'Slope', value: fmt(stats.slope), sub: `per +1 ${xCol.name}` },
            { label: 'Intercept', value: fmt(stats.intercept), sub: `when ${xCol.name} = 0` },
            { label: 'n', value: String(stats.n), sub: 'paired rows' },
            { label: 'RMSE', value: fmt(stats.rmse), sub: 'typical prediction error' },
          ].map(item => (
            <div key={item.label} className="bg-slate-50 rounded-xl p-3 text-center">
              <div className="text-xs text-[var(--color-muted)] mb-0.5">{item.label}</div>
              <div className="font-mono font-semibold text-[var(--color-text)] text-base">{item.value}</div>
              <div className="text-[10px] text-[var(--color-muted)] mt-0.5 leading-tight">{item.sub}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-slate-100 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted)] mb-2">Residual Plot</div>
          <PlotlyChart
            data={residualTrace}
            height={210}
            mode="fixed"
            layout={{
              xaxis: { title: { text: xCol.name } },
              yaxis: { title: { text: 'Residual' }, zeroline: true, zerolinecolor: '#94A3B8', zerolinewidth: 1.5 },
              shapes: [{
                type: 'line',
                xref: 'paper',
                yref: 'y',
                x0: 0,
                x1: 1,
                y0: 0,
                y1: 0,
                line: { color: '#94A3B8', width: 1.5, dash: 'dot' },
              }],
              margin: { t: 8, r: 16, b: 44, l: 52 },
            }}
          />
        </div>
      </div>
    )
  })()

  const inner = (
    <div className="h-full flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('x')}>
          <DropZone
            id={`${cardId}:x`}
            label="Explanatory Variable"
            hint="numeric variable"
            assignedCol={xCol}
            onClear={() => onClearZone('x')}
          />
        </div>
        <div onDragOver={handleNativeDragOver} onDrop={handleNativeDrop('y')}>
          <DropZone
            id={`${cardId}:y`}
            label="Response Variable"
            hint="numeric variable"
            assignedCol={yCol}
            onClear={() => onClearZone('y')}
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        {content}
      </div>
    </div>
  )

  if (hideHeader) return inner

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <span className="text-sm font-semibold text-[var(--color-muted)] uppercase tracking-wide">Regression</span>
        <button onClick={onRemove} className="text-[var(--color-muted)] hover:text-red-500 transition-colors text-xl leading-none">×</button>
      </div>
      <div className="p-4 min-h-[420px]">
        {inner}
      </div>
    </div>
  )
}
